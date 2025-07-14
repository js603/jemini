
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  deleteUser, // deleteUser 추가
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
  runTransaction,
  orderBy,
  limit,
  arrayUnion,
} from 'firebase/firestore';

// ====================================================================
// Firebase configuration information - 수정 금지
const defaultFirebaseConfig = {
  apiKey: 'AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8',
  authDomain: 'text-adventure-game-cb731.firebaseapp.com',
  projectId: 'text-adventure-game-cb731',
  storageBucket: 'text-adventure-game-cb731.appspot.com',
  messagingSenderId: '1092941614820',
  appId: '1:1092941614820:web:5545f36014b73c268026f1',
  measurementId: 'G-FNGF42T1FP',
};

// 수정금지
const firebaseConfig = defaultFirebaseConfig;
const appId = firebaseConfig.projectId;
const initialAuthToken = null;
// ====================================================================

// Firestore 경로 유틸
const getMainScenarioRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'mainScenario', 'main');
const getPrivatePlayerStateRef = (db, appId, userId) => doc(db, 'artifacts', appId, 'users', userId, 'playerState', 'state');
const getGameStatusRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
const getMajorEventsRef = (db, appId) => collection(db, 'artifacts', appId, 'public', 'data', 'majorEvents');
const getPersonalStoryLogRef = (db, appId, userId) => collection(db, 'artifacts', appId, 'users', userId, 'personalStoryLog');
const getNpcRef = (db, appId, npcId) => doc(db, 'artifacts', appId, 'public', 'data', 'npcs', npcId);
const getActiveTurningPointRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'turningPoints', 'active');
const getWorldviewRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'worldview', 'main');

// 상태 초기화 유틸
const getDefaultGameState = () => ({
  publicLog: [],
  subtleClues: [],
  lastUpdate: null,
});

const getDefaultPrivatePlayerState = () => ({
  stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 },
  inventory: [],
  initialMotivation: '',
  reputation: {},
  activeQuests: [],
  companions: [],
  knownClues: [],
  activeMemories: [],
  characterCreated: false,
  profession: '',
  choices: [],
  groups: [],
  npcRelations: {},
  knownEventIds: [],
  currentLocation: null,
});

