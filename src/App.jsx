import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
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
  getDocs,
  deleteDoc,
  where,
  runTransaction
} from 'firebase/firestore';

// ====================================================================
// Firebase configuration information - 수정 금지
const defaultFirebaseConfig = {
  apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
  authDomain: "text-adventure-game-cb731.firebaseapp.com",
  projectId: "text-adventure-game-cb731",
  storageBucket: "text-adventure-game-cb731.appspot.com",
  messagingSenderId: "1092941614820",
  appId: "1:1092941614820:web:5545f36014b73c268026f1",
  measurementId: "G-FNGF42T1FP"
};

// 수정금지
const firebaseConfig = defaultFirebaseConfig;
const appId = firebaseConfig.projectId;
const initialAuthToken = null;
// ====================================================================

const professions = {
  '1': { name: '몰락한 귀족/기사', motivation: '가문의 몰락 원인을 조사하고, 잃어버린 가문의 보물을 찾아야 합니다.' },
  '2': { name: '평범한 마을 사람/농부', motivation: '갑자기 마을에 나타난 괴생명체로부터 마을을 지켜야 합니다.' },
  '3': { name: '젊은 마법사/견습생', motivation: '스승님의 실종에 대한 단서를 찾아야 합니다.' },
  '4': { name: '용병/모험가', motivation: '의뢰받은 임무를 수행하던 중 예상치 못한 사건에 휘말렸습니다.' },
  '5': { name: '도적/암살자', motivation: '길드에서 내려온 첫 번째 임무를 완수하고, 그 과정에서 수상한 음모를 감지해야 합니다.' },
  '6': { name: '왕족/공주/왕자', motivation: '왕실 내의 불화와 암투 속에서 자신의 입지를 다져야 합니다.' },
};

// Firestore 경로 유틸
const getMainScenarioRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'mainScenario', 'main');
const getPrivatePlayerStateRef = (db, appId, userId) => doc(db, 'artifacts', appId, 'users', userId, 'playerState', 'state');

// 상태 초기화 유틸
const getDefaultGameState = () => ({
  phase: 'characterSelection',
  log: [
    "환영합니다! 당신은 중세 유럽풍 판타지 왕국의 모험가가 될 것입니다. 당신은 지금 '방랑자의 안식처'라는 아늑한 여관에 도착했습니다.",
    "어떤 직업을 선택하시겠습니까?"
  ],
  choices: Object.keys(professions).map(key => `${key}. ${professions[key].name}`),
  player: { // 공유 정보나 기본 UI 표시용
    profession: '',
    currentLocation: '방랑자의 안식처',
  },
});

const getDefaultPrivatePlayerState = () => ({
    stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 },
    inventory: [],
    initialMotivation: '',
    reputation: {},
    activeQuests: [],
    companions: [],
    knownClues: [], // 개인적으로 알고 있는 단서
});


