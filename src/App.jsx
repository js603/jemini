import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, // 익명 로그인 임포트
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  onSnapshot, 
  serverTimestamp, 
  addDoc,
  getDocs, // 추가: 문서 목록을 가져오기 위해
  deleteDoc // 추가: 문서를 삭제하기 위해
} from 'firebase/firestore';

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
  // 채팅 메시지 목록
  const [chatMessages, setChatMessages] = useState([]);
  // 현재 채팅 입력 값
  const [currentChatMessage, setCurrentChatMessage] = useState('');

  // Firebase 및 인증 상태
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // 스크롤을 최하단으로 유지하기 위한 ref
  const logEndRef = useRef(null);
  const sharedLogEndRef = useRef(null);
  const chatEndRef = useRef(null); // 채팅 로그를 위한 ref 추가

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
      // 60초 이내에 활동한 사용자만 필터링하여 UI에 표시합니다.
      const cutoffTime = Date.now() - 60 * 1000; // 60초 (1분)
      const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.lastActive && user.lastActive.toMillis() > cutoffTime); // lastActive 타임스탬프를 기준으로 필터링
      setActiveUsers(users);
    }, (error) => {
      console.error("Active users snapshot error:", error);
    });

    // 3. 채팅 메시지 리스너
    const chatCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
    const qChatMessages = query(chatCollectionRef);
    const unsubscribeChatMessages = onSnapshot(qChatMessages, (snapshot) => {
      const messages = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0)); // Sort by timestamp
      setChatMessages(messages);
    }, (error) => {
      console.error("Chat messages snapshot error:", error);
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
      unsubscribeChatMessages(); // 채팅 리스너 정리
      clearInterval(presenceInterval);
    };
  }, [db, isAuthReady, userId, auth]);

  // 비활성 사용자 정리 함수 (클라이언트 측)
  // 이 함수는 클라이언트 측에서 실행되므로, 앱이 실행 중일 때만 작동합니다.
  // 더 견고하고 안전한 방법은 Firebase Cloud Functions를 사용하는 것입니다.
  const cleanupInactiveUsers = async () => {
    if (!db || !isAuthReady || !userId) return;

    const inactiveThreshold = 1 * 60 * 1000; // 1분 (60초)
    const cutoffTime = Date.now() - inactiveThreshold;

    try {
      const activeUsersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers');
      const querySnapshot = await getDocs(activeUsersCollectionRef); // 모든 문서를 가져옵니다.

      querySnapshot.forEach(async (docSnapshot) => {
        const userData = docSnapshot.data();
        // lastActive 타임스탬프가 5분보다 오래된 사용자를 삭제합니다.
        if (userData.lastActive && userData.lastActive.toMillis() < cutoffTime) {
          console.log(`DEBUG: 비활성 사용자 삭제 중: ${docSnapshot.id}`);
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', docSnapshot.id));
        }
      });
    } catch (error) {
      console.error("비활성 사용자 정리 중 오류 발생:", error);
    }
  };

  // 비활성 사용자 정리를 위한 인터벌 설정
  useEffect(() => {
    if (!db || !isAuthReady || !userId) return;

    // 1분마다 비활성 사용자 정리 함수를 실행합니다.
    const cleanupInterval = setInterval(cleanupInactiveUsers, 1 * 60 * 1000); // 1분마다 실행

    return () => clearInterval(cleanupInterval); // 컴포넌트 언마운트 시 인터벌 정리
  }, [db, isAuthReady, userId]); // db, isAuthReady, userId가 변경될 때마다 재실행

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

  // Scroll to the bottom whenever chat messages are updated
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // Define the system prompt to send to the LLM
    const systemPrompt = `
    당신은 중세 유럽풍 판타지 텍스트 어드벤처 게임의 스토리텔러이자 게임 마스터입니다.
    플레이어의 선택과 현재 게임 상태를 기반으로 스토리를 진행하고, 새로운 상황을 묘사하며, 다음 선택지를 제시해야 합니다.
    당신은 3인칭으로 서술하며, 진지하고 서사적인 어조와 객관적이고 정보 전달적인 어조를 적절히 섞어 사용합니다.
    정보는 직접적인 설명, 간접적인 묘사, NPC 대화, 아이템/문서 등 다양한 방식으로 제공합니다.
    묘사의 세부 정도는 LLM이 유연하게 조절하되, 중요하거나 인상적인 장면에서는 상세하게 묘사합니다.
    플레이어의 목표는 고정되어 있지 않으며, 플레이어의 선택과 행동에 따라 유동적으로 형성되어 무한한 엔딩으로 이어집니다.
    간단한 인벤토리 시스템(주요 스토리 아이템 위주)을 고려하며, 아이템 획득 또는 사용 시 스토리 묘사에 반영합니다.
    간단한 텍스트 기반 전투(선택 및 확률 기반)를 시뮬레이션합니다. 전투 시 적을 묘사하고, 플레이어의 행동, 능력치와 확률에 기반한 결과, 능력치 변화 또는 피해를 묘사합니다.
    능력치(힘, 지능, 민첩, 카리스마)가 존재하며, 플레이어의 행동에 따라 능력치가 어떻게 변화하고 성장하는지 서사적으로 묘사해야 합니다.
    LLM 기반 퍼즐을 생성하고 해결을 유도할 수 있습니다. 퍼즐을 제시할 때는 퍼즐의 내용과 해결 방법을 명확히 제시합니다.
    시간 제한은 없습니다.

    이야기를 통해 새로운 퀘스트를 암시적으로 도입합니다. 예를 들어, NPC가 도움을 요청하거나, 어떤 발견이 새로운 목표로 이어질 수 있습니다.
    NPC 및 세력 평판을 이야기 내에서 암시적으로 관리합니다. 플레이어의 행동이 NPC 반응에 어떻게 영향을 미치는지 묘사합니다.
    플레이어에게 잠재적인 동료를 소개합니다. 동료가 영입되면, 그들의 존재와 플레이어 및 세계와의 상호작용을 묘사합니다.
    퀘스트 진행 상황, 평판 변화, 동료 상호작용을 JSON 출력에 명확히 포함하여 게임 로직이 이를 추적할 수 있도록 합니다.

    당신은 항상 유효한 JSON 형식으로 응답해야 합니다. 구문에 세심한 주의를 기울이십시오. 모든 문자열은 올바르게 인용되어야 하며, 객체 또는 배열의 마지막 요소 뒤에 후행 쉼표가 없어야 합니다. 배열의 모든 요소는 쉼표로 구분되어야 합니다. 다음 JSON 스키마를 엄격히 따르십시오:
    {
      "story": "현재 상황에 대한 스토리 텍스트 (3인칭으로 서술).",
      "choices": ["선택지 1", "선택지 2", ...],
      "inventoryUpdates": ["아이템1", "아이템2", ...],
      "statChanges": {"strength": 12, "intelligence": 10, ...},
      "location": "플레이어의 현재 위치",
      "reputationUpdates": {"세력명": "상태", ...},
      "activeQuestsUpdates": ["퀘스트1", "퀘스트2", ...],
      "companionsUpdates": ["동료1", "동료2", ...]
    }
    항상 2개에서 5개 사이의 'choices'를 제공하십시오.
    'inventoryUpdates', 'statChanges', 'location', 'reputationUpdates', 'activeQuestsUpdates', 'companionsUpdates'는 변경 사항이 없더라도 현재 상태를 포함하여야 합니다.
    스토리 텍스트는 500자 이내여야 합니다.
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
      현재 게임 단계: ${promptData.phase}
      플레이어 직업: ${promptData.character.profession}
      플레이어 초기 동기: ${promptData.character.initialMotivation}
      현재 능력치: ${JSON.stringify(promptData.character.stats)}
      현재 인벤토리: ${JSON.stringify(promptData.character.inventory)}
      현재 위치: ${promptData.character.currentLocation}
      현재 평판: ${JSON.stringify(promptData.character.reputation)}
      현재 활성 퀘스트: ${JSON.stringify(promptData.character.activeQuests)}
      현재 동료: ${JSON.stringify(promptData.character.companions)}
      이전 게임 로그 (마지막 5개 항목): ${JSON.stringify(promptData.history.slice(-5))}
      플레이어의 마지막 선택: ${promptData.playerChoice}

      위 정보를 바탕으로 다음 스토리 부분을 한국어로 생성하고, 시스템 프롬프트의 JSON 스키마에 따라 선택지를 제공하십시오.
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

  // Function to send a chat message
  const sendChatMessage = async () => {
    if (!db || !userId || !isAuthReady || !currentChatMessage.trim()) {
      console.warn("채팅 메시지를 보낼 수 없습니다. 내용을 입력하거나 인증 상태를 확인해주세요.");
      return;
    }

    try {
      const chatCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
      await addDoc(chatCollectionRef, {
        userId: userId,
        displayName: `플레이어 ${userId.substring(0, 4)}`,
        message: currentChatMessage,
        timestamp: serverTimestamp(),
      });
      setCurrentChatMessage(''); // 메시지 전송 후 입력 필드 초기화
    } catch (error) {
      console.error("채팅 메시지 전송 중 오류 발생:", error);
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

          {/* Chat section */}
          <div className="bg-gray-600 p-3 rounded-md flex flex-col h-64">
            <h4 className="text-md font-semibold text-gray-200 mb-2">채팅:</h4>
            <div className="flex-grow overflow-y-auto custom-scrollbar mb-3 text-sm text-gray-300 space-y-2">
              {chatMessages.length > 0 ? (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="border-b border-gray-500 pb-1 last:border-b-0">
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-green-300">{msg.displayName}</span> (
                      {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString() : '시간 없음'}):
                    </p>
                    <p>{msg.message}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">아직 채팅 메시지가 없습니다.</p>
              )}
              <div ref={chatEndRef} /> {/* Empty div for scroll position */}
            </div>
            <div className="flex">
              <input
                type="text"
                className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="메시지를 입력하세요..."
                value={currentChatMessage}
                onChange={(e) => setCurrentChatMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    sendChatMessage();
                  }
                }}
                disabled={!isAuthReady || !userId}
              />
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-r-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                onClick={sendChatMessage}
                disabled={!isAuthReady || !userId || !currentChatMessage.trim()}
              >
                보내기
              </button>
            </div>
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