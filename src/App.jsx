import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, // 익명 로그인 임포트
  onAuthStateChanged 
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, query, onSnapshot, serverTimestamp, addDoc } from 'firebase/firestore';

// ====================================================================
// TODO: 여기에 사용자님의 개인 Firebase 구성 정보를 직접 붙여넣으세요!
// Firebase Console에서 복사한 firebaseConfig 객체를 여기에 붙여넣습니다.
// **주의: "YOUR_API_KEY", "YOUR_AUTH_DOMAIN" 등의 플레이스홀더를
// 반드시 사용자님의 실제 Firebase 프로젝트 정보로 교체해야 합니다.**
const firebaseConfig = {
  apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
  authDomain: "text-adventure-game-cb731.firebaseapp.com",
  projectId: "text-adventure-game-cb731",
  storageBucket: "text-adventure-game-cb731.firebasestorage.app",
  messagingSenderId: "1092941614820",
  appId: "1:1092941614820:web:5545f36014b73c268026f1",
  measurementId: "G-FNGF42T1FP"
};
// ====================================================================

// 사용자님의 Firebase projectId를 앱 ID로 사용합니다.
const appId = firebaseConfig.projectId;

// 게임의 초기 직업 정보 및 동기
const professions = {
  '1': { name: '몰락한 귀족/기사', motivation: '가문의 몰락 원인을 조사하고, 잃어버린 가문의 보물을 찾아야 합니다.' },
  '2': { name: '평범한 마을 사람/농부', motivation: '갑자기 마을에 나타난 괴생명체로부터 마을을 지켜야 합니다.' },
  '3': { name: '젊은 마법사/견습생', motivation: '스승님의 실종에 대한 단서를 찾아야 합니다.' },
  '4': { name: '용병/모험가', motivation: '의뢰받은 임무를 수행하던 중 예상치 못한 사건에 휘말렸습니다.' },
  '5': { name: '도적/암살자', motivation: '길드에서 내려온 첫 번째 임무를 완수하고, 그 과정에서 수상한 음모를 감지해야 합니다.' },
  '6': { name: '왕족/공주/왕자', motivation: '왕실 내의 불화와 암투 속에서 자신의 입지를 다져야 합니다.' },
};

