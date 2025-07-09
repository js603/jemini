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
  runTransaction
} from 'firebase/firestore';
import { useMediaQuery } from 'react-responsive';

// ====================================================================
// Firebase configuration information
const defaultFirebaseConfig = {
  apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
  authDomain: "text-adventure-game-cb731.firebaseapp.com",
  projectId: "text-adventure-game-cb731",
  storageBucket: "text-adventure-game-cb731.appspot.com",
  messagingSenderId: "1092941614820",
  appId: "1:1092941614820:web:5545f36014b73c268026f1",
  measurementId: "G-FNGF42T1FP"
};

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

// Firestore Path Utils
const getMainScenarioRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'mainScenario', 'main');
const getPrivatePlayerStateRef = (db, appId, userId) => doc(db, 'artifacts', appId, 'users', userId, 'playerState', 'state');
const getGameStatusRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
const getMajorEventsRef = (db, appId) => collection(db, 'artifacts', appId, 'public', 'data', 'majorEvents');

// State Initialization Utils
const getDefaultGameState = () => ({
  phase: 'playing',
  log: [],
  choices: [
    { id: 'inn_look_around', text: "여관을 둘러본다", type: 'location_default', location: '방랑자의 안식처' },
    { id: 'inn_talk_to_owner', text: "여관 주인에게 말을 건다", type: 'location_default', location: '방랑자의 안식처' },
    { id: 'inn_talk_to_adventurer', text: "다른 모험가에게 말을 건다", type: 'location_default', location: '방랑자의 안식처' },
  ],
  player: {
    currentLocation: '방랑자의 안식처',
  },
  subtleClues: [],
});

const getDefaultPrivatePlayerState = () => ({
    stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 },
    inventory: [],
    initialMotivation: '',
    reputation: {},
    activeQuests: [],
    companions: [],
    knownClues: [],
    characterCreated: false,
    profession: '',
    choices: [],
    groups: [],
    npcRelations: {},
});

// ====================================================================
// 🎨 UI Components
// ====================================================================

const GameLogPanel = ({ log, userId, isTextLoading, logEndRef, characterCreated }) => (
  <div className="flex-grow bg-gray-700 p-4 rounded-md overflow-y-auto h-96 custom-scrollbar text-sm md:text-base leading-relaxed">
    {!characterCreated && (
      <div className="mb-4 p-2 rounded bg-gray-900/50 text-center">
        <p className="text-yellow-300 font-semibold italic text-lg">모험의 서막</p>
        <p className="whitespace-pre-wrap mt-1">당신은 어떤 운명을 선택하시겠습니까?</p>
      </div>
    )}
    {log.map((event, index) => (
      <div key={index} className="mb-4 p-2 rounded bg-gray-900/50">
        {event.actor && (
          <p className="text-yellow-300 font-semibold italic text-sm">
            {Array.isArray(event.actor) ? event.actor.map(a => a.displayName).join(', ') : (event.actor.displayName || '시스템')} 님이 {event.action} 선택
          </p>
        )}
        <p className="whitespace-pre-wrap mt-1" dangerouslySetInnerHTML={{ __html: (event.publicStory || '').replace(/\n/g, '<br />') }}></p>
        {event.privateStories && event.privateStories[userId] && (
          <p className="whitespace-pre-wrap mt-2 p-2 rounded bg-blue-900/30 border-l-4 border-blue-400 text-blue-200">
            <span className="font-bold">[당신만 아는 사실] </span>{event.privateStories[userId]}
          </p>
        )}
      </div>
    ))}
    {isTextLoading && (
      <div className="flex justify-center items-center mt-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
        <span className="ml-3 text-gray-400">이야기를 생성 중...</span>
      </div>
    )}
    <div ref={logEndRef} />
  </div>
);

