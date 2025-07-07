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
// Firebase configuration information (default if not provided by Canvas environment)
const defaultFirebaseConfig = {
  apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8", // Replace with your actual Firebase API key
  authDomain: "text-adventure-game-cb731.firebaseapp.com",
  projectId: "text-adventure-game-cb731",
  storageBucket: "text-adventure-game-cb731.firebaseapis.com",
  messagingSenderId: "1092941614820",
  appId: "1:1092941614820:web:5545f36014b73c268026f1",
  measurementId: "G-FNGF42T1FP"
};

// Use global variables provided by Canvas environment
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

function App() {
  // Current game text log (private)
  const [gameLog, setGameLog] = useState([]);
  // LLM text response loading state
  const [isTextLoading, setIsTextLoading] = useState(false);
  // Game phase: 'characterSelection' or 'playing'
  const [gamePhase, setGamePhase] = useState('characterSelection');
  // Player character information
  const [playerCharacter, setPlayerCharacter] = useState({
    profession: '',
    stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 }, // Base stats
    inventory: [],
    initialMotivation: '',
    currentLocation: '방랑자의 안식처', // Set initial location to 'Wanderer's Rest'
    reputation: {}, // NPC/faction reputation (managed by LLM)
    activeQuests: [], // Active quests (managed by LLM)
    companions: [], // Companions (managed by LLM)
  });
  // Current choices presented to the player
  const [currentChoices, setCurrentChoices] = useState([]);
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
  // [수정] 개인 채팅 모달이 사용자에게 의해 닫혔는지 여부를 추적하는 상태
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

  // Firebase initialization and authentication handling
  useEffect(() => {
    try {
      // Check if Firebase API key is a placeholder.
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
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Firebase authentication failed:", error);
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

  // Set multiplayer data listeners after Firebase authentication is complete
  useEffect(() => {
    if (!db || !isAuthReady || !userId || !auth) return;

    // [수정] Add listener to monitor game status (scenario progress, etc.)
    const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
    const unsubscribeGameStatus = onSnapshot(gameStatusDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setIsCompanionActionInProgress(data.isActionInProgress || false);
            setActingPlayer(data.actingPlayer || null); // Update acting player information
        }
    }, (error) => {
        console.error("Game status snapshot error:", error);
    });

    // 1. Shared game log listener
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

    // 2. Active user list listener
    // Public data is at /artifacts/{appId}/public/data/{your_collection_name}
    const activeUsersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers');
    const qActiveUsers = query(activeUsersCollectionRef);
    const unsubscribeActiveUsers = onSnapshot(qActiveUsers, (snapshot) => {
      // Filter to show only users active within the last 60 seconds.
      const cutoffTime = Date.now() - 60 * 1000; // 60 seconds (1 minute)
      const users = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.lastActive && user.lastActive.toMillis() > cutoffTime); // Filter by lastActive timestamp
      setActiveUsers(users);
    }, (error) => {
      console.error("Active users snapshot error:", error);
    });

    // 3. Public chat message listener
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
            profession: playerCharacter.profession, // Add player profession
            isCompanion: playerCharacter.companions.length > 0, // [추가] Companion status
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
      unsubscribeChatMessages(); // Clean up chat listener
      unsubscribeGameStatus(); // [수정] Clean up game status listener
      clearInterval(presenceInterval);
    };
  }, [db, isAuthReady, userId, auth, playerCharacter.profession, playerCharacter.companions]); // Add playerCharacter.companions to dependency array

  // Cleanup inactive users function (client-side)
  // This function runs client-side, so it only works when the app is running.
  // A more robust and secure method would be to use Firebase Cloud Functions.
  const cleanupInactiveUsers = async () => {
    if (!db || !isAuthReady || !userId) return;

    const inactiveThreshold = 1 * 60 * 1000; // 1 minute (60 seconds)
    const cutoffTime = Date.now() - inactiveThreshold;

    try {
      const activeUsersCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'activeUsers');
      const querySnapshot = await getDocs(activeUsersCollectionRef); // Get all documents.

      querySnapshot.forEach(async (docSnapshot) => {
        const userData = docSnapshot.data();
        // Delete users whose lastActive timestamp is older than 5 minutes.
        if (userData.lastActive && userData.lastActive.toMillis() < cutoffTime) {
          console.log(`DEBUG: Deleting inactive user: ${docSnapshot.id}`);
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'activeUsers', docSnapshot.id));
        }
      });
    } catch (error) {
      console.error("Error cleaning up inactive users:", error);
    }
  };

  // Set interval for cleaning up inactive users
  useEffect(() => {
    if (!db || !isAuthReady || !userId) return;

    // Run cleanup function every 1 minute.
    const cleanupInterval = setInterval(cleanupInactiveUsers, 1 * 60 * 1000); // Run every 1 minute

    return () => clearInterval(cleanupInterval); // Clean up interval on component unmount
  }, [db, isAuthReady, userId]); // Re-run whenever db, isAuthReady, userId change

  // Set initial message and profession choices when the game starts
  useEffect(() => {
    if (gamePhase === 'characterSelection') {
      setGameLog([
        "환영합니다! 당신은 중세 유럽풍 판타지 왕국의 모험가가 될 것입니다. 당신은 지금 '방랑자의 안식처'라는 아늑한 여관에 도착했습니다.",
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

  // Scroll private chat messages
  useEffect(() => {
    if (privateChatEndRef.current) {
      privateChatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [privateChatMessages]);

  // Function to generate private chat room ID (sorts two user IDs for consistent ID generation)
  const getPrivateChatRoomId = (user1Id, user2Id) => {
    const sortedIds = [user1Id, user2Id].sort();
    return `${sortedIds[0]}_${sortedIds[1]}`;
  };

  // Existing private chat listener (receives only conversations with the selected player)
  useEffect(() => {
    if (!db || !isAuthReady || !userId || !selectedPlayerForChat) {
      setPrivateChatMessages([]); // Initialize messages if no player is selected
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
  }, [db, isAuthReady, userId, selectedPlayerForChat, appId]); // Added appId to dependency array

  // [NEW] 수신 메시지 알림 리스너 (collectionGroup 사용하지 않음)
  useEffect(() => {
    if (!db || !isAuthReady || !userId) {
      return;
    }

    // 현재 사용자의 incomingMessages 컬렉션을 감시합니다.
    const incomingMessagesCollectionRef = collection(db, 'artifacts', appId, 'users', userId, 'incomingMessages');
    const qIncomingMessages = query(incomingMessagesCollectionRef);

    const unsubscribeIncomingMessages = onSnapshot(qIncomingMessages, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const notification = change.doc.data();
          const senderId = change.doc.id; // 문서 ID가 senderId가 됩니다.

          // 모달이 이미 열려있거나 수동으로 닫힌 상태가 아니라면
          // [수정] isPrivateChatModalManuallyClosed를 의존성 배열에서 제거했으므로,
          // 이 useEffect는 해당 상태 변화에 직접 반응하지 않습니다.
          // 따라서, 모달이 닫힌 상태에서만 알림을 처리하도록 로직을 유지합니다.
          if (!showPlayerChatModal) { // Removed !isPrivateChatModalManuallyClosed from here
            const senderInfo = activeUsers.find(user => user.id === senderId);
            if (senderInfo) {
              openPlayerChatModal(senderInfo);
            } else {
              // activeUsers에 없는 경우, 알림 정보로 임시 플레이어 정보 생성
              openPlayerChatModal({
                id: senderId,
                displayName: notification.senderDisplayName || `알 수 없는 플레이어 ${senderId.substring(0, 4)}`,
                profession: '알 수 없음' // activeUsers에서 가져올 수 없으므로 기본값
              });
            }
            // 알림을 처리했으므로 해당 알림 문서를 삭제합니다.
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
  }, [db, isAuthReady, userId, showPlayerChatModal, activeUsers, appId]); // Removed isPrivateChatModalManuallyClosed from dependency array


  // Define the system prompt to send to the LLM
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
          currentLocation: '방랑자의 안식처', // Set initial location to 'Wanderer's Rest'
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

  // Function to send a public chat message
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
      setCurrentChatMessage(''); // Clear input field after sending message
    } catch (error) {
      console.error("Error sending chat message:", error);
    }
  };

  // Function to send a private chat message
  const sendPrivateChatMessage = async () => {
    if (!db || !userId || !isAuthReady || !selectedPlayerForChat || !currentPrivateChatMessage.trim()) {
      console.warn("개인 메시지를 보낼 수 없습니다. 내용을 입력하거나 대화 상대를 선택해주세요.");
      return;
    }

    try {
      const chatRoomId = getPrivateChatRoomId(userId, selectedPlayerForChat.id);
      const privateChatCollectionRef = collection(db, 'artifacts', appId, 'privateChats', chatRoomId, 'messages');

      await addDoc(privateChatCollectionRef, {
        senderId: userId,
        receiverId: selectedPlayerForChat.id, // Explicit receiver ID
        displayName: `플레이어 ${userId.substring(0, 4)}`,
        message: currentPrivateChatMessage,
        timestamp: serverTimestamp(),
      });

      // [NEW] 수신자에게 새 메시지 알림 플래그 추가
      const receiverNotificationDocRef = doc(db, 'artifacts', appId, 'users', selectedPlayerForChat.id, 'incomingMessages', userId);
      await setDoc(receiverNotificationDocRef, {
        lastMessageTimestamp: serverTimestamp(),
        senderDisplayName: `플레이어 ${userId.substring(0, 4)}`,
        senderId: userId // 알림 규칙을 위해 senderId 필드를 추가합니다.
      }, { merge: true });

      setCurrentPrivateChatMessage(''); // Clear input field after sending message
    } catch (error) {
      console.error("Error sending private message:", error);
    }
  };

  // Open private chat modal
  const openPlayerChatModal = (player) => {
    setSelectedPlayerForChat(player);
    setShowPlayerChatModal(true);
    // [수정] 모달을 열 때 isPrivateChatModalManuallyClosed를 항상 false로 설정
    setIsPrivateChatModalManuallyClosed(false); 

    // [NEW] 모달을 열 때 해당 발신자로부터의 알림 플래그를 삭제합니다.
    if (db && userId && player.id) {
      deleteDoc(doc(db, 'artifacts', appId, 'users', userId, 'incomingMessages', player.id)).catch(error => {
        console.error("Error deleting incoming message notification on modal open:", error);
      });
    }
  };

  // Close private chat modal
  const closePlayerChatModal = async () => {
    if (!db || !userId || !selectedPlayerForChat) return;

    try {
      const chatRoomId = getPrivateChatRoomId(userId, selectedPlayerForChat.id);
      // [수정] chatRoomId 문서 자체를 참조하고, 그 안에 status 필드를 업데이트
      const chatRoomDocRef = doc(db, 'artifacts', appId, 'privateChats', chatRoomId);
      await setDoc(chatRoomDocRef, {
        status: { // status 필드 안에 객체로 저장
          [`closedBy.${userId}`]: true, 
          lastClosedBy: userId, 
          lastClosedAt: serverTimestamp()
        }
      }, { merge: true });

      setSelectedPlayerForChat(null);
      setPrivateChatMessages([]);
      setCurrentPrivateChatMessage('');
      setShowPlayerChatModal(false);
      // [수정] 모달을 닫을 때 isPrivateChatModalManuallyClosed를 true로 설정
      setIsPrivateChatModalManuallyClosed(true); 
    } catch (error) {
      console.error("Error closing private chat modal:", error);
    }
  };

  // New useEffect: Listen for private chat close signals from the other user
  useEffect(() => {
    if (!db || !isAuthReady || !userId || !selectedPlayerForChat) return;

    const chatRoomId = getPrivateChatRoomId(userId, selectedPlayerForChat.id);
    // [수정] chatRoomId 문서 자체를 참조
    const chatRoomDocRef = doc(db, 'artifacts', appId, 'privateChats', chatRoomId);

    const unsubscribeChatStatus = onSnapshot(chatRoomDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        // [수정] status 필드 내의 데이터에 접근
        const statusData = data.status || {}; 
        const otherUserId = selectedPlayerForChat.id;

        // If the other user has closed the chat and it's not me who closed it last
        if (statusData.closedBy && statusData.closedBy[otherUserId] && statusData.lastClosedBy !== userId) {
          // Close the modal if it's open and the other user closed it
          if (showPlayerChatModal) {
            setSelectedPlayerForChat(null);
            setPrivateChatMessages([]);
            setCurrentPrivateChatMessage('');
            setShowPlayerChatModal(false);
            setIsPrivateChatModalManuallyClosed(false); // Reset manual close state
            setGameLog(prev => [...prev, `\n> ${selectedPlayerForChat.displayName}님이 대화를 종료했습니다.`]);
          }
        }
      }
    }, (error) => {
      console.error("Private chat status snapshot error:", error);
    });

    return () => unsubscribeChatStatus();
  }, [db, isAuthReady, userId, selectedPlayerForChat, showPlayerChatModal, appId]); // Added appId to dependency array


  // Private chat end and scenario reflection function (modified)
  const handleEndPrivateChatAndReflectScenario = async () => {
      if (!selectedPlayerForChat) return;

      // [수정] Close modal first to improve user experience before LLM call
      closePlayerChatModal();

      // Start loading state
      setIsTextLoading(true);
      setGameLog(prev => [...prev, `\n> ${selectedPlayerForChat.displayName}님과의 대화 내용을 바탕으로 시나리오를 진행합니다...\n`]);

      // Construct promptData to send to LLM
      const promptData = {
          phase: 'playing',
          playerChoice: `플레이어 ${selectedPlayerForChat.displayName}님과의 대화 종료.`,
          character: playerCharacter,
          history: gameLog,
          activeUsers: activeUsers.filter(user => user.id !== userId),
          privateChatHistory: privateChatMessages
      };

      try {
          // [수정] Update shared scenario progress status in Firestore
          const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
          await setDoc(gameStatusDocRef, {
              isActionInProgress: true,
              actingPlayer: { id: userId, displayName: `플레이어 ${userId.substring(0, 4)}` }
          }, { merge: true });

          const llmResponse = await callGeminiTextLLM(promptData);

          // Ideally, Cloud Functions should be used to update multiple players' states.
          // For now, update only current player's state and shared log on the client side.
          setGameLog(prev => [...prev, llmResponse.story]);

          if (db && userId) {
              const sharedLogCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'sharedGameLog');
              await addDoc(sharedLogCollectionRef, {
                  userId: userId,
                  displayName: `플레이어 ${userId.substring(0, 4)}`,
                  content: `[${playerCharacter.profession}]이(가) ${selectedPlayerForChat.displayName}님과 대화 후: ${llmResponse.story}`,
                  timestamp: serverTimestamp(),
              });
          }

          setPlayerCharacter(prev => ({
              ...prev,
              inventory: (llmResponse.inventoryUpdates && llmResponse.inventoryUpdates.length > 0) ? llmResponse.inventoryUpdates : prev.inventory,
              stats: (llmResponse.statChanges && !isObjectEmpty(llmResponse.statChanges)) ? llmResponse.statChanges : prev.stats,
              currentLocation: llmResponse.location || prev.currentLocation,
              reputation: (llmResponse.reputationUpdates && !isObjectEmpty(llmResponse.reputationUpdates)) ? llmResponse.reputationUpdates : prev.reputation,
              activeQuests: (llmResponse.activeQuestsUpdates && llmResponse.activeQuestsUpdates.length > 0) ? llmResponse.activeQuestsUpdates : prev.activeQuests,
              companions: (llmResponse.companionsUpdates && llmResponse.companionsUpdates.length > 0) ? llmResponse.companionsUpdates : prev.companions,
          }));
          setCurrentChoices(llmResponse.choices || []);

      } catch (error) {
          console.error("Error processing private chat with LLM:", error);
          setGameLog(prev => [...prev, `\n오류: 개인 대화 내용을 시나리오에 반영하는 중 문제가 발생했습니다: ${error.message}`]);
      } finally {
          // [수정] Change status back to false after scenario progress is complete
          const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
          await setDoc(gameStatusDocRef, { isActionInProgress: false, actingPlayer: null }, { merge: true });

          setIsTextLoading(false); // End loading state
      }
  };

  // Helper function to check if an object is empty
  const isObjectEmpty = (obj) => Object.keys(obj).length === 0 && obj.constructor === Object;

  // Player choice button click handler (modified)
  const handleChoiceClick = async (choice) => {
    // [수정] Cannot select if another player is acting
    if (isTextLoading || isCompanionActionInProgress) return;

    setGameLog(prev => [...prev, `\n> 당신의 선택: ${choice}\n`]);
    setCurrentChoices([]);

    let promptData;

    try {
        // [수정] Set scenario progress status to true
        if (db && userId) {
            const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
            await setDoc(gameStatusDocRef, {
                isActionInProgress: true,
                actingPlayer: { id: userId, displayName: `플레이어 ${userId.substring(0, 4)}` }
            }, { merge: true });
        }

        if (gamePhase === 'characterSelection') {
          const chosenProfessionKey = choice.split('.')[0].trim();
          const chosenProfession = professions[chosenProfessionKey];

          if (chosenProfession) {
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
              currentLocation: '방랑자의 안식처',
              reputation: {},
              activeQuests: [],
              companions: [],
            };
            setPlayerCharacter(initialCharacterState);

            promptData = {
              phase: 'characterSelection',
              playerChoice: choice,
              character: initialCharacterState,
              history: gameLog,
              activeUsers: activeUsers.filter(user => user.id !== userId),
              privateChatHistory: []
            };

            const llmResponse = await callGeminiTextLLM(promptData);
            setGameLog(prev => [...prev, llmResponse.story]);

            setPlayerCharacter(prev => ({
              ...prev,
              inventory: (llmResponse.inventoryUpdates && llmResponse.inventoryUpdates.length > 0) ? llmResponse.inventoryUpdates : prev.inventory,
              stats: (llmResponse.statChanges && !isObjectEmpty(llmResponse.statChanges)) ? llmResponse.statChanges : prev.stats,
              currentLocation: llmResponse.location || prev.currentLocation,
              reputation: (llmResponse.reputationUpdates && !isObjectEmpty(llmResponse.reputationUpdates)) ? llmResponse.reputationUpdates : prev.reputation,
              activeQuests: (llmResponse.activeQuestsUpdates && llmResponse.activeQuestsUpdates.length > 0) ? llmResponse.activeQuestsUpdates : prev.activeQuests,
              companions: (llmResponse.companionsUpdates && llmResponse.companionsUpdates.length > 0) ? llmResponse.companionsUpdates : prev.companions,
            }));
            setCurrentChoices(llmResponse.choices || []);
            setGamePhase('playing');
          } else {
            setGameLog(prev => [...prev, "유효하지 않은 선택입니다. 제시된 직업 중 하나를 선택해주세요."]);
            setCurrentChoices(Object.keys(professions).map(key => `${key}. ${professions[key].name}`));
          }

        } else { // gamePhase === 'playing'
          promptData = {
            phase: 'playing',
            playerChoice: choice,
            character: playerCharacter,
            history: gameLog,
            activeUsers: activeUsers.filter(user => user.id !== userId),
            privateChatHistory: []
          };

          const llmResponse = await callGeminiTextLLM(promptData);
          setGameLog(prev => [...prev, llmResponse.story]);

          if (db && userId) {
            const sharedLogCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'sharedGameLog');
            await addDoc(sharedLogCollectionRef, {
              userId: userId,
              displayName: `플레이어 ${userId.substring(0, 4)}`,
              content: `[${playerCharacter.profession}]의 선택: ${choice}\n\n${llmResponse.story}`,
              timestamp: serverTimestamp(),
            });
          }

          setPlayerCharacter(prev => ({
            ...prev,
            inventory: (llmResponse.inventoryUpdates && llmResponse.inventoryUpdates.length > 0) ? llmResponse.inventoryUpdates : prev.inventory,
            stats: (llmResponse.statChanges && !isObjectEmpty(llmResponse.statChanges)) ? llmResponse.statChanges : prev.stats,
            currentLocation: llmResponse.location || prev.currentLocation,
            reputation: (llmResponse.reputationUpdates && !isObjectEmpty(llmResponse.reputationUpdates)) ? llmResponse.reputationUpdates : prev.reputation,
            activeQuests: (llmResponse.activeQuestsUpdates && llmResponse.activeQuestsUpdates.length > 0) ? llmResponse.activeQuestsUpdates : prev.activeQuests,
            companions: (llmResponse.companionsUpdates && llmResponse.companionsUpdates.length > 0) ? llmResponse.companionsUpdates : prev.companions,
          }));
          setCurrentChoices(llmResponse.choices || []);
        }
    } catch (error) {
        console.error("Error during choice handling:", error);
        setGameLog(prev => [...prev, `\n오류가 발생했습니다: ${error.message}`]);
    } finally {
        // [수정] Change status back to false after scenario progress is complete
        if (db && userId) {
            const gameStatusDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
            await setDoc(gameStatusDocRef, { isActionInProgress: false, actingPlayer: null }, { merge: true });
        }
    }
  };

  const isMyTurn = !isCompanionActionInProgress || (actingPlayer && actingPlayer.id === userId);
  const isCompanionSystemActive = playerCharacter.companions.length > 0;

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
            {/* [추가] Companion action waiting message */}
            {isCompanionSystemActive && isCompanionActionInProgress && !isMyTurn && (
                <div className="text-center text-yellow-400 font-semibold p-2 bg-black bg-opacity-20 rounded-md mt-2">
                    {actingPlayer ? `${actingPlayer.displayName}님이 선택하고 있습니다...` : "동료가 선택하고 있습니다..."}
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
                // [수정] Disable when companion is acting
                disabled={isTextLoading || (isCompanionSystemActive && !isMyTurn)}
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
                  <li
                    key={user.id}
                    className="truncate flex justify-between items-center p-1 rounded-md hover:bg-gray-500 cursor-pointer" // Added hover and cursor styles
                    onDoubleClick={() => user.id !== userId && openPlayerChatModal(user)} // Double-click handler
                  >
                    <span>
                      <span className="font-medium text-blue-300">{user.displayName}</span>
                       {/* [추가] Companion display */}
                       {user.isCompanion && <span className="text-green-400 ml-2">(동료)</span>}
                    </span>
                    {user.id !== userId && ( // Do not show chat button for self
                      <button
                        className="ml-2 px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-md"
                        onClick={() => openPlayerChatModal(user)}
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

          {/* Public Chat section */}
          <div className="bg-gray-600 p-3 rounded-md flex flex-col h-64">
            <h4 className="text-md font-semibold text-gray-200 mb-2">공개 채팅:</h4>
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

      {/* Private Chat Modal (modified) */}
      {showPlayerChatModal && selectedPlayerForChat && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4 flex flex-col h-3/4 max-h-[80vh]">
            <h3 className="text-xl font-bold text-gray-100">
              {selectedPlayerForChat.displayName} ({selectedPlayerForChat.profession}) 님과 대화
            </h3>
            <div className="flex-grow bg-gray-700 p-3 rounded-md overflow-y-auto custom-scrollbar text-sm text-gray-300 space-y-2">
              {privateChatMessages.length > 0 ? (
                privateChatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-2 rounded-lg max-w-[80%] ${msg.senderId === userId ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-100'}`}>
                      <p className="text-xs text-gray-300 mb-1">
                        <span className="font-medium">{msg.displayName}</span> (
                        {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString() : '시간 없음'})
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
                className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="개인 메시지를 입력하세요..."
                value={currentPrivateChatMessage}
                onChange={(e) => setCurrentPrivateChatMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    sendPrivateChatMessage();
                  }
                }}
                disabled={!isAuthReady || !userId || !selectedPlayerForChat}
              />
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-r-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                onClick={sendPrivateChatMessage}
                disabled={!isAuthReady || !userId || !selectedPlayerForChat || !currentPrivateChatMessage.trim()}
              >
                보내기
              </button>
            </div>
            {/* [수정] Modified button area */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleEndPrivateChatAndReflectScenario}
                disabled={isTextLoading || privateChatMessages.length === 0}
              >
                대화 종료 및 시나리오 반영
              </button>
              <button
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-md transition duration-300"
                onClick={closePlayerChatModal}
                // [수정] Close button is always active
              >
                닫기
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