function App() {
  const [gameState, setGameState] = useState(getDefaultGameState());
  const [personalStoryLog, setPersonalStoryLog] = useState([]);
  const [privatePlayerState, setPrivatePlayerState] = useState(getDefaultPrivatePlayerState());
  const [displayedChoices, setDisplayedChoices] = useState([]);
  const [choicesTimestamp, setChoicesTimestamp] = useState(null);
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
  const [accordion, setAccordion] = useState({
    gameLog: true,
    chat: true,
    users: true,
    playerInfo: true,
    chronicle: true,
    turningPoint: true,
  });
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [llmError, setLlmError] = useState(null);
  const [llmRetryPrompt, setLlmRetryPrompt] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [allMajorEvents, setAllMajorEvents] = useState([]);
  const [knownMajorEvents, setKnownMajorEvents] = useState([]);
  const [activeTurningPoint, setActiveTurningPoint] = useState(null);
  const [worldview, setWorldview] = useState(null);

  const combinedFeed = useMemo(() => {
    const chatFeed = (chatMessages || []).map((msg) => ({
      ...msg,
      type: 'chat',
      date: msg.timestamp?.toDate() || new Date(),
    }));

    const publicLogFeed = (gameState.publicLog || []).map((log, index) => ({
      ...log,
      id: `${log.timestamp?.toString()}-${index}` || `${Date.now()}-${index}`,
      type: 'system',
      date: log.timestamp instanceof Date ? log.timestamp : new Date(),
    }));

    return [...chatFeed, ...publicLogFeed].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [chatMessages, gameState.publicLog]);

  const handleNicknameSubmit = () => {
    if (nicknameInput.trim()) {
      const finalNickname = nicknameInput.trim();
      setNickname(finalNickname);
      localStorage.setItem('nickname', finalNickname);
      setShowNicknameModal(false);
      if (userId && db) {
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId), { nickname: finalNickname }, { merge: true });
      }
    }
  };

  const getDisplayName = (uid) => {
    const safeUid = String(uid || '');
    if (uid === userId) {
      const safeUserId = String(userId || '');
      return nickname || `플레이어 ${safeUserId.substring(0, 4)}`;
    }
    const user = activeUsers.find((u) => u.id === uid);
    return user?.nickname || `플레이어 ${safeUid.substring(0, 4)}`;
  };

  const resetAllGameData = async () => {
    if (!db || !isAuthReady || !auth.currentUser) return;
    setIsResetting(true);
    try {
      const collectionsToDelete = [
        collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages'),
        collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers'),
        getMajorEventsRef(db, appId),
        collection(db, 'artifacts', appId, 'public', 'data', 'npcs'),
        collection(db, 'artifacts', appId, 'public', 'data', 'turningPoints'),
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
        const personalLogRef = getPersonalStoryLogRef(db, appId, userDoc.id);
        const personalLogSnapshot = await getDocs(personalLogRef);
        for (const logDoc of personalLogSnapshot.docs) {
          await deleteDoc(logDoc.ref);
        }
        const playerStateColRef = collection(db, 'artifacts', appId, 'users', userDoc.id, 'playerState');
        const playerStateSnapshot = await getDocs(playerStateColRef);
        for (const stateDoc of playerStateSnapshot.docs) {
          await deleteDoc(stateDoc.ref);
        }
        await deleteDoc(doc(db, 'artifacts', appId, 'users', userDoc.id));
      }

      await deleteDoc(getWorldviewRef(db, appId));
      await deleteDoc(getMainScenarioRef(db, appId));
      await deleteDoc(getGameStatusRef(db, appId));

      await deleteUser(auth.currentUser);
      console.log("Firebase Auth user deleted.");

      localStorage.clear();
      window.location.reload();

    } catch (e) {
      console.error('전체 데이터 초기화 중 오류 발생:', e);
      setLlmError('초기화에 실패했습니다. 이 오류가 반복되면 브라우저의 캐시를 삭제하고 다시 시도해 주세요.');
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
      console.error('Firebase initialization error:', error);
      setLlmError('Firebase 초기화에 실패했습니다.');
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady || !db || !userId) return;

    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
    getDoc(privateStateRef).then((docSnap) => {
      if (!docSnap.exists()) {
        setDoc(privateStateRef, getDefaultPrivatePlayerState());
      }
    });
    const unsubscribePrivateState = onSnapshot(privateStateRef, (snapshot) => {
      if (snapshot.exists()) {
        setPrivatePlayerState({ ...getDefaultPrivatePlayerState(), ...snapshot.data() });
      }
      if (isLoading) setIsLoading(false);
    });

    const personalLogQuery = query(getPersonalStoryLogRef(db, appId, userId), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribePersonalLog = onSnapshot(personalLogQuery, (snapshot) => {
      const stories = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).reverse();
      setPersonalStoryLog(stories);
    });

    return () => {
      unsubscribePrivateState();
      unsubscribePersonalLog();
    };
  }, [isAuthReady, db, userId]);

  useEffect(() => {
    if (!isAuthReady || !db) return;

    const unsubscribes = [
      onSnapshot(getMainScenarioRef(db, appId), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setGameState((prev) => ({
            ...prev,
            publicLog: data.publicLog || [],
            subtleClues: data.subtleClues || [],
            lastUpdate: data.lastUpdate,
          }));
        }
      }),
      onSnapshot(getWorldviewRef(db, appId), (snap) => {
        setWorldview(snap.exists() ? snap.data() : null);
      }),
      onSnapshot(getGameStatusRef(db, appId), (docSnap) => {
        setActionLocks(docSnap.data()?.actionLocks || {});
      }),
      onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages')), (snapshot) => {
        const messages = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
        setChatMessages(messages);
      }),
      onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers')), (snapshot) => {
        const cutoffTime = Date.now() - 60 * 1000;
        const users = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.lastActive && u.lastActive.toMillis() > cutoffTime);
        setActiveUsers(users);
      }),
      onSnapshot(query(getMajorEventsRef(db, appId)), (snapshot) => {
        const events = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
        setAllMajorEvents(events);
      }),
      onSnapshot(getActiveTurningPointRef(db, appId), (docSnap) => {
        setActiveTurningPoint(docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null);
      }),
    ];
    return () => unsubscribes.forEach((unsub) => unsub());
  }, [isAuthReady, db]);

  useEffect(() => {
    if (!db || !userId || allMajorEvents.length === 0) return;
    const currentKnownIds = privatePlayerState.knownEventIds || [];
    const newDiscoveredEvents = allMajorEvents.filter(event => event?.location === privatePlayerState.currentLocation && !currentKnownIds.includes(event.id)).map(event => event.id);
    if (newDiscoveredEvents.length > 0) {
      const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
      setDoc(privateStateRef, { knownEventIds: arrayUnion(...newDiscoveredEvents) }, { merge: true });
    }
  }, [privatePlayerState.currentLocation, allMajorEvents, privatePlayerState.knownEventIds, db, userId]);

  useEffect(() => {
    const knownEvents = allMajorEvents.filter((event) => (privatePlayerState.knownEventIds || []).includes(event?.id));
    setKnownMajorEvents(knownEvents);
  }, [privatePlayerState.knownEventIds, allMajorEvents]);

  useEffect(() => {
    if (!db || !userId || !nickname) return;
    const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
    setDoc(
      userDocRef,
      {
        lastActive: serverTimestamp(),
        nickname: nickname || `플레이어 ${userId.substring(0, 4)}`,
        profession: privatePlayerState.profession,
      },
      { merge: true }
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setDoc(userDocRef, { lastActive: serverTimestamp() }, { merge: true });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [db, userId, nickname, privatePlayerState.profession]);

  useEffect(() => {
    if (accordion.gameLog && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [personalStoryLog, accordion.gameLog]);

  useEffect(() => {
    if (accordion.chat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [combinedFeed, accordion.chat]);

  useEffect(() => {
    // 앱이 로딩 상태가 아니고, 캐릭터는 생성되었는데, 세계관이 없는 경우를 감지
    if (!isLoading && privatePlayerState.characterCreated && !worldview && db) {
      
      // 이 함수는 세계관이 없을 때만 호출됩니다.
      const createMissingWorld = async () => {
        console.warn("Character exists but worldview is missing. Re-creating world...");
        
        // 함수 실행 중 중복 호출 방지를 위해 임시로 worldview를 객체로 설정
        setWorldview({}); 

        try {
          const worldviewRef = getWorldviewRef(db, appId);
          // LLM을 호출하여 세계관 생성
          const llmResponse = await callGeminiTextLLM(worldCreationPrompt, worldCreationPrompt);

          if (llmResponse) {
            await setDoc(worldviewRef, llmResponse);
            // 성공적으로 생성된 세계관을 상태에 반영하면, 무한 루프가 깨지고 정상 렌더링됩니다.
            setWorldview(llmResponse); 
            console.log("World created successfully to resolve stuck state.");
          } else {
            // LLM 호출 실패 시 에러 처리
            throw new Error("세계관 자동 복구에 실패했습니다.");
          }
        } catch (error) {
          console.error(error);
          setLlmError("세계관 정보가 없어 게임을 시작할 수 없습니다. '전체 데이터 초기화'를 시도해 주세요.");
        }
      };

      createMissingWorld();
    }
  }, [isLoading, privatePlayerState.characterCreated, worldview, db]); // 의존성 배열이 매우 중요합니다.


  useEffect(() => {
    // 앱 로딩이 끝나고, DB가 준비되었는지 확인
    if (isLoading || !db || !isAuthReady) {
      return;
    }

    // 캐릭터가 아직 생성되지 않았고, 불러온 세계관도 없을 때
    if (!privatePlayerState.characterCreated && !worldview) {
      
      const createInitialWorld = async () => {
        console.log("No character and no worldview detected. Creating a new world to start...");
        // 중복 생성을 막기 위해 임시 로딩 상태 활성화
        setIsTextLoading(true);
        try {
          const worldviewRef = getWorldviewRef(db, appId);
          
          // LLM을 호출하여 세계관 생성
          const llmResponse = await callGeminiTextLLM(worldCreationPrompt, worldCreationPrompt);

          if (llmResponse) {
            // Firestore에 세계관 저장
            await setDoc(worldviewRef, llmResponse);
            // 앱의 state에 세계관 설정 (이것으로 UI가 다시 렌더링됩니다)
            setWorldview(llmResponse);
            console.log("Initial world created successfully. Ready for character selection.");
          } else {
            // LLM 호출 실패 시 에러 처리
            throw new Error("세계관 생성에 실패했습니다. LLM이 응답하지 않았습니다.");
          }
        } catch (error) {
          console.error(error);
          setLlmError("초기 세계를 생성하는 데 실패했습니다. 잠시 후 페이지를 새로고침하거나, 문제가 지속되면 '전체 데이터 초기화'를 다시 시도해 주세요.");
        } finally {
          setIsTextLoading(false);
        }
      };

      createInitialWorld();
    }
    // 의존성 배열은 이 로직이 필요한 정확한 시점에 실행되도록 보장합니다.
  }, [isLoading, db, isAuthReady, privatePlayerState.characterCreated, worldview]);

  const buildSystemPrompt = (worldviewData) => {
    const worldSetting = worldviewData ? `### 세계관 설정: [${worldviewData.genre}] ${worldviewData.title}\n${worldviewData.atmosphere}\n배경: ${worldviewData.background_story}` : `### 세계관 설정: 페이디드 판타지 (Faded Fantasy) 이 세계는 오래되었고, 과거의 영광은 빛이 바랬습니다... (기본값)`;
    return `### 페르소나 (Persona) 당신은 이 세계의 '수호자'이자 '사관(史官)'이며, 플레이어들에게는 '게임 마스터(GM)'로 알려져 있습니다. 당신의 임무는 단순한 이야기 생성을 넘어, 일관된 역사와 살아 숨 쉬는 세계관을 구축하는 것입니다. 모든 묘사와 사건은 이 세계의 정해진 분위기와 역사적 사실 위에서 피어나는 한 편의 서사시여야 합니다. ${worldSetting} ### 핵심 구동 원칙 1. **일관성의 원칙 (Canon) (가장 중요)**: User Prompt에 제공된 [세계의 연대기], [주요 세력 및 인물], [플레이어 정보]는 이 세계의 '정사(正史)'입니다. 당신은 절대 이 사실들을 왜곡하거나 모순되는 내용을 만들어서는 안 됩니다. 이 정보들을 바탕으로 세계를 확장해 나가십시오. 2. **상호연결성의 원칙 (Interconnection)**: 당신은 뛰어난 이야기꾼으로서, 현재 발생하는 사건을 과거의 역사나 다른 플레이어의 행적과 연결지어야 합니다. 예를 들어, 한 플레이어가 던전에서 발견한 고대 문양은, 다른 플레이어가 수도에서 쫓고 있는 비밀 결사의 상징일 수 있습니다. 세상이 서로 연결되어 있음을 플레이어가 느끼게 하십시오. 3. **장면 중심의 서사 원칙 (Scene-Centric)**: 플레이어의 '[선택]'은 하나의 '장면'을 시작하는 것과 같습니다. 당신의 "personalStory"는 반드시 그 선택의 즉각적인 결과와 묘사로 시작되어야 합니다. 대화라면 실제 대화 내용이, 행동이라면 그 행동의 과정과 결과가 구체적으로 서술되어야 합니다. 4. **'보여주기, 말하지 않기' 원칙 (Show, Don't Tell)**: "마을이 가난하다"고 설명하지 마십시오. 대신 "굶주린 아이들이 흙바닥에 주저앉아 있고, 대부분의 건물은 지붕이 허술하게 덧대어져 있다"고 묘사하십시오. 플레이어가 스스로 분위기와 상황을 파악하게 만드십시오. ### [추가] NPC 상호작용 규칙 - 플레이어가 NPC와 상호작용할 때, 해당 NPC의 [페르소나 카드]가 제공될 수 있습니다. - 당신은 반드시 이 [페르소나 카드]에 명시된 '핵심 정체성'과 '기억 로그'를 바탕으로 NPC의 대사와 행동을 일관성 있게 생성해야 합니다. - 상호작용의 결과로 NPC가 새로운 사실을 알게 되거나 감정이 변했다면, 이를 반영할 '기억 로그 업데이트'를 JSON 출력의 'npcMemoryUpdate' 필드에 요약하여 포함시키십시오. ### JSON 출력 구조 {"publicLogEntry": "만약 이 행동이 주변의 다른 플레이어나 NPC가 명백히 인지할 수 있는 '공개적인 사건'이라면, 3인칭 시점의 객관적인 기록을 한 문장으로 작성. (예: '플레이어 A가 경비병을 공격했다.') 그렇지 않으면 null.","personalStory": "플레이어의 선택으로 시작된 '장면'에 대한 상세하고 감정적인 1인칭 또는 2인칭 서사. 플레이어의 내면 묘사, 감각, 대화 내용 등을 포함.","choices": ["'personalStory'의 결과에 따라 플레이어가 할 수 있는 논리적인 다음 행동들."],"privateChoices": ["오직 행동 주체의 특성 때문에 가능한 특별한 행동들."],"groupChoices": ["같은 그룹 소속원들만 할 수 있는 비밀 행동들."],"majorEvent": {"summary": "만약 이 사건이 후대에 '역사'로 기록될 만한 중대한 전환점이라면, 사관의 어조로 요약. (예: '왕국력 342년, 방랑자의 안식처에서 발생한 이 사건은 훗날 '붉은 달 교단'의 부흥을 알리는 서막이 되었다.') 그렇지 않으면 null.","location": "사건이 발생한 장소 이름. majorEvent가 있을 경우 필수."},"sharedStateUpdates": {"subtleClues": [{"location": "장소명", "clue": "새롭게 생성된 단서"}]},"privateStateUpdates": {"location": "플레이어의 새로운 현재 위치. 변경되었을 경우에만 포함.","inventory": ["업데이트된 전체 인벤토리 목록"],"stats": {"strength": 12, "intelligence": 10, "agility": 10, "charisma": 10 },"activeQuests": ["업데이트된 개인 퀘스트 목록"],"knownClues": ["새롭게 알게 된 단서 목록"],"groups": ["업데이트된 소속 그룹 목록"],"npcRelations": {"가라크": "55 (나에 대한 경계심이 약간 누그러졌다.)"}},"npcMemoryUpdate": {"npcName": "상호작용 한 NPC의 이름","newMemory": "NPC의 기억에 추가될 새로운 로그 (예: '플레이어 B가 음식값을 빚지고 도망갔다.')"},"turningPointUpdate": {"objectiveId": "플레이어의 행동이 기여한 목표의 ID","progressIncrement": 10}}`;
  };

  const worldCreationPrompt = `당신은 천재적인 스토리 작가이자 '세계 창조자'입니다. 지금부터 플레이어들이 모험할 새로운 세계의 핵심 설정을 만들어야 합니다. 전통적인 판타지에 얽매이지 말고, 영화, 애니메이션, 소설, 신화 등 모든 장르를 아우르는 독창적이고 매력적인 세계관을 창조하십시오. 사이버펑크, 무협, 스팀펑크, 코스믹 호러, 포스트 아포칼립스, 느와르 등 어떤 것이든 좋습니다. 아래 JSON 구조에 맞춰 응답해주십시오.

### JSON 출력 구조
{
  "title": "세계관의 이름 (예: '네온 비가 내리는 도시, 2242')",
  "genre": "세계관의 장르 (예: '사이버펑크 느와르')",
  "atmosphere": "세계의 전체적인 분위기를 묘사하는 2~3 문장의 글",
  "background_story": "플레이어가 모험을 시작하기 직전까지의 간략한 배경 역사",
  "startingLocation": "플레이어가 처음 눈을 뜨게 될 시작 장소의 이름 (예: '비에 젖은 뒷골목의 국수 가판대')",
  "professions": [
    { "name": "기업 해결사", "motivation": "거대 기업의 비리를 파헤치다 동료를 잃고 복수를 다짐합니다." },
    { "name": "기억 상실된 사이보그", "motivation": "자신이 누구인지, 왜 몸의 일부가 기계인지에 대한 단서를 찾아야 합니다." },
    { "name": "뒷골목 정보상", "motivation": "도시의 모든 비밀을 거래하며, 가장 큰 한탕을 노리던 중 위험한 정보에 휘말렸습니다." },
    { "name": "반체제 저항군", "motivation": "억압적인 기업 통치에 맞서 싸우는 저항군의 일원으로서 중요한 임무를 부여받았습니다." }
  ],
  "startingChoices": [
    "주변을 둘러보며 현재 상황을 파악한다.",
    "가장 가까운 사람에게 말을 걸어본다.",
    "일단 몸을 숨길 곳을 찾는다."
  ]
}`;

  const turningPointCreationPrompt = `당신은 역사의 흐름을 읽는 '운명' 그 자체입니다. 최근 세상에서 벌어진 다음 사건들을 보고, 이 흐름이 하나의 거대한 '전환점(Turning Point)'으로 수렴될 수 있는지 판단하십시오. 현재 활성화된 전환점은 없습니다. 만약 중대한 갈등의 씨앗이나, 거대한 위협, 혹은 새로운 시대의 서막이 보인다면, 그에 맞는 전환점을 아래 JSON 형식으로 생성해주십시오. 아직 시기가 아니라면 'create' 값을 false로 설정하십시오. ### 최근 사건들 {event_summary} ### JSON 출력 구조 {"create": true,"turningPoint": {"title": "전환점의 제목 (예: '수도에 창궐한 역병')","description": "전환점에 대한 흥미로운 설명","status": "active","objectives": [{ "id": "objective_1", "description": "첫 번째 목표 (예: 역병의 근원 찾기)", "progress": 0, "goal": 100 },{ "id": "objective_2", "description": "두 번째 목표 (예: 치료제 개발 지원)", "progress": 0, "goal": 100 }]}}`;

  const checkAndCreateTurningPoint = async () => {
    if (activeTurningPoint || !db) return;
    console.log("Checking for new Turning Point...");
    const publicLogSummary = (gameState.publicLog || []).slice(-20).map(e => e.log).join('\n');
    const majorEventsSummary = (allMajorEvents || []).slice(-10).map(e => e.summary).join('\n');
    const eventSummary = `[최근 공개 사건들]\n${publicLogSummary}\n\n[최근 주요 역사]\n${majorEventsSummary}`;
    const prompt = turningPointCreationPrompt.replace('{event_summary}', eventSummary);
    const llmResponse = await callGeminiTextLLM(prompt, buildSystemPrompt(worldview));

    if (llmResponse && llmResponse.create && llmResponse.turningPoint) {
      console.log("New Turning Point detected! Creating...", llmResponse.turningPoint);
      const turningPointRef = getActiveTurningPointRef(db, appId);
      await setDoc(turningPointRef, { ...llmResponse.turningPoint, startTimestamp: serverTimestamp() });
    } else {
      console.log("No new Turning Point detected at this time.");
    }
  };

  const buildLlmPrompt = async (choice) => {
    const factions = (privatePlayerState.groups || []).join(', ') || '없음';
    const npcs = Object.entries(privatePlayerState.npcRelations || {}).map(([name, value]) => `${name} (관계: ${value})`).join(', ') || '없음';
    const personalLogEntries = (personalStoryLog || []).slice(-10).map((entry) => `[나의 행동: ${entry?.action ?? '알 수 없는 행동'}] -> ${entry?.story ?? ''}`).join('\n');
    const publicLogEntries = (gameState.publicLog || []).slice(-10).map((entry) => `[${entry?.actor?.displayName ?? '누군가'}] ${entry?.log ?? ''}`).join('\n');
    const activeMemorySection = privatePlayerState.activeMemories && privatePlayerState.activeMemories.length > 0 ? `[나의 활성 기억 (My Active Memories)]\n- 이것은 내가 이 세계에서 가장 중요하다고 생각하는 핵심 정보들입니다. 당신은 이 정보를 반드시 최우선으로 고려하여 이야기를 진행해야 합니다.\n- ${privatePlayerState.activeMemories.join('\n- ')}\n` : '';
    let npcPersonaCardSection = '';
    const npcMatch = choice.match(/(.+)에게 말을 건다/);
    if (npcMatch && db) {
      const npcName = npcMatch[1].trim();
      const npcId = npcName.replace(/\s+/g, '_');
      const npcRef = getNpcRef(db, appId, npcId);
      const npcSnap = await getDoc(npcRef);
      if (npcSnap.exists()) {
        const npcData = npcSnap.data();
        npcPersonaCardSection = `\n[NPC 페르소나 카드: ${npcName}]\n- 핵심 정체성: ${npcData.core_identity || '아직 알려지지 않음'}\n- 기억 로그: \n${npcData.memory_log && npcData.memory_log.length > 0 ? npcData.memory_log.map((log) => `- ${log}`).join('\n') : '- 특별한 기억 없음'}\n`;
      } else {
        npcPersonaCardSection = `\n[NPC 페르소나 카드: ${npcName}]\n- 핵심 정체성: 당신이 이번 상호작용을 통해 이 NPC의 성격을 처음으로 설정합니다.\n- 기억 로그: - 특별한 기억 없음\n`;
      }
    }
    let turningPointSection = "";
    if (activeTurningPoint && activeTurningPoint.status === 'active') {
      turningPointSection = `\n[현재 진행중인 주요 분기점: ${activeTurningPoint.title}]\n- 개요: ${activeTurningPoint.description}\n- 현재 목표 및 진척도:\n${(activeTurningPoint.objectives || []).map(obj => `     - ${obj.description} (${obj.progress}/${obj.goal})`).join('\n')}\n- 당신의 행동이 이 분기점의 목표에 기여한다면, 'turningPointUpdate'를 통해 결과를 알려주십시오.\n`;
    }
    const userPrompt = `${activeMemorySection}${npcPersonaCardSection}${turningPointSection}[세계의 연대기 (World Chronicle)]\n- 내가 발견한, 세상에 일어난 주요 역사적 사건들입니다. 이 기록은 절대적인 사실입니다.\n- ${knownMajorEvents.length > 0 ? knownMajorEvents.map((h) => h.summary).join('\n- ') : '아직 기록된 역사가 없음'}\n\n[나의 여정록 (My Journey Log) - 최근 기록]\n- 이것은 나의 개인적인 경험과 생각의 기록입니다.\n${personalLogEntries || '아직 여정을 시작하지 않음'}\n\n[주변의 최근 사건들 (Recent Public Events)]\n- 내가 있는 장소 주변에서 최근 일어난 공개적인 사건들입니다.\n${publicLogEntries || '최근에 주변에서 별다른 일은 없었음'}\n\n[주요 세력 및 인물 (Key Factions & NPCs)]\n- 나와 관련된 주요 세력: ${factions}\n- 나와 관계를 맺은 주요 인물: ${npcs}\n\n[나의 현재 상태 (My Current State)]\n- 이름: ${getDisplayName(userId)}\n- 직업: ${privatePlayerState.profession ?? '미정'}\n- 현재 위치: ${privatePlayerState.currentLocation ?? '알 수 없는 곳'}\n- 소지품 및 능력치: ${JSON.stringify({ inventory: privatePlayerState.inventory || [], stats: privatePlayerState.stats || {} })}\n\n[주변 관찰자 (Nearby Observers)]\n- 현재 장소에 함께 있는 다른 플레이어들입니다. 이들은 이번 턴에 행동하지 않습니다.\n- ${(activeUsers || []).map((u) => u.nickname || `플레이어 ${u.id.substring(0, 4)}`).join(', ') || '주변에 다른 플레이어가 없음'}\n\n[나의 선택 (My Action)]\n- 위 모든 상황 속에서, 나는 다음 행동을 선택했습니다. 이 선택으로 시작될 '장면'을 연출해주십시오.\n- "${choice}"`;
    return userPrompt;
  };

  const callGeminiTextLLM = async (userPrompt, systemPromptToUse) => { setIsTextLoading(true); const mainApiKey = 'AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8'; const backupApiKey = 'AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84'; const getApiUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`; const payload = { contents: [{ role: 'user', parts: [{ text: systemPromptToUse }] }, { role: 'model', parts: [{ text: '{}' }] }, { role: 'user', parts: [{ text: userPrompt }] }] }; const tryGeminiCall = async (apiKey) => fetch(getApiUrl(apiKey), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); try { let response = await tryGeminiCall(mainApiKey); if (!response.ok) { response = await tryGeminiCall(backupApiKey); } if (!response.ok) { throw new Error(`HTTP error! status: ${response.status}`); } const result = await response.json(); const llmOutputText = result.candidates?.[0]?.content?.parts?.[0]?.text; const jsonMatch = llmOutputText?.match(/\{[\s\S]*\}/); if (jsonMatch) return JSON.parse(jsonMatch[0]); throw new Error('Valid JSON object not found in LLM response.'); } catch (error) { console.error('LLM API call error:', error); setLlmError(error.message || 'LLM 호출 실패'); return null; } finally { setIsTextLoading(false); } };
  const sendChatMessage = async () => { if (!db || !userId || !isAuthReady || !currentChatMessage.trim()) return; const messageText = currentChatMessage.trim(); setCurrentChatMessage(''); const chatCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages'); if (messageText.startsWith('!')) { const actionText = messageText.substring(1).trim(); if (actionText) { await addDoc(chatCollectionRef, { userId, displayName: getDisplayName(userId), message: `*${actionText} (선언)*`, isAction: true, timestamp: serverTimestamp() }); await handleDeclarativeAction(actionText); } } else { await addDoc(chatCollectionRef, { userId, displayName: getDisplayName(userId), message: messageText, isAction: false, timestamp: serverTimestamp() }); } };

  const updateNarratives = async (llmResponse, playerChoice, isDeclarative = false) => {
    const mainScenarioRef = getMainScenarioRef(db, appId);
    await runTransaction(db, async (transaction) => {
      const scenarioDoc = await transaction.get(mainScenarioRef);
      if (!scenarioDoc.exists()) {
        throw new Error('치명적 오류: 게임의 기본 시나리오 데이터가 없습니다.');
      }
      let currentData = scenarioDoc.data();
      let currentPublicLog = currentData.publicLog || [];
      if (isDeclarative) {
        currentPublicLog = [...currentPublicLog, { actor: { id: userId, displayName: getDisplayName(userId) }, log: "❗ 세계 흐름의 변동이 일어납니다!", isDeclaration: true, timestamp: new Date(new Date().getTime() - 1) }];
      }
      const updates = {
        subtleClues: llmResponse.sharedStateUpdates?.subtleClues || currentData.subtleClues,
        lastUpdate: serverTimestamp(),
      };
      if (llmResponse.publicLogEntry) {
        updates.publicLog = [...currentPublicLog, { actor: { id: userId, displayName: getDisplayName(userId) }, log: llmResponse.publicLogEntry, timestamp: new Date() }];
      } else if (isDeclarative) {
        updates.publicLog = currentPublicLog;
      }
      transaction.update(mainScenarioRef, updates);
    });

    await addDoc(getPersonalStoryLogRef(db, appId, userId), {
      action: playerChoice,
      story: llmResponse.personalStory || '특별한 일은 일어나지 않았다.',
      timestamp: serverTimestamp()
    });

    if (llmResponse.majorEvent?.summary && llmResponse.majorEvent?.location) {
      await addDoc(getMajorEventsRef(db, appId), {
        ...llmResponse.majorEvent,
        timestamp: serverTimestamp(),
        actor: { id: userId, displayName: getDisplayName(userId) },
      });
      checkAndCreateTurningPoint();
    }
    if (llmResponse.npcMemoryUpdate && db) {
      const { npcName, newMemory } = llmResponse.npcMemoryUpdate;
      if (npcName && newMemory) {
        const npcId = npcName.replace(/\s+/g, '_');
        await setDoc(getNpcRef(db, appId, npcId), { name: npcName, memory_log: arrayUnion(newMemory) }, { merge: true });
      }
    }
    if (llmResponse.turningPointUpdate && activeTurningPoint) {
      const { objectiveId, progressIncrement } = llmResponse.turningPointUpdate;
      if (objectiveId && typeof progressIncrement === 'number') {
        const turningPointRef = getActiveTurningPointRef(db, appId);
        await runTransaction(db, async (transaction) => {
          const tpDoc = await transaction.get(turningPointRef);
          if (!tpDoc.exists()) return;
          const tpData = tpDoc.data();
          const newObjectives = (tpData.objectives || []).map((obj) => {
            if (obj.id === objectiveId) {
              const newProgress = (obj.progress || 0) + progressIncrement;
              return { ...obj, progress: Math.min(Math.max(newProgress, 0), obj.goal) };
            }
            return obj;
          });
          transaction.update(turningPointRef, { objectives: newObjectives });
        });
      }
    }
    await updatePrivateState(llmResponse);
    const newPublicChoices = llmResponse.choices || [];
    setDisplayedChoices(newPublicChoices);
    const updatedScenarioDoc = await getDoc(mainScenarioRef);
    setChoicesTimestamp(updatedScenarioDoc.data()?.lastUpdate || null);
  };

  const updatePrivateState = async (llmResponse) => {
    const privateStateRef = getPrivatePlayerStateRef(db, appId, userId);
    const updates = llmResponse.privateStateUpdates ? { ...llmResponse.privateStateUpdates } : {};

    if (updates.npcRelations && typeof updates.npcRelations === 'object') {
      const existingRelations = privatePlayerState.npcRelations || {};
      updates.npcRelations = { ...existingRelations, ...updates.npcRelations };
    } else if (Object.prototype.hasOwnProperty.call(updates, 'npcRelations')) {
      delete updates.npcRelations;
      console.warn(`[Data Warning] LLM이 보낸 npcRelations 포맷이 유효하지 않아 무시합니다.`);
    }

    const newPrivateChoices = llmResponse.privateChoices || [];
    const newGroupChoices = llmResponse.groupChoices || [];
    updates.choices = [...newPrivateChoices, ...newGroupChoices];

    if (Object.keys(updates).length > 0) {
      await setDoc(privateStateRef, updates, { merge: true });
    }
  };

  const getActionScope = (choice) => { const npcMatch = choice.match(/(.+)에게 말을 건다/); if (npcMatch) { return `npc:${npcMatch[1].trim()}`; } return `location:${privatePlayerState.currentLocation}`; };
  const toggleActiveMemory = async (clue, activate) => { if (!db || !userId) return; const privateStateRef = getPrivatePlayerStateRef(db, appId, userId); let currentMemories = privatePlayerState.activeMemories || []; if (activate) { if (!currentMemories.includes(clue)) { currentMemories = [...currentMemories, clue]; } } else { currentMemories = currentMemories.filter((memory) => memory !== clue); } await setDoc(privateStateRef, { activeMemories: currentMemories }, { merge: true }); };
  const summarizeAndArchiveEvents = async () => { alert("시대 요약 기능은 다음 업데이트에서 구현될 예정입니다. 이 버튼을 누르면, '세계의 연대기'에 기록된 주요 사건들이 하나의 '역사 요약문'으로 압축되어, 게임의 장기적인 맥락을 유지하면서도 데이터 부담을 줄이게 됩니다."); };

  const createCharacter = async (choice) => {
    setIsTextLoading(true);
    try {
      const worldviewRef = getWorldviewRef(db, appId);
      let currentWorldview = worldview;

      // 세계관이 없다면 새로 생성 (기존 로직 유지)
      if (!currentWorldview || !currentWorldview.professions) {
        console.log("No worldview found. Creating a new one...");
        const llmResponse = await callGeminiTextLLM(worldCreationPrompt, worldCreationPrompt);
        if (llmResponse) {
          await setDoc(worldviewRef, llmResponse);
          currentWorldview = llmResponse;
          setWorldview(llmResponse);
        } else {
          throw new Error("Failed to create a new worldview.");
        }
      }

      // 선택한 직업 이름(choice)으로 worldview.professions 배열에서 해당 직업 정보 찾기
      const selectedProfession = currentWorldview.professions.find(p => p.name === choice);

      if (selectedProfession) {
        // 찾은 직업 정보와 동적 시작 위치를 사용해 플레이어 상태 설정
        await setDoc(getPrivatePlayerStateRef(db, appId, userId), { 
          ...getDefaultPrivatePlayerState(), 
          characterCreated: true, 
          profession: selectedProfession.name, 
          initialMotivation: selectedProfession.motivation, 
          currentLocation: currentWorldview.startingLocation // 동적 시작 위치 사용
        }, { merge: true });

        // 개인 로그에 기록
        await addDoc(getPersonalStoryLogRef(db, appId, userId), { 
          action: '여정에 나서다', 
          story: `나는 '${selectedProfession.name}'으로서, '${selectedProfession.motivation}'라는 동기를 품고 이 세상에 첫 발을 내디뎠다.`, 
          timestamp: serverTimestamp(), 
        });

        const mainScenarioRef = getMainScenarioRef(db, appId);
        await runTransaction(db, async (transaction) => {
          const scenarioDoc = await transaction.get(mainScenarioRef);
          const baseData = scenarioDoc.exists() ? scenarioDoc.data() : getDefaultGameState();
          const cleanedPublicLog = (baseData.publicLog || []).map((log) => { if (log.timestamp && typeof log.timestamp.toDate === 'function') { return { ...log }; } return { ...log, timestamp: new Date() }; });
          
          // 공개 로그에 새로운 모험가가 나타났음을 알림 (장소 정보 추가)
          const newPublicLogEntry = { 
            actor: { id: userId, displayName: getDisplayName(userId) }, 
            log: `새로운 모험가, '${getDisplayName(userId)}'님이 '${currentWorldview.startingLocation}'에 모습을 드러냈습니다.`, 
            timestamp: new Date(), 
          };
          const updatedPublicLog = [...cleanedPublicLog, newPublicLogEntry];
          const payload = { ...baseData, publicLog: updatedPublicLog, lastUpdate: serverTimestamp() };
          transaction.set(mainScenarioRef, payload);
        });

        // LLM이 생성한 동적 시작 선택지를 표시
        const startingChoices = currentWorldview.startingChoices;
        setDisplayedChoices(startingChoices);
        
        const updatedDoc = await getDoc(mainScenarioRef);
        if (updatedDoc.exists()) {
          setChoicesTimestamp(updatedDoc.data().lastUpdate);
        }
      }
    } catch (e) {
      console.error('등장 이벤트 추가 실패: ', e);
      setLlmError('게임 세계에 합류하는 중 오류가 발생했습니다. 문제가 지속되면 \'전체 데이터 초기화\'를 시도해 주세요.');
    } finally {
      setIsTextLoading(false);
    }
  };

  const handleDeclarativeAction = async (actionText) => {
    setIsTextLoading(true);
    setLlmRetryPrompt({ playerChoice: actionText, isDeclarative: true });
    const gameStatusRef = getGameStatusRef(db, appId);
    const scope = `declarative:${privatePlayerState.currentLocation}`;
    try {
      const currentLocks = (await getDoc(gameStatusRef)).data()?.actionLocks || {};
      if (currentLocks[scope] && currentLocks[scope] !== userId) {
        throw new Error(`현재 다른 플레이어(${getDisplayName(currentLocks[scope])})의 중대한 행동으로 인해 추가 행동을 할 수 없습니다.`);
      }
      await setDoc(gameStatusRef, { actionLocks: { ...currentLocks, [scope]: userId } }, { merge: true });
      const systemPromptToUse = buildSystemPrompt(worldview);
      const userPromptText = await buildLlmPrompt(actionText);
      const llmResponse = await callGeminiTextLLM(userPromptText, systemPromptToUse);
      if (llmResponse) {
        await updateNarratives(llmResponse, actionText, true);
        setLlmError(null);
        setLlmRetryPrompt(null);
      } else if (!llmError) {
        setLlmError("LLM으로부터 유효한 응답을 받지 못했습니다.");
      }
    } catch (error) {
      console.error("선언적 행동 처리 중 오류:", error.message);
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

  const performPlayerAction = async (choice) => {
    setIsTextLoading(true);
    setLlmRetryPrompt({ playerChoice: choice });
    const mainScenarioRef = getMainScenarioRef(db, appId);
    const gameStatusRef = getGameStatusRef(db, appId);
    const scope = getActionScope(choice);
    try {
      const freshScenarioDoc = await getDoc(mainScenarioRef);
      const serverTimestampValue = freshScenarioDoc.exists() ? freshScenarioDoc.data().lastUpdate : null;
      if (choicesTimestamp && serverTimestampValue && choicesTimestamp.toMillis() < serverTimestampValue.toMillis()) {
        const oldLogCount = gameState.publicLog?.length || 0;
        const newPublicLog = freshScenarioDoc.data().publicLog || [];
        const interveningEvents = newPublicLog.slice(oldLogCount).map(log => `[${log.actor.displayName}] ${log.log}`).join(', ');
        const conflictResolutionUserPrompt = `[상황]\n- 나의 원래 행동: "${choice}"\n- 내가 행동하기 직전에 벌어진 실제 사건: "${interveningEvents || '알 수 없는 변화'}"\n\n[지시]\n위 상황을 바탕으로, 나의 행동이 실패하고 실제 사건을 목격하는 장면을 1인칭 또는 2인칭 시점에서 극적으로 묘사해주십시오. 예시: 내가 '경비병에게 말을 걸려고' 했으나, 실제로는 '다른 플레이어가 경비병을 암살했다'면, "당신이 경비병에게 다가가려던 찰나, 어둠 속에서 날아온 화살이 경비병의 목에 박히는 것을 목격합니다." 와 같이 서술합니다. 반드시 'personalStory'와 현재 상황에 맞는 새로운 'choices'를 포함한 JSON 형식으로만 응답해주십시오.`;
        const systemPromptToUse = buildSystemPrompt(worldview);
        const llmResponse = await callGeminiTextLLM(conflictResolutionUserPrompt, systemPromptToUse);
        if (llmResponse) {
          await addDoc(getPersonalStoryLogRef(db, appId, userId), { action: choice, story: llmResponse.personalStory, timestamp: serverTimestamp() });
          await updatePrivateState(llmResponse);
          setDisplayedChoices(llmResponse.choices || []);
          setChoicesTimestamp(serverTimestampValue);
        } else {
          const conflictStory = `당신이 '${choice}'(을)를 하려던 찰나, 세상은 이미 당신의 예상과 달라져 있었습니다. 주변을 다시 둘러보니 상황이 바뀌어 있습니다.`;
          await addDoc(getPersonalStoryLogRef(db, appId, userId), { action: choice, story: conflictStory, timestamp: serverTimestamp() });
          setDisplayedChoices(["주변을 다시 살핀다."]);
          setPrivatePlayerState(prev => ({ ...prev, choices: [] }));
          setChoicesTimestamp(serverTimestampValue);
        }
        setIsTextLoading(false);
        return;
      }
      const currentLocks = (await getDoc(gameStatusRef)).data()?.actionLocks || {};
      if (currentLocks[scope] && currentLocks[scope] !== userId) {
        throw new Error(`현재 '${scope.split(':')[1]}'(은)는 다른 플레이어(${getDisplayName(currentLocks[scope])})가 사용 중입니다.`);
      }
      await setDoc(gameStatusRef, { actionLocks: { ...currentLocks, [scope]: userId } }, { merge: true });
      const systemPromptToUse = buildSystemPrompt(worldview);
      const userPromptText = await buildLlmPrompt(choice);
      const llmResponse = await callGeminiTextLLM(userPromptText, systemPromptToUse);
      if (llmResponse) {
        await updateNarratives(llmResponse, choice, false);
        setLlmError(null);
        setLlmRetryPrompt(null);
      } else if (!llmError) {
        setLlmError('LLM으로부터 유효한 응답을 받지 못했습니다.');
      }
    } catch (error) {
      console.error('행동 처리 중 오류:', error.message);
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

  const handleChoiceClick = async (choice) => { if (isTextLoading) return; if (!privatePlayerState.characterCreated) { await createCharacter(choice); } else { await performPlayerAction(choice); } };
  const toggleAccordion = (key) => { setAccordion((prev) => ({ ...prev, [key]: !prev[key] })); };

  const LlmErrorModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4 text-center">
        <h3 className="text-xl font-bold text-red-400">오류가 발생했습니다</h3>
        <p className="text-gray-200">{llmError}</p>
        <div className="flex justify-center gap-4">
          {llmRetryPrompt && (
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md" onClick={async () => { setLlmError(null); if (llmRetryPrompt.playerChoice) { llmRetryPrompt.isDeclarative ? await handleDeclarativeAction(llmRetryPrompt.playerChoice) : await handleChoiceClick(llmRetryPrompt.playerChoice); } }} > 재시도 </button>
          )}
          <button className="px-4 py-2 bg-gray-600 hover:bg-gray-700 font-bold rounded-md" onClick={() => { setLlmError(null); setLlmRetryPrompt(null); }} > 닫기 </button>
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

  if (isLoading || (privatePlayerState.characterCreated && !worldview)) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-300"></div>
        <span className="ml-4 text-xl">{isLoading ? '데이터를 불러오는 중...' : '세계를 구축하는 중...'}</span>
      </div>
    );
  }

  const renderGameLog = () => (
    <div className="mb-2">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('gameLog')}>
        <h2 className="text-lg font-bold text-gray-100">나의 여정록</h2>
        <div className="text-xl">{accordion.gameLog ? '▼' : '▲'}</div>
      </div>
      {accordion.gameLog && (
        <>
          <div className="flex justify-end mb-2 gap-2">
            <button className="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded-md" title="향후 구현될 기능입니다." onClick={summarizeAndArchiveEvents}>시대 요약</button>
            <button className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md" onClick={() => setShowResetModal(true)}>전체 데이터 초기화</button>
          </div>
          <div className="flex-grow bg-gray-700 p-4 rounded-md overflow-y-auto h-96 custom-scrollbar text-sm md:text-base leading-relaxed" style={{ maxHeight: '24rem' }}>
            {(personalStoryLog || []).length === 0 && !privatePlayerState.characterCreated && (
              <div className="mb-4 p-2 rounded bg-gray-900/50 text-center">
                <p className="text-yellow-300 font-semibold italic text-lg">모험의 서막</p>
                <p className="whitespace-pre-wrap mt-1">당신은 어떤 운명을 선택하시겠습니까?</p>
              </div>
            )}
            {(personalStoryLog || []).map((event, index) => (
              <div key={event.id || index} className="mb-4 p-2 rounded bg-gray-900/50">
                {event?.action && (
                  <p className="text-yellow-300 font-semibold italic text-sm"> 나의 선택: {event.action} </p>
                )}
                <p className="whitespace-pre-wrap mt-1" dangerouslySetInnerHTML={{ __html: (event?.story ?? '').replace(/\n/g, '<br />') }}></p>
              </div>
            ))}
            {isTextLoading && (
              <div className="flex justify-center items-center mt-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
                <span className="ml-3 text-gray-400">이야기를 생성 중...</span>
              </div>
            )}
            {Object.entries(actionLocks || {}).map(([scope, lockedBy]) => {
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
        [...(displayedChoices || []), ...(privatePlayerState.choices || [])].map((choice, index) => {
          if (!choice) return null;
          const scope = getActionScope(choice);
          const isLockedByOther = actionLocks[scope] && actionLocks[scope] !== userId;
          const allPrivateChoices = privatePlayerState.choices || [];
          const isPersonalChoice = allPrivateChoices.includes(choice);
          let buttonStyle = 'bg-blue-600 hover:bg-blue-700';
          let prefix = '';
          if (isPersonalChoice) {
            buttonStyle = 'bg-green-600 hover:bg-green-700';
            prefix = '[개인] ';
          }
          if (isLockedByOther) {
            buttonStyle = 'bg-gray-500 cursor-not-allowed';
            prefix = `[${getDisplayName(actionLocks[scope])} 사용 중] `;
          }
          return (
            <button key={`${choice}-${index}`} className={`px-6 py-3 font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 ${buttonStyle} text-white`} onClick={() => handleChoiceClick(choice)} disabled={isTextLoading || isLockedByOther} >
              {prefix}{choice}
            </button>
          )
        })
      ) : (
        worldview?.professions?.map((profession, index) => (
          <button key={index} onClick={() => handleChoiceClick(profession.name)} disabled={isTextLoading} className="px-6 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 disabled:cursor-wait text-left" >
            <p className="text-lg text-blue-300">{profession.name}</p>
            <p className="text-sm font-normal text-gray-300 mt-1">{profession.motivation}</p>
          </button>
        ))
      )}
    </div>
  );

  const renderSidebar = () => (
    <div className="w-full lg:w-1/3 flex flex-col space-y-6 bg-gray-700 p-4 rounded-lg shadow-inner">
      {worldview && (
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <h4 className="text-md font-semibold text-gray-200">현재 세계관</h4>
          </div>
          <div className="bg-gray-900/50 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-2">
            <p className="font-bold text-yellow-200">{worldview.title} <span className="text-gray-400 font-normal">({worldview.genre})</span></p>
            <p className="text-xs italic text-gray-400">{worldview.atmosphere}</p>
          </div>
        </div>
      )}
      {activeTurningPoint && (
        <div className="mb-2">
          <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('turningPoint')}>
            <h4 className="text-md font-semibold text-yellow-300">주요 분기점</h4>
            <div className="text-xl">{accordion.turningPoint ? '▼' : '▲'}</div>
          </div>
          {accordion.turningPoint && (
            <div className="bg-gray-900/50 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-2">
              <p className="font-bold text-yellow-200">{activeTurningPoint.title}</p>
              <p className="text-xs italic text-gray-400">{activeTurningPoint.description}</p>
              {(activeTurningPoint.objectives || []).map(obj => (
                <div key={obj.id}>
                  <p className="text-xs font-semibold">{obj.description} ({obj.progress || 0} / {obj.goal})</p>
                  <div className="w-full bg-gray-600 rounded-full h-2.5">
                    <div className="bg-yellow-500 h-2.5 rounded-full" style={{ width: `${((obj.progress || 0) / obj.goal) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mb-2">
        <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('playerInfo')}>
          <h4 className="text-md font-semibold text-gray-200">내 정보</h4>
          <div className="text-xl">{accordion.playerInfo ? '▼' : '▲'}</div>
        </div>
        {accordion.playerInfo && (
          <div className="bg-gray-600 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-2 h-96 overflow-y-auto custom-scrollbar">
            <p><span className="font-semibold text-blue-300">이름:</span> {getDisplayName(userId)}</p>
            <p><span className="font-semibold text-blue-300">직업:</span> {privatePlayerState.profession || '미정'}</p>
            <p><span className="font-semibold text-blue-300">위치:</span> {privatePlayerState.currentLocation || '알 수 없는 곳'}</p>
            <p><span className="font-semibold text-blue-300">능력치:</span> 힘({privatePlayerState.stats?.strength ?? 10}) 지능({privatePlayerState.stats?.intelligence ?? 10}) 민첩({privatePlayerState.stats?.agility ?? 10}) 카리스마({privatePlayerState.stats?.charisma ?? 10})</p>
            <p><span className="font-semibold text-blue-300">인벤토리:</span> {(privatePlayerState.inventory || []).join(', ') || '비어있음'}</p>
            <div>
              <span className="font-semibold text-yellow-300">활성 기억:</span>
              {(privatePlayerState.activeMemories || []).length > 0 ? (
                <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                  {(privatePlayerState.activeMemories || []).map((memory, i) => <li key={`mem-${i}`} className="text-xs flex justify-between items-center"> <span>{memory}</span> <button onClick={() => toggleActiveMemory(memory, false)} className="text-red-400 hover:text-red-300 ml-2 text-lg">×</button> </li>)}
                </ul>
              ) : <p className="text-xs text-gray-400 ml-2">기억할 단서를 활성화하세요.</p>}
            </div>
            <div>
              <span className="font-semibold text-purple-300">알려진 단서:</span>
              {(privatePlayerState.knownClues || []).length > 0 ? (
                <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                  {(privatePlayerState.knownClues || []).map((clue, i) => {
                    const isActivated = (privatePlayerState.activeMemories || []).includes(clue);
                    return (
                      <li key={`clue-${i}`} className="text-xs flex justify-between items-center">
                        <span>{clue}</span>
                        {!isActivated && (
                          <button onClick={() => toggleActiveMemory(clue, true)} className="text-green-400 hover:text-green-300 ml-2 text-lg">↑</button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-xs text-gray-400 ml-2">아직 발견한 단서가 없습니다.</p>}
            </div>
            <div>
              <span className="font-semibold text-indigo-300">NPC 관계:</span>
              <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                {Object.entries(privatePlayerState.npcRelations || {}).length > 0 ? Object.entries(privatePlayerState.npcRelations).map(([name, value]) => <li key={name} className="text-xs">{`${name}: ${value}`}</li>) : <li>알려진 관계 없음</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
      <div className="mb-2">
        <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('chronicle')}>
          <h4 className="text-md font-semibold text-gray-200">세계의 연대기</h4>
          <div className="text-xl">{accordion.chronicle ? '▼' : '▲'}</div>
        </div>
        {accordion.chronicle && (
          <div className="bg-gray-600 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1 h-32 overflow-y-auto custom-scrollbar">
            {(knownMajorEvents || []).length > 0 ? (
              <ul className="list-disc list-inside">
                {(knownMajorEvents || []).map((event) => <li key={event?.id}>{event?.summary ?? '기록이 손상되었습니다.'}</li>)}
              </ul>
            ) : (
              <p>아직 발견한 주요 사건이 없습니다. 세상을 탐험해 보세요.</p>
            )}
          </div>
        )}
      </div>
      <div className="mb-2">
        <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('users')}>
          <h4 className="text-md font-semibold text-gray-200">현재 플레이어들</h4>
          <div className="text-xl">{accordion.users ? '▼' : '▲'}</div>
        </div>
        {accordion.users && (
          <div className="bg-gray-600 p-3 rounded-md h-32 overflow-y-auto custom-scrollbar">
            {(activeUsers || []).length > 0 ? (
              <ul className="text-sm text-gray-300 space-y-1">
                {(activeUsers || []).map(user => (
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
          <h4 className="text-md font-semibold text-gray-200">세상의 소식</h4>
          <div className="text-xl">{accordion.chat ? '▼' : '▲'}</div>
        </div>
        {accordion.chat && (
          <div className="bg-gray-600 p-3 rounded-md flex flex-col h-96">
            <div className="flex-grow overflow-y-auto custom-scrollbar mb-3 text-sm space-y-2">
              {combinedFeed.map((item, index) => {
                if (item.type === 'chat') {
                  const isMyMessage = item.userId === userId;
                  const time = item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div key={item.id || index} className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                      <div className={`text-xs text-gray-400 px-1 ${isMyMessage ? 'text-right' : 'text-left'}`}>{getDisplayName(item.userId)}</div>
                      <div className="flex items-end gap-2">
                        {isMyMessage && <span className="text-xs text-gray-500">{time}</span>}
                        <div className={`max-w-xs rounded-lg px-3 py-2 ${isMyMessage ? 'bg-blue-800' : 'bg-gray-700'} ${item.isAction ? 'italic font-semibold border border-yellow-500' : ''}`}>
                          <p className="whitespace-pre-wrap break-words">{item.message}</p>
                        </div>
                        {!isMyMessage && <span className="text-xs text-gray-500">{time}</span>}
                      </div>
                    </div>
                  );
                }
                if (item.type === 'system') {
                  return (
                    <div key={item.id || index} className="text-center my-2">
                      <p className={`text-xs px-2 py-1 rounded-md inline-block ${item.isDeclaration ? 'text-yellow-300 bg-red-900/50 font-bold' : 'text-yellow-400 italic bg-black/20'}`}>
                        {item.log.includes("❗") ? item.log : `[${item.actor?.displayName ?? '누군가'}] ${item.log}`}
                      </p>
                    </div>
                  );
                }
                return null;
              })}
              <div ref={chatEndRef} />
            </div>
            <div className="flex">
              <input type="text" placeholder="!를 붙여 행동을 선언하세요" className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600 text-white placeholder-gray-500" value={currentChatMessage} onChange={(e) => setCurrentChatMessage(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()} disabled={!isAuthReady} />
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 font-bold rounded-r-md disabled:opacity-50" onClick={sendChatMessage} disabled={!isAuthReady || !currentChatMessage.trim()}>전송</button>
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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
        body { font-family: 'Noto Sans KR', sans-serif; }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #4a5568; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #6b7280; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </div>
  );
}

export default App;