const ChoicesPanel = ({ choices, characterCreated, handleChoiceClick, isTextLoading, leaderId, userId, handleTakeLead, getDisplayName }) => {
  const isMyTurn = leaderId === userId;
  const isPreparationPhase = !leaderId;

  return (
    <div className="flex flex-col gap-3">
      {characterCreated && isPreparationPhase && (
        <button
          onClick={handleTakeLead}
          disabled={isTextLoading}
          className="w-full px-6 py-3 font-bold rounded-md shadow-lg transition duration-300 bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
        >
          [행동권 잡기]
        </button>
      )}
      {characterCreated && leaderId && !isMyTurn && (
         <div className="text-center p-3 bg-gray-700 rounded-md text-yellow-300 font-bold">
            {getDisplayName(leaderId)} 님이 행동 중입니다...
         </div>
      )}
      {characterCreated ? (
        choices.map((choice) => (
          <button
            key={choice.id}
            className={`px-6 py-3 font-bold rounded-md shadow-lg transition duration-300 ${isMyTurn ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 cursor-not-allowed'} text-white`}
            onClick={() => handleChoiceClick(choice)}
            disabled={isTextLoading || !isMyTurn}
          >
            {choice.text}
          </button>
        ))
      ) : (
        Object.keys(professions).map(key => (
          <button
            key={key}
            onClick={() => handleChoiceClick({ id: key, text: `${key}. ${professions[key].name}` })}
            disabled={isTextLoading}
            className="px-6 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 text-left"
          >
            <p className="text-lg text-blue-300">{`${key}. ${professions[key].name}`}</p>
            <p className="text-sm font-normal text-gray-300 mt-1">{professions[key].motivation}</p>
          </button>
        ))
      )}
    </div>
  );
};

const Sidebar = ({ playerState, getDisplayName, userId, activeUsers, currentLocation }) => (
    <div className="flex flex-col space-y-4 bg-gray-700 p-4 rounded-lg shadow-inner">
        <div>
            <h4 className="text-md font-semibold text-gray-200 mb-2">내 정보</h4>
            <div className="bg-gray-600 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1 h-48 overflow-y-auto custom-scrollbar">
                <p><span className="font-semibold text-blue-300">이름:</span> {getDisplayName(userId)}</p>
                <p><span className="font-semibold text-blue-300">직업:</span> {playerState.profession || '미정'}</p>
                <p><span className="font-semibold text-blue-300">위치:</span> {currentLocation}</p>
                <p><span className="font-semibold text-blue-300">능력치:</span> 힘({playerState.stats.strength}) 지능({playerState.stats.intelligence}) 민첩({playerState.stats.agility}) 카리스마({playerState.stats.charisma})</p>
                <p><span className="font-semibold text-blue-300">인벤토리:</span> {playerState.inventory.join(', ') || '비어있음'}</p>
                <p><span className="font-semibold text-blue-300">퀘스트:</span> {playerState.activeQuests.join(', ') || '없음'}</p>
            </div>
        </div>
        <div>
            <h4 className="text-md font-semibold text-gray-200 mb-2">현재 플레이어들</h4>
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
        </div>
    </div>
);

const ChatPanel = ({ messages, chatEndRef, currentMessage, onMessageChange, onSendMessage, isAuthReady, getDisplayName }) => (
    <div className="bg-gray-700 p-4 rounded-lg flex flex-col h-full md:h-[32rem]">
        <h4 className="text-md font-semibold text-gray-200 mb-2">공개 채팅</h4>
        <div className="bg-gray-600 p-3 rounded-md flex flex-col flex-grow">
            <div className="flex-grow overflow-y-auto custom-scrollbar mb-3 text-sm space-y-2">
                {messages.map((msg) => (
                    <div key={msg.id}><p><span className="font-medium text-yellow-300">{getDisplayName(msg.userId)}:</span> {msg.message}</p></div>
                ))}
                <div ref={chatEndRef} />
            </div>
            <div className="flex">
                <input type="text" className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600" value={currentMessage} onChange={onMessageChange} onKeyPress={(e) => e.key === 'Enter' && onSendMessage()} disabled={!isAuthReady} />
                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 font-bold rounded-r-md" onClick={onSendMessage} disabled={!isAuthReady || !currentMessage.trim()}>보내기</button>
            </div>
        </div>
    </div>
);

