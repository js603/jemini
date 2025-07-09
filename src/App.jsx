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
const getGameStatusRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
const getMajorEventsRef = (db, appId) => collection(db, 'artifacts', appId, 'public', 'data', 'majorEvents');


// 상태 초기화 유틸
const getDefaultGameState = () => ({
  phase: 'playing',
  log: [],
  choices: [],
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


function App() {
  const [gameState, setGameState] = useState(getDefaultGameState());
  const [privatePlayerState, setPrivatePlayerState] = useState(getDefaultPrivatePlayerState());
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const [actionLocks, setActionLocks] = useState({});
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const logEndRef = useRef(null);
  const chatEndRef = useRef(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');
  const [showNicknameModal, setShowNicknameModal] = useState(!localStorage.getItem('nickname'));
  const [nicknameInput, setNicknameInput] = useState('');
  const [accordion, setAccordion] = useState({ gameLog: true, chat: true, users: true, playerInfo: true, worldHistory: true });
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [llmRetryPrompt, setLlmRetryPrompt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [worldHistory, setWorldHistory] = useState([]);

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

        setGameState(getDefaultGameState());
        setPrivatePlayerState(getDefaultPrivatePlayerState());
        setChatMessages([]);
        setActionLocks({});

        console.log("모든 서버 및 클라이언트 데이터가 성공적으로 초기화되었습니다.");

    } catch (e) {
        console.error("전체 데이터 초기화 중 오류 발생:", e);
    } finally {
      setIsResetting(false);
      setShowResetModal(false);
      window.location.reload();
    }
  };
  
  // [1] useEffects: Firebase 초기화, 데이터 리스닝, 부가 기능
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

    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
    
    getDoc(privateStateRef).then(docSnap => {
        if (!docSnap.exists()) {
            setDoc(privateStateRef, getDefaultPrivatePlayerState());
        }
    });

    const unsubscribe = onSnapshot(privateStateRef, (snapshot) => {
      if (snapshot.exists()) {
        setPrivatePlayerState({ ...getDefaultPrivatePlayerState(), ...snapshot.data() });
      }
      if (isLoading) setIsLoading(false);
    }, (err) => {
      console.error("Private state listener error:", err);
      setLlmError("개인 정보를 불러오는 중 오류가 발생했습니다.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthReady, db, userId]);

  useEffect(() => {
    if (!isAuthReady || !db) return;

    const unsubscribes = [
      onSnapshot(getMainScenarioRef(db, appId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setGameState(prev => ({
            ...prev,
            log: data.storyLog || [],
            choices: data.choices || [],
            player: { ...prev.player, currentLocation: data.player?.currentLocation || prev.player.currentLocation },
            subtleClues: data.subtleClues || []
          }));
        }
      }),
      onSnapshot(getGameStatusRef(db, appId), (docSnap) => {
        setActionLocks(docSnap.data()?.actionLocks || {});
      }),
      onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages')), (snapshot) => {
        const messages = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
        setChatMessages(messages);
      }),
      onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers')), (snapshot) => {
        const cutoffTime = Date.now() - 60 * 1000;
        const users = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.lastActive && u.lastActive.toMillis() > cutoffTime);
        setActiveUsers(users);
      })
    ];

    getDocs(getMajorEventsRef(db, appId)).then(historySnapshot => {
      const historyData = historySnapshot.docs.map(doc => doc.data().summary).sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
      setWorldHistory(historyData);
    });

    return () => unsubscribes.forEach(unsub => unsub());
  }, [isAuthReady, db]);


  useEffect(() => {
    if (!db || !userId || !nickname) return;
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
    setDoc(userDocRef, {
      lastActive: serverTimestamp(),
      nickname: nickname || `플레이어 ${userId.substring(0, 4)}`,
      profession: privatePlayerState.profession,
    }, { merge: true });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setDoc(userDocRef, { lastActive: serverTimestamp() }, { merge: true });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [db, userId, nickname, privatePlayerState.profession]);

  useEffect(() => {
    if (accordion.gameLog && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [gameState.log, accordion.gameLog]);

  useEffect(() => {
    if (accordion.chat && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, accordion.chat]);

  // [2] Helper Functions: 로직 분리 (가독성 향상)
  const systemPrompt = `
    ### 페르소나 (Persona)
    당신은 세계 최고의 TRPG '게임 마스터(GM)'입니다. 당신의 임무는 유기적으로 살아 숨 쉬는 세계를 창조하는 것입니다. 플레이어의 선택은 세상에 영구적인 흔적을 남기고, 다른 플레이어의 경험에 영향을 미치며, 세상의 역사를 바꾸어야 합니다.

    ### 핵심 규칙 (매우 중요)
    1.  **행동 주체 절대 원칙**: 모든 서사는 반드시 '[행동 주체]'로 명시된 플레이어의 시점에서, 그가 한 '[선택]'의 직접적인 결과로만 서술되어야 합니다.
    2.  **관찰자 원칙**: '[주변 플레이어]' 목록에 있는 인물들은 현재 턴의 관찰자일 뿐, 절대 행동하지 않습니다. 그들의 존재를 묘사할 수는 있지만, 그들이 행동의 주체가 되어서는 안 됩니다.
    3.  **다층적 서사**: 이 원칙들 위에서 '공유된 현실(story)', '개인적 서사(privateStory)', '그룹 서사(groupStory)'를 구분하여 이야기를 전개하십시오.

    ### JSON 출력 구조
    {
      "story": "모든 플레이어가 볼 수 있는 공유된 사건에 대한 3인칭 서사.",
      "privateStory": "오직 행동 주체만 볼 수 있는 2인칭 서사. ('당신은...')",
      "groupStory": "행동 주체와 같은 그룹 소속원들만 볼 수 있는 비밀스러운 이야기. 해당사항 없으면 null.",
      "choices": ["다른 플레이어들도 선택할 수 있는 일반적인 행동들."],
      "privateChoices": ["오직 행동 주체의 특성 때문에 가능한 특별한 행동들."],
      "groupChoices": ["같은 그룹 소속원들만 할 수 있는 비밀 행동들."],
      "sharedStateUpdates": {
        "location": "플레이어 그룹의 현재 위치. 변경되었을 경우에만 포함.",
        "subtleClues": [{"location": "장소명", "clue": "새롭게 생성된 단서"}]
      },
      "privateStateUpdates": {
        "inventory": ["업데이트된 전체 인벤토리 목록"],
        "stats": {"strength": 12, "intelligence": 10, "agility": 10, "charisma": 10 },
        "activeQuests": ["업데이트된 개인 퀘스트 목록"],
        "knownClues": ["새롭게 알게 된 단서 목록"],
        "groups": ["업데이트된 소속 그룹 목록"],
        "npcRelations": {"가라크": 55, "엘라라": -10}
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
      아래 정보를 바탕으로, '[행동 주체]'가 '[선택]'을 한 결과에 대한 이야기를 생성해주십시오.

      ### [행동 주체 (Actor)]
      - 이름: ${promptData.actorDisplayName}
      - 정보: ${JSON.stringify(promptData.privateInfo)}

      ### [선택 (Action)]
      - "${promptData.playerChoice}"

      ### [배경 정보]
      - 세상의 주요 역사: ${promptData.worldHistory.length > 0 ? promptData.worldHistory.join(', ') : "없음"}
      - 현재 위치: ${promptData.sharedInfo.currentLocation}
      - 개인화된 최근 사건 로그: ${promptData.personalizedHistory}
      - 세상에 남겨진 흔적들: ${JSON.stringify(promptData.sharedInfo.subtleClues)}

      ### [주변 플레이어 (Observers)]
      - 이들은 현재 턴의 관찰자이며, 직접 행동하지 않습니다.
      - ${promptData.activeUsers.length > 0 ? JSON.stringify(promptData.activeUsers) : "주변에 다른 플레이어가 없습니다."}
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

  const updatePublicState = async (llmResponse, playerChoice) => {
    const mainScenarioRef = getMainScenarioRef(db, appId);
    const newEvent = {
        actor: { id: userId, displayName: getDisplayName(userId) },
        action: playerChoice,
        publicStory: llmResponse.story || "특별한 일은 일어나지 않았다.",
        privateStories: { [userId]: llmResponse.privateStory || null },
        groupStory: llmResponse.groupStory || null,
        timestamp: new Date()
    };
  
    await runTransaction(db, async (transaction) => {
        const scenarioDoc = await transaction.get(mainScenarioRef);
        const currentData = scenarioDoc.exists() ? scenarioDoc.data() : getDefaultGameState();
        
        const newStoryLog = [...(currentData.storyLog || []), newEvent];
        
        const updateData = {
          storyLog: newStoryLog,
          lastUpdate: serverTimestamp()
        };
  
        if (llmResponse.choices && llmResponse.choices.length > 0) {
          updateData.choices = llmResponse.choices;
        }
  
        if (llmResponse.sharedStateUpdates?.location) {
          updateData['player.currentLocation'] = llmResponse.sharedStateUpdates.location;
        }
  
        if (llmResponse.sharedStateUpdates?.subtleClues) {
          updateData.subtleClues = llmResponse.sharedStateUpdates.subtleClues;
        }
        
        if (scenarioDoc.exists()) {
            transaction.update(mainScenarioRef, updateData);
        } else {
            transaction.set(mainScenarioRef, { ...currentData, ...updateData });
        }
    });
  };
  
  const updatePrivateState = async (llmResponse) => {
    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
  
    const updates = llmResponse.privateStateUpdates ? { ...llmResponse.privateStateUpdates } : {};
  
    const newPrivateChoices = llmResponse.privateChoices || [];
    const newGroupChoices = llmResponse.groupChoices || [];
    if (newPrivateChoices.length > 0 || newGroupChoices.length > 0) {
      updates.choices = [...newPrivateChoices, ...newGroupChoices];
    }
  
    if (Object.keys(updates).length > 0) {
      await setDoc(privateStateRef, updates, { merge: true });
    }
  };

  const getActionScope = (choice) => {
    const npcMatch = choice.match(/(.+)에게 말을 건다/);
    if (npcMatch) {
        return `npc:${npcMatch[1].trim()}`;
    }
    return `location:${gameState.player.currentLocation}`;
  };

  const buildLlmPrompt = (choice) => {
    const personalizedHistory = gameState.log.slice(-10).map(event => {
        let historyEntry = `[${event.actor.displayName}] ${event.action} -> ${event.publicStory}`;
        if (event.privateStories && event.privateStories[userId]) {
            historyEntry += ` (개인적으로 당신은 다음을 경험했다: ${event.privateStories[userId]})`;
        }
        return historyEntry;
    }).join('\n');

    return {
        actorDisplayName: getDisplayName(userId),
        playerChoice: choice,
        sharedInfo: { currentLocation: gameState.player.currentLocation, subtleClues: gameState.subtleClues },
        privateInfo: privatePlayerState,
        personalizedHistory: personalizedHistory,
        activeUsers: activeUsers.map(u => ({ nickname: getDisplayName(u.id), profession: u.profession })).filter(u => u.id !== userId),
        worldHistory: worldHistory.map(h => h.summary),
    };
  };

  const createCharacter = async (choice) => {
    setIsTextLoading(true);
    try {
        const choiceKey = choice.split('.')[0];
        const selectedProfession = professions[choiceKey];
        if (selectedProfession) {
            const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
            await setDoc(privateStateRef, {
                ...getDefaultPrivatePlayerState(),
                characterCreated: true,
                profession: selectedProfession.name,
                initialMotivation: selectedProfession.motivation,
            }, { merge: true });

            const newEvent = {
                story: `어둠침침한 여관 문이 삐걱거리며 열리더니, 새로운 모험가가 모습을 드러냅니다. 바로 '${getDisplayName(userId)}'라는 이름의 ${selectedProfession.name}입니다.`,
                privateStory: selectedProfession.motivation,
                choices: ["여관을 둘러본다.", "다른 모험가에게 말을 건다.", "여관 주인에게 정보를 묻는다."]
            };

            await updatePublicState(newEvent, "여관에 들어선다");
        }
    } catch (e) {
        console.error("등장 이벤트 추가 실패: ", e);
        setLlmError("게임 세계에 합류하는 중 오류가 발생했습니다.");
    } finally {
        setIsTextLoading(false);
    }
  };

  const performPlayerAction = async (choice) => {
    const gameStatusRef = getGameStatusRef(db, appId);
    const scope = getActionScope(choice);

    setIsTextLoading(true);

    try {
        const currentLocks = (await getDoc(gameStatusRef)).data()?.actionLocks || {};
        if (currentLocks[scope] && currentLocks[scope] !== userId) {
            throw new Error(`현재 '${scope.split(':')[1]}'(은)는 다른 플레이어(${getDisplayName(currentLocks[scope])})가 사용 중입니다.`);
        }
        await setDoc(gameStatusRef, { actionLocks: { ...currentLocks, [scope]: userId } }, { merge: true });

        const promptData = buildLlmPrompt(choice);
        const llmResponse = await callGeminiTextLLM(promptData);

        if (llmResponse) {
            await updatePublicState(llmResponse, choice);
            await updatePrivateState(llmResponse);
            setLlmError(null);
            setLlmRetryPrompt(null);
        } else if (!llmError) {
            setLlmError("LLM으로부터 유효한 응답을 받지 못했습니다.");
        }
    } catch (error) {
        console.error("행동 처리 중 오류:", error.message);
        setLlmError(error.message);
    } finally {
        const finalLocksDoc = await getDoc(gameStatusRef);
        if (finalLocksDoc.exists()) {
            const finalLocks = finalLocksDoc.data().actionLocks || {};
            if (finalLocks[scope] === userId) {
                delete finalLocks[scope];
                await setDoc(gameStatusRef, { actionLocks: finalLocks }, { merge: true });
            }
        }
        setIsTextLoading(false);
    }
  };

  const handleChoiceClick = async (choice) => {
    if (isTextLoading) return;

    if (!privatePlayerState.characterCreated) {
        await createCharacter(choice);
    } else {
        await performPlayerAction(choice);
    }
  };
  
  const toggleAccordion = (key) => {
    setAccordion(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // [3] Render Functions: UI 분리 (가독성 향상)
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
                  await handleChoiceClick(llmRetryPrompt.playerChoice);
                }
              }}
            >
              재시도
            </button>
          )}
          <button
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 font-bold rounded-md"
            onClick={() => {
              setLlmError(null);
              setLlmRetryPrompt(null);
            }}
          >
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
  
  const renderGameLog = () => (
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
            {!privatePlayerState.characterCreated && (
              <div className="mb-4 p-2 rounded bg-gray-900/50 text-center">
                  <p className="text-yellow-300 font-semibold italic text-lg">모험의 서막</p>
                  <p className="whitespace-pre-wrap mt-1">당신은 어떤 운명을 선택하시겠습니까?</p>
              </div>
            )}
            {gameState.log.map((event, index) => (
              <div key={index} className="mb-4 p-2 rounded bg-gray-900/50">
                {event.actor?.displayName && event.action && (
                   <p className="text-yellow-300 font-semibold italic text-sm">
                      {event.actor.displayName} 님이 {event.action} 선택
                   </p>
                )}
                <p className="whitespace-pre-wrap mt-1" dangerouslySetInnerHTML={{ __html: (event.publicStory || '').replace(/\n/g, '<br />') }}></p>
                {event.groupStory && privatePlayerState.groups.length > 0 && (
                    <p className="whitespace-pre-wrap mt-2 p-2 rounded bg-green-900/30 border-l-4 border-green-400 text-green-200">
                        <span className="font-bold">[그룹 이야기] </span>
                        {event.groupStory}
                    </p>
                )}
                {event.privateStories && event.privateStories[userId] && (
                  <p className="whitespace-pre-wrap mt-2 p-2 rounded bg-blue-900/30 border-l-4 border-blue-400 text-blue-200">
                    <span className="font-bold">[당신만 아는 사실] </span>
                    {event.privateStories[userId]}
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
            {Object.entries(actionLocks).map(([scope, lockedBy]) => {
              if (lockedBy === userId) return null;
              return (
                  <div key={scope} className="text-center text-yellow-400 font-semibold p-2 bg-black bg-opacity-20 rounded-md mt-2">
                      {`'${scope.split(':')[1]}' 영역은 ${getDisplayName(lockedBy)}님이 사용 중입니다...`}
                  </div>
              )
            })}
            <div ref={logEndRef} />
          </div>
        </>
      )}
    </div>
  );

  const renderChoices = () => (
    <div className="flex flex-col gap-3">
        {privatePlayerState.characterCreated ? (
            [...gameState.choices, ...(privatePlayerState.choices || [])].map((choice, index) => {
                const scope = getActionScope(choice);
                const isLockedByOther = actionLocks[scope] && actionLocks[scope] !== userId;
                const allPrivateChoices = privatePlayerState.choices || [];
                const isPersonalChoice = allPrivateChoices.includes(choice);
                const isPublicChoice = gameState.choices.includes(choice);
                
                let buttonStyle = 'bg-blue-600 hover:bg-blue-700';
                let prefix = '';

                if (isPersonalChoice && !isPublicChoice) {
                  buttonStyle = 'bg-green-600 hover:bg-green-700';
                  prefix = '[개인/그룹] ';
                }
                
                if (isLockedByOther) {
                  buttonStyle = 'bg-gray-500 cursor-not-allowed';
                  prefix = `[${getDisplayName(actionLocks[scope])} 사용 중] `;
                }

                return (
                    <button
                        key={index}
                        className={`px-6 py-3 font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 ${buttonStyle} text-white`}
                        onClick={() => handleChoiceClick(choice)}
                        disabled={isTextLoading || isLockedByOther}
                    >
                        {prefix}{choice}
                    </button>
                )
            })
        ) : (
            Object.keys(professions).map(key => (
                <button
                    key={key}
                    onClick={() => handleChoiceClick(`${key}. ${professions[key].name}`)}
                    disabled={isTextLoading}
                    className="px-6 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 disabled:cursor-wait text-left"
                >
                    <p className="text-lg text-blue-300">{`${key}. ${professions[key].name}`}</p>
                    <p className="text-sm font-normal text-gray-300 mt-1">{professions[key].motivation}</p>
                </button>
            ))
        )}
    </div>
  );

  const renderSidebar = () => (
    <div className="w-full lg:w-1/3 flex flex-col space-y-6 bg-gray-700 p-4 rounded-lg shadow-inner">
        {/* 내 정보 */}
        <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('playerInfo')}>
                <h4 className="text-md font-semibold text-gray-200">내 정보</h4>
                <div className="text-xl">{accordion.playerInfo ? '▼' : '▲'}</div>
            </div>
            {accordion.playerInfo && (
              <div className="bg-gray-600 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1 h-48 overflow-y-auto custom-scrollbar">
                <p><span className="font-semibold text-blue-300">이름:</span> {getDisplayName(userId)}</p>
                <p><span className="font-semibold text-blue-300">직업:</span> {privatePlayerState.profession || '미정'}</p>
                <p><span className="font-semibold text-blue-300">위치:</span> {gameState.player.currentLocation}</p>
                <p><span className="font-semibold text-blue-300">능력치:</span> 힘({privatePlayerState.stats.strength}) 지능({privatePlayerState.stats.intelligence}) 민첩({privatePlayerState.stats.agility}) 카리스마({privatePlayerState.stats.charisma})</p>
                <p><span className="font-semibold text-blue-300">인벤토리:</span> {privatePlayerState.inventory.join(', ') || '비어있음'}</p>
                <p><span className="font-semibold text-blue-300">퀘스트:</span> {privatePlayerState.activeQuests.join(', ') || '없음'}</p>
                <p><span className="font-semibold text-blue-300">단서:</span> {privatePlayerState.knownClues.join(', ') || '없음'}</p>
                <p><span className="font-semibold text-green-300">소속 그룹:</span> {privatePlayerState.groups.join(', ') || '없음'}</p>
                <div>
                    <span className="font-semibold text-yellow-300">NPC 관계:</span>
                    <ul className="list-disc list-inside ml-4">
                        {Object.entries(privatePlayerState.npcRelations).length > 0 ? 
                            Object.entries(privatePlayerState.npcRelations).map(([name, value]) => <li key={name}>{`${name}: ${value}`}</li>) :
                            <li>알려진 관계 없음</li>
                        }
                    </ul>
                </div>
              </div>
            )}
        </div>

        {/* 세계의 역사 (신규) */}
        <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('worldHistory')}>
                <h4 className="text-md font-semibold text-gray-200">세계의 역사</h4>
                <div className="text-xl">{accordion.worldHistory ? '▼' : '▲'}</div>
            </div>
            {accordion.worldHistory && (
                <div className="bg-gray-600 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1 h-32 overflow-y-auto custom-scrollbar">
                    {worldHistory.length > 0 ? (
                        <ul className="list-disc list-inside">
                            {worldHistory.map((event, index) => <li key={index}>{event.summary}</li>)}
                        </ul>
                    ) : (
                        <p>아직 기록된 역사가 없습니다.</p>
                    )}
                </div>
            )}
        </div>
        
        {/* 현재 플레이어들 */}
        <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('users')}>
                <h4 className="text-md font-semibold text-gray-200">현재 플레이어들</h4>
                <div className="text-xl">{accordion.users ? '▼' : '▲'}</div>
            </div>
            {accordion.users && (
                <div className="bg-gray-600 p-3 rounded-md h-32 overflow-y-auto custom-scrollbar">
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
        
        {/* 공개 채팅 */}
        <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('chat')}>
                <h4 className="text-md font-semibold text-gray-200">공개 채팅</h4>
                <div className="text-xl">{accordion.chat ? '▼' : '▲'}</div>
            </div>
            {accordion.chat && (
                <div className="bg-gray-600 p-3 rounded-md flex flex-col h-48">
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
  );

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
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

      <div className="w-full max-w-5xl bg-gray-800 rounded-lg shadow-xl p-6 md:p-8 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6">
        <div className="flex flex-col w-full lg:w-2/3 space-y-6">
            {renderGameLog()}
            {renderChoices()}
        </div>
        {renderSidebar()}
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