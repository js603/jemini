import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously, // 익명 로그인 임포트
  signInWithCustomToken, // 커스텀 토큰 로그인 임포트
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
  deleteDoc, // 추가: 문서를 삭제하기 위해
  where, // [수정] where 임포트 추가
  runTransaction // 트랜잭션 임포트 추가
} from 'firebase/firestore';

// ====================================================================
// Firebase configuration information 수정금지
const defaultFirebaseConfig = {
  apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
  authDomain: "text-adventure-game-cb731.firebaseapp.com",
  projectId: "text-adventure-game-cb731",
  storageBucket: "text-adventure-game-cb731.firebaseapis.com",
  messagingSenderId: "1092941614820",
  appId: "1:1092941614820:web:5545f36014b73c268026f1",
  measurementId: "G-FNGF42T1FP"
};

// 수정금지
const firebaseConfig = defaultFirebaseConfig;
const appId = firebaseConfig.projectId;
const initialAuthToken = null;
// ====================================================================

// Initial profession information and motivations for the game
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

// 상태 초기화 유틸
const getDefaultGameState = () => ({
  phase: 'characterSelection',
  log: [
    "환영합니다! 당신은 중세 유럽풍 판타지 왕국의 모험가가 될 것입니다. 당신은 지금 '방랑자의 안식처'라는 아늑한 여관에 도착했습니다.",
    "어떤 직업을 선택하시겠습니까?"
  ],
  choices: Object.keys(professions).map(key => `${key}. ${professions[key].name}`),
  player: {
    profession: '',
    stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 },
    inventory: [],
    initialMotivation: '',
    currentLocation: '방랑자의 안식처',
    reputation: {},
    activeQuests: [],
    companions: [],
  },
});