// ====================================================================
// 🖥️ Responsive Layouts
// ====================================================================

const DesktopLayout = (props) => (
  <div className="w-full max-w-7xl bg-gray-800 rounded-lg shadow-xl p-6 flex space-x-6">
    <div className="flex flex-col w-2/3 space-y-6">
      <GameLogPanel {...props} />
      <ChoicesPanel {...props} />
    </div>
    <div className="w-1/3 flex flex-col space-y-6">
      <Sidebar {...props} />
      <ChatPanel {...props} />
    </div>
  </div>
);

const MobileLayout = (props) => {
  const [activeTab, setActiveTab] = useState('game'); // 'game', 'info', or 'chat'

  return (
    <div className="w-full h-[90vh] bg-gray-800 rounded-lg shadow-xl p-2 flex flex-col">
      <div className="flex-shrink-0 mb-2">
        <div className="flex border-b border-gray-600">
          <button onClick={() => setActiveTab('game')} className={`flex-1 py-2 text-center font-bold ${activeTab === 'game' ? 'text-white bg-blue-600' : 'text-gray-400'}`}>게임</button>
          <button onClick={() => setActiveTab('info')} className={`flex-1 py-2 text-center font-bold ${activeTab === 'info' ? 'text-white bg-blue-600' : 'text-gray-400'}`}>정보</button>
          <button onClick={() => setActiveTab('chat')} className={`flex-1 py-2 text-center font-bold ${activeTab === 'chat' ? 'text-white bg-blue-600' : 'text-gray-400'}`}>채팅</button>
        </div>
      </div>
      <div className="flex-grow overflow-y-auto">
        {activeTab === 'game' && (
          <div className="flex flex-col space-y-4 h-full">
            <GameLogPanel {...props} />
            <ChoicesPanel {...props} />
          </div>
        )}
        {activeTab === 'info' && <Sidebar {...props} />}
        {activeTab === 'chat' && <ChatPanel {...props} />}
      </div>
    </div>
  );
};

