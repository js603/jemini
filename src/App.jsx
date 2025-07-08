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
  
  // *** 개인 상태 동기화 useEffect ***
  useEffect(() => {
    if (!db || !userId) return;

    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
    const unsubscribe = onSnapshot(privateStateRef, (docSnap) => {
        if (docSnap.exists()) {
            setPrivatePlayerState(docSnap.data());
        } else {
            setDoc(privateStateRef, getDefaultPrivatePlayerState());
        }
    });

    return () => unsubscribe();
  }, [db, userId]);

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
  
  const systemPrompt = `
    당신은 중세 판타지 텍스트 어드벤처 게임의 게임 마스터(GM)입니다. 이 게임은 여러 플레이어가 하나의 공유된 세계관에서 각자의 이야기를 진행하는 하이브리드 멀티플레이어 게임입니다.

    **핵심 규칙:**
    1.  **공유 상태(Shared State)와 개인 상태(Private State):**
        * **공유 상태:** 모든 플레이어에게 영향을 미치는 사건, 장소의 상태, 주요 NPC의 행동 등은 공유됩니다. 이는 'story'와 'sharedStateUpdates'를 통해 전달됩니다.
        * **개인 상태:** 플레이어 개인의 생각, 발견, 비밀 퀘스트 등은 해당 플레이어에게만 전달됩니다. 이는 'privateStory', 'privateChoices', 'privateStateUpdates'를 통해 전달됩니다.
    2.  **역할 기반 스토리텔링:** 플레이어의 직업, 능력치, 아이템, 그리고 'privateInfo'에 담긴 개인적인 정보(비밀 단서, 개인 퀘스트 등)를 적극적으로 활용하여 스토리를 전개하고 선택지를 제공해야 합니다.
    3.  **상호작용:** 다른 플레이어('activeUsers')의 존재를 이야기에 자연스럽게 녹여내고, 플레이어 간의 상호작용을 유도하는 선택지를 제시하십시오.

    **JSON 출력 스키마:**
    당신은 반드시 다음 JSON 스키마를 엄격히 준수하여 응답해야 합니다. 모든 문자열은 큰따옴표로 감싸고, 후행 쉼표를 사용하지 마십시오.
    {
      "story": "모든 플레이어에게 보이는 현재 상황에 대한 공유 스토리 텍스트 (3인칭 서술).",
      "privateStory": "해당 플레이어에게만 보이는 추가적인 묘사, 생각, 또는 비밀스러운 발견.",
      "choices": ["공통 선택지 1", "공통 선택지 2", ...],
      "privateChoices": ["이 플레이어만 선택할 수 있는 개인적인 선택지 1", ...],
      "sharedStateUpdates": {
        "location": "플레이어 그룹의 새로운 현재 위치"
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

    **지침:**
    * 'story'는 500자 이내로 간결하게 작성합니다.
    * 'choices'와 'privateChoices'를 합쳐 2~5개의 선택지를 제공합니다.
    * 'sharedStateUpdates'와 'privateStateUpdates'의 각 필드는 **변경 사항이 없더라도 현재 상태를 반드시 포함**해야 합니다.
  `;
  
  const callGeminiTextLLM = async (promptData) => {
    setIsTextLoading(true);
    setLlmRetryPrompt(promptData);
    const mainApiKey = ""; // This will be provided by the Canvas environment.
    const backupApiKey = ""; // This will be provided by the Canvas environment.
    const getApiUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const userPrompt = `
      - **공유 정보:** ${JSON.stringify(promptData.sharedInfo)}
      - **개인 정보 (이 플레이어만 아는 비밀):** ${JSON.stringify(promptData.privateInfo)}
      - **이전 로그:** ${JSON.stringify(Array.isArray(promptData.history) ? promptData.history.slice(-3) : [])}
      - **플레이어의 마지막 선택:** "${promptData.playerChoice}"
      - **주변의 다른 플레이어들:** ${JSON.stringify(promptData.activeUsers)}
    `;
    const payload = { contents: [{ role: "user", parts: [{ text: systemPrompt }] }, { role: "model", parts: [{ text: "{}" }] }, { role: "user", parts: [{ text: userPrompt }] }] };

    const tryGeminiCall = async (apiKey) => fetch(getApiUrl(apiKey), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    try {
      let response = await tryGeminiCall(mainApiKey);
      if (!response.ok) {
        response = await tryGeminiCall(backupApiKey);
      }
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
        setGameState(prev => ({
          ...prev,
          log: data.storyLog || prev.log,
          choices: data.choices || [],
          phase: data.phase || prev.phase,
          player: { ...prev.player, currentLocation: data.player?.currentLocation || prev.player.currentLocation }
        }));
      } else {
        const def = getDefaultGameState();
        await setDoc(ref, { ...def, storyLog: def.log, lastUpdate: serverTimestamp() }, { merge: true });
        setGameState(def);
      }
    }, (error) => {
      console.error("Main scenario snapshot error:", error);
      setLlmError("시나리오를 불러오는 중 오류가 발생했습니다.");
    });
    return () => unsubscribe();
  }, [db, appId]);

  const updateGameStateFromLLM = async (llmResponse) => {
    if (!db || !appId || !userId) return;
    
    const mainScenarioRef = getMainScenarioRef(db, appId);
    const newChoices = [...(llmResponse.choices || []), ...(llmResponse.privateChoices || [])];

    try {
        await runTransaction(db, async (transaction) => {
            const scenarioDoc = await transaction.get(mainScenarioRef);
            if (!scenarioDoc.exists()) throw "시나리오 문서가 존재하지 않습니다.";
            
            const currentData = scenarioDoc.data();
            const newLog = [...(currentData.storyLog || []), llmResponse.story];

            if (llmResponse.privateStory) {
                newLog.push(`\n[당신만 아는 사실] ${llmResponse.privateStory}`);
            }
            
            transaction.update(mainScenarioRef, {
                storyLog: newLog,
                choices: newChoices,
                phase: 'playing',
                'player.currentLocation': llmResponse.sharedStateUpdates?.location || currentData.player.currentLocation,
                lastUpdate: serverTimestamp(),
                lastActor: { id: userId, displayName: getDisplayName(userId) }
            });
        });
    } catch (error) {
        console.error("공유 상태 업데이트 실패:", error);
        setLlmError("시나리오를 업데이트하는 데 실패했습니다.");
    }

    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
    if (llmResponse.privateStateUpdates) {
        await setDoc(privateStateRef, llmResponse.privateStateUpdates, { merge: true });
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
          await setDoc(privateStateRef, { ...getDefaultPrivatePlayerState(), initialMotivation: initialMotivation }, { merge: true });
          
          setGameState(prev => ({ ...prev, player: {...prev.player, profession: selectedProfession.name }}));
          return;
        }
      }

      const promptData = {
        playerChoice: choice,
        sharedInfo: {
            currentLocation: gameState.player.currentLocation,
            profession: gameState.player.profession,
        },
        privateInfo: privatePlayerState,
        history: newLog,
        activeUsers: activeUsers.map(u => ({ nickname: getDisplayName(u.id), profession: u.profession })).filter(u => u.nickname !== getDisplayName(userId)),
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