function App() {
  const [gameState, setGameState] = useState(getDefaultGameState());
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [sharedGameLog, setSharedGameLog] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const [showPlayerChatModal, setShowPlayerChatModal] = useState(false);
  const [selectedPlayerForChat, setSelectedPlayerForChat] = useState(null);
  const [privateChatMessages, setPrivateChatMessages] = useState([]);
  const [currentPrivateChatMessage, setCurrentPrivateChatMessage] = useState('');
  const [isPrivateChatModalManuallyClosed, setIsPrivateChatModalManuallyClosed] = useState(false);
  const [isCompanionActionInProgress, setIsCompanionActionInProgress] = useState(false);
  const [actingPlayer, setActingPlayer] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const logEndRef = useRef(null);
  const sharedLogEndRef = useRef(null);
  const chatEndRef = useRef(null);
  const privateChatEndRef = useRef(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');
  const [showNicknameModal, setShowNicknameModal] = useState(!localStorage.getItem('nickname'));
  const [nicknameInput, setNicknameInput] = useState('');
  const [accordion, setAccordion] = useState({ gameLog: true, sharedLog: true, chat: true, users: true });
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [llmRetryPrompt, setLlmRetryPrompt] = useState(null);

  const getFallbackLLMResponse = (promptData) => ({
    story: 'LLM 호출에 실패했습니다. 임시로 진행할 수 있습니다.',
    choices: ['임시 선택지 1', '임시 선택지 2', '게임 재시도'],
    inventoryUpdates: promptData.character?.inventory || [],
    statChanges: promptData.character?.stats || {},
    location: promptData.character?.currentLocation || '',
    reputationUpdates: promptData.character?.reputation || {},
    activeQuestsUpdates: promptData.character?.activeQuests || [],
    companionsUpdates: promptData.character?.companions || [],
  });

  const handleNicknameSubmit = () => {
    if (nicknameInput.trim()) {
      setNickname(nicknameInput.trim());
      localStorage.setItem('nickname', nicknameInput.trim());
      setShowNicknameModal(false);
    }
  };

  const getDisplayName = (uid) => {
    if (uid === userId) return nickname || `플레이어 ${userId?.substring(0, 4)}`;
    const user = activeUsers.find(u => u.id === uid);
    return user?.displayName || user?.nickname || `플레이어 ${uid?.substring(0, 4)}`;
  };

  const resetAllGameData = async () => {
    if (!db || !isAuthReady) return;
    setIsResetting(true);
    try {
      const paths = [
        ['artifacts', appId, 'public', 'data', 'sharedGameLog'],
        ['artifacts', appId, 'public', 'data', 'activeUsers'],
        ['artifacts', appId, 'public', 'data', 'chatMessages'],
        ['artifacts', appId, 'public', 'data', 'gameStatus'],
        ['artifacts', appId, 'privateChats'],
        ['artifacts', appId, 'users'],
      ];
      for (const pathArr of paths) {
        const colRef = collection(db, ...pathArr);
        const docsSnap = await getDocs(colRef);
        for (const docSnap of docsSnap.docs) {
          await deleteDoc(docSnap.ref);
        }
      }
      const mainScenarioRef = getMainScenarioRef(db, appId);
      await setDoc(mainScenarioRef, { ...getDefaultGameState(), lastUpdate: serverTimestamp() });
      setGameState(getDefaultGameState());
      setSharedGameLog([]);
      setActiveUsers([]);
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
    if (!db || !isAuthReady || !userId || !auth) return;

    const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
    const unsubscribeGameStatus = onSnapshot(gameStatusDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIsCompanionActionInProgress(data.isActionInProgress || false);
        setActingPlayer(data.actingPlayer || null);
      }
    });

    const collectionsToSubscribe = [
        { path: ['artifacts', appId, 'public', 'data', 'sharedGameLog'], setter: setSharedGameLog },
        { path: ['artifacts', appId, 'public', 'data', 'chatMessages'], setter: setChatMessages },
    ];

    const unsubscribers = collectionsToSubscribe.map(({ path, setter }) => {
        const q = query(collection(db, ...path));
        return onSnapshot(q, (snapshot) => {
            const items = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
            setter(items);
        });
    });

    const activeUsersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers');
    const unsubscribeActiveUsers = onSnapshot(query(activeUsersCollectionRef), (snapshot) => {
      const cutoffTime = Date.now() - 60 * 1000;
      const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.lastActive && user.lastActive.toMillis() > cutoffTime);
      setActiveUsers(users);
    });
    unsubscribers.push(unsubscribeActiveUsers);

    const updateUserPresence = async () => {
      if (userId) {
        const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
        await setDoc(userDocRef, {
          lastActive: serverTimestamp(),
          displayName: nickname || `플레이어 ${userId.substring(0, 4)}`,
          nickname: nickname || `플레이어 ${userId.substring(0, 4)}`,
          profession: gameState.player.profession,
          isCompanion: gameState.player.companions.length > 0,
        }, { merge: true });
      }
    };
    updateUserPresence();
    const presenceInterval = setInterval(updateUserPresence, 30000);
    unsubscribers.push(() => clearInterval(presenceInterval));

    return () => {
      unsubscribeGameStatus();
      unsubscribers.forEach(unsub => unsub());
    };
  }, [db, isAuthReady, userId, auth, nickname, gameState.player.profession, gameState.player.companions]);

  useEffect(() => {
    if (accordion.gameLog && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [gameState.log, accordion.gameLog]);

  useEffect(() => {
    if (accordion.sharedLog && sharedLogEndRef.current) sharedLogEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [sharedGameLog, accordion.sharedLog]);

  useEffect(() => {
    if (accordion.chat && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, accordion.chat]);
  
  const systemPrompt = `
    당신은 중세 유럽풍 판타지 텍스트 어드벤처 게임의 스토리텔러이자 게임 마스터입니다.
    이 게임은 멀티플레이어 게임이며, 현재 접속 중인 다른 플레이어들도 같은 시나리오에 참여합니다.
    모든 플레이어는 '방랑자의 안식처'라는 여관에서 게임을 시작합니다.
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

    **멀티플레이어 시나리오 지침:**
    1.  **시작 지점:** 모든 플레이어는 '방랑자의 안식처'에서 시작하며, 당신은 이 여관의 분위기와 그 안에 있는 다른 플레이어들을 묘사해야 합니다.
    2.  **다른 플레이어 등장:** 현재 게임에 접속해 있는 다른 플레이어들을 스토리 내에서 등장인물로 자연스럽게 포함시키십시오. 이들은 동료가 될 수도 있고, 경쟁자가 될 수도 있습니다.
    3.  **플레이어 간 상호작용 (LLM 반영 중요):** 플레이어가 다른 플레이어와 상호작용(대화, 협력, 경쟁 등)을 선택하면, 당신은 해당 상호작용의 결과를 시뮬레이션하고 다음 선택지를 제공해야 합니다. **특히, 플레이어 간의 개인 대화 내용이 있다면, 이 내용을 시나리오 진행에 가장 우선적으로 반영하여 스토리를 전개하십시오.** 예를 들어, 한 플레이어가 다른 플레이어에게 말을 걸면, 당신은 그 플레이어의 캐릭터(직업, 성향 등)에 기반한 반응을 생성하고, 대화를 이어나갈 선택지를 제시합니다.
    4.  **공유된 스토리:** 모든 플레이어의 선택과 상호작용이 하나의 공유된 시나리오에 영향을 미치도록 스토리를 발전시키십시오.

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
  
  const callGeminiTextLLM = async (promptData) => {
    setIsTextLoading(true);
    setLlmRetryPrompt(promptData);
    const mainApiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
    const backupApiKey = "AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84";
    const getApiUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const userPrompt = `현재 게임 단계: ${promptData.phase}, 플레이어 직업: ${promptData.character.profession}, 초기 동기: ${promptData.character.initialMotivation}, 능력치: ${JSON.stringify(promptData.character.stats)}, 인벤토리: ${JSON.stringify(promptData.character.inventory)}, 위치: ${promptData.character.currentLocation}, 평판: ${JSON.stringify(promptData.character.reputation)}, 퀘스트: ${JSON.stringify(promptData.character.activeQuests)}, 동료: ${JSON.stringify(promptData.character.companions)}, 이전 로그: ${JSON.stringify(Array.isArray(promptData.history) ? promptData.history.slice(-5) : [])}, 마지막 선택: ${promptData.playerChoice}, 다른 플레이어들: ${JSON.stringify(promptData.activeUsers)}, 최근 개인 대화: ${promptData.privateChatHistory && promptData.privateChatHistory.length > 0 ? JSON.stringify(promptData.privateChatHistory.slice(-5)) : '없음'}`;
    const payload = { contents: [{ role: "user", parts: [{ text: systemPrompt }] }, { role: "user", parts: [{ text: userPrompt }] }] };

    const tryGeminiCall = async (apiKey) => fetch(getApiUrl(apiKey), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    try {
      let response = await tryGeminiCall(mainApiKey);
      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 429 || /quota|limit|exceeded|over|rate/i.test(errorBody)) {
          response = await tryGeminiCall(backupApiKey);
        } else {
          throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
        }
      }
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
      }
      const result = await response.json();
      const llmOutputText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const jsonMatch = llmOutputText?.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error("Valid JSON object not found in LLM response.");
    } catch (error) {
      console.error("LLM API call error:", error);
      setLlmError(error.message || 'LLM 호출 실패');
      return getFallbackLLMResponse(promptData);
    } finally {
      setIsTextLoading(false);
    }
  };

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

  useEffect(() => {
    if (!db || !appId) return;
    const ref = getMainScenarioRef(db, appId);
    const unsubscribe = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let finalLog = data.storyLog || [];

        const isActionByOthers = data.lastActor && data.lastActor.id !== userId;
        if (isActionByOthers) {
          const lastStory = finalLog[finalLog.length - 1] || "이야기";
          const notification = `\n[알림] ${data.lastActor.displayName}님이 행동하여 이야기가 다음과 같이 진행되었습니다: "${lastStory}"`;
          finalLog = [...finalLog, notification];
        }

        setGameState(prev => ({
          ...prev,
          log: finalLog,
          choices: data.choices || [],
          phase: data.gamePhase || prev.phase,
        }));
      } else {
        const def = getDefaultGameState();
        await setDoc(ref, { ...def, lastUpdate: serverTimestamp() }, { merge: true });
        setGameState(def);
      }
    }, (error) => {
      console.error("Main scenario snapshot error:", error);
      setLlmError("시나리오를 불러오는 중 오류가 발생했습니다.");
    });
    return () => unsubscribe();
  }, [db, appId, userId]);

  const updateGameStateFromLLM = async (llmResponse, fromPrivateChat = false) => {
    if (!db || !appId) return;
    const mainScenarioRef = getMainScenarioRef(db, appId);
    try {
      await runTransaction(db, async (transaction) => {
        const scenarioDoc = await transaction.get(mainScenarioRef);
        if (!scenarioDoc.exists()) throw "시나리오 문서가 존재하지 않습니다.";
        
        const currentData = scenarioDoc.data();
        const baseLog = fromPrivateChat ? gameState.log : currentData.storyLog || gameState.log;
        const newStoryLog = [...baseLog, llmResponse.story];
        const newChoices = llmResponse.choices || [];
        
        transaction.update(mainScenarioRef, {
            storyLog: newStoryLog,
            choices: newChoices,
            gamePhase: 'playing',
            lastUpdate: serverTimestamp(),
            lastActor: { id: userId, displayName: getDisplayName(userId) }
        });
      });

      setGameState(prev => ({
        ...prev,
        player: {
            ...prev.player,
            inventory: llmResponse.inventoryUpdates || prev.player.inventory,
            stats: llmResponse.statChanges || prev.player.stats,
            currentLocation: llmResponse.location || prev.player.currentLocation,
            reputation: llmResponse.reputationUpdates || prev.player.reputation,
            activeQuests: llmResponse.activeQuestsUpdates || prev.player.activeQuests,
            companions: llmResponse.companionsUpdates || prev.player.companions,
        },
        phase: 'playing'
      }));
    } catch (error) {
      console.error("시나리오 업데이트 실패:", error);
      setLlmError("시나리오를 업데이트하는 데 실패했습니다.");
    }
  };

  const handleChoiceClick = async (choice) => {
    const isMyTurn = !isCompanionActionInProgress || (actingPlayer && actingPlayer.id === userId);
    if (isTextLoading || (gameState.player.companions.length > 0 && !isMyTurn)) return;

    setIsTextLoading(true);
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
          
          setGameState(prev => ({
              ...prev,
              phase: 'playing',
              player: { ...prev.player, profession: selectedProfession.name, initialMotivation: initialMotivation },
              log: finalLog,
              choices: choices,
          }));

          const mainScenarioRef = getMainScenarioRef(db, appId);
          await setDoc(mainScenarioRef, {
              gamePhase: 'playing',
              storyLog: finalLog,
              choices: choices,
              lastUpdate: serverTimestamp(),
              lastActor: { id: userId, displayName: getDisplayName(userId) }
          }, { merge: true });
          return;
        }
      }

      const promptData = {
        phase: gameState.phase,
        playerChoice: choice,
        character: gameState.player,
        history: newLog,
        activeUsers: activeUsers.filter(user => user.id !== userId),
        privateChatHistory: [],
      };
      await handleLLMCall(promptData);
    } catch (error) {
      console.error("행동 처리 중 오류:", error.message);
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
                  {isCompanionActionInProgress && (!actingPlayer || actingPlayer.id !== userId) && (
                      <div className="text-center text-yellow-400 font-semibold p-2 bg-black bg-opacity-20 rounded-md mt-2">
                          {actingPlayer ? `${getDisplayName(actingPlayer.id)}님이 선택하고 있습니다...` : "다른 플레이어가 선택하고 있습니다..."}
                      </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              </>
            )}
          </div>

          {gameState.phase === 'playing' && (
            <div className="bg-gray-700 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1">
              <p><span className="font-semibold">직업:</span> {gameState.player.profession}</p>
              <p><span className="font-semibold">위치:</span> {gameState.player.currentLocation}</p>
              <p><span className="font-semibold">능력치:</span> 힘({gameState.player.stats.strength}) 지능({gameState.player.stats.intelligence}) 민첩({gameState.player.stats.agility}) 카리스마({gameState.player.stats.charisma})</p>
              <p><span className="font-semibold">인벤토리:</span> {gameState.player.inventory.join(', ') || '비어있음'}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {gameState.choices.map((choice, index) => (
              <button
                key={index}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleChoiceClick(choice)}
                disabled={isTextLoading || isCompanionActionInProgress}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full lg:w-1/3 flex flex-col space-y-6 bg-gray-700 p-4 rounded-lg shadow-inner">
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
                                        <span className="font-medium text-blue-300">{getDisplayName(user.id)}</span>
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
                                <div key={msg.id}><p><span className="font-medium text-green-300">{getDisplayName(msg.userId)}:</span> {msg.message}</p></div>
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