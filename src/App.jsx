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
  where // [수정] where 임포트 추가
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
  // [수정] 게임 상태 통합
  const [gameState, setGameState] = useState(getDefaultGameState());

  // LLM text response loading state
  const [isTextLoading, setIsTextLoading] = useState(false);
  // Feedback modal display status
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  // Feedback text
  const [feedbackText, setFeedbackText] = useState('');
  // Shared game log (multiplayer)
  const [sharedGameLog, setSharedGameLog] = useState([]);
  // List of active users (multiplayer)
  const [activeUsers, setActiveUsers] = useState([]);
  // List of chat messages (public chat)
  const [chatMessages, setChatMessages] = useState([]);
  // Current chat input value (public chat)
  const [currentChatMessage, setCurrentChatMessage] = useState('');

  // Private chat related states
  const [showPlayerChatModal, setShowPlayerChatModal] = useState(false);
  const [selectedPlayerForChat, setSelectedPlayerForChat] = useState(null); // { id, displayName, profession }
  const [privateChatMessages, setPrivateChatMessages] = useState([]);
  const [currentPrivateChatMessage, setCurrentPrivateChatMessage] = useState('');
  const [isPrivateChatModalManuallyClosed, setIsPrivateChatModalManuallyClosed] = useState(false);

  // [추가] Companion scenario progress status
  const [isCompanionActionInProgress, setIsCompanionActionInProgress] = useState(false);
  const [actingPlayer, setActingPlayer] = useState(null); // [추가] Information of the player currently acting

  // Firebase and authentication status
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Refs to keep scroll at the bottom
  const logEndRef = useRef(null);
  const sharedLogEndRef = useRef(null);
  const chatEndRef = useRef(null); // Ref for public chat log
  const privateChatEndRef = useRef(null); // Ref for private chat log

  // [1] 닉네임 상태 및 모달 추가
  const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');
  const [showNicknameModal, setShowNicknameModal] = useState(!localStorage.getItem('nickname'));
  const [nicknameInput, setNicknameInput] = useState('');

  // [2] 아코디언 상태 추가
  const [accordion, setAccordion] = useState({
    gameLog: true,
    sharedLog: true,
    chat: true,
    users: true,
  });

  // [3] 데이터 초기화 모달 및 상태
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // [mainScenario 상태 추가] - gameState로 통합되어 직접 사용은 줄어듦
  const [mainScenario, setMainScenario] = useState({ storyLog: [], choices: [] });

  // LLM Error Handling
  const [llmError, setLlmError] = useState(null);
  const [llmRetryPrompt, setLlmRetryPrompt] = useState(null);

  // LLM 호출 실패 시 임시 선택지 제공
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

  // 임시 선택지/로그 수동 추가 UI 상태
  const [manualChoiceInput, setManualChoiceInput] = useState('');
  const [manualLogInput, setManualLogInput] = useState('');

  // 임시 선택지 추가 함수
  const addManualChoice = () => {
    if (!manualChoiceInput.trim()) return;
    setGameState(prev => ({
      ...prev,
      choices: [...(prev.choices || []), manualChoiceInput.trim()]
    }));
    setManualChoiceInput('');
  };

  // 임시 로그 추가 함수
  const addManualLog = () => {
    if (!manualLogInput.trim()) return;
    setGameState(prev => ({
      ...prev,
      log: [...(prev.log || []), manualLogInput.trim()]
    }));
    setManualLogInput('');
  };

  // 닉네임 입력 및 저장 함수
  const handleNicknameSubmit = () => {
    if (nicknameInput.trim()) {
      setNickname(nicknameInput.trim());
      localStorage.setItem('nickname', nicknameInput.trim());
      setShowNicknameModal(false);
    }
  };

  // displayName 대체 함수
  const getDisplayName = (uid) => {
    if (uid === userId) return nickname || `플레이어 ${userId?.substring(0, 4)}`;
    const user = activeUsers.find(u => u.id === uid);
    return user?.displayName || user?.nickname || `플레이어 ${uid?.substring(0, 4)}`;
  };

  // Firestore 데이터 전체 초기화 함수
  const resetAllGameData = async () => {
    if (!db || !isAuthReady) return;
    setIsResetting(true);
    try {
      // 삭제할 경로들
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
      
      // [수정] Firestore mainScenario 문서도 초기화
      const mainScenarioRef = getMainScenarioRef(db, appId);
      await setDoc(mainScenarioRef, {
          ...getDefaultGameState(),
          lastUpdate: serverTimestamp()
      });

      // [수정] 로컬 상태도 gameState를 통해 초기화
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

  // Firebase initialization and authentication handling
  useEffect(() => {
    try {
      if (firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey) {
        console.error("Firebase initialization error: firebaseConfig.apiKey must be replaced with your actual Firebase API key.");
        setGameState(prev => ({...prev, log: [...prev.log, "오류: Firebase API 키가 올바르게 설정되지 않았습니다. 코드를 확인해주세요."]}));
        return;
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
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Firebase authentication failed:", error);
            setGameState(prev => ({...prev, log: [...prev.log, "오류: Firebase 인증에 실패했습니다."]}));
          }
        }
      });

      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Firebase initialization error:", error);
      setGameState(prev => ({...prev, log: [...prev.log, "오류: 게임을 초기화할 수 없습니다."]}));
    }
  }, []);

  // Set multiplayer data listeners after Firebase authentication is complete
  useEffect(() => {
    if (!db || !isAuthReady || !userId || !auth) return;

    const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
    const unsubscribeGameStatus = onSnapshot(gameStatusDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setIsCompanionActionInProgress(data.isActionInProgress || false);
            setActingPlayer(data.actingPlayer || null);
        }
    }, (error) => {
        console.error("Game status snapshot error:", error);
    });

    const sharedLogCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'sharedGameLog');
    const qSharedLog = query(sharedLogCollectionRef);
    const unsubscribeSharedLog = onSnapshot(qSharedLog, (snapshot) => {
      const logs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
      setSharedGameLog(logs);
    }, (error) => {
      console.error("Shared game log snapshot error:", error);
    });

    const activeUsersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers');
    const qActiveUsers = query(activeUsersCollectionRef);
    const unsubscribeActiveUsers = onSnapshot(qActiveUsers, (snapshot) => {
      const cutoffTime = Date.now() - 60 * 1000;
      const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.lastActive && user.lastActive.toMillis() > cutoffTime);
      setActiveUsers(users);
    }, (error) => {
      console.error("Active users snapshot error:", error);
    });

    const chatCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
    const qChatMessages = query(chatCollectionRef);
    const unsubscribeChatMessages = onSnapshot(qChatMessages, (snapshot) => {
      const messages = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
      setChatMessages(messages);
    }, (error) => {
      console.error("Chat messages snapshot error:", error);
    });

    const updateUserPresence = async () => {
      if (userId) {
        try {
          const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
          // [수정] gameState.player에서 데이터 참조
          await setDoc(userDocRef, {
            lastActive: serverTimestamp(),
            displayName: nickname || `플레이어 ${userId.substring(0, 4)}`,
            nickname: nickname || `플레이어 ${userId.substring(0, 4)}`,
            profession: gameState.player.profession,
            isCompanion: gameState.player.companions.length > 0,
          }, { merge: true });
        } catch (error) {
          console.error("Failed to update user presence:", error);
        }
      }
    };

    updateUserPresence();
    const presenceInterval = setInterval(updateUserPresence, 30000);

    return () => {
      unsubscribeSharedLog();
      unsubscribeActiveUsers();
      unsubscribeChatMessages();
      unsubscribeGameStatus();
      clearInterval(presenceInterval);
    };
  }, [db, isAuthReady, userId, auth, nickname, gameState.player.profession, gameState.player.companions]); // [수정] 의존성 배열 변경

  // Cleanup inactive users function
  const cleanupInactiveUsers = async () => {
    if (!db || !isAuthReady || !userId) return;

    const inactiveThreshold = 1 * 60 * 1000;
    const cutoffTime = Date.now() - inactiveThreshold;

    try {
      const activeUsersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers');
      const querySnapshot = await getDocs(activeUsersCollectionRef);

      querySnapshot.forEach(async (docSnapshot) => {
        const userData = docSnapshot.data();
        if (userData.lastActive && userData.lastActive.toMillis() < cutoffTime) {
          console.log(`DEBUG: Deleting inactive user: ${docSnapshot.id}`);
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', docSnapshot.id));
        }
      });
    } catch (error) {
      console.error("Error cleaning up inactive users:", error);
    }
  };

  useEffect(() => {
    if (!db || !isAuthReady || !userId) return;
    const cleanupInterval = setInterval(cleanupInactiveUsers, 1 * 60 * 1000);
    return () => clearInterval(cleanupInterval);
  }, [db, isAuthReady, userId]);

  // [수정] 아래 useEffect는 Firestore 구독 로직과 중복되므로 제거합니다.
  /*
  useEffect(() => {
    if (gamePhase === 'characterSelection') {
      setGameLog([
        "환영합니다! ...",
        "어떤 직업을 선택하시겠습니까?"
      ]);
      setCurrentChoices(Object.keys(professions).map(key => `${key}. ${professions[key].name}`));
    }
  }, [gamePhase]);
  */
  
  // Scroll to the bottom whenever the game log is updated
  useEffect(() => {
    if (accordion.gameLog && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [gameState.log, accordion.gameLog]); // [수정] gameState.log 의존

  // Scroll to the bottom whenever the shared log is updated
  useEffect(() => {
    if (accordion.sharedLog && sharedLogEndRef.current) {
      sharedLogEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [sharedGameLog, accordion.sharedLog]);

  // Scroll to the bottom whenever chat messages are updated
  useEffect(() => {
    if (accordion.chat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, accordion.chat]);

  // Scroll private chat messages
  useEffect(() => {
    if (showPlayerChatModal && privateChatEndRef.current) {
      privateChatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [privateChatMessages, showPlayerChatModal]);

  // Function to generate private chat room ID
  const getPrivateChatRoomId = (user1Id, user2Id) => {
    const sortedIds = [user1Id, user2Id].sort();
    return `${sortedIds[0]}_${sortedIds[1]}`;
  };

  // Private chat listener
  useEffect(() => {
    if (!db || !isAuthReady || !userId || !selectedPlayerForChat) {
      setPrivateChatMessages([]);
      return;
    }

    const chatRoomId = getPrivateChatRoomId(userId, selectedPlayerForChat.id);
    const privateChatCollectionRef = collection(db, 'artifacts', appId, 'privateChats', chatRoomId, 'messages');
    const qPrivateChat = query(privateChatCollectionRef);

    const unsubscribePrivateChat = onSnapshot(qPrivateChat, (snapshot) => {
      const messages = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
      setPrivateChatMessages(messages);
    }, (error) => {
      console.error("Private chat messages snapshot error:", error);
    });

    return () => unsubscribePrivateChat();
  }, [db, isAuthReady, userId, selectedPlayerForChat, appId]);

  // Incoming private message notification listener
  useEffect(() => {
    if (!db || !isAuthReady || !userId) {
      return;
    }

    const incomingMessagesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'incomingMessages');
    const qIncomingMessages = query(incomingMessagesCollectionRef);

    const unsubscribeIncomingMessages = onSnapshot(qIncomingMessages, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const notification = change.doc.data();
          const senderId = change.doc.id;
          if (!showPlayerChatModal) {
            const senderInfo = activeUsers.find(user => user.id === senderId);
            if (senderInfo) {
              openPlayerChatModal(senderInfo);
            } else {
              openPlayerChatModal({
                id: senderId,
                displayName: notification.senderDisplayName || `알 수 없는 플레이어 ${senderId.substring(0, 4)}`,
                profession: '알 수 없음'
              });
            }
            deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'incomingMessages', senderId)).catch(error => {
              console.error("Error deleting incoming message notification:", error);
            });
          }
        }
      });
    }, (error) => {
      console.error("Incoming private messages notification error:", error);
    });

    return () => unsubscribeIncomingMessages();
  }, [db, isAuthReady, userId, showPlayerChatModal, activeUsers, appId]);
  
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
    console.log("DEBUG: Starting callGeminiTextLLM");
    const mainApiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
    const backupApiKey = "AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84";

    const getApiUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

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
      이전 게임 로그 (마지막 5개 항목): ${JSON.stringify(Array.isArray(promptData.history) ? promptData.history.slice(-5) : [])}
      플레이어의 마지막 선택: ${promptData.playerChoice}
      **현재 접속 중인 다른 플레이어들:**
      ${JSON.stringify(promptData.activeUsers)}
      **현재 플레이어와 관련된 최근 개인 대화 내용 (LLM이 시나리오에 우선 반영):**
      ${promptData.privateChatHistory && promptData.privateChatHistory.length > 0 ? JSON.stringify(promptData.privateChatHistory.slice(-5)) : '없음'}
      위 정보를 바탕으로 다음 스토리 부분을 한국어로 생성하고, 시스템 프롬프트의 JSON 스키마에 따라 선택지를 제공하십시오.
    `;

    const chatHistory = [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "user", parts: [{ text: userPrompt }] }
    ];

    const payload = { contents: chatHistory };
    console.log("DEBUG: Payload:", JSON.stringify(payload, null, 2));

    const tryGeminiCall = async (apiKey) => {
      const apiUrl = getApiUrl(apiKey);
      return await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    };

    try {
      let response = await tryGeminiCall(mainApiKey);
      if (!response.ok) {
        const errorBody = await response.text();
        if (response.status === 429 || /quota|limit|exceeded|over|rate/i.test(errorBody)) {
          console.warn("DEBUG: Main API key quota exceeded, retrying with backup key.");
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
      if (result.candidates?.[0]?.content?.parts?.[0]) {
        let llmOutputText = result.candidates[0].content.parts[0].text;
        const jsonMatch = llmOutputText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (parsingError) {
                console.error("JSON Parsing Error:", parsingError, "Malformed JSON:", jsonMatch[0]);
                throw new Error(`LLM response was not valid JSON. Details: ${parsingError.message}`);
            }
        } else {
            throw new Error("Valid JSON object not found in LLM response.");
        }
      } else {
        throw new Error("Invalid LLM response structure.");
      }
    } catch (error) {
      console.error("LLM API call error:", error);
      setLlmError(error.message || 'LLM 호출 실패');
      return getFallbackLLMResponse(promptData);
    } finally {
      setIsTextLoading(false);
      console.log("DEBUG: Finished callGeminiTextLLM");
    }
  };

  const saveGame = async () => {
    if (!db || !userId || !isAuthReady) {
      setLlmError("오류: 게임을 저장할 수 없습니다. 인증 상태를 확인해주세요.");
      return;
    }

    setIsTextLoading(true);
    try {
      const gameDocRef = doc(db, 'artifacts', appId, 'users', userId, 'textAdventureGame', 'gameState');
      // [수정] gameState 전체를 저장
      await setDoc(gameDocRef, {
        ...gameState,
        timestamp: new Date().toISOString()
      });
      setGameState(prev => ({...prev, log: [...prev.log, "\n게임이 성공적으로 저장되었습니다."]}));
    } catch (error) {
      console.error("Game save error:", error);
      setGameState(prev => ({...prev, log: [...prev.log, `\n게임 저장 중 오류가 발생했습니다: ${error.message}`]}));
    } finally {
      setIsTextLoading(false);
    }
  };

  const loadGame = async () => {
    if (!db || !userId || !isAuthReady) {
      setLlmError("오류: 게임을 불러올 수 없습니다. 인증 상태를 확인해주세요.");
      return;
    }
    setIsTextLoading(true);
    try {
      const gameDocRef = doc(db, 'artifacts', appId, 'users', userId, 'textAdventureGame', 'gameState');
      const docSnap = await getDoc(gameDocRef);
      if (docSnap.exists()) {
        const savedData = docSnap.data();
        // [수정] 불러온 데이터로 gameState를 설정
        setGameState(savedData);
      } else {
        setGameState(getDefaultGameState());
        setLlmError("저장된 게임이 없어 새로 시작합니다.");
      }
    } catch (error) {
      setLlmError("게임 불러오기 중 오류: " + error.message);
      setGameState(getDefaultGameState());
    } finally {
      setIsTextLoading(false);
    }
  };

  const sendFeedback = async () => {
    if (!db || !userId || !isAuthReady || !feedbackText.trim()) {
      alert("피드백을 보낼 수 없습니다. 내용을 입력하거나 인증 상태를 확인해주세요.");
      return;
    }

    setIsTextLoading(true);
    try {
      const feedbackCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'feedback');
      await addDoc(feedbackCollectionRef, {
        feedback: feedbackText,
        // [수정] gameState에서 스냅샷 생성
        gameLogSnapshot: gameState.log.slice(-10),
        playerCharacterSnapshot: gameState.player,
        timestamp: serverTimestamp(),
      });
      alert("피드백이 성공적으로 전송되었습니다. 감사합니다!");
      setFeedbackText('');
      setShowFeedbackModal(false);
    } catch (error) {
      console.error("Feedback submission error:", error);
      alert(`피드백 전송 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsTextLoading(false);
    }
  };

  const sendChatMessage = async () => {
    if (!db || !userId || !isAuthReady || !currentChatMessage.trim()) return;

    try {
      const chatCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
      await addDoc(chatCollectionRef, {
        userId: userId,
        displayName: nickname || `플레이어 ${userId.substring(0, 4)}`,
        message: currentChatMessage,
        timestamp: serverTimestamp(),
      });
      setCurrentChatMessage('');
    } catch (error) {
      console.error("Error sending chat message:", error);
    }
  };

  const sendPrivateChatMessage = async () => {
    if (!db || !userId || !isAuthReady || !selectedPlayerForChat || !currentPrivateChatMessage.trim()) return;

    try {
      const chatRoomId = getPrivateChatRoomId(userId, selectedPlayerForChat.id);
      const privateChatCollectionRef = collection(db, 'artifacts', appId, 'privateChats', chatRoomId, 'messages');

      await addDoc(privateChatCollectionRef, {
        senderId: userId,
        receiverId: selectedPlayerForChat.id,
        displayName: nickname || `플레이어 ${userId.substring(0, 4)}`,
        message: currentPrivateChatMessage,
        timestamp: serverTimestamp(),
      });

      const receiverNotificationDocRef = doc(db, 'artifacts', appId, 'users', selectedPlayerForChat.id, 'incomingMessages', userId);
      await setDoc(receiverNotificationDocRef, {
        lastMessageTimestamp: serverTimestamp(),
        senderDisplayName: nickname || `플레이어 ${userId.substring(0, 4)}`,
        senderId: userId
      }, { merge: true });

      setCurrentPrivateChatMessage('');
    } catch (error) {
      console.error("Error sending private message:", error);
    }
  };

  const openPlayerChatModal = (player) => {
    setSelectedPlayerForChat(player);
    setShowPlayerChatModal(true);
    setIsPrivateChatModalManuallyClosed(false);

    if (db && userId && player.id) {
      deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'incomingMessages', player.id)).catch(error => {
        console.error("Error deleting incoming message notification on modal open:", error);
      });
    }
  };

  const closePlayerChatModal = async () => {
    if (!db || !userId || !selectedPlayerForChat) return;

    try {
      const chatRoomId = getPrivateChatRoomId(userId, selectedPlayerForChat.id);
      const chatRoomDocRef = doc(db, 'artifacts', appId, 'privateChats', chatRoomId);
      await setDoc(chatRoomDocRef, {
        status: {
          [`closedBy.${userId}`]: true,
          lastClosedBy: userId,
          lastClosedAt: serverTimestamp()
        }
      }, { merge: true });

      setSelectedPlayerForChat(null);
      setPrivateChatMessages([]);
      setCurrentPrivateChatMessage('');
      setShowPlayerChatModal(false);
      setIsPrivateChatModalManuallyClosed(true);
    } catch (error) {
      console.error("Error closing private chat modal:", error);
    }
  };

  useEffect(() => {
    if (!db || !isAuthReady || !userId || !selectedPlayerForChat) return;

    const chatRoomId = getPrivateChatRoomId(userId, selectedPlayerForChat.id);
    const chatRoomDocRef = doc(db, 'artifacts', appId, 'privateChats', chatRoomId);

    const unsubscribeChatStatus = onSnapshot(chatRoomDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const statusData = docSnap.data().status || {};
        const otherUserId = selectedPlayerForChat.id;

        if (statusData.closedBy && statusData.closedBy[otherUserId] && statusData.lastClosedBy !== userId) {
          if (showPlayerChatModal) {
            setGameState(prev => ({...prev, log: [...prev.log, `\n> ${selectedPlayerForChat.displayName}님이 대화를 종료했습니다.`]}));
            setSelectedPlayerForChat(null);
            setPrivateChatMessages([]);
            setCurrentPrivateChatMessage('');
            setShowPlayerChatModal(false);
            setIsPrivateChatModalManuallyClosed(false);
          }
        }
      }
    }, (error) => {
      console.error("Private chat status snapshot error:", error);
    });

    return () => unsubscribeChatStatus();
  }, [db, isAuthReady, userId, selectedPlayerForChat, showPlayerChatModal, appId]);


  const handleEndPrivateChatAndReflectScenario = async () => {
      if (!selectedPlayerForChat) return;

      closePlayerChatModal();
      setIsTextLoading(true);
      setGameState(prev => ({...prev, log: [...prev.log, `\n> ${selectedPlayerForChat.displayName}님과의 대화 내용을 바탕으로 시나리오를 진행합니다...\n`]}));

      const promptData = {
          phase: 'playing',
          playerChoice: `플레이어 ${selectedPlayerForChat.displayName}님과의 대화 종료.`,
          character: gameState.player, // [수정] gameState에서 참조
          history: gameState.log, // [수정] gameState에서 참조
          activeUsers: activeUsers.filter(user => user.id !== userId),
          privateChatHistory: privateChatMessages
      };

      try {
          const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
          await setDoc(gameStatusDocRef, {
              isActionInProgress: true,
              actingPlayer: { id: userId, displayName: getDisplayName(userId) }
          }, { merge: true });

          const llmResponse = await callGeminiTextLLM(promptData);
          updateGameStateFromLLM(llmResponse, true); // LLM 응답으로 상태 업데이트

          if (db && userId) {
              const sharedLogCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'sharedGameLog');
              await addDoc(sharedLogCollectionRef, {
                  userId: userId,
                  displayName: getDisplayName(userId),
                  content: `[${gameState.player.profession}]이(가) ${selectedPlayerForChat.displayName}님과 대화 후: ${llmResponse.story}`,
                  timestamp: serverTimestamp(),
              });
          }

      } catch (error) {
          console.error("Error processing private chat with LLM:", error);
          setGameState(prev => ({...prev, log: [...prev.log, `\n오류: 개인 대화 내용을 시나리오에 반영하는 중 문제가 발생했습니다: ${error.message}`]}));
      } finally {
          const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
          await setDoc(gameStatusDocRef, { isActionInProgress: false, actingPlayer: null }, { merge: true });
          setIsTextLoading(false);
      }
  };

  const isObjectEmpty = (obj) => Object.keys(obj).length === 0 && obj.constructor === Object;

  const moveToInn = async () => {
    // [수정] gameState 업데이트
    setGameState(prev => ({
        ...prev,
        player: { ...prev.player, currentLocation: '방랑자의 안식처' },
        log: [...prev.log, '\n여관(방랑자의 안식처)으로 이동했습니다.']
    }));

    if (db && userId) {
      const userDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', userId);
      await setDoc(userDocRef, {
        currentLocation: '방랑자의 안식처',
      }, { merge: true });
    }
  };

  // [수정] Firestore mainScenario 구독 로직 통합 및 개선
  useEffect(() => {
    if (!db || !appId) return;
    const ref = getMainScenarioRef(db, appId);
    const unsubscribe = onSnapshot(ref, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Firestore 데이터로 로컬 gameState를 업데이트
        setGameState(prev => ({
          ...prev, // 기존 player 정보 등은 유지
          log: data.storyLog || [],
          choices: data.choices || [],
          phase: data.gamePhase || prev.phase,
        }));
      } else {
        // 문서가 없으면 기본 게임 상태로 생성
        const def = getDefaultGameState();
        await setDoc(ref, {
          storyLog: def.log,
          choices: def.choices,
          gamePhase: def.phase,
          lastUpdate: serverTimestamp(),
        }, { merge: true });
        setGameState(def);
      }
    }, (error) => {
        console.error("Main scenario snapshot error:", error);
        setLlmError("시나리오를 불러오는 중 오류가 발생했습니다.");
    });
    return () => unsubscribe();
  }, [db, appId]);
  
  // [수정] 이 useEffect는 위 Firestore 구독 로직과 중복되므로 제거합니다.
  /*
  useEffect(() => {
    if (!db) return;
    const mainScenarioRef = doc(db, 'artifacts', appId, 'public', 'data', 'mainScenario', 'main');
    const unsubscribe = onSnapshot(mainScenarioRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setMainScenario(data);
        setGameLog(data.storyLog || []);
        setCurrentChoices(data.choices || []);
      }
    });
    return () => unsubscribe();
  }, [db]);
  */

  // LLM 호출 후 상태 업데이트 함수
  const updateGameStateFromLLM = (llmResponse, fromPrivateChat = false) => {
    setGameState(prev => {
        // 직업 선택 단계에서 LLM 응답 처리
        if (prev.phase === 'characterSelection' && llmResponse.story) {
            const professionKey = llmResponse.story.match(/(\d)\. /)?.[1]; // 선택지에서 직업 키 추출 (가정)
            const chosenProfession = professions[professionKey] || { name: '알 수 없음', motivation: '' };

            return {
                ...prev,
                phase: 'playing',
                log: [...prev.log, llmResponse.story],
                choices: llmResponse.choices || [],
                player: {
                    ...prev.player,
                    profession: chosenProfession.name,
                    initialMotivation: chosenProfession.motivation,
                    inventory: llmResponse.inventoryUpdates || prev.player.inventory,
                    stats: llmResponse.statChanges || prev.player.stats,
                    currentLocation: llmResponse.location || prev.player.currentLocation,
                }
            };
        }
        
        // 일반 플레이 또는 개인 채팅 후 시나리오 반영
        return {
            ...prev,
            log: fromPrivateChat ? [...prev.log, llmResponse.story] : [...prev.log.slice(0, -1), llmResponse.story],
            choices: llmResponse.choices || [],
            player: {
                ...prev.player,
                inventory: llmResponse.inventoryUpdates || prev.player.inventory,
                stats: llmResponse.statChanges || prev.player.stats,
                currentLocation: llmResponse.location || prev.player.currentLocation,
                reputation: llmResponse.reputationUpdates || prev.player.reputation,
                activeQuests: llmResponse.activeQuestsUpdates || prev.player.activeQuests,
                companions: llmResponse.companionsUpdates || prev.player.companions,
            },
        };
    });

    // Firestore mainScenario 업데이트
    if (db && appId) {
        const mainScenarioRef = getMainScenarioRef(db, appId);
        setDoc(mainScenarioRef, {
            storyLog: [...gameState.log, llmResponse.story],
            choices: llmResponse.choices || [],
            gamePhase: 'playing', // LLM 호출 후에는 항상 playing 상태
            lastUpdate: serverTimestamp()
        }, { merge: true }).catch(e => console.error("Error updating main scenario:", e));
    }
  };

  // LLM 호출 실패 시 재시도
  const retryLLM = async () => {
    if (!llmRetryPrompt) return;
    setLlmError(null);
    await handleLLMCall(llmRetryPrompt);
  };

  const handleLLMCall = async (promptData) => {
    setIsTextLoading(true);
    try {
      const llmResponse = await callGeminiTextLLM(promptData);
      if (llmResponse && llmResponse.story) {
        updateGameStateFromLLM(llmResponse);
        setLlmError(null);
      } else {
        throw new Error("Invalid LLM response received.");
      }
    } catch (error) {
      setLlmError(error.message || 'LLM 호출 실패');
      const fallback = getFallbackLLMResponse(promptData);
      updateGameStateFromLLM(fallback);
    } finally {
      setIsTextLoading(false);
    }
  };

  // 선택지 클릭 핸들러
  const handleChoiceClick = (choice) => {
    if (isTextLoading) return;

    // 선택지를 로그에 추가
    setGameState(prev => ({ ...prev, log: [...prev.log, `\n> ${choice}`] }));
    
    // 직업 선택 단계 처리
    if (gameState.phase === 'characterSelection') {
        const choiceKey = choice.split('.')[0];
        const selectedProfession = professions[choiceKey];

        if(selectedProfession) {
            const initialMotivation = selectedProfession.motivation;
            const newPlayerState = {
                ...gameState.player,
                profession: selectedProfession.name,
                initialMotivation: initialMotivation,
            };

            setGameState(prev => ({
                ...prev,
                phase: 'playing',
                player: newPlayerState,
                log: [...prev.log, `\n당신은 '${selectedProfession.name}'입니다. ${initialMotivation}`],
                choices: ["여관을 둘러본다.", "다른 모험가에게 말을 건다.", "여관 주인에게 정보를 묻는다."], // 초기 선택지 제공
            }));

            // Firestore mainScenario 업데이트
            const mainScenarioRef = getMainScenarioRef(db, appId);
            setDoc(mainScenarioRef, {
                gamePhase: 'playing',
                storyLog: [...gameState.log, `\n당신은 '${selectedProfession.name}'입니다. ${initialMotivation}`],
                choices: ["여관을 둘러본다.", "다른 모험가에게 말을 건다.", "여관 주인에게 정보를 묻는다."],
                lastUpdate: serverTimestamp()
            }, { merge: true });
            
            return; // LLM 호출 없이 종료
        }
    }

    // 일반 플레이 단계에서 LLM 호출
    const promptData = {
      phase: gameState.phase,
      playerChoice: choice,
      character: gameState.player,
      history: gameState.log,
      activeUsers: activeUsers.filter(user => user.id !== userId),
      privateChatHistory: [],
    };
    handleLLMCall(promptData);
  };

  const isMyTurn = !isCompanionActionInProgress || (actingPlayer && actingPlayer.id === userId);
  const isCompanionSystemActive = gameState.player.companions.length > 0; // [수정] gameState에서 참조

  const toggleAccordion = (key) => {
    setAccordion(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Firestore 기본 컬렉션/문서 자동 생성 useEffect
  useEffect(() => {
    if (!db || !appId || !isAuthReady || !userId) return;
    (async () => {
      try {
        const mainScenarioRef = getMainScenarioRef(db, appId);
        const mainSnap = await getDoc(mainScenarioRef);
        if (!mainSnap.exists()) {
          const def = getDefaultGameState();
          await setDoc(mainScenarioRef, {
            storyLog: def.log,
            choices: def.choices,
            gamePhase: def.phase,
            lastUpdate: serverTimestamp(),
          }, { merge: true });
        }
        const collectionsToEnsure = [
            'sharedGameLog', 'activeUsers', 'chatMessages'
        ];
        for(const colName of collectionsToEnsure) {
            const colRef = collection(db, 'artifacts', appId, 'public', 'data', colName);
            const snap = await getDocs(query(colRef));
            if(snap.empty) {
                await addDoc(colRef, { system: true, timestamp: serverTimestamp() });
            }
        }
      } catch (e) {
        console.warn('Firestore 기본 컬렉션/문서 자동 생성 실패:', e);
      }
    })();
  }, [db, appId, isAuthReady, userId]);

  // 게임 상태 비정상 복구
  useEffect(() => {
    if (!gameState.log || gameState.log.length === 0 || !gameState.choices) {
      setGameState(getDefaultGameState());
    }
  }, [gameState.log, gameState.choices]);

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
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleNicknameSubmit}
                disabled={!nicknameInput.trim()}
              >
                시작하기
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-red-400">⚠️ 모든 데이터를 초기화할까요?</h3>
            <p className="text-gray-200">이 작업은 되돌릴 수 없습니다. 모든 시나리오, 로그, 유저, 채팅 데이터가 삭제됩니다.</p>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-md"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
              >
                취소
              </button>
              <button
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-md"
                onClick={resetAllGameData}
                disabled={isResetting}
              >
                {isResetting ? '초기화 중...' : '초기화'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl bg-gray-800 rounded-lg shadow-xl p-6 md:p-8 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6">
        <div className="flex flex-col w-full lg:w-2/3 space-y-6">
          {isAuthReady && userId && (
            <div className="text-xs text-gray-500 text-center mb-2">
              사용자 ID: {userId}
            </div>
          )}

          <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('gameLog')}>
              <h2 className="text-lg font-bold text-gray-100">게임 로그</h2>
              <div className="text-xl">{accordion.gameLog ? '▼' : '▲'}</div>
            </div>
            {accordion.gameLog && (
              <>
                <div className="flex justify-end mb-2">
                  <button
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md"
                    onClick={() => setShowResetModal(true)}
                  >
                    전체 데이터 초기화
                  </button>
                </div>
                <div className="flex-grow bg-gray-700 p-4 rounded-md overflow-y-auto h-96 custom-scrollbar text-sm md:text-base leading-relaxed" style={{ maxHeight: '24rem' }}>
                  {/* [수정] gameState.log 사용 */}
                  {gameState.log.map((line, index) => (
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
                  {isCompanionSystemActive && isCompanionActionInProgress && !isMyTurn && (
                      <div className="text-center text-yellow-400 font-semibold p-2 bg-black bg-opacity-20 rounded-md mt-2">
                          {actingPlayer ? `${getDisplayName(actingPlayer.id)}님이 선택하고 있습니다...` : "동료가 선택하고 있습니다..."}
                      </div>
                  )}
                  <div ref={logEndRef} />
                </div>
              </>
            )}
          </div>

          {/* [수정] gameState.phase와 gameState.player 사용 */}
          {gameState.phase === 'playing' && (
            <div className="bg-gray-700 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1">
              <p><span className="font-semibold text-gray-100">직업:</span> {gameState.player.profession}</p>
              <p><span className="font-semibold text-gray-100">위치:</span> {gameState.player.currentLocation}</p>
              <p><span className="font-semibold text-gray-100">능력치:</span> 힘({gameState.player.stats.strength}) 지능({gameState.player.stats.intelligence}) 민첩({gameState.player.stats.agility}) 카리스마({gameState.player.stats.charisma})</p>
              <p><span className="font-semibold text-gray-100">인벤토리:</span> {gameState.player.inventory.length > 0 ? gameState.player.inventory.join(', ') : '비어있음'}</p>
              <p><span className="font-semibold text-gray-100">평판:</span> {Object.keys(gameState.player.reputation).length > 0 ? Object.entries(gameState.player.reputation).map(([key, value]) => `${key}: ${value}`).join(', ') : '없음'}</p>
              <p><span className="font-semibold text-gray-100">퀘스트:</span> {gameState.player.activeQuests.length > 0 ? gameState.player.activeQuests.join(', ') : '없음'}</p>
              <p><span className="font-semibold text-gray-100">동료:</span> {gameState.player.companions.length > 0 ? gameState.player.companions.join(', ') : '없음'}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {/* [수정] gameState.choices 사용 */}
            {gameState.choices.map((choice, index) => (
              <button
                key={index}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleChoiceClick(choice)}
                disabled={isTextLoading || (isCompanionSystemActive && !isMyTurn)}
              >
                {choice}
              </button>
            ))}
          </div>

          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <button
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md shadow-lg"
              onClick={saveGame}
              disabled={isTextLoading || !isAuthReady || !userId || gameState.phase === 'characterSelection'}
            >
              게임 저장
            </button>
            <button
              className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-md shadow-lg"
              onClick={loadGame}
              disabled={isTextLoading || !isAuthReady || !userId}
            >
              게임 불러오기
            </button>
            <button
              className="flex-1 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-md shadow-lg"
              onClick={() => setShowFeedbackModal(true)}
              disabled={isTextLoading || !isAuthReady || !userId}
            >
              피드백 보내기
            </button>
          </div>
        </div>

        <div className="w-full lg:w-1/3 flex flex-col space-y-6 bg-gray-700 p-4 rounded-lg shadow-inner">
          <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('users')}>
              <h4 className="text-md font-semibold text-gray-200 mb-2">현재 플레이어들</h4>
              <div className="text-xl">{accordion.users ? '▼' : '▲'}</div>
            </div>
            {accordion.users && (
              <div className="bg-gray-600 p-3 rounded-md h-48 overflow-y-auto custom-scrollbar">
                {activeUsers.length > 0 ? (
                  <ul className="text-sm text-gray-300 space-y-1">
                    {activeUsers.map(user => (
                      <li
                        key={user.id}
                        className="truncate flex justify-between items-center p-1 rounded-md hover:bg-gray-500 cursor-pointer"
                        onDoubleClick={() => user.id !== userId && openPlayerChatModal(user)}
                      >
                        <span>
                          <span className="font-medium text-blue-300">{user.nickname || user.displayName || `플레이어 ${user.id.substring(0, 4)}`}</span>
                          {user.isCompanion && <span className="text-green-400 ml-2">(동료)</span>}
                        </span>
                        {user.id !== userId && (
                          <button
                            className="ml-2 px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-md"
                            onClick={() => openPlayerChatModal(user)}
                            disabled={user.currentLocation !== gameState.player.currentLocation} // [수정] gameState에서 참조
                          >
                            대화하기
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">활동 중인 플레이어가 없습니다.</p>
                )}
              </div>
            )}
          </div>

          <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('sharedLog')}>
              <h4 className="text-md font-semibold text-gray-200 mb-2">모든 플레이어의 활동</h4>
              <div className="text-xl">{accordion.sharedLog ? '▼' : '▲'}</div>
            </div>
            {accordion.sharedLog && (
              <div className="bg-gray-600 p-3 rounded-md flex-grow h-96 overflow-y-auto custom-scrollbar">
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
            )}
          </div>

          <div className="mb-2">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('chat')}>
              <h4 className="text-md font-semibold text-gray-200 mb-2">공개 채팅</h4>
              <div className="text-xl">{accordion.chat ? '▼' : '▲'}</div>
            </div>
            {accordion.chat && (
              <div className="bg-gray-600 p-3 rounded-md flex flex-col h-64">
                <div className="flex-grow overflow-y-auto custom-scrollbar mb-3 text-sm text-gray-300 space-y-2">
                  {chatMessages.length > 0 ? (
                    chatMessages.map((msg) => (
                      <div key={msg.id} className="border-b border-gray-500 pb-1 last:border-b-0">
                        <p className="text-xs text-gray-400">
                          <span className="font-medium text-green-300">{getDisplayName(msg.userId)}</span> (
                          {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString() : '시간 없음'}):
                        </p>
                        <p>{msg.message}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-400">아직 채팅 메시지가 없습니다.</p>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="flex">
                  <input
                    type="text"
                    className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600 text-gray-100"
                    placeholder="메시지를 입력하세요..."
                    value={currentChatMessage}
                    onChange={(e) => setCurrentChatMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                    disabled={!isAuthReady || !userId}
                  />
                  <button
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-r-md"
                    onClick={sendChatMessage}
                    disabled={!isAuthReady || !userId || !currentChatMessage.trim()}
                  >
                    보내기
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-gray-100">피드백 보내기</h3>
            <textarea
              className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-gray-100 h-32"
              placeholder="게임에 대한 피드백을 여기에 작성해주세요..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              disabled={isTextLoading}
            ></textarea>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-md"
                onClick={() => setShowFeedbackModal(false)}
                disabled={isTextLoading}
              >
                취소
              </button>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md"
                onClick={sendFeedback}
                disabled={isTextLoading || !feedbackText.trim()}
              >
                보내기
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlayerChatModal && selectedPlayerForChat && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4 flex flex-col h-3/4 max-h-[80vh]">
            <h3 className="text-xl font-bold text-gray-100">
              {getDisplayName(selectedPlayerForChat.id)} ({selectedPlayerForChat.profession}) 님과 대화
            </h3>
            <div className="flex-grow bg-gray-700 p-3 rounded-md overflow-y-auto custom-scrollbar text-sm text-gray-300 space-y-2">
              {privateChatMessages.length > 0 ? (
                privateChatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-2 rounded-lg max-w-[80%] ${msg.senderId === userId ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-100'}`}>
                      <p className="text-xs text-gray-300 mb-1">
                        <span className="font-medium">{getDisplayName(msg.senderId)}</span>
                      </p>
                      <p>{msg.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 text-center">아직 대화가 없습니다. 먼저 메시지를 보내세요!</p>
              )}
              <div ref={privateChatEndRef} />
            </div>
            <div className="flex">
              <input
                type="text"
                className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600 text-gray-100"
                placeholder="개인 메시지를 입력하세요..."
                value={currentPrivateChatMessage}
                onChange={(e) => setCurrentPrivateChatMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendPrivateChatMessage()}
                disabled={!isAuthReady || !userId || !selectedPlayerForChat}
              />
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-r-md"
                onClick={sendPrivateChatMessage}
                disabled={!isAuthReady || !userId || !selectedPlayerForChat || !currentPrivateChatMessage.trim()}
              >
                보내기
              </button>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md"
                onClick={handleEndPrivateChatAndReflectScenario}
                disabled={isTextLoading || privateChatMessages.length === 0}
              >
                대화 종료 및 시나리오 반영
              </button>
              <button
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-md"
                onClick={closePlayerChatModal}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 mt-4">
        <button
          className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-lg"
          onClick={moveToInn}
          disabled={isTextLoading || gameState.player.currentLocation === '방랑자의 안식처'} // [수정] gameState에서 참조
        >
          여관(방랑자의 안식처)으로 이동
        </button>
      </div>

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