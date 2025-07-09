import React, { useState, useEffect, useRef } from 'react';
import { useMediaQuery } from 'react-responsive';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
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

// State Initializers
const getDefaultGameState = () => ({
  log: [],
  choices: [
    { id: 'inn_look_around', text: "여관을 둘러본다", type: 'location_default', location: '방랑자의 안식처' },
    { id: 'inn_talk_to_owner', text: "여관 주인에게 말을 건다", type: 'location_default', location: '방랑자의 안식처' },
  ],
  player: { currentLocation: '방랑자의 안식처' },
  leaderId: null,
});

const getDefaultPrivatePlayerState = () => ({
    stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 },
    inventory: [],
    characterCreated: false,
    profession: '',
    choices: [],
});

// Main App Component
function App() {
  const [gameState, setGameState] = useState(getDefaultGameState());
  const [privatePlayerState, setPrivatePlayerState] = useState(getDefaultPrivatePlayerState());
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');
  const [showNicknameModal, setShowNicknameModal] = useState(!localStorage.getItem('nickname'));
  const [nicknameInput, setNicknameInput] = useState('');
  const [llmError, setLlmError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const isDesktopOrLaptop = useMediaQuery({ query: '(min-width: 1024px)' });
  const isMobile = useMediaQuery({ query: '(max-width: 1023px)' });
  const [mobileTab, setMobileTab] = useState('game');

  // --- Core Functions ---
  
  const handleNicknameSubmit = () => {
    if (nicknameInput.trim()) {
      const finalNickname = nicknameInput.trim();
      setNickname(finalNickname);
      localStorage.setItem('nickname', finalNickname);
      setShowNicknameModal(false);
    }
  };

  const getDisplayName = (uid) => {
    if (uid === userId) return nickname || `플레이어 ${userId?.substring(0, 4)}`;
    const user = activeUsers.find(u => u.id === uid);
    return user?.nickname || `플레이어 ${uid?.substring(0, 4)}`;
  };
  
  const sendChatMessage = async (message) => {
    if (!db || !userId || !isAuthReady || !message.trim()) return;
    try {
      const chatCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
      await addDoc(chatCollectionRef, { userId, displayName: getDisplayName(userId), message, timestamp: serverTimestamp() });
    } catch (error) {
      console.error("Error sending chat message:", error);
    }
  };

  const takeLead = async () => {
    if (gameState.leaderId || !isAuthReady || !db) return;
    const gameStatusRef = getGameStatusRef(db, appId);
    try {
        await setDoc(gameStatusRef, { leaderId: userId }, { merge: true });
    } catch(e) {
        console.error("Failed to take lead:", e);
        setLlmError("행동권을 가져오는 데 실패했습니다.");
    }
  };
  
  const systemPrompt = `
    ### 페르소나 (Persona)
    당신은 세계 최고의 TRPG '게임 마스터(GM)'입니다. 당신의 임무는 살아 숨 쉬는 세계를 창조하고, 플레이어의 선택에 따라 '선택지 풀'을 유기적으로 관리하는 것입니다.

    ### 핵심 규칙 (매우 중요)
    1.  **행동 주체 원칙**: 모든 서사는 반드시 '[행동 주체]'로 명시된 플레이어의 시점에서, 그가 한 '[선택]'의 직접적인 결과로만 서술되어야 합니다.
    2.  **선택지 풀 관리**: 당신은 선택지 목록 전체를 교체하는 것이 아니라, 특정 선택지를 '추가(add)'하거나 '제거(remove)'하는 명령을 내려야 합니다.

    ### JSON 출력 구조
    {
      "story": "공유된 사건에 대한 3인칭 서사.",
      "privateStory": "행동 주체만 볼 수 있는 2인칭 서사.",
      "choices_to_add": [ { "id": "unique_id_1", "text": "새로운 선택지", "type": "location_default", "location": "현재 장소" } ],
      "choices_to_remove": ["obsolete_choice_id_1"],
      "privateChoices_to_add": [ { "id": "private_choice_1", "text": "개인 선택지", "type": "private" } ],
      "privateChoices_to_remove": ["obsolete_private_id_1"],
      "privateStateUpdates": {
        "inventory": ["업데이트된 전체 인벤토리 목록"],
        "stats": {"strength": 12, "intelligence": 10, "agility": 10, "charisma": 10 }
      }
    }
  `;

  const callGeminiTextLLM = async (promptData) => {
    setIsTextLoading(true);
    const mainApiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
    const getApiUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const userPrompt = `
      [상황 분석 요청]
      아래 정보를 바탕으로, '[행동 주체]'가 '[선택]'을 한 결과에 대한 이야기를 생성하고 '선택지 풀'을 관리해주십시오.

      ### [행동 주체 (Actor)]
      - 이름: ${promptData.actorDisplayName}
      - 정보: ${JSON.stringify(promptData.privateInfo)}

      ### [선택 (Action)]
      - "${promptData.playerChoice}"

      ### [배경 정보]
      - 현재 위치: ${promptData.sharedInfo.currentLocation}
      - 현재 공개 선택지 풀: ${JSON.stringify(promptData.sharedInfo.currentChoices)}
    `;

    const payload = { contents: [{ role: "user", parts: [{ text: systemPrompt }] }, { role: "model", parts: [{ text: "{}" }] }, { role: "user", parts: [{ text: userPrompt }] }] };
    
    try {
      const response = await fetch(getApiUrl(mainApiKey), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
    } finally {
      setIsTextLoading(false);
    }
  };

  const handleChoiceClick = async (choiceObject) => {
    if (isTextLoading) return;

    if (!privatePlayerState.characterCreated) {
        setIsTextLoading(true);
        const choiceKey = choiceObject.text.split('.')[0];
        const selectedProfession = professions[choiceKey];
        if (selectedProfession) {
            await setDoc(getPrivatePlayerStateRef(db, appId, userId), {
                ...getDefaultPrivatePlayerState(), characterCreated: true, profession: selectedProfession.name,
            }, { merge: true });
            
            const mainScenarioRef = getMainScenarioRef(db, appId);
            const newEvent = {
                actor: { id: userId, displayName: getDisplayName(userId) },
                action: "여관에 들어선다",
                publicStory: `어둠침침한 여관 문이 삐걱거리며 열리더니, 새로운 모험가가 모습을 드러냅니다. 바로 '${getDisplayName(userId)}'라는 이름의 ${selectedProfession.name}입니다.`,
                timestamp: serverTimestamp()
            };
            await setDoc(mainScenarioRef, { ...getDefaultGameState(), log: [newEvent] }, { merge: true });
        }
        setIsTextLoading(false);
        return;
    }
    
    if (choiceObject.type !== 'private' && gameState.leaderId !== userId) {
        setLlmError("현재 턴의 리더만 주요 행동을 할 수 있습니다. '행동권 잡기'를 눌러 리더가 되어주세요.");
        setTimeout(()=>setLlmError(null), 3000);
        return;
    }
    
    setIsTextLoading(true);

    const promptData = {
        actorDisplayName: getDisplayName(userId),
        playerChoice: choiceObject.text,
        sharedInfo: { 
            currentLocation: gameState.player.currentLocation, 
            currentChoices: gameState.choices 
        },
        privateInfo: privatePlayerState,
    };

    const llmResponse = await callGeminiTextLLM(promptData);

    if (llmResponse) {
        const mainScenarioRef = getMainScenarioRef(db, appId);
        const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);

        await runTransaction(db, async (transaction) => {
            const scenarioDoc = await transaction.get(mainScenarioRef);
            const privateDoc = await transaction.get(privateStateRef);

            const currentPublicData = scenarioDoc.exists() ? scenarioDoc.data() : getDefaultGameState();
            const currentPrivateData = privateDoc.exists() ? privateDoc.data() : getDefaultPrivatePlayerState();

            // Public State 업데이트
            let newChoicePool = [...(currentPublicData.choices || [])];
            if (llmResponse.choices_to_remove) {
                const idsToRemove = new Set(llmResponse.choices_to_remove);
                newChoicePool = newChoicePool.filter(c => !idsToRemove.has(c.id));
            }
            if (llmResponse.choices_to_add) {
                newChoicePool.push(...llmResponse.choices_to_add.filter(c=>c.id && c.text));
            }
            const publicUpdates = {
                log: [...(currentPublicData.log || []), {
                    actor: {id: userId, displayName: getDisplayName(userId)},
                    action: choiceObject.text,
                    publicStory: llmResponse.story || "특별한 일은 일어나지 않았다.",
                    timestamp: serverTimestamp()
                }],
                choices: newChoicePool,
            };
            transaction.set(mainScenarioRef, publicUpdates, {merge: true});

            // Private State 업데이트
            let newPrivateChoices = [...(currentPrivateData.choices || [])];
             if (llmResponse.privateChoices_to_remove) {
                const idsToRemove = new Set(llmResponse.privateChoices_to_remove);
                newPrivateChoices = newPrivateChoices.filter(c => !idsToRemove.has(c.id));
            }
            if (llmResponse.privateChoices_to_add) {
                newPrivateChoices.push(...llmResponse.privateChoices_to_add.filter(c=>c.id && c.text));
            }
            const privateUpdates = {
                ...llmResponse.privateStateUpdates,
                choices: newPrivateChoices,
            };
            transaction.set(privateStateRef, privateUpdates, {merge: true});
        });
    }

    // 행동 후 리더십 해제
    const gameStatusRef = getGameStatusRef(db, appId);
    await setDoc(gameStatusRef, { leaderId: null }, { merge: true });
    setIsTextLoading(false);
  };
  
  // --- useEffect Hooks ---
  
  useEffect(() => {
    const app = initializeApp(firebaseConfig);
    const firestoreDb = getFirestore(app);
    const firebaseAuth = getAuth(app);
    setDb(firestoreDb);
    setAuth(firebaseAuth);
    const unsubAuth = onAuthStateChanged(firebaseAuth, user => {
      if (user) { setUserId(user.uid); setIsAuthReady(true); } 
      else { signInAnonymously(firebaseAuth); }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
    getDoc(privateStateRef).then(docSnap => {
        if (!docSnap.exists()) setDoc(privateStateRef, getDefaultPrivatePlayerState());
    });
    const unsubPrivate = onSnapshot(privateStateRef, (snapshot) => {
      if (snapshot.exists()) setPrivatePlayerState({ ...getDefaultPrivatePlayerState(), ...snapshot.data() });
      if (isLoading) setIsLoading(false);
    });

    const unsubPublic = onSnapshot(getMainScenarioRef(db, appId), (snap) => {
        if (snap.exists()) setGameState(prev => ({...prev, ...snap.data()}));
    });

    const unsubStatus = onSnapshot(getGameStatusRef(db, appId), (snap) => {
        if(snap.exists()) setGameState(prev => ({...prev, leaderId: snap.data().leaderId || null }));
    });
    
    const unsubChat = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages')), (snapshot) => {
        setChatMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0)));
    });
    
    const unsubUsers = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers')), (snapshot) => {
        setActiveUsers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubPrivate(); unsubPublic(); unsubStatus(); unsubChat(); unsubUsers(); };
  }, [isAuthReady, db, userId]);

  useEffect(() => {
    if (!db || !userId || !nickname) return;
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
    setDoc(userDocRef, {
      lastActive: serverTimestamp(),
      nickname,
      profession: privatePlayerState.profession,
    }, { merge: true });
  }, [db, userId, nickname, privatePlayerState.profession]);


  // --- Render Components ---

  const gameLogRef = useRef(null);
  useEffect(() => { if (gameLogRef.current) gameLogRef.current.scrollTop = gameLogRef.current.scrollHeight; }, [gameState.log]);

  const GameLogPanel = () => (
    <div className="flex-grow bg-gray-700/50 p-4 rounded-md overflow-y-auto h-full custom-scrollbar" ref={gameLogRef}>
        {!privatePlayerState.characterCreated && (
            <div className="mb-4 p-2 rounded bg-gray-900/50 text-center">
                <p className="text-yellow-300 font-semibold italic text-lg">모험의 서막</p>
                <p className="whitespace-pre-wrap mt-1">당신은 어떤 운명을 선택하시겠습니까?</p>
            </div>
        )}
        {gameState.log.map((event, index) => (
            <div key={index} className="mb-4 p-3 rounded bg-gray-900/50">
                <p className="text-yellow-300 font-semibold italic text-sm">{event.actor.displayName} 님이 "{event.action}" 선택</p>
                <p className="whitespace-pre-wrap mt-2">{event.publicStory}</p>
            </div>
        ))}
        {isTextLoading && <div className="text-center text-yellow-400 p-2">이야기 생성 중...</div>}
    </div>
  );
  
  const chatLogRef = useRef(null);
  useEffect(() => { if(chatLogRef.current) chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight; }, [chatMessages]);

  const ChatPanel = ({ isMobile }) => (
    <div className={`flex flex-col h-full rounded-md ${isMobile ? 'bg-gray-900' : 'bg-gray-700/50'}`}>
        <div className="flex-grow p-4 overflow-y-auto custom-scrollbar" ref={chatLogRef}>
            {chatMessages.map((msg) => (
                <div key={msg.id} className="mb-2 leading-snug">
                    <span className="font-medium text-yellow-300">{getDisplayName(msg.userId)}:</span> <span className="text-gray-200">{msg.message}</span>
                </div>
            ))}
        </div>
    </div>
  );

  const ChatInput = ({ onSendMessage }) => {
    const [message, setMessage] = useState('');
    const handleSend = () => { onSendMessage(message); setMessage(''); };
    return (
        <div className="flex p-2 bg-gray-800/80 border-t border-gray-700">
            <input type="text" className="flex-grow p-2 rounded-l-md bg-gray-600 border border-gray-500 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none" value={message} onChange={(e) => setMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder="메시지 입력..." />
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 font-bold rounded-r-md text-white" onClick={handleSend} disabled={!message.trim()}>보내기</button>
        </div>
    );
  };
  
  const ChoicesPanel = () => {
    const visibleChoices = [...(gameState.choices || []).filter(c => c.location === gameState.player.currentLocation), ...(privatePlayerState.choices || [])];
    return (
      <div className="flex flex-col gap-3 p-4 overflow-y-auto custom-scrollbar">
          {!privatePlayerState.characterCreated ? (
                Object.keys(professions).map(key => (
                    <button key={key} onClick={() => handleChoiceClick({ id: key, text: `${key}. ${professions[key].name}`})}
                        className="p-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white rounded-md text-left">
                        <p className="text-lg text-blue-300 font-bold">{professions[key].name}</p>
                        <p className="text-sm font-normal text-gray-300 mt-1">{professions[key].motivation}</p>
                    </button>
                ))
            ) : (
                <>
                {gameState.leaderId === null && (
                    <button className="px-6 py-3 font-bold rounded-md shadow-lg bg-green-600 hover:bg-green-700 text-white transition-transform transform hover:scale-105" onClick={takeLead}>
                        행동권 잡기
                    </button>
                )}
                {gameState.leaderId !== null && gameState.leaderId !== userId && (
                    <div className="text-center p-3 bg-yellow-900/50 rounded-md text-yellow-300 font-bold">
                        {getDisplayName(gameState.leaderId)}님이 행동 중입니다...
                    </div>
                )}
                {visibleChoices.map((choice) => (
                    <button
                        key={choice.id}
                        className={`px-6 py-3 font-bold rounded-md shadow-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none ${choice.type === 'private' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
                        onClick={() => handleChoiceClick(choice)}
                        disabled={isTextLoading || (choice.type !== 'private' && gameState.leaderId !== userId)}>
                        {choice.type === 'private' && '[개인] '}{choice.text}
                    </button>
                ))}
                </>
            )
          }
      </div>
    );
  };

  const Sidebar = () => (
    <div className="w-full lg:w-1/3 flex flex-col space-y-4 p-4 bg-gray-800/50 rounded-lg">
        <div>
            <h4 className="text-md font-semibold text-gray-200 mb-2">내 정보</h4>
            <div className="bg-gray-700/50 p-3 rounded-md text-sm text-gray-300 space-y-1">
                <p><span className="font-semibold text-blue-300">이름:</span> {getDisplayName(userId)}</p>
                <p><span className="font-semibold text-blue-300">직업:</span> {privatePlayerState.profession || '미정'}</p>
                <p><span className="font-semibold text-blue-300">위치:</span> {gameState.player.currentLocation}</p>
            </div>
        </div>
        <div>
            <h4 className="text-md font-semibold text-gray-200 mb-2">현재 플레이어 ({activeUsers.length})</h4>
            <div className="bg-gray-700/50 p-3 rounded-md text-sm text-gray-300 space-y-1 h-32 overflow-y-auto custom-scrollbar">
                {activeUsers.map(user => (
                    <div key={user.id} className={`p-1 rounded transition-colors ${user.id === gameState.leaderId ? 'bg-yellow-500 text-black font-bold' : ''}`}>
                      {getDisplayName(user.id)} {user.id === gameState.leaderId && '(리더)'}
                    </div>
                ))}
            </div>
        </div>
        <div className="flex-grow flex flex-col min-h-0">
            <h4 className="text-md font-semibold text-gray-200 mb-2">공개 채팅</h4>
            <ChatPanel isMobile={false} />
        </div>
    </div>
  );

  const DesktopLayout = () => (
    <div className="w-full max-w-7xl h-[90vh] bg-gray-900/50 rounded-lg shadow-2xl p-6 flex space-x-6 border border-gray-700">
        <div className="w-2/3 flex flex-col space-y-4">
            <div className="flex-grow h-1/2 min-h-0">
                <GameLogPanel />
            </div>
            <div className="flex-grow h-1/2 min-h-0 border-t-2 border-gray-700 pt-4">
                <ChoicesPanel />
            </div>
        </div>
        <div className="w-1/3 h-full flex flex-col">
            <Sidebar />
            <ChatInput onSendMessage={sendChatMessage} />
        </div>
    </div>
  );

  const MobileLayout = () => (
    <div className="w-full h-[95vh] bg-gray-900 rounded-lg shadow-xl flex flex-col">
        <div className="flex border-b border-gray-700">
            <button className={`flex-1 p-3 font-bold text-lg ${mobileTab === 'game' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'}`} onClick={() => setMobileTab('game')}>게임</button>
            <button className={`flex-1 p-3 font-bold text-lg ${mobileTab === 'chat' ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'}`} onClick={() => setMobileTab('chat')}>채팅</button>
        </div>
        
        <div className="flex-grow min-h-0">
            {mobileTab === 'game' ? <GameLogPanel /> : <ChatPanel isMobile={true}/>}
        </div>
        
        <div className="flex-shrink-0 border-t border-gray-700 bg-gray-800">
            {mobileTab === 'game' ? <ChoicesPanel /> : <ChatInput onSendMessage={sendChatMessage} />}
        </div>
    </div>
  );

  // --- Main Render ---

  if (!isAuthReady) {
    return <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-300"></div><span className="ml-4 text-xl">연결 중...</span></div>;
  }
  
  if (showNicknameModal) {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-gray-100">모험에 사용할 이름을 입력하세요</h3>
            <input className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg" placeholder="닉네임" value={nicknameInput} onChange={e => setNicknameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleNicknameSubmit(); }} autoFocus />
            <button className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50" onClick={handleNicknameSubmit} disabled={!nicknameInput.trim()}>모험 시작</button>
          </div>
        </div>
    );
  }

  if (isLoading) {
    return <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center"><div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-300"></div><span className="ml-4 text-xl">세계의 문을 여는 중...</span></div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-2 font-sans">
      {llmError && (
          <div className="fixed top-5 right-5 bg-red-800/90 text-white p-4 rounded-lg shadow-lg z-50 border border-red-600 max-w-sm">
              <p className="font-bold">오류 발생</p>
              <p className="text-sm mt-1">{llmError}</p>
              <button onClick={() => setLlmError(null)} className="absolute top-1 right-2 text-lg font-bold">&times;</button>
          </div>
      )}
      {isDesktopOrLaptop && <DesktopLayout />}
      {isMobile && <MobileLayout />}
      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
        body { font-family: 'Noto Sans KR', sans-serif; background-color: #111827; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #1f2937; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #4b5563; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
        `}
      </style>
    </div>
  );
}

export default App;