// ====================================================================
// 🚀 Main App Component
// ====================================================================
function App() {
  const [gameState, setGameState] = useState(getDefaultGameState());
  const [privatePlayerState, setPrivatePlayerState] = useState(getDefaultPrivatePlayerState());
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const logEndRef = useRef(null);
  const chatEndRef = useRef(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');
  const [showNicknameModal, setShowNicknameModal] = useState(!localStorage.getItem('nickname'));
  const [nicknameInput, setNicknameInput] = useState('');
  const [llmError, setLlmError] = useState(null);
  const [llmRetryPrompt, setLlmRetryPrompt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [worldHistory, setWorldHistory] = useState([]);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  
  const [leaderId, setLeaderId] = useState(null);

  const isDesktop = useMediaQuery({ query: '(min-width: 1024px)' });

  // --- Helper Functions ---
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
    if (!uid) return '시스템';
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
            getMajorEventsRef(db, appId)
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
            await deleteDoc(doc(db, 'artifacts', appId, 'users', userDoc.id));
        }

        await deleteDoc(getMainScenarioRef(db, appId));
        await deleteDoc(getGameStatusRef(db, appId));
        
        localStorage.clear();
        console.log("모든 서버 및 클라이언트 데이터가 성공적으로 초기화되었습니다.");

    } catch (e) {
        console.error("전체 데이터 초기화 중 오류 발생:", e);
    } finally {
      setIsResetting(false);
      setShowResetModal(false);
      window.location.reload();
    }
  };
  
  // --- Firebase Listeners ---
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
      setLlmError("Firebase 초기화에 실패했습니다.");
    }
  }, []);
  
  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const unsubscribes = [
      onSnapshot(getPrivatePlayerStateRef(db, appId, userId), (snapshot) => {
        if (snapshot.exists()) {
          setPrivatePlayerState({ ...getDefaultPrivatePlayerState(), ...snapshot.data() });
        } else {
          setDoc(getPrivatePlayerStateRef(db, appId, userId), getDefaultPrivatePlayerState());
        }
        if (isLoading) setIsLoading(false);
      }),
      onSnapshot(getMainScenarioRef(db, appId), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            setGameState(prev => ({...prev, ...data}));
        } else {
            setGameState(getDefaultGameState());
        }
      }),
      onSnapshot(getGameStatusRef(db, appId), (docSnap) => {
        setLeaderId(docSnap.data()?.leaderId || null);
      }),
      onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages')), (snapshot) => {
        const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
        setChatMessages(messages);
      }),
      onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers')), (snapshot) => {
        const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setActiveUsers(users);
      })
    ];
    
    getDocs(getMajorEventsRef(db, appId)).then(historySnapshot => {
      const historyData = historySnapshot.docs.map(doc => doc.data().summary);
      setWorldHistory(historyData);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [isAuthReady, db, userId]);

  useEffect(() => {
    if (!db || !userId) return;
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
    setDoc(userDocRef, {
      lastActive: serverTimestamp(),
      nickname: nickname || `플레이어 ${userId.substring(0, 4)}`,
      profession: privatePlayerState.profession,
    }, { merge: true });
  }, [db, userId, nickname, privatePlayerState.profession]);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [gameState.log]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // --- AI Interaction ---
  const systemPrompt = `
    ### 페르소나 (Persona)
    당신은 세계 최고의 TRPG '게임 마스터(GM)'입니다. 당신의 임무는 살아 숨 쉬는 세계를 창조하고, 플레이어의 선택에 따라 '선택지 풀'을 유기적으로 관리하는 것입니다.
    ### 핵심 규칙 (매우 중요)
    1.  **행동 주체 원칙**: 모든 서사는 반드시 '[행동 주체]'의 시점에서, 그가 한 '[선택]'의 직접적인 결과로만 서술되어야 합니다.
    2.  **지능형 선택지 풀 관리**: 당신은 선택지 목록 전체를 교체하는 것이 아니라, 특정 선택지를 '추가(add)'하거나 '제거(remove)'하는 명령을 내려야 합니다.
        -   **제거**: \`choices_to_remove\`에 더 이상 유효하지 않은 선택지의 \`id\`를 담아 제거하십시오.
        -   **추가**: \`choices_to_add\`에 새로운 상황으로 생긴 선택지 객체를 담아 추가하십시오.
    ### JSON 출력 구조
    {
      "story": "공유된 사건에 대한 3인칭 서사.",
      "privateStory": "행동 주체만 볼 수 있는 2인칭 서사.",
      "choices_to_add": [{ "id": "unique_id", "text": "새 선택지", "type": "event_driven", "location": "현재 장소" }],
      "choices_to_remove": ["obsolete_choice_id"],
      "sharedStateUpdates": {
        "location": "플레이어 그룹의 현재 위치. 변경되었을 경우에만 포함."
      },
      "privateStateUpdates": {
        "inventory": ["업데이트된 전체 인벤토리 목록"],
        "stats": {"strength": 12, "intelligence": 10, "agility": 10, "charisma": 10 },
        "activeQuests": ["업데이트된 개인 퀘스트 목록"]
      }
    }
  `;

  const callGeminiTextLLM = async (promptData) => {
    setIsTextLoading(true);
    setLlmRetryPrompt(promptData);
    const mainApiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
    const backupApiKey = "AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84";
    const getApiUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const userPrompt = `
      [상황 분석 요청]
      아래 정보를 바탕으로, '[행동 주체]'가 '[선택]'을 한 결과에 대한 이야기를 생성하고 '선택지 풀'을 관리해주십시오.
      ### [행동 주체 (Actor)]
      - 이름: ${promptData.actorDisplayNames[0]}
      - 정보: ${JSON.stringify(promptData.privateInfos[Object.keys(promptData.privateInfos)[0]])}
      ### [선택 (Action)]
      - "${promptData.playerChoice}"
      ### [배경 정보]
      - 세상의 주요 역사: ${promptData.worldHistory.length > 0 ? promptData.worldHistory.join(', ') : "없음"}
      - 현재 위치: ${promptData.sharedInfo.currentLocation}
      - 현재 공개 선택지 풀: ${JSON.stringify(promptData.sharedInfo.currentChoices)}
    `;

    const payload = { contents: [{ role: "user", parts: [{ text: systemPrompt }] }, { role: "model", parts: [{ text: "{}" }] }, { role: "user", parts: [{ text: userPrompt }] }] };
    const tryGeminiCall = async (apiKey) => fetch(getApiUrl(apiKey), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

    try {
      let response = await tryGeminiCall(mainApiKey);
      if (!response.ok) { response = await tryGeminiCall(backupApiKey); }
      if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); }
      const result = await response.json();
      const llmOutputText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      const jsonMatch = llmOutputText?.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error("Valid JSON object not found in LLM response.");
    } catch (error) {
      console.error("LLM API call error:", error);
      setLlmError(error.message || 'LLM 호출 실패');
      return null;
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

  // --- Game Logic (Turn-based) ---
  const handleTakeLead = async () => {
    if (!db || !userId || leaderId || isTextLoading) return;
    try {
        await setDoc(getGameStatusRef(db, appId), { leaderId: userId }, { merge: true });
    } catch (e) {
        console.error("행동권 획득 실패:", e);
        setLlmError("행동권을 가져오는 데 실패했습니다.");
    }
  };

  const performAction = async (choiceObject) => {
    const choiceText = choiceObject.text;
    setIsTextLoading(true);
    setLlmRetryPrompt({ playerChoice: choiceText });

    try {
        const promptData = {
            actorDisplayNames: [getDisplayName(userId)],
            playerChoice: choiceText,
            sharedInfo: { 
                currentLocation: gameState.player.currentLocation, 
                subtleClues: gameState.subtleClues,
                currentChoices: gameState.choices 
            },
            privateInfos: { [userId]: privatePlayerState },
            worldHistory: worldHistory,
        };

        const llmResponse = await callGeminiTextLLM(promptData);

        if (llmResponse) {
            await runTransaction(db, async (transaction) => {
                const mainScenarioRef = getMainScenarioRef(db, appId);
                const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);

                const scenarioDoc = await transaction.get(mainScenarioRef);
                const privateDoc = await transaction.get(privateStateRef);
                
                const currentData = scenarioDoc.exists() ? scenarioDoc.data() : getDefaultGameState();
                
                // 1. Update Public State
                let newChoicePool = [...(currentData.choices || [])];
                if (llmResponse.choices_to_remove) {
                    const idsToRemove = new Set(llmResponse.choices_to_remove);
                    newChoicePool = newChoicePool.filter(c => !idsToRemove.has(c.id));
                }
                if (llmResponse.choices_to_add) {
                    newChoicePool.push(...llmResponse.choices_to_add.filter(c => c.id && c.text));
                }
                const newEvent = {
                    actor: { id: userId, displayName: getDisplayName(userId) },
                    action: choiceText,
                    publicStory: llmResponse.story || "특별한 일은 일어나지 않았다.",
                    privateStories: llmResponse.privateStory ? { [userId]: llmResponse.privateStory } : {},
                    timestamp: new Date()
                };
                const publicUpdateData = {
                    storyLog: [...(currentData.log || []), newEvent],
                    choices: newChoicePool,
                    lastUpdate: serverTimestamp()
                };
                 if (llmResponse.sharedStateUpdates?.location) {
                    publicUpdateData['player.currentLocation'] = llmResponse.sharedStateUpdates.location;
                }
                transaction.update(mainScenarioRef, publicUpdateData);

                // 2. Update Private State
                if(privateDoc.exists() && llmResponse.privateStateUpdates) {
                    transaction.update(privateStateRef, llmResponse.privateStateUpdates);
                }
            });
        }
    } catch (error) {
        setLlmError(error.message);
    } finally {
        await setDoc(getGameStatusRef(db, appId), { leaderId: null }, { merge: true });
        setIsTextLoading(false);
    }
  };
  
  const handleChoiceClick = async (choiceObject) => {
    if (isTextLoading) return;
    
    if (!privatePlayerState.characterCreated) {
        setIsTextLoading(true);
        const choiceKey = choiceObject.id;
        const selectedProfession = professions[choiceKey];
        if (selectedProfession) {
            await setDoc(getPrivatePlayerStateRef(db, appId, userId), {
                ...getDefaultPrivatePlayerState(), characterCreated: true, profession: selectedProfession.name, initialMotivation: selectedProfession.motivation,
            }, { merge: true });
            
            const newEvent = {
                actor: { id: userId, displayName: getDisplayName(userId) || `플레이어 ${userId.substring(0,4)}` }, action: "여관에 들어선다",
                publicStory: `어둠침침한 여관 문이 삐걱거리며 열리더니, 새로운 모험가가 모습을 드러냅니다. 바로 '${getDisplayName(userId) || `플레이어 ${userId.substring(0,4)}`}'라는 이름의 ${selectedProfession.name}입니다.`,
                privateStories: { [userId]: selectedProfession.motivation }, timestamp: new Date()
            };
            const mainScenarioRef = getMainScenarioRef(db, appId);
            const scenarioDoc = await getDoc(mainScenarioRef);
            const currentLog = scenarioDoc.exists() ? scenarioDoc.data().log : [];
            await setDoc(mainScenarioRef, { ...getDefaultGameState(), log: [...currentLog, newEvent] }, { merge: true });
        }
        setIsTextLoading(false);
        return;
    }

    if (leaderId === userId) {
        await performAction(choiceObject);
    }
  };

  const getVisibleChoices = () => {
    const masterChoicePool = gameState.choices || [];
    const privateChoicePool = privatePlayerState.choices || [];
    const currentLocation = gameState.player.currentLocation;

    const visiblePublicChoices = masterChoicePool.filter(choice => {
      return !choice.location || choice.location === currentLocation;
    });
    
    const allChoices = [...visiblePublicChoices, ...privateChoicePool];
    return allChoices.filter((choice, index, self) =>
        index === self.findIndex((c) => c.id === choice.id)
    );
  };

  // --- Render ---
  const LlmErrorModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4 text-center">
        <h3 className="text-xl font-bold text-red-400">오류가 발생했습니다</h3>
        <p className="text-gray-200">{llmError}</p>
        <div className="flex justify-center gap-4">
          {llmRetryPrompt && (
            <button
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md"
              onClick={async () => {
                setLlmError(null);
                if (llmRetryPrompt.playerChoice) {
                  await performAction({ id: 'retry', text: llmRetryPrompt.playerChoice });
                }
              }}
            >
              재시도
            </button>
          )}
          <button className="px-4 py-2 bg-gray-600 hover:bg-gray-700 font-bold rounded-md" onClick={() => { setLlmError(null); setLlmRetryPrompt(null); }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );

  if (showNicknameModal) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-gray-100">닉네임을 입력하세요</h3>
            <input className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg" placeholder="닉네임" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleNicknameSubmit(); }} autoFocus />
            <button className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50" onClick={handleNicknameSubmit} disabled={!nicknameInput.trim()}>시작하기</button>
          </div>
        </div>
    )
  }

  if (isLoading) {
    return <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-300"></div><span className="ml-4 text-xl">데이터를 불러오는 중...</span></div>;
  }

  const componentProps = {
    log: gameState.log,
    choices: getVisibleChoices(),
    userId,
    isTextLoading,
    logEndRef,
    characterCreated: privatePlayerState.characterCreated,
    handleChoiceClick,
    leaderId,
    handleTakeLead,
    getDisplayName,
    playerState: privatePlayerState,
    activeUsers,
    currentLocation: gameState.player.currentLocation,
    messages: chatMessages,
    chatEndRef,
    currentMessage: currentChatMessage,
    onMessageChange: (e) => setCurrentChatMessage(e.target.value),
    onSendMessage: sendChatMessage,
    isAuthReady,
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center p-1 md:p-4 font-sans">
      {llmError && <LlmErrorModal />}
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
      
      {isDesktop ? <DesktopLayout {...componentProps} /> : <MobileLayout {...componentProps} />}

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