function App() {
  // 게임의 현재 텍스트 로그 (개인)
  const [gameLog, setGameLog] = useState([]);
  // LLM 텍스트 응답 로딩 상태
  const [isTextLoading, setIsTextLoading] = useState(false);
  // 게임 단계: 'characterSelection' 또는 'playing'
  const [gamePhase, setGamePhase] = useState('characterSelection');
  // 플레이어 캐릭터 정보
  const [playerCharacter, setPlayerCharacter] = useState({
    profession: '',
    stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 }, // 기본 능력치
    inventory: [],
    initialMotivation: '',
    currentLocation: '왕국의 수도 외곽', // 초기 위치
    reputation: {}, // NPC/세력 평판 (LLM이 관리)
    activeQuests: [], // 활성 퀘스트 (LLM이 관리)
    companions: [], // 동료 (LLM이 관리)
  });
  // 현재 플레이어에게 제시되는 선택지들
  const [currentChoices, setCurrentChoices] = useState([]);
  // 피드백 모달 표시 여부
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  // 피드백 텍스트
  const [feedbackText, setFeedbackText] = useState('');
  // 공유 게임 로그 (멀티플레이어)
  const [sharedGameLog, setSharedGameLog] = useState([]);
  // 활성 사용자 목록 (멀티플레이어)
  const [activeUsers, setActiveUsers] = useState([]);

  // Firebase 및 인증 상태
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // 스크롤을 최하단으로 유지하기 위한 ref
  const logEndRef = useRef(null);
  const sharedLogEndRef = useRef(null);

  // Firebase 초기화 및 인증 처리
  useEffect(() => {
    try {
      // Firebase API 키가 플레이스홀더인지 확인합니다.
      if (firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey) {
        console.error("Firebase initialization error: firebaseConfig.apiKey must be replaced with your actual Firebase API key.");
        setGameLog(prev => [...prev, "오류: Firebase API 키가 올바르게 설정되지 않았습니다. 코드를 확인해주세요."]);
        return; // Firebase initialization is stopped.
      }

      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // If no user is logged in, attempt anonymous sign-in.
          try {
            await signInAnonymously(firebaseAuth);
          } catch (error) {
            console.error("Anonymous sign-in failed:", error);
            setGameLog(prev => [...prev, "오류: Firebase 인증에 실패했습니다."]);
          }
        }
      });

      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Firebase initialization error:", error);
      setGameLog(prev => [...prev, "오류: 게임을 초기화할 수 없습니다."]);
    }
  }, []);

  // Firebase 인증 완료 후 멀티플레이어 데이터 리스너 설정
  useEffect(() => {
    if (!db || !isAuthReady || !userId || !auth) return;

    // 1. 공유 게임 로그 리스너
    // Firestore security rules adjust the path.
    // Public data is at /artifacts/{appId}/public/data/{your_collection_name}
    const sharedLogCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'sharedGameLog');
    const qSharedLog = query(sharedLogCollectionRef);
    const unsubscribeSharedLog = onSnapshot(qSharedLog, (snapshot) => {
      const logs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0)); // Sort by timestamp
      setSharedGameLog(logs);
    }, (error) => {
      console.error("Shared game log snapshot error:", error);
    });

    // 2. 활성 사용자 목록 리스너
    // Public data is at /artifacts/{appId}/public/data/{your_collection_name}
    const activeUsersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers');
    const qActiveUsers = query(activeUsersCollectionRef);
    const unsubscribeActiveUsers = onSnapshot(qActiveUsers, (snapshot) => {
      const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setActiveUsers(users);
    }, (error) => {
      console.error("Active users snapshot error:", error);
    });

    // Update user presence (periodically)
    const updateUserPresence = async () => {
      if (userId) {
        try {
          const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
          await setDoc(userDocRef, {
            lastActive: serverTimestamp(),
            displayName: `플레이어 ${userId.substring(0, 4)}`, // Display only part of the user ID
          }, { merge: true });
        } catch (error) {
          console.error("Failed to update user presence:", error);
        }
      }
    };

    updateUserPresence(); // Initial update
    const presenceInterval = setInterval(updateUserPresence, 30000); // Update every 30 seconds

    return () => {
      unsubscribeSharedLog();
      unsubscribeActiveUsers();
      clearInterval(presenceInterval);
    };
  }, [db, isAuthReady, userId, auth]);


  // Set initial message and profession choices when the game starts
  useEffect(() => {
    if (gamePhase === 'characterSelection') {
      setGameLog([
        "환영합니다! 당신은 중세 유럽풍 판타지 왕국의 모험가가 될 것입니다.",
        "어떤 직업을 선택하시겠습니까?"
      ]);
      setCurrentChoices(Object.keys(professions).map(key => `${key}. ${professions[key].name}`));
    }
  }, [gamePhase]);

  // Scroll to the bottom whenever the game log is updated
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [gameLog]);

  // Scroll to the bottom whenever the shared log is updated
  useEffect(() => {
    if (sharedLogEndRef.current) {
      sharedLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [sharedGameLog]);

  // Define the system prompt to send to the LLM
  const systemPrompt = `
    You are the storyteller and game master for a medieval European fantasy text adventure game.
    Based on the player's choices and current game state, you must advance the story, describe new situations, and present the next choices.
    You narrate in the third person, mixing a serious, narrative tone with an objective, informative tone as appropriate.
    Information is provided through various means: direct explanations, indirect descriptions, NPC dialogues, items/documents, etc.
    The level of detail in descriptions can be flexibly adjusted by the LLM, but should be detailed for important or impressive scenes.
    The player's goals are not fixed; they are fluidly formed based on the player's choices and actions, leading to infinite endings.
    Consider a simple inventory system (focused on key story items), reflecting item acquisition or use in story descriptions.
    Simulate simple text-based combat (choice and probability-based). In combat, describe the enemy, the player's actions, probability-based outcomes, and changes in stats or damage.
    Stats (Strength, Intelligence, Agility, Charisma) exist, and you should narratively describe how these stats change and grow based on the player's actions.
    You can create LLM-based puzzles and guide their resolution. When presenting a puzzle, clearly state its content and how to solve it.
    There is no time limit.

    Implicitly introduce new quests through the story. For example, an NPC asking for help, or a discovery leading to a new objective.
    Implicitly manage NPC and faction reputations within the narrative. Describe how the player's actions affect NPC reactions.
    Introduce potential companions to the player. Once a companion is recruited, describe their presence and interactions with the player and the world.
    Clearly include quest progress, reputation changes, and companion interactions in the JSON output so the game logic can track them.

    You must always respond in a valid JSON format. Pay careful attention to syntax. All strings must be properly quoted, and there should be no trailing commas after the last element of an object or array. All elements in an array must be comma-separated. Strictly adhere to the following JSON schema:
    {
      "story": "Story text for the current situation (narrated in third person).",
      "choices": ["Choice 1", "Choice 2", ...],
      "inventoryUpdates": ["Item1", "Item2", ...],
      "statChanges": {"strength": 12, "intelligence": 10, ...},
      "location": "Player's current location",
      "reputationUpdates": {"FactionName": "Status", ...},
      "activeQuestsUpdates": ["Quest1", "Quest2", ...],
      "companionsUpdates": ["Companion1", "Companion2", ...]
    }
    Always provide between 2 and 5 'choices'.
    'inventoryUpdates', 'statChanges', 'location', 'reputationUpdates', 'activeQuestsUpdates', 'companionsUpdates' must include the current state even if there are no changes.
    Story text should be within 500 characters.
  `;

  // LLM text generation function (Gemini-2.0-flash)
  const callGeminiTextLLM = async (promptData) => {
    setIsTextLoading(true);
    console.log("DEBUG: Starting callGeminiTextLLM");
    // Enter your Gemini API key here.
    // Since this is not a Canvas environment, you must enter the key directly.
    const apiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8"; // <-- Enter your actual Gemini API key here!
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const userPrompt = `
      Current game phase: ${promptData.phase}
      Player profession: ${promptData.character.profession}
      Player initial motivation: ${promptData.character.initialMotivation}
      Current stats: ${JSON.stringify(promptData.character.stats)}
      Current inventory: ${JSON.stringify(promptData.character.inventory)}
      Current location: ${promptData.character.currentLocation}
      Current reputation: ${JSON.stringify(promptData.character.reputation)}
      Current active quests: ${JSON.stringify(promptData.character.activeQuests)}
      Current companions: ${JSON.stringify(promptData.character.companions)}
      Previous game log (last 5 items): ${JSON.stringify(promptData.history.slice(-5))}
      Player's last choice: ${promptData.playerChoice}

      Based on the above information, generate the next part of the story in Korean and provide choices according to the JSON schema in the system prompt.
    `;
    
    const chatHistory = [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "user", parts: [{ text: userPrompt }] }
    ];

    const payload = {
      contents: chatHistory,
    };
    console.log("DEBUG: Payload:", JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      console.log("DEBUG: Fetch response received.");

      if (!response.ok) {
          const errorBody = await response.text();
          console.error("DEBUG: HTTP Error Response:", response.status, response.statusText, errorBody);
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }

      const result = await response.json();
      console.log("DEBUG: Parsed JSON result:", JSON.stringify(result, null, 2));

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        
        let llmOutputText = result.candidates[0].content.parts[0].text;
        console.log("DEBUG: LLM Raw Output Text:", llmOutputText);
        
        // Extract JSON object from the LLM response, in case it includes pre/postamble text.
        const jsonMatch = llmOutputText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            llmOutputText = jsonMatch[0];
        } else {
            throw new Error("Valid JSON object not found in LLM response.");
        }
        
        // Attempt to parse the extracted JSON string.
        try {
            const llmOutput = JSON.parse(llmOutputText);
            console.log("DEBUG: LLM Parsed Output JSON:", JSON.stringify(llmOutput, null, 2));
            return llmOutput;
        } catch (parsingError) {
            console.error("JSON Parsing Error:", parsingError);
            console.error("Malformed JSON string from LLM:", llmOutputText);
            throw new Error(`LLM response was not valid JSON. Details: ${parsingError.message}`);
        }

      } else {
        console.error("LLM response structure is different than expected:", result);
        throw new Error("Invalid LLM response structure.");
      }
    } catch (error) {
      console.error("LLM API call error:", error);
      return {
        story: `오류: LLM API 호출 중 문제가 발생했습니다: ${error.message}. 네트워크 연결을 확인하고 다시 시도해주세요.`,
        choices: ["다시 시도"],
        inventoryUpdates: promptData.character.inventory,
        statChanges: promptData.character.stats,
        location: promptData.character.currentLocation,
        reputationUpdates: promptData.character.reputation,
        activeQuestsUpdates: promptData.character.activeQuests,
        companionsUpdates: promptData.character.companions,
      };
    } finally {
      setIsTextLoading(false);
      console.log("DEBUG: Finished callGeminiTextLLM");
    }
  };

  // Function to save game state.
  const saveGame = async () => {
    if (!db || !userId || !isAuthReady) {
      setGameLog(prev => [...prev, "오류: 게임을 저장할 수 없습니다. 인증 상태를 확인해주세요."]);
      return;
    }

    setIsTextLoading(true);
    try {
      // Private data is at /artifacts/{appId}/users/{userId}/{your_collection_name}
      const gameDocRef = doc(db, 'artifacts', appId, 'users', userId, 'textAdventureGame', 'gameState');
      await setDoc(gameDocRef, {
        gameLog: gameLog,
        gamePhase: gamePhase,
        playerCharacter: playerCharacter,
        currentChoices: currentChoices,
        timestamp: new Date().toISOString()
      });
      setGameLog(prev => [...prev, "\n게임이 성공적으로 저장되었습니다."]);
    } catch (error) {
      console.error("Game save error:", error);
      setGameLog(prev => [...prev, `\n게임 저장 중 오류가 발생했습니다: ${error.message}`]);
    } finally {
      setIsTextLoading(false);
    }
  };

  // Function to load game state.
  const loadGame = async () => {
    if (!db || !userId || !isAuthReady) {
      setGameLog(prev => [...prev, "오류: 게임을 불러올 수 없습니다. 인증 상태를 확인해주세요."]);
      return;
    }

    setIsTextLoading(true);
    try {
      // Private data is at /artifacts/{appId}/users/{userId}/{your_collection_name}
      const gameDocRef = doc(db, 'artifacts', appId, 'users', userId, 'textAdventureGame', 'gameState');
      const docSnap = await getDoc(gameDocRef);

      if (docSnap.exists()) {
        const savedData = docSnap.data();
        setGameLog(savedData.gameLog || []);
        setGamePhase(savedData.gamePhase || 'characterSelection');
        setPlayerCharacter(savedData.playerCharacter || {
          profession: '',
          stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 },
          inventory: [],
          initialMotivation: '',
          currentLocation: '왕국의 수도 외곽',
          reputation: {},
          activeQuests: [],
          companions: [],
        });
        setCurrentChoices(savedData.currentChoices || []);
        setGameLog(prev => [...prev, "\n게임이 성공적으로 불러와졌습니다."]);
      } else {
        setGameLog(prev => [...prev, "\n저장된 게임이 없습니다."]);
      }
    } catch (error) {
      console.error("Game load error:", error);
      setGameLog(prev => [...prev, `\n게임 불러오기 중 오류가 발생했습니다: ${error.message}`]);
    } finally {
      setIsTextLoading(false);
    }
  };

  // Function to send user feedback.
  const sendFeedback = async () => {
    if (!db || !userId || !isAuthReady || !feedbackText.trim()) {
      setGameLog(prev => [...prev, "피드백을 보낼 수 없습니다. 내용을 입력하거나 인증 상태를 확인해주세요."]);
      return;
    }

    setIsTextLoading(true);
    try {
      // Private data is at /artifacts/{appId}/users/{userId}/{your_collection_name}
      const feedbackCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'feedback');
      await addDoc(feedbackCollectionRef, {
        feedback: feedbackText,
        gameLogSnapshot: gameLog.slice(-10), // Snapshot of the last 10 logs
        playerCharacterSnapshot: playerCharacter,
        timestamp: serverTimestamp(),
      });
      setGameLog(prev => [...prev, "\n피드백이 성공적으로 전송되었습니다. 감사합니다!"]);
      setFeedbackText('');
      setShowFeedbackModal(false);
    } catch (error) {
      console.error("Feedback submission error:", error);
      setGameLog(prev => [...prev, `\n피드백 전송 중 오류가 발생했습니다: ${error.message}`]);
    } finally {
      setIsTextLoading(false);
    }
  };


  // Player choice button click handler
  const handleChoiceClick = async (choice) => {
    if (isTextLoading) return; // Do not process if text is loading

    setGameLog(prev => [...prev, `\n> 당신의 선택: ${choice}\n`]);
    setCurrentChoices([]); // Clear choices to prevent duplicate clicks and wait for next response

    let promptData;
    if (gamePhase === 'characterSelection') {
      const chosenProfessionKey = choice.split('.')[0].trim();
      const chosenProfession = professions[chosenProfessionKey];

      if (chosenProfession) {
        // Set initial character state when profession is selected
        const initialCharacterState = {
          profession: chosenProfession.name,
          stats: {
            strength: chosenProfession.name.includes('기사') || chosenProfession.name.includes('용병') ? 12 : 10,
            intelligence: chosenProfession.name.includes('마법사') ? 12 : 10,
            agility: chosenProfession.name.includes('도적') ? 12 : 10,
            charisma: chosenProfession.name.includes('왕족') ? 12 : 10,
          },
          inventory: [],
          initialMotivation: chosenProfession.motivation,
          currentLocation: '왕국의 수도 외곽',
          reputation: {},
          activeQuests: [],
          companions: [],
        };
        setPlayerCharacter(initialCharacterState); // Update character state first

        // Construct prompt data to send to LLM
        promptData = {
          phase: 'characterSelection',
          playerChoice: choice,
          character: initialCharacterState, // Pass the updated character state to LLM
          history: gameLog,
        };

        // Call LLM
        const llmResponse = await callGeminiTextLLM(promptData);
        setGameLog(prev => [...prev, llmResponse.story]);

        setPlayerCharacter(prev => ({
          ...prev,
          inventory: llmResponse.inventoryUpdates || prev.inventory,
          stats: llmResponse.statChanges || prev.stats,
          currentLocation: llmResponse.location || prev.currentLocation,
          reputation: llmResponse.reputationUpdates || prev.reputation,
          activeQuests: llmResponse.activeQuestsUpdates || prev.activeQuests,
          companions: llmResponse.companionsUpdates || prev.companions,
        }));
        setCurrentChoices(llmResponse.choices || []);
        setGamePhase('playing'); // Change game phase
      } else {
        setGameLog(prev => [...prev, "유효하지 않은 선택입니다. 제시된 직업 중 하나를 선택해주세요."]);
        setCurrentChoices(Object.keys(professions).map(key => `${key}. ${professions[key].name}`)); // Display profession choices again
      }

    } else { // gamePhase === 'playing'
      // Construct prompt data to send to LLM during game play
      promptData = {
        phase: 'playing',
        playerChoice: choice,
        character: playerCharacter, // Pass the current character state to LLM
        history: gameLog,
      };

      // Call LLM
      const llmResponse = await callGeminiTextLLM(promptData);
      setGameLog(prev => [...prev, llmResponse.story]);

      // Add LLM response to shared log (multiplayer feature)
      if (db && userId) {
        try {
          // Public data is at /artifacts/{appId}/public/data/{your_collection_name}
          const sharedLogCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'sharedGameLog');
          await addDoc(sharedLogCollectionRef, {
            userId: userId,
            displayName: `플레이어 ${userId.substring(0, 4)}`,
            content: `[${playerCharacter.profession}]의 선택: ${choice}\n\n${llmResponse.story}`,
            timestamp: serverTimestamp(),
          });
        } catch (error) {
          console.error("Failed to add to shared log:", error);
        }
      }

      setPlayerCharacter(prev => ({
        ...prev,
        inventory: llmResponse.inventoryUpdates || prev.inventory,
        stats: llmResponse.statChanges || prev.stats,
        currentLocation: llmResponse.location || prev.currentLocation,
        reputation: llmResponse.reputationUpdates || prev.reputation,
        activeQuests: llmResponse.activeQuestsUpdates || prev.activeQuests,
        companions: llmResponse.companionsUpdates || prev.companions,
      }));
      setCurrentChoices(llmResponse.choices || []);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-5xl bg-gray-800 rounded-lg shadow-xl p-6 md:p-8 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6">
        {/* Main game area */}
        <div className="flex flex-col w-full lg:w-2/3 space-y-6">
          {/* User ID display (for debugging and multi-user identification) */}
          {isAuthReady && userId && (
            <div className="text-xs text-gray-500 text-center mb-2">
              사용자 ID: {userId}
            </div>
          )}

          {/* Game text output area */}
          <div className="flex-grow bg-gray-700 p-4 rounded-md overflow-y-auto h-96 custom-scrollbar text-sm md:text-base leading-relaxed">
            {gameLog.map((line, index) => (
              <p key={index} className="whitespace-pre-wrap mb-1" dangerouslySetInnerHTML={{ __html: line.replace(/\n/g, '<br />') }}></p>
            ))}
            {isTextLoading && (
              <div className="flex justify-center items-center mt-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
                <span className="ml-3 text-gray-400">
                  이야기를 생성 중...
                </span>
              </div>
            )}
            <div ref={logEndRef} /> {/* Empty div for scroll position */}
          </div>

          {/* Character info display */}
          {gamePhase === 'playing' && (
            <div className="bg-gray-700 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1">
              <p><span className="font-semibold text-gray-100">직업:</span> {playerCharacter.profession}</p>
              <p><span className="font-semibold text-gray-100">위치:</span> {playerCharacter.currentLocation}</p>
              <p><span className="font-semibold text-gray-100">능력치:</span> 힘({playerCharacter.stats.strength}) 지능({playerCharacter.stats.intelligence}) 민첩({playerCharacter.stats.agility}) 카리스마({playerCharacter.stats.charisma})</p>
              <p><span className="font-semibold text-gray-100">인벤토리:</span> {playerCharacter.inventory.length > 0 ? playerCharacter.inventory.join(', ') : '비어있음'}</p>
              <p><span className="font-semibold text-gray-100">평판:</span> {Object.keys(playerCharacter.reputation).length > 0 ? Object.entries(playerCharacter.reputation).map(([key, value]) => `${key}: ${value}`).join(', ') : '없음'}</p>
              <p><span className="font-semibold text-gray-100">퀘스트:</span> {playerCharacter.activeQuests.length > 0 ? playerCharacter.activeQuests.join(', ') : '없음'}</p>
              <p><span className="font-semibold text-gray-100">동료:</span> {playerCharacter.companions.length > 0 ? playerCharacter.companions.join(', ') : '없음'}</p>
            </div>
          )}

          {/* Choice button area */}
          <div className="flex flex-col gap-3">
            {currentChoices.map((choice, index) => (
              <button
                key={index}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleChoiceClick(choice)}
                disabled={isTextLoading}
              >
                {choice}
              </button>
            ))}
          </div>

          {/* Save/Load and Feedback buttons */}
          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <button
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={saveGame}
              disabled={isTextLoading || !isAuthReady || !userId || gamePhase === 'characterSelection'}
            >
              게임 저장
            </button>
            <button
              className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={loadGame}
              disabled={isTextLoading || !isAuthReady || !userId}
            >
              게임 불러오기
            </button>
            <button
              className="flex-1 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setShowFeedbackModal(true)}
              disabled={isTextLoading || !isAuthReady || !userId}
            >
              피드백 보내기
            </button>
          </div>
        </div>

        {/* Multiplayer sidebar */}
        <div className="w-full lg:w-1/3 flex flex-col space-y-6 bg-gray-700 p-4 rounded-lg shadow-inner">
          <h3 className="text-lg font-bold text-gray-100 text-center mb-4">공유된 모험</h3>
          
          {/* Active user list */}
          <div className="bg-gray-600 p-3 rounded-md h-48 overflow-y-auto custom-scrollbar">
            <h4 className="text-md font-semibold text-gray-200 mb-2">현재 플레이어들:</h4>
            {activeUsers.length > 0 ? (
              <ul className="text-sm text-gray-300 space-y-1">
                {activeUsers.map(user => (
                  <li key={user.id} className="truncate">
                    <span className="font-medium text-blue-300">{user.displayName}</span> (ID: {user.id})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">활동 중인 플레이어가 없습니다.</p>
            )}
          </div>

          {/* Shared game log */}
          <div className="bg-gray-600 p-3 rounded-md flex-grow h-96 overflow-y-auto custom-scrollbar">
            <h4 className="text-md font-semibold text-gray-200 mb-2">모든 플레이어의 활동:</h4>
            {sharedGameLog.length > 0 ? (
              <div className="text-sm text-gray-300 space-y-2">
                {sharedGameLog.map((logEntry) => (
                  <div key={logEntry.id} className="border-b border-gray-500 pb-2 last:border-b-0">
                    <p className="text-xs text-gray-400 mb-1">
                      <span className="font-medium text-purple-300">{logEntry.displayName}</span> (
                      {logEntry.timestamp ? new Date(logEntry.timestamp.toMillis()).toLocaleTimeString() : '시간 없음'})
                    </p>
                    <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: logEntry.content.replace(/\n/g, '<br />') }}></p>
                  </div>
                ))}
                <div ref={sharedLogEndRef} />
              </div>
            ) : (
              <p className="text-sm text-gray-400">공유된 활동이 아직 없습니다.</p>
            )}
          </div>
        </div>
      </div>

      {/* Feedback modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-gray-100">피드백 보내기</h3>
            <textarea
              className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
              placeholder="게임에 대한 피드백을 여기에 작성해주세요..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              disabled={isTextLoading}
            ></textarea>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setShowFeedbackModal(false)}
                disabled={isTextLoading}
              >
                취소
              </button>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={sendFeedback}
                disabled={isTextLoading || !feedbackText.trim()}
              >
                보내기
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
        body {
          font-family: 'Noto Sans KR', sans-serif;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #4a5568; /* gray-600 */
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #6b7280; /* gray-500 */
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9ca3af; /* gray-400 */
        }
        `}
      </style>
    </div>
  );
}

export default App;