function App() {
  const [gameState, setGameState] = useState(getDefaultGameState());
  const [privatePlayerState, setPrivatePlayerState] = useState(getDefaultPrivatePlayerState());
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const [actingPlayer, setActingPlayer] = useState(null);
  const [isActionInProgress, setIsActionInProgress] = useState(false);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const logEndRef = useRef(null);
  const chatEndRef = useRef(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');
  const [showNicknameModal, setShowNicknameModal] = useState(!localStorage.getItem('nickname'));
  const [nicknameInput, setNicknameInput] = useState('');
  const [accordion, setAccordion] = useState({ gameLog: true, chat: true, users: true, playerInfo: true });
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [llmRetryPrompt, setLlmRetryPrompt] = useState(null);

  const handleNicknameSubmit = () => {
    if (nicknameInput.trim()) {
      const finalNickname = nicknameInput.trim();
      setNickname(finalNickname);
      localStorage.setItem('nickname', finalNickname);
      setShowNicknameModal(false);
      if (userId && db) {
          const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
          setDoc(userDocRef, { nickname: finalNickname }, { merge: true });
      }
    }
  };

  const getDisplayName = (uid) => {
    if (uid === userId) return nickname || `플레이어 ${userId?.substring(0, 4)}`;
    const user = activeUsers.find(u => u.id === uid);
    return user?.nickname || `플레이어 ${uid?.substring(0, 4)}`;
  };

  const resetAllGameData = async () => {
    if (!db || !isAuthReady) return;
    setIsResetting(true);
    try {
        const collectionsToDelete = [
            collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages'),
            collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers'),
        ];

        for (const colRef of collectionsToDelete) {
            const snapshot = await getDocs(colRef);
            for (const docSnap of snapshot.docs) {
                await deleteDoc(docSnap.ref);
            }
        }

        const usersColRef = collection(db, 'artifacts', appId, 'users');
        const usersSnapshot = await getDocs(usersColRef);
        for (const userDoc of usersSnapshot.docs) {
            const playerStateColRef = collection(db, 'artifacts', appId, 'users', userDoc.id, 'playerState');
            const playerStateSnapshot = await getDocs(playerStateColRef);
            for (const stateDoc of playerStateSnapshot.docs) {
                await deleteDoc(stateDoc.ref);
            }
        }

        const mainScenarioRef = getMainScenarioRef(db, appId);
        await setDoc(mainScenarioRef, { ...getDefaultGameState(), storyLog: getDefaultGameState().log, lastUpdate: serverTimestamp() });
        
        const gameStatusRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
        await deleteDoc(gameStatusRef);

        setGameState(getDefaultGameState());
        setPrivatePlayerState(getDefaultPrivatePlayerState());
        setChatMessages([]);

    } catch (e) {
      setGameState(prev => ({ ...prev, log: [...prev.log, '데이터 초기화 중 오류 발생: ' + e.message] }));
    } finally {
      setIsResetting(false);
      setShowResetModal(false);
    }
  };

  useEffect(() => {
    try {
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
            await (initialAuthToken ? signInWithCustomToken(firebaseAuth, initialAuthToken) : signInAnonymously(firebaseAuth));
        }
      });
      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Firebase initialization error:", error);
    }
  }, []);
  
  useEffect(() => {
    if (!db || !userId || !isAuthReady) return;

    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
    const unsubscribe = onSnapshot(privateStateRef, (docSnap) => {
        if (docSnap.exists()) {
            setPrivatePlayerState(docSnap.data());
        } else {
            setDoc(privateStateRef, getDefaultPrivatePlayerState());
        }
    }, (error) => {
        console.error("Private player state snapshot error:", error);
    });

    return () => unsubscribe();
  }, [db, userId, isAuthReady]);

  useEffect(() => {
    if (!db || !isAuthReady || !userId || !auth) return;

    const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
    const unsubscribeGameStatus = onSnapshot(gameStatusDocRef, (docSnap) => {
      const data = docSnap.data();
      setIsActionInProgress(data?.isActionInProgress || false);
      setActingPlayer(data?.actingPlayer || null);
    });

    const chatMessagesColRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
    const unsubscribeChat = onSnapshot(query(chatMessagesColRef), (snapshot) => {
        const messages = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
        setChatMessages(messages);
    });

    const activeUsersColRef = collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers');
    const unsubscribeActiveUsers = onSnapshot(query(activeUsersColRef), (snapshot) => {
      const cutoffTime = Date.now() - 60 * 1000;
      const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.lastActive && user.lastActive.toMillis() > cutoffTime);
      setActiveUsers(users);
    });
    
    const updateUserPresence = async () => {
      if (userId) {
        const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
        await setDoc(userDocRef, {
          lastActive: serverTimestamp(),
          nickname: nickname || `플레이어 ${userId.substring(0, 4)}`,
          profession: gameState.player.profession,
        }, { merge: true });
      }
    };
    updateUserPresence();
    const presenceInterval = setInterval(updateUserPresence, 30000);

    return () => {
      unsubscribeGameStatus();
      unsubscribeChat();
      unsubscribeActiveUsers();
      clearInterval(presenceInterval);
    };
  }, [db, isAuthReady, userId, auth, nickname, gameState.player.profession]);

  useEffect(() => {
    if (accordion.gameLog && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [gameState.log, accordion.gameLog]);

  useEffect(() => {
    if (accordion.chat && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, accordion.chat]);
  
  // ====================================================================
  // LLM PROMPT ENGINEERING SECTION
  // ====================================================================

  const systemPrompt = `
    ### 페르소나 (Persona)
    당신은 TRPG(Tabletop Role-Playing Game)의 최고 실력자 '게임 마스터(GM)'입니다. 당신의 임무는 단순한 스토리 생성이 아니라, 각 플레이어가 자신의 서사의 주인공이 되면서도, 모두가 하나의 거대한 세계관 속에서 살아 숨 쉬고 있다는 느낌을 받도록 만드는 것입니다. 당신은 유려한 문장가이자, 치밀한 설계자이며, 플레이어들의 행동에 즉각적으로 반응하는 유연한 스토리텔러입니다.

    ### 핵심 철학: 하이브리드 월드 (Hybrid World)
    이 세계는 '공유된 현실'과 '개인적인 서사'가 공존합니다.
    1.  **공유된 현실 (Shared Reality):** 세상의 중요한 사건, 장소의 변화, 주요 NPC의 죽음 등은 모든 플레이어가 함께 경험하는 절대적인 현실입니다. 이는 'story'와 'sharedStateUpdates'로 표현됩니다.
    2.  **개인적인 서사 (Personal Narrative):** 플레이어의 내면의 생각, 남들은 모르는 비밀 지식, 개인적인 퀘스트의 진행 등은 오직 그 플레이어에게만 주어지는 고유한 경험입니다. 이는 'privateStory', 'privateChoices', 'privateStateUpdates'로 표현됩니다.

    ### 스토리텔링 원칙
    * **보여주되, 말하지 말라 (Show, Don't Tell):** '그는 화가 났다'가 아니라 '그는 주먹을 불끈 쥐었다'라고 묘사하십시오.
    * **역할 존중:** 플레이어의 직업, 능력치, 아이템, 그리고 특히 **'[개인 정보]'**에 담긴 단서('knownClues')나 퀘스트('activeQuests')는 당신이 스토리를 만들 때 가장 먼저 고려해야 할 재료입니다. 이것이 개인화된 경험의 핵심입니다.
    * **살아있는 세계:** '[주변 플레이어]' 정보를 활용하여 다른 플레이어들의 존재를 이야기에 자연스럽게 녹여내십시오. 그들의 등장은 단순한 배경이 아니라, 새로운 사건의 계기가 되어야 합니다.
    * **선택의 무게:** 플레이어의 선택은 반드시 의미 있는 결과를 가져와야 합니다. 사소한 선택이 나비효과를 일으킬 수도 있습니다.

    ### JSON 출력 규칙 (매우 중요)
    당신은 반드시 아래의 JSON 구조를 완벽하게 따라야 합니다. 설명(comment)은 절대 포함하지 마십시오.
    {
      "story": "모든 플레이어가 볼 수 있는 공유된 사건에 대한 3인칭 서사. 이 사건의 결과로 세상이 어떻게 변했는지 객관적으로 묘사합니다.",
      "privateStory": "선택을 한 플레이어만 볼 수 있는 2인칭 서사. '당신은...', '...라고 느낀다.' 와 같이 내면의 생각, 감각, 남들이 눈치채지 못한 미세한 발견 등을 묘사합니다.",
      "choices": [
        "다른 플레이어들도 선택할 수 있는 일반적인 행동들."
      ],
      "privateChoices": [
        "오직 이 플레이어의 직업, 아이템, 퀘스트, 단서 때문에 가능한 특별한 행동들."
      ],
      "sharedStateUpdates": {
        "location": "플레이어 그룹의 현재 위치. 변경되었을 경우에만 포함됩니다."
      },
      "privateStateUpdates": {
        "inventory": ["업데이트된 전체 인벤토리 목록"],
        "stats": {"strength": 12, "intelligence": 10, ...},
        "activeQuests": ["업데이트된 개인 퀘스트 목록"],
        "knownClues": ["새롭게 알게 된 단서를 포함한 전체 단서 목록"],
        "companions": ["업데이트된 동료 목록"],
        "reputation": {"세력명": "상태", ...}
      }
    }

    ### 규칙 상세
    * 'privateChoices' 예시: 플레이어의 'knownClues'에 '가문의 문장'이 있다면, "가문의 문장을 제단에 맞춰본다." 와 같은 선택지를 제공하십시오.
    * **상태 업데이트:** 'privateStateUpdates'의 모든 필드는 **변경 여부와 관계없이 항상 현재 플레이어의 전체 상태를 포함**하여 보내야 합니다. 예를 들어, 아이템을 하나 얻었다면, 기존 아이템을 포함한 전체 인벤토리 목록을 'inventory'에 담아야 합니다.
    * 'story'와 'privateStory'는 합쳐서 500자 이내로 간결하게 작성하십시오.
  `;

  const callGeminiTextLLM = async (promptData) => {
    setIsTextLoading(true);
    setLlmRetryPrompt(promptData);
    const apiKey = ""; // API 키는 환경에 따라 제공되며, 하드코딩하지 않습니다.
    const getApiUrl = (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
    
    // LLM이 상황을 명확하게 파악하도록 구조화된 User Prompt
    const userPrompt = `
      [상황 분석 요청]
      아래 정보를 바탕으로 플레이어의 행동에 대한 결과를 생성해주십시오.

      [공유 컨텍스트]
      - 현재 위치: ${promptData.sharedInfo.currentLocation}
      - 이전 주요 사건 로그 (최대 3개): ${JSON.stringify(promptData.history.slice(-3))}

      [개인 정보 (현재 플레이어)]
      - 직업: ${promptData.privateInfo.profession || gameState.player.profession}
      - 능력치: ${JSON.stringify(promptData.privateInfo.stats)}
      - 인벤토리: ${JSON.stringify(promptData.privateInfo.inventory)}
      - 활성 퀘스트: ${JSON.stringify(promptData.privateInfo.activeQuests)}
      - 알려진 단서: ${JSON.stringify(promptData.privateInfo.knownClues)}
      - 평판: ${JSON.stringify(promptData.privateInfo.reputation)}

      [플레이어의 행동]
      - 선택: "${promptData.playerChoice}"

      [주변 플레이어]
      - ${promptData.activeUsers.length > 0 ? JSON.stringify(promptData.activeUsers) : "현재 주변에 다른 플레이어가 없습니다."}
    `;

    const payload = { contents: [{ role: "user", parts: [{ text: systemPrompt }] }, { role: "model", parts: [{ text: "{}" }] }, { role: "user", parts: [{ text: userPrompt }] }] };

    try {
      const response = await fetch(getApiUrl(apiKey), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      const llmOutputText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const jsonMatch = llmOutputText?.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error("Valid JSON object not found in LLM response.");
    } catch (error) {
      console.error("LLM API call error:", error);
      setLlmError(error.message || 'LLM 호출 실패');
      return null;
    } finally {
      setIsTextLoading(false);
    }
  };

  // ====================================================================
  // END OF LLM PROMPT ENGINEERING SECTION
  // ====================================================================


  const sendChatMessage = async () => {
    if (!db || !userId || !isAuthReady || !currentChatMessage.trim()) return;
    try {
      const chatCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
      await addDoc(chatCollectionRef, { userId, displayName: getDisplayName(userId), message: currentChatMessage, timestamp: serverTimestamp() });
      setCurrentChatMessage('');
    } catch (error) {
      console.error("Error sending chat message:", error);
    }
  };

  // *** 권한 오류 수정을 위해 isAuthReady를 의존성에 추가하고 로직을 수정 ***
  useEffect(() => {
    if (!db || !appId || !isAuthReady) return; // 인증이 준비될 때까지 대기
    const ref = getMainScenarioRef(db, appId);
    const unsubscribe = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGameState(prev => ({
          ...prev,
          log: data.storyLog || prev.log,
          choices: data.choices || [],
          phase: data.phase || prev.phase,
          player: { ...prev.player, currentLocation: data.player?.currentLocation || prev.player.currentLocation }
        }));
      } else {
        // 최초 시나리오 생성
        const def = getDefaultGameState();
        try {
            await setDoc(ref, { ...def, storyLog: def.log, lastUpdate: serverTimestamp() }, { merge: true });
            setGameState(def);
        } catch (e) {
            console.error("Failed to create initial scenario:", e);
        }
      }
    }, (error) => {
      console.error("Main scenario snapshot error:", error);
      setLlmError("시나리오를 불러오는 중 오류가 발생했습니다. 페이지를 새로고침 해보세요.");
    });
    return () => unsubscribe();
  }, [db, appId, isAuthReady]); // isAuthReady를 의존성 배열에 추가

  const updateGameStateFromLLM = async (llmResponse) => {
    if (!db || !appId || !userId) return;
    
    const mainScenarioRef = getMainScenarioRef(db, appId);
    const newChoices = [...(llmResponse.choices || []), ...(llmResponse.privateChoices || [])];

    try {
        await runTransaction(db, async (transaction) => {
            const scenarioDoc = await transaction.get(mainScenarioRef);
            if (!scenarioDoc.exists()) throw "시나리오 문서가 존재하지 않습니다.";
            
            const currentData = scenarioDoc.data();
            // 트랜잭션에서는 공유 로그만 업데이트
            const publicLog = [...(currentData.storyLog || []), llmResponse.story];
            
            transaction.update(mainScenarioRef, {
                storyLog: publicLog,
                choices: newChoices,
                phase: 'playing',
                'player.currentLocation': llmResponse.sharedStateUpdates?.location || currentData.player.currentLocation,
                lastUpdate: serverTimestamp(),
                lastActor: { id: userId, displayName: getDisplayName(userId) }
            });
        });

        // 트랜잭션 성공 후, 로컬 상태에만 개인 스토리 추가
        // onSnapshot이 비동기적으로 작동하므로, 즉각적인 UI 반영을 위해 로컬 상태를 직접 조작
        const docSnap = await getDoc(mainScenarioRef);
        const updatedPublicLog = docSnap.data().storyLog;
        const finalLog = llmResponse.privateStory 
            ? [...updatedPublicLog, `\n[당신만 아는 사실] ${llmResponse.privateStory}`]
            : [...updatedPublicLog];
        
        setGameState(prev => ({...prev, log: finalLog, choices: newChoices}));

    } catch (error) {
        console.error("공유 상태 업데이트 실패:", error);
        setLlmError("시나리오를 업데이트하는 데 실패했습니다.");
    }

    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
    if (llmResponse.privateStateUpdates) {
        await setDoc(privateStateRef, llmResponse.privateStateUpdates, { merge: false });
    }
  };

  const handleChoiceClick = async (choice) => {
    if (isTextLoading || isActionInProgress) return;

    const gameStatusRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');

    try {
      await runTransaction(db, async (transaction) => {
        const statusDoc = await transaction.get(gameStatusRef);
        if (statusDoc.exists() && statusDoc.data().isActionInProgress) {
          throw new Error("다른 플레이어가 행동 중입니다. 잠시 후 다시 시도해주세요.");
        }
        transaction.set(gameStatusRef, {
          isActionInProgress: true,
          actingPlayer: { id: userId, displayName: getDisplayName(userId) }
        }, { merge: true });
      });

      const newLog = [...gameState.log, `\n> ${choice}`];
      setGameState(prev => ({ ...prev, log: newLog }));
      
      if (gameState.phase === 'characterSelection') {
        const choiceKey = choice.split('.')[0];
        const selectedProfession = professions[choiceKey];
        if (selectedProfession) {
          const initialMotivation = selectedProfession.motivation;
          const finalLog = [...newLog, `\n당신은 '${selectedProfession.name}'입니다. ${initialMotivation}`];
          const choices = ["여관을 둘러본다.", "다른 모험가에게 말을 건다.", "여관 주인에게 정보를 묻는다."];
          
          const mainScenarioRef = getMainScenarioRef(db, appId);
          await setDoc(mainScenarioRef, {
              phase: 'playing',
              storyLog: finalLog,
              choices: choices,
              lastUpdate: serverTimestamp(),
              lastActor: { id: userId, displayName: getDisplayName(userId) }
          }, { merge: true });

          const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
          const newPrivateState = getDefaultPrivatePlayerState();
          newPrivateState.initialMotivation = initialMotivation;
          await setDoc(privateStateRef, newPrivateState, { merge: true });
          
          setGameState(prev => ({ ...prev, player: {...prev.player, profession: selectedProfession.name }}));
          return;
        }
      }

      const promptData = {
        playerChoice: choice,
        sharedInfo: {
            currentLocation: gameState.player.currentLocation,
        },
        privateInfo: {
            ...privatePlayerState,
            profession: gameState.player.profession // privateInfo에 직업 정보 추가
        },
        history: newLog,
        activeUsers: activeUsers.map(u => ({ nickname: getDisplayName(u.id), profession: u.profession })).filter(u => u.id !== userId),
      };
      
      const llmResponse = await callGeminiTextLLM(promptData);
      if (llmResponse) {
        await updateGameStateFromLLM(llmResponse);
        setLlmError(null);
      } else {
        throw new Error("LLM으로부터 유효한 응답을 받지 못했습니다.");
      }
    } catch (error) {
      console.error("행동 처리 중 오류:", error.message);
      setLlmError(error.message);
    } finally {
      await setDoc(gameStatusRef, { isActionInProgress: false, actingPlayer: null }, { merge: true });
      setIsTextLoading(false);
    }
  };

  const toggleAccordion = (key) => {
    setAccordion(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-gray-100">닉네임을 입력하세요</h3>
            <input
              className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
              placeholder="닉네임"
              value={nicknameInput}
              onChange={e => setNicknameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleNicknameSubmit(); }}
              autoFocus
            />
            <button
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50"
              onClick={handleNicknameSubmit}
              disabled={!nicknameInput.trim()}
            >
              시작하기
            </button>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-red-400">⚠️ 모든 데이터를 초기화할까요?</h3>
            <p className="text-gray-200">이 작업은 되돌릴 수 없습니다. 모든 시나리오, 로그, 유저, 채팅 데이터가 삭제됩니다.</p>
            <div className="flex justify-end gap-3">
              <button className="px-4 py-2 bg-gray-600 hover:bg-gray-700 font-bold rounded-md" onClick={() => setShowResetModal(false)} disabled={isResetting}>취소</button>
              <button className="px-4 py-2 bg-red-600 hover:bg-red-700 font-bold rounded-md" onClick={resetAllGameData} disabled={isResetting}>{isResetting ? '초기화 중...' : '초기화'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl bg-gray-800 rounded-lg shadow-xl p-6 md:p-8 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6">
        <div className="flex flex-col w-full lg:w-2/3 space-y-6">
          <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('gameLog')}>
              <h2 className="text-lg font-bold text-gray-100">게임 로그</h2>
              <div className="text-xl">{accordion.gameLog ? '▼' : '▲'}</div>
            </div>
            {accordion.gameLog && (
              <>
                <div className="flex justify-end mb-2">
                  <button className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md" onClick={() => setShowResetModal(true)}>전체 데이터 초기화</button>
                </div>
                <div className="flex-grow bg-gray-700 p-4 rounded-md overflow-y-auto h-96 custom-scrollbar text-sm md:text-base leading-relaxed" style={{ maxHeight: '24rem' }}>
                  {gameState.log.map((line, index) => (
                    <p key={index} className="whitespace-pre-wrap mb-1" dangerouslySetInnerHTML={{ __html: line.replace(/\n/g, '<br />') }}></p>
                  ))}
                  {isTextLoading && (
                    <div className="flex justify-center items-center mt-4">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
                      <span className="ml-3 text-gray-400">이야기를 생성 중...</span>
                    </div>
                  )}
                  {isActionInProgress && (!actingPlayer || actingPlayer.id !== userId) && (
                      <div className="text-center text-yellow-400 font-semibold p-2 bg-black bg-opacity-20 rounded-md mt-2">
                          {actingPlayer ? `${getDisplayName(actingPlayer.id)}님이 선택하고 있습니다...` : "다른 플레이어가 선택하고 있습니다..."}
                      </div>
                  )}
                  {llmError && <div className="text-red-400 p-2 bg-red-900 bg-opacity-50 rounded mt-2">오류: {llmError}</div>}
                  <div ref={logEndRef} />
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {gameState.choices.map((choice, index) => (
              <button
                key={index}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleChoiceClick(choice)}
                disabled={isTextLoading || isActionInProgress}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full lg:w-1/3 flex flex-col space-y-6 bg-gray-700 p-4 rounded-lg shadow-inner">
            <div className="mb-2">
                <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('playerInfo')}>
                    <h4 className="text-md font-semibold text-gray-200">내 정보</h4>
                    <div className="text-xl">{accordion.playerInfo ? '▼' : '▲'}</div>
                </div>
                {accordion.playerInfo && gameState.phase === 'playing' && (
                  <div className="bg-gray-600 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1 h-48 overflow-y-auto custom-scrollbar">
                    <p><span className="font-semibold text-blue-300">직업:</span> {gameState.player.profession}</p>
                    <p><span className="font-semibold text-blue-300">위치:</span> {gameState.player.currentLocation}</p>
                    <p><span className="font-semibold text-blue-300">능력치:</span> 힘({privatePlayerState.stats.strength}) 지능({privatePlayerState.stats.intelligence}) 민첩({privatePlayerState.stats.agility}) 카리스마({privatePlayerState.stats.charisma})</p>
                    <p><span className="font-semibold text-blue-300">인벤토리:</span> {privatePlayerState.inventory.join(', ') || '비어있음'}</p>
                    <p><span className="font-semibold text-blue-300">퀘스트:</span> {privatePlayerState.activeQuests.join(', ') || '없음'}</p>
                    <p><span className="font-semibold text-blue-300">단서:</span> {privatePlayerState.knownClues.join(', ') || '없음'}</p>
                  </div>
                )}
            </div>
            <div className="mb-2">
                <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('users')}>
                    <h4 className="text-md font-semibold text-gray-200">현재 플레이어들</h4>
                    <div className="text-xl">{accordion.users ? '▼' : '▲'}</div>
                </div>
                {accordion.users && (
                    <div className="bg-gray-600 p-3 rounded-md h-48 overflow-y-auto custom-scrollbar">
                        {activeUsers.length > 0 ? (
                            <ul className="text-sm text-gray-300 space-y-1">
                                {activeUsers.map(user => (
                                    <li key={user.id} className="truncate p-1 rounded-md">
                                        <span className="font-medium text-green-300">{getDisplayName(user.id)}</span>
                                        <span className="text-gray-400 text-xs"> ({user.profession || '모험가'})</span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-sm text-gray-400">활동 중인 플레이어가 없습니다.</p>}
                    </div>
                )}
            </div>
            <div className="mb-2">
                <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('chat')}>
                    <h4 className="text-md font-semibold text-gray-200">공개 채팅</h4>
                    <div className="text-xl">{accordion.chat ? '▼' : '▲'}</div>
                </div>
                {accordion.chat && (
                    <div className="bg-gray-600 p-3 rounded-md flex flex-col h-64">
                        <div className="flex-grow overflow-y-auto custom-scrollbar mb-3 text-sm space-y-2">
                            {chatMessages.map((msg) => (
                                <div key={msg.id}><p><span className="font-medium text-yellow-300">{getDisplayName(msg.userId)}:</span> {msg.message}</p></div>
                            ))}
                            <div ref={chatEndRef} />
                        </div>
                        <div className="flex">
                            <input type="text" className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600" value={currentChatMessage} onChange={(e) => setCurrentChatMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()} disabled={!isAuthReady} />
                            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 font-bold rounded-r-md" onClick={sendChatMessage} disabled={!isAuthReady || !currentChatMessage.trim()}>보내기</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
        body { font-family: 'Noto Sans KR', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #4a5568; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #6b7280; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        `}
      </style>
    </div>
  );
}

export default App;
