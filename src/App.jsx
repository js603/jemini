import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
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
  writeBatch,
  orderBy,
  limit,
  where,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';

// ====================================================================
// Firebase 설정
const firebaseConfig = {
  apiKey: 'AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8',
  authDomain: 'text-adventure-game-cb731.firebaseapp.com',
  projectId: 'text-adventure-game-cb731',
  storageBucket: 'text-adventure-game-cb731.appspot.com',
  messagingSenderId: '1092941614820',
  appId: '1:1092941614820:web:5545f36014b73c268026f1',
  measurementId: 'G-FNGF42T1FP',
};
// ====================================================================

// ====================================================================
// LLM 서비스 함수
// ====================================================================

// 1. 메시지 요약 및 관련 정보 추출 함수 추가
function summarizeMessages(messages) {
  // 시스템 메시지, 명령어, 주요 행동만 추출 (예시)
  return messages
      .filter(m => m.isSystemMessage || m.text.startsWith('!') || m.text.includes('공격') || m.text.includes('획득'))
      .map(m => `${m.displayName || 'System'}: ${m.text}`)
      .join('\n');
}

function extractRelevantPlayers(players, lastUserId) {
  // 최근 행동한 플레이어 + HP 10 미만 등 주요 상태 변화 플레이어만 (예시)
  return players.filter(p => p.id === lastUserId || (p.stats && p.stats.hp !== undefined && p.stats.hp < 10));
}

// === Hugging Face LLM 연동 함수 ===
const callHuggingFaceLlmApi = async (prompt, systemPrompt) => {
  const HF_TOKEN = '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';
  // 원하는 모델로 변경 가능 (예: meta-llama/Llama-2-70b-chat-hf)
  const modelId = 'beomi/KoAlpaca-Polyglot-5.8B';
  const url = `https://api-inference.huggingface.co/models/${modelId}`;
  // Hugging Face Inference API는 system prompt를 지원하지 않으므로 합쳐서 전달
  const fullPrompt = systemPrompt ? `${systemPrompt}\n${prompt}` : prompt;
  const payload = {
    inputs: fullPrompt,
    parameters: {
      max_new_tokens: 1024,
      return_full_text: false,
      do_sample: true,
      temperature: 0.7
    }
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`Hugging Face API 호출 실패 (상태: ${response.status})`);
      return {
        chatMessage: `[시스템 오류: Hugging Face API 호출 실패 (상태: ${response.status})]`,
        playerUpdates: []
      };
    }
    const result = await response.json();
    // output 형식: [{ generated_text: ... }]
    let output = Array.isArray(result) && result[0]?.generated_text ? result[0].generated_text : '';
    if (!output) {
      console.error("Hugging Face API 응답에 텍스트가 없음:", result);
      return {
        chatMessage: "[시스템 오류: Hugging Face API 응답에 텍스트가 없습니다]",
        playerUpdates: []
      };
    }

    try {
      const cleanedOutput = output.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedOutput);

      // 기본 구조 검증
      if (!parsed.chatMessage) {
        parsed.chatMessage = "시스템: 응답을 처리하는 중 오류가 발생했습니다.";
      }
      if (!Array.isArray(parsed.playerUpdates)) {
        parsed.playerUpdates = [];
      }
      return parsed;
    } catch (parseError) {
      console.error("Hugging Face API 응답 파싱 오류:", parseError, "원본 텍스트:", output);
      // JSON 파싱 실패 시 텍스트 자체를 chatMessage로 사용
      return {
        chatMessage: output.length > 500 ? output.substring(0, 500) + "..." : output,
        playerUpdates: []
      };
    }
  } catch (error) {
    console.error("Hugging Face API 호출 중 오류:", error);
    return {
      chatMessage: `[시스템 오류: Hugging Face API 호출 중 오류: ${error.message}]`,
      playerUpdates: []
    };
  }
};

// 기존 Groq LLM 함수명 변경
const callGroqLlmApi = async (prompt, systemPrompt, model = "llama3-70b-8192") => {
  const GROQ_API_KEY = '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';
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 1024,
    response_format: { type: 'text' },
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`Groq API 호출 실패 (상태: ${response.status})`);
      return {
        chatMessage: `[시스템 오류: Groq API 호출 실패 (상태: ${response.status})]`,
        playerUpdates: []
      };
    }
    const result = await response.json();
    const llmOutputText = result.choices?.[0]?.message?.content || '';
    // JSON 파싱 (코드블록 제거)
    const cleanedOutput = llmOutputText.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      const parsedOutput = JSON.parse(cleanedOutput);
      // 기본 구조 검증
      if (!parsedOutput.chatMessage) {
        parsedOutput.chatMessage = "시스템: 응답을 처리하는 중 오류가 발생했습니다.";
      }
      if (!Array.isArray(parsedOutput.playerUpdates)) {
        parsedOutput.playerUpdates = [];
      }
      return parsedOutput;
    } catch (parseError) {
      console.error("Groq API 응답 파싱 오류:", parseError, "원본 텍스트:", cleanedOutput);
      return {
        chatMessage: `[시스템 오류: JSON 파싱 실패] ${llmOutputText.substring(0, 100)}...`,
        playerUpdates: []
      };
    }
  } catch (error) {
    console.error("Groq API 호출 중 오류:", error);
    return {
      chatMessage: `[시스템 오류: Groq API 호출 중 오류: ${error.message}]`,
      playerUpdates: []
    };
  }
};

const generateSystemPrompt = (worldConcept) => {
  return `
        ### 페르소나 (Persona)
        당신은 전문 게임 마스터(GM)이자 뛰어난 이야기꾼입니다. 당신은 플레이어들과 함께 실시간으로 텍스트 기반 롤플레잉 게임을 만들어갑니다. 당신의 무대는 "${worldConcept}"입니다.

        ### 핵심 임무 (Core Task)
        1.  **서사 진행:** 플레이어들의 채팅을 기반으로 흥미로운 이야기를 만들고, 그 결과를 채팅 메시지로 전달합니다.
        2.  **캐릭터 관리:** 이야기의 흐름에 따라 플레이어의 상태(능력치, 아이템 등)를 업데이트하고, 그 결과를 데이터로 반환합니다.

        ### 절대적 지시사항 (Absolute Instructions)
        1.  **오직 JSON만 출력:** 당신의 응답은 반드시 아래에 명시된 JSON 구조를 따라야 합니다. 설명, 마크다운, 기타 텍스트는 절대 포함하지 마십시오.
        2.  **반드시 한국어만 사용:** 모든 생성 텍스트는 반드시 100% 한국어로만 작성해야 합니다. 영어, 숫자, 특수문자, 이모지, 기타 언어는 절대 포함하지 마십시오. 한국어 이외의 언어가 포함되면 심각한 오류로 간주합니다. 반드시 한국어만 사용하세요.
        3.  **채팅과 데이터 분리:** 서사적 묘사는 'chatMessage'에, 플레이어 상태 변경은 'playerUpdates'에 명확히 분리하여 작성하십시오.

        ### JSON 출력 구조 (이 구조를 반드시 따르세요)
        {
          "chatMessage": "플레이어들에게 보여줄 서사적인 채팅 메시지입니다. 상황 묘사, NPC의 대사, 이벤트 발생 등을 포함합니다.",
          "playerUpdates": [
            {
              "userId": "상태를_업데이트할_플레이어의_ID",
              "updates": {
                "name": "캐릭터 이름",
                "description": "캐릭터에 대한 새로운 설명",
                "stats.힘": 11,
                "inventory": ["검", "방패", "새로운 아이템"]
              }
            }
          ]
        }

        ### 캐릭터 생성 규칙
        - 새로운 플레이어가 입장하면, 그를 위한 초기 캐릭터 정보를 생성하여 'playerUpdates'에 포함시켜주세요. 이름, 간단한 설명, 기본 능력치와 아이템을 부여하세요.
        - 환영의 의미로 'chatMessage'를 통해 새로운 플레이어의 등장을 다른 모두에게 알려주세요.
    `;
};

// --- AppLite.jsx 메인 컴포넌트 ---
function AppLite() {
  const [db, setDb] = useState(null);
  // const [auth, setAuth] = useState(null); // Firebase Auth is no longer used
  const [user, setUser] = useState(null); // Now holds { id, nickname }

  // Login state
  const [showLogin, setShowLogin] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [worlds, setWorlds] = useState([]);
  const [currentWorld, setCurrentWorld] = useState(null); // { id, name, systemPrompt, gameStarted }
  const [newWorldName, setNewWorldName] = useState('');

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [players, setPlayers] = useState([]);

  // Character sheet carousel state
  const [displayedPlayerIndex, setDisplayedPlayerIndex] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const chatEndRef = useRef(null);
  const chatInputRef = useRef(null);

  const [lastLlmResponse, setLastLlmResponse] = useState(null); // 이전 LLM 응답 저장

  const [deleteTargetWorld, setDeleteTargetWorld] = useState(null);
  const [isDeletingWorld, setIsDeletingWorld] = useState(false);

  const newWorldInputRef = useRef(null); // 로비 입력창
  const nicknameInputRef = useRef(null); // 로그인 닉네임
  const passwordInputRef = useRef(null); // 로그인 비번

  // === (1) 상태 추가 ===
  const [freeChatInput, setFreeChatInput] = useState('');
  const freeChatEndRef = useRef(null);

  const [llmProvider, setLlmProvider] = useState('groq'); // 'groq' 또는 'huggingface'

  function generateUUID() {
    // RFC4122 버전 4 준수 (간단 버전)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Get or create a persistent user ID from localStorage
  useEffect(() => {
    let userId = localStorage.getItem('text-adventure-user-id');
    if (!userId) {
      userId = generateUUID();
      localStorage.setItem('text-adventure-user-id', userId);
    }
    // We set a temporary user object with just the ID.
    // The nickname will be added after they log into a world.
    setUser({ id: userId });

    try {
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      setDb(firestoreDb);
      setIsLoading(false);
    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setIsLoading(false);
    }
  }, []);

  // 월드 목록 리스너
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'worlds'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setWorlds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [db]);

  // 현재 월드의 메시지 및 플레이어 리스너
  useEffect(() => {
    // 월드가 변경되면 상태 초기화
    if (!db || !currentWorld) {
      setMessages([]);
      setPlayers([]);
      setDisplayedPlayerIndex(0); // 플레이어 인덱스도 초기화
      return;
    }

    // 안전하게 월드 ID 확인
    const worldId = currentWorld.id;
    if (!worldId) {
      console.error("유효하지 않은 월드 ID:", currentWorld);
      return;
    }

    console.log(`월드 "${currentWorld.name}" (${worldId})에 연결 중...`);

    // 구독 취소 함수 배열
    const unsubscribes = [];

    try {
      // 월드 문서 리스너 추가 (gameStarted 등 실시간 반영)
      const worldDocRef = doc(db, 'worlds', worldId);
      const unsubscribeWorld = onSnapshot(
          worldDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              const worldData = docSnap.data();
              setCurrentWorld(prev => ({
                ...prev,
                ...worldData,
                id: worldId, // id 유지
              }));
            } else {
              console.warn(`월드 ${worldId}가 더 이상 존재하지 않습니다.`);
            }
          },
          (error) => {
            console.error(`월드 ${worldId} 리스너 오류:`, error);
          }
      );
      unsubscribes.push(unsubscribeWorld);

      // 메시지 리스너
      const messagesQuery = query(
          collection(db, `worlds/${worldId}/messages`),
          orderBy('timestamp')
      );
      const messagesUnsub = onSnapshot(
          messagesQuery,
          (snapshot) => {
            // 임시 메시지를 제외한 실제 메시지만 표시
            const realMessages = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              isPending: false // 서버에서 온 메시지는 항상 pending 아님
            }));

            // 임시 메시지와 실제 메시지 병합 (중복 제거)
            setMessages(prevMessages => {
              // 임시 메시지만 필터링 (id가 temp-로 시작하는 메시지)
              const tempMessages = prevMessages.filter(msg =>
                  msg.id.startsWith('temp-') &&
                  !realMessages.some(rm => rm.text === msg.text && rm.userId === msg.userId)
              );
              return [...realMessages, ...tempMessages];
            });
          },
          (error) => {
            console.error(`메시지 리스너 오류 (월드 ${worldId}):`, error);
          }
      );
      unsubscribes.push(messagesUnsub);

      // 플레이어 리스너
      const playersQuery = query(collection(db, `worlds/${worldId}/players`));
      const playersUnsub = onSnapshot(
          playersQuery,
          (snapshot) => {
            const playersList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlayers(playersList);

            // 표시된 플레이어 인덱스가 범위를 벗어나면 조정
            setDisplayedPlayerIndex(prevIndex => {
              if (playersList.length === 0) return 0;
              return Math.min(prevIndex, playersList.length - 1);
            });
          },
          (error) => {
            console.error(`플레이어 리스너 오류 (월드 ${worldId}):`, error);
          }
      );
      unsubscribes.push(playersUnsub);
    } catch (error) {
      console.error("리스너 설정 중 오류:", error);
    }

    // 클린업 함수: 모든 구독 취소
    return () => {
      console.log(`월드 "${currentWorld.name}" (${worldId}) 연결 해제 중...`);
      unsubscribes.forEach(unsub => {
        try {
          unsub();
        } catch (e) {
          console.error("구독 취소 중 오류:", e);
        }
      });
    };
  }, [db, currentWorld && currentWorld.id]); // 의존성 배열은 동일하게 유지

  // 채팅 스크롤 맨 아래로
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [messages]);

  // 자유 채팅 스크롤 맨 아래로
  useEffect(() => {
    freeChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 로비 진입 시 월드 입력창 포커스
  useEffect(() => {
    if (!currentWorld && newWorldInputRef.current) {
      newWorldInputRef.current.focus();
    }
  }, [currentWorld]);

  // 로그인 모달 열릴 때 닉네임 입력창 포커스
  useEffect(() => {
    if (showLogin && nicknameInputRef.current) {
      nicknameInputRef.current.focus();
    }
  }, [showLogin]);

  // 비밀번호 입력창 자동 포커스는 onKeyDown 이벤트에서 처리됨

  // === LLM dispatcher ===
  const callSelectedLlmApi = async (prompt, systemPrompt, model = "llama3-70b-8192") => {
    if (llmProvider === 'huggingface') {
      return await callHuggingFaceLlmApi(prompt, systemPrompt);
    } else {
      return await callGroqLlmApi(prompt, systemPrompt, model);
    }
  };

  // --- 핸들러 ---
  const handleCreateWorld = async () => {
    if (!db || !newWorldName.trim()) return;
    setIsLoading(true);
    try {
      const newWorldRef = await addDoc(collection(db, 'worlds'), {
        name: newWorldName,
        createdAt: serverTimestamp(),
        systemPrompt: generateSystemPrompt(newWorldName),
        gameStarted: true // 생성 즉시 게임 시작
      });
      setCurrentWorld({ id: newWorldRef.id, name: newWorldName, systemPrompt: generateSystemPrompt(newWorldName), gameStarted: true });
      setShowLogin(true); // 월드 생성 후 바로 로그인 모달 띄우기
    } catch (e) {
      console.error("월드 생성 오류:", e);
    } finally {
      setNewWorldName('');
      setIsLoading(false);
    }
  };

  const handleJoinWorld = (world) => {
    setCurrentWorld(world);
    setShowLogin(true); // Show login modal instead of joining directly
  };

  // App.jsx 파일의 handleLogin 함수를 아래 코드로 교체하세요.

  const handleLogin = async () => {
    if (!db || !user || !currentWorld || !nicknameInput.trim() || !passwordInput.trim()) {
      setLoginError("닉네임과 비밀번호를 모두 입력해야 합니다.");
      return;
    }

    setLoginError('');
    setIsLoading(true);

    try {
      // 1. 닉네임으로 플레이어를 먼저 찾습니다.
      const playersQuery = query(
          collection(db, `worlds/${currentWorld.id}/players`),
          where("nickname", "==", nicknameInput)
      );
      const querySnapshot = await getDocs(playersQuery);

      // 현재 사용자 ID 저장 (비동기 상태 업데이트 문제 방지)
      const currentUserId = user.id;

      if (!querySnapshot.empty) {
        // 2. 닉네임이 존재할 경우 (이어하기 시도)
        const playerDoc = querySnapshot.docs[0]; // 해당 닉네임의 문서
        const playerData = playerDoc.data();

        if (playerData.password === passwordInput) {
          // 비밀번호 일치 -> 로그인 성공
          // 현재 브라우저의 user 상태에 불러온 닉네임과 ID를 설정합니다.
          const updatedUser = { id: playerDoc.id, nickname: playerData.nickname };
          setUser(updatedUser);
          setShowLogin(false);

          // 월드가 시작된 상태면 무조건 LLM 호출 (등장 연출 및 인물정보)
          if (currentWorld.gameStarted) {
            const recentMessages = messages.slice(-20);
            const importantMessages = summarizeMessages(recentMessages);
            const playersInfo = players.map(p => JSON.stringify({id: p.id, ...p})).join('\n');
            const prevLlmSummary = lastLlmResponse && lastLlmResponse.chatMessage ? `\n[이전 장면 요약]\n${lastLlmResponse.chatMessage}\n` : '';
            // 업데이트된 사용자 정보 사용
            const prompt = `${prevLlmSummary}[중요 채팅]\n${importantMessages}\n\n[기존 플레이어]\n${playersInfo}\n\n[새 플레이어]\n닉네임: ${nicknameInput}, ID: ${playerDoc.id}\n\n새로운 플레이어가 게임에 입장했습니다. 이 인물을 현재 시나리오에 자연스럽게 등장시키고, 캐릭터 시트(이름, 설명, 능력치, 컨셉 등)를 생성하세요. 등장 연출도 포함하세요. 반드시 JSON으로만 응답하세요.`;

            try {
              const llmResponse = await callSelectedLlmApi(prompt, currentWorld.systemPrompt, "llama3-70b-8192");
              setLastLlmResponse(llmResponse);
              await processLlmResponse(llmResponse);
            } catch (llmError) {
              console.error("로그인 중 LLM 호출 오류:", llmError);
              // LLM 오류가 발생해도 로그인은 성공으로 처리
            }
          }
        } else {
          // 비밀번호 불일치
          setLoginError("비밀번호가 올바르지 않습니다.");
        }
      } else {
        // 3. 닉네임이 존재하지 않을 경우 (새로 시작)
        try {
          // 현재 브라우저의 고유 ID로 새 플레이어를 생성합니다.
          const newPlayerRef = doc(db, `worlds/${currentWorld.id}/players`, currentUserId);
          const newPlayerData = {
            id: currentUserId,
            nickname: nicknameInput,
            password: passwordInput, // 실제 앱에서는 해싱 필수!
            name: nicknameInput,
            description: "새로운 모험가.",
            level: 1,
            stats: {},
            inventory: []
          };
          await setDoc(newPlayerRef, newPlayerData);

          // 업데이트된 사용자 정보
          const updatedUser = { id: currentUserId, nickname: nicknameInput };
          setUser(updatedUser);
          setShowLogin(false);

          // 새 플레이어 등장 LLM 처리 (항상 실행)
          if (currentWorld.gameStarted) {
            const recentMessages = messages.slice(-20);
            const importantMessages = summarizeMessages(recentMessages);
            const playersInfo = players.map(p => JSON.stringify({id: p.id, ...p})).join('\n');
            const prevLlmSummary = lastLlmResponse && lastLlmResponse.chatMessage ? `\n[이전 장면 요약]\n${lastLlmResponse.chatMessage}\n` : '';
            // 업데이트된 사용자 정보 사용
            const prompt = `${prevLlmSummary}[중요 채팅]\n${importantMessages}\n\n[기존 플레이어]\n${playersInfo}\n\n[새 플레이어]\n닉네임: ${nicknameInput}, ID: ${currentUserId}\n\n새로운 플레이어가 게임에 입장했습니다. 이 인물을 현재 시나리오에 자연스럽게 등장시키고, 캐릭터 시트(이름, 설명, 능력치, 컨셉 등)를 생성하세요. 등장 연출도 포함하세요. 반드시 JSON으로만 응답하세요.`;

            try {
              const llmResponse = await callSelectedLlmApi(prompt, currentWorld.systemPrompt, "llama3-70b-8192");
              setLastLlmResponse(llmResponse);
              await processLlmResponse(llmResponse);
            } catch (llmError) {
              console.error("신규 플레이어 생성 중 LLM 호출 오류:", llmError);
              // LLM 오류가 발생해도 로그인은 성공으로 처리
            }
          }
        } catch (dbError) {
          console.error("플레이어 생성 중 오류:", dbError);
          setLoginError("플레이어 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
      }
    } catch (error) {
      console.error("로그인 처리 중 오류:", error);
      setLoginError("로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  // =======================================================================
  // <<< ✨ 수정된 handleSendMessage 함수 ✨ >>>
  // =======================================================================
  const handleSendMessage = async () => {
    if (!db || !user || !currentWorld || !chatInput.trim()) return;

    const messageText = chatInput.trim();
    setIsSending(true);

    try {
      // 현재 사용자 정보 저장 (비동기 상태 업데이트 문제 방지)
      const currentUserId = user.id;
      const currentUserNickname = user.nickname;

      // 게임 시작 명령어 처리
      const isStartCommand = messageText === '!시작!';

      // 1. 메시지를 화면에 즉시 표시 (낙관적 UI 업데이트)
      const tempMessage = {
        id: `temp-${Date.now()}`,
        userId: currentUserId,
        displayName: currentUserNickname,
        text: messageText,
        isSystemMessage: false,
        timestamp: new Date(), // 임시 클라이언트 타임스탬프
        isPending: true,       // 전송 중 상태를 나타내는 플래그
        type: "game"
      };

      // 메시지 추가 (함수형 업데이트 사용)
      setMessages(prevMessages => [...prevMessages, tempMessage]);

      // 입력창 비우기
      setChatInput('');

      // 2. 실제 Firestore에 데이터 전송 및 LLM 로직 처리 (백그라운드에서 실행)
      const userMessage = {
        userId: currentUserId,
        displayName: currentUserNickname,
        text: messageText,
        isSystemMessage: false,
        timestamp: serverTimestamp(),
        type: "game"
      };

      try {
        await addDoc(collection(db, `worlds/${currentWorld.id}/messages`), userMessage);
      } catch (dbError) {
        console.error("메시지 저장 중 오류:", dbError);
        // 메시지 저장 실패 시에도 계속 진행 (UI에는 이미 표시됨)
      }

      // 게임 시작 명령어 처리
      if (isStartCommand && !currentWorld.gameStarted) {
        try {
          // 월드 문서 업데이트하여 게임 시작 상태로 변경
          await setDoc(doc(db, 'worlds', currentWorld.id), {
            gameStarted: true
          }, { merge: true });

          // 시스템 메시지 추가
          const startMessage = {
            userId: 'SYSTEM',
            displayName: '시스템',
            text: `${currentUserNickname}님이 게임을 시작했습니다! 모험이 시작됩니다...`,
            isSystemMessage: true,
            timestamp: serverTimestamp(),
            type: "game"
          };
          await addDoc(collection(db, `worlds/${currentWorld.id}/messages`), startMessage);

          // 로컬 상태도 업데이트 (실시간 리스너가 있지만 즉시 반영을 위해)
          setCurrentWorld(prev => ({...prev, gameStarted: true}));
        } catch (startError) {
          console.error("게임 시작 처리 중 오류:", startError);
        }
      }

      // --- Game Logic Trigger ---
      if (currentWorld.gameStarted || isStartCommand) {
        try {
          // 메시지 목록에서 현재 메시지를 포함하여 최근 20개 가져오기
          // 낙관적 업데이트된 메시지를 포함하기 위해 현재 상태에서 가져옴
          const allMessages = [...messages, tempMessage].slice(-20);
          const importantMessages = summarizeMessages(allMessages);
          const relevantPlayers = extractRelevantPlayers(players, currentUserId);
          const playersInfo = relevantPlayers.map(p => JSON.stringify({id: p.id, ...p})).join('\n');

          // 이전 LLM 응답도 프롬프트에 포함(있으면)
          const prevLlmSummary = lastLlmResponse && lastLlmResponse.chatMessage ?
              `\n[이전 장면 요약]\n${lastLlmResponse.chatMessage}\n` : '';

          // 게임 시작 명령어인 경우 특별한 프롬프트 사용
          const prompt = isStartCommand ?
              `새로운 모험이 시작되었습니다! "${currentWorld.name}" 세계에 대한 소개와 현재 플레이어들이 처한 상황을 설명해주세요. 흥미로운 시작점을 만들어주세요.` :
              `${prevLlmSummary}[중요 채팅]\n${importantMessages}\n\n[관련 플레이어]\n${playersInfo}\n\n[유저 행동]\n${currentUserNickname}: ${messageText}`;

          // 복잡한 명령/서사면 더 큰 모델 사용 (현재는 동일하지만 향후 확장성 고려)
          const isStory = messageText.length > 30 || messageText.includes('장면') || messageText.includes('스토리') || isStartCommand;
          const model = "llama3-70b-8192"; // 모든 경우에 동일한 모델 사용

          const llmResponse = await callSelectedLlmApi(prompt, currentWorld.systemPrompt, model);
          setLastLlmResponse(llmResponse); // 이전 응답 저장
          await processLlmResponse(llmResponse);
        } catch (llmError) {
          console.error("LLM 처리 중 오류:", llmError);
          // LLM 오류 발생 시 사용자에게 알림
          const errorMessage = {
            userId: 'SYSTEM',
            displayName: '시스템',
            text: `[오류: 응답 생성 중 문제가 발생했습니다. 다시 시도해주세요.]`,
            isSystemMessage: true,
            timestamp: serverTimestamp(),
            type: "game"
          };
          try {
            await addDoc(collection(db, `worlds/${currentWorld.id}/messages`), errorMessage);
          } catch (e) {
            console.error("오류 메시지 저장 실패:", e);
          }
        }
      }
      // 게임이 시작되지 않았고 시작 명령어도 아닌 경우 아무 작업도 하지 않음 (자유 채팅)
    } catch (error) {
      console.error("메시지 전송 중 오류:", error);
    } finally {
      setIsSending(false);
    }
  };

  // === (2) 일반 채팅 전송 함수 추가 ===
  const handleSendFreeMessage = async () => {
    if (!db || !user || !currentWorld || !freeChatInput.trim()) return;
    const freeMessage = {
      userId: user.id,
      displayName: user.nickname,
      text: freeChatInput.trim(),
      isSystemMessage: false,
      timestamp: serverTimestamp(),
      type: "free"
    };
    await addDoc(collection(db, `worlds/${currentWorld.id}/messages`), freeMessage);
    setFreeChatInput('');
  };

  const processLlmResponse = async (llmResponse) => {
    if (!db || !currentWorld) return;

    try {
      // 응답 유효성 검사
      if (!llmResponse || typeof llmResponse !== 'object') {
        console.error("유효하지 않은 LLM 응답:", llmResponse);
        return;
      }

      const batch = writeBatch(db);
      let hasValidOperations = false;

      // Add LLM chat response
      if (llmResponse.chatMessage && typeof llmResponse.chatMessage === 'string') {
        const llmMessage = {
          userId: 'LLM',
          displayName: '', // No display name for system messages
          text: llmResponse.chatMessage,
          isSystemMessage: true,
          timestamp: serverTimestamp(),
          type: "game" // 명시적으로 게임 메시지로 표시
        };
        const llmMessageRef = doc(collection(db, `worlds/${currentWorld.id}/messages`));
        batch.set(llmMessageRef, llmMessage);
        hasValidOperations = true;
      } else {
        console.warn("LLM 응답에 유효한 chatMessage가 없습니다:", llmResponse);
      }

      // Update player data
      if (Array.isArray(llmResponse.playerUpdates) && llmResponse.playerUpdates.length > 0) {
        for (const update of llmResponse.playerUpdates) {
          // Ensure the update has a target userId and valid updates object
          if (update && update.userId && update.updates && typeof update.updates === 'object') {
            // 플레이어 존재 여부 확인
            try {
              const playerDoc = await getDoc(doc(db, `worlds/${currentWorld.id}/players`, update.userId));
              if (playerDoc.exists()) {
                const playerRef = doc(db, `worlds/${currentWorld.id}/players`, update.userId);

                // 업데이트 데이터 정제 (null, undefined 제거)
                const cleanUpdates = Object.entries(update.updates)
                    .filter(([_, value]) => value !== null && value !== undefined)
                    .reduce((obj, [key, value]) => {
                      obj[key] = value;
                      return obj;
                    }, {});

                if (Object.keys(cleanUpdates).length > 0) {
                  batch.set(playerRef, cleanUpdates, { merge: true });
                  hasValidOperations = true;
                }
              } else {
                console.warn(`플레이어 ID ${update.userId}가 존재하지 않습니다.`);
              }
            } catch (playerCheckError) {
              console.error("플레이어 확인 중 오류:", playerCheckError);
            }
          } else {
            console.warn("유효하지 않은 플레이어 업데이트:", update);
          }
        }
      }

      // 유효한 작업이 있을 때만 batch 커밋
      if (hasValidOperations) {
        await batch.commit();
      } else {
        console.warn("처리할 유효한 LLM 응답이 없습니다.");
      }
    } catch (error) {
      console.error("LLM 응답 처리 중 오류:", error);

      // 오류 발생 시 사용자에게 알림
      try {
        const errorMessage = {
          userId: 'SYSTEM',
          displayName: '시스템',
          text: `[오류: 응답 처리 중 문제가 발생했습니다.]`,
          isSystemMessage: true,
          timestamp: serverTimestamp(),
          type: "game"
        };
        await addDoc(collection(db, `worlds/${currentWorld.id}/messages`), errorMessage);
      } catch (msgError) {
        console.error("오류 메시지 저장 실패:", msgError);
      }
    }
  };

  // 월드 및 하위 데이터 완전 삭제 함수
  const handleDeleteWorld = async (world) => {
    if (!db || !world) return;
    setIsDeletingWorld(true);
    try {
      // 1. messages 컬렉션 삭제
      const messagesCol = collection(db, `worlds/${world.id}/messages`);
      const messagesSnap = await getDocs(messagesCol);
      for (const docSnap of messagesSnap.docs) {
        await deleteDoc(docSnap.ref);
      }
      // 2. players 컬렉션 삭제
      const playersCol = collection(db, `worlds/${world.id}/players`);
      const playersSnap = await getDocs(playersCol);
      for (const docSnap of playersSnap.docs) {
        await deleteDoc(docSnap.ref);
      }
      // 3. (필요시 추가 컬렉션 삭제)
      // 4. 월드 문서 삭제
      await deleteDoc(doc(db, 'worlds', world.id));
      setDeleteTargetWorld(null);
    } catch (e) {
      alert('월드 삭제 중 오류 발생: ' + e.message);
    }
    setIsDeletingWorld(false);
  };

  // --- 렌더링 로직 ---
  if (isLoading) {
    return <div className="loading-screen">로딩 중...</div>;
  }

  // Show login modal if a world is selected but user is not logged in
  if (currentWorld && showLogin) {
    return (
        <div className="modal-backdrop">
          <div className="login-modal">
            <h2>{currentWorld.name}에 입장</h2>
            <p>닉네임과 비밀번호를 입력하세요.</p>
            <input
                type="text"
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (nicknameInput.trim() && passwordInputRef.current) {
                      passwordInputRef.current.focus();
                    }
                  }
                }}
                placeholder="닉네임"
                ref={nicknameInputRef}
            />
            <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="비밀번호"
                ref={passwordInputRef}
            />
            {loginError && <p className="error-text">{loginError}</p>}
            <div className="modal-actions">
              <button onClick={handleLogin} disabled={isLoading}>
                {isLoading ? '입장 중...' : '입장 / 등록'}
              </button>
              <button onClick={() => { setCurrentWorld(null); setShowLogin(false); }} disabled={isLoading}>취소</button>
            </div>
          </div>
        </div>
    );
  }

  // Show lobby if no world is selected
  if (!currentWorld) {
    return (
        <div className="lobby">
          <h1>텍스트 어드벤처 로비</h1>
          {/* LLM 선택 드롭다운 */}
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="llm-select" style={{ marginRight: 8 }}>LLM 선택:</label>
            <select id="llm-select" value={llmProvider} onChange={e => setLlmProvider(e.target.value)}>
              <option value="groq">Groq (llama3)</option>
              <option value="huggingface">Hugging Face</option>
            </select>
          </div>
          <div className="create-world">
            <input
                type="text"
                value={newWorldName}
                onChange={(e) => setNewWorldName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateWorld()}
                placeholder="새 월드 이름 입력"
                ref={newWorldInputRef}
            />
            <button onClick={handleCreateWorld}>월드 생성</button>
          </div>
          <div className="world-list">
            {worlds.map(world => (
                <div key={world.id} className="world-item">
                  <span>{world.name}</span>
                  <button onClick={() => handleJoinWorld(world)}>입장</button>
                  <button style={{marginLeft:8, background:'#f04747'}} onClick={() => setDeleteTargetWorld(world)} disabled={isDeletingWorld}>삭제</button>
                </div>
            ))}
          </div>
          {/* 월드 삭제 확인 모달 */}
          {deleteTargetWorld && (
              <div className="modal-backdrop">
                <div className="login-modal">
                  <h2>월드 삭제</h2>
                  <p>정말로 &quot;{deleteTargetWorld.name}&quot; 월드를 완전히 삭제하시겠습니까?<br/>(관련 모든 데이터가 영구히 삭제됩니다)</p>
                  <div className="modal-actions">
                    <button onClick={() => handleDeleteWorld(deleteTargetWorld)} disabled={isDeletingWorld} style={{background:'#f04747'}}>
                      {isDeletingWorld ? '삭제 중...' : '완전 삭제'}
                    </button>
                    <button onClick={() => setDeleteTargetWorld(null)} disabled={isDeletingWorld}>취소</button>
                  </div>
                </div>
              </div>
          )}
        </div>
    );
  }

  const displayedPlayer = players[displayedPlayerIndex];

  return (
      <div className="app-container">
        <div className="game-area">
          <div className="chat-window">
            {messages
                .filter(msg => {
                  // 게임 메시지 필터링: 시스템 메시지이거나 명시적으로 게임 타입인 메시지
                  return msg.isSystemMessage || msg.type === "game";
                })
                .map(msg => (
                    <div
                        key={msg.id}
                        className={`message ${msg.isSystemMessage ? 'system' : 'user'} ${msg.userId === user?.id ? 'mine' : ''} ${msg.isPending ? 'pending' : ''}`}
                    >
                      {!msg.isSystemMessage && <span className="display-name">{msg.displayName || '알 수 없음'}</span>}
                      <p className="text">{msg.text}</p>
                    </div>
                ))
            }
            {!currentWorld.gameStarted && (
                <div className="system-info">
                  <p>환영합니다 {currentWorld.name}. 게임이 아직 시작되지 않았습니다. 자유롭게 채팅하세요.</p>
                  <p>모험을 시작하려면 <strong>!시작!</strong>을 입력하세요!</p>
                </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input">
            <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isSending && handleSendMessage()}
                placeholder="무엇을 하시겠습니까? 시작하려면 !시작!을 입력하세요..."
                disabled={isSending}
                ref={chatInputRef}
            />
            <button onClick={handleSendMessage} disabled={isSending}>
              {isSending ? '...' : '전송'}
            </button>
          </div>
        </div>
        <div className="sidebar">
          <div className="character-sheet">
            <div className="sheet-header">
              <button onClick={() => setDisplayedPlayerIndex(i => (i - 1 + players.length) % players.length)} disabled={players.length < 2}>◀</button>
              <h2>인물정보</h2>
              <button onClick={() => setDisplayedPlayerIndex(i => (i + 1) % players.length)} disabled={players.length < 2}>▶</button>
            </div>
            {displayedPlayer ? (
                <div>
                  <p><strong>이름:</strong> {displayedPlayer.name} {displayedPlayer.id === user.id && "(나의 정보)"}</p>
                  <p><strong>설명:</strong> {displayedPlayer.description}</p>
                  <p><strong>레벨:</strong> {displayedPlayer.level}</p>
                  <p><strong>능력치:</strong> {JSON.stringify(displayedPlayer.stats)}</p>
                  <p><strong>인벤토리:</strong> {displayedPlayer.inventory?.join(', ')}</p>
                </div>
            ) : (
                <p>플레이어 데이터가 없습니다. 누군가 !시작!을 입력하면 게임이 시작됩니다.</p>
            )}
          </div>
          <div className="player-list">
            <h2>플레이어 목록</h2>
            <ul>
              {players.map(p => (
                  <li key={p.id}>{p.nickname || p.id}</li>
              ))}
            </ul>
          </div>
          {/* === 일반 채팅창 추가 === */}
          <div className="free-chat-section">
            <h2>일반 채팅</h2>
            <div className="free-chat-window">
              {messages
                  .filter(msg => {
                    // 자유 채팅 메시지 필터링:
                    // 1. 명시적으로 "free" 타입인 메시지
                    if (msg.type === "free") return true;

                    // 2. 타입이 없고, 시스템 메시지가 아니며, 다음 조건 중 하나를 만족:
                    //    - 게임이 시작되지 않았거나
                    //    - 메시지가 '!'로 시작하지 않음
                    if (!msg.type && !msg.isSystemMessage) {
                      return !currentWorld.gameStarted || !msg.text.startsWith('!');
                    }

                    return false;
                  })
                  .map(msg => (
                      <div
                          key={msg.id}
                          className={`free-message ${msg.userId === user?.id ? 'mine' : ''}`}
                      >
                        <span className="display-name">{msg.displayName || '알 수 없음'}</span>
                        <span className="text">{msg.text}</span>
                      </div>
                  ))
              }
              <div ref={freeChatEndRef} />
            </div>
            <div className="free-chat-input">
              <input
                  type="text"
                  value={freeChatInput}
                  onChange={e => setFreeChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendFreeMessage()}
                  placeholder="자유롭게 대화하세요..."
              />
              <button onClick={handleSendFreeMessage}>전송</button>
            </div>
          </div>
          <button className="back-to-lobby" onClick={() => setCurrentWorld(null)}>로비로 돌아가기</button>
        </div>
      </div>
  );
}

const GlobalStyles = () => (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');

        body {
            font-family: 'Noto Sans KR', sans-serif;
            background-color: #1a1a1d;
            color: #f5f5f5;
            margin: 0;
            padding: 0;
        }

        .loading-screen {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-size: 2rem;
        }

        .lobby {
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background-color: #2c2f33;
            border-radius: 8px;
        }

        .lobby h1 { text-align: center; color: #7289da; }
        .create-world, .world-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .create-world input, .world-item span { flex-grow: 1; margin-right: 10px; }
        input { padding: 10px; border-radius: 4px; border: 1px solid #4f545c; background-color: #40444b; color: #f5f5f5; }
        button { padding: 10px 15px; border: none; border-radius: 4px; background-color: #7289da; color: white; cursor: pointer; }
        button:hover { background-color: #677bc4; }
        button:disabled { background-color: #5a68a5; cursor: not-allowed; }

        .app-container {
            display: flex;
            height: 100vh;
            min-width: 0;
        }

        .game-area {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            padding: 20px;
            min-width: 0;
        }

        .chat-window {
            flex-grow: 1;
            overflow-y: auto;
            background-color: #2c2f33;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 15px;
            min-height: 0;
            /* height: calc(100vh - 120px); // 필요시 유지 */
        }

        .message { margin-bottom: 12px; }
        .message .display-name { font-weight: bold; font-size: 0.9rem; color: #99aab5; }
        .message.mine .display-name { color: #7289da; }
        .message.system .display-name { color: #f0b90b; }
        .message .text { margin: 4px 0 0 0; line-height: 1.4; }
        .message.system .text { font-style: italic; color: #f5f5f5; }

        .chat-input { display: flex; }
        .chat-input input { flex-grow: 1; margin-right: 10px; }

        .sidebar {
            width: 300px;
            background-color: #23272a;
            padding: 20px;
            overflow-y: auto;
            min-width: 300px;
            max-width: 300px;
        }

        .character-sheet {
            background-color: #2c2f33;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            max-height: 300px;
            overflow-y: auto;
            width: 100%;
            min-width: 0;
        }

        .sidebar h2 { margin-top: 0; color: #7289da; border-bottom: 1px solid #4f545c; padding-bottom: 10px; }
        .character-sheet p { margin: 5px 0; font-size: 0.9rem; }
        .character-sheet p strong { color: #99aab5; }
        .player-list ul { list-style: none; padding: 0; }
        .player-list li { padding: 5px 0; }

        /* New Styles */
        .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; }
        .login-modal { background-color: #2c2f33; padding: 25px; border-radius: 8px; width: 90%; max-width: 400px; }
        .login-modal h2 { margin-top: 0; }
        .login-modal input { width: calc(100% - 22px); margin-bottom: 10px; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        .error-text { color: #f04747; font-size: 0.9rem; }
        .sheet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .sheet-header h2 { margin: 0; padding: 0; border: none; }
        .system-info { text-align: center; padding: 20px; margin: 10px; background-color: #23272a; border-radius: 8px; }
        .system-info p { margin: 5px 0; }
        .back-to-lobby { width: 100%; margin-top: 20px; background-color: #4f545c; }
        .message.system {
            background: rgba(255, 230, 120, 0.18);
            border-left: 5px solid #f0b90b;
            color: #ffe066;
            font-style: italic;
            font-weight: 600;
            padding: 10px 16px;
            margin: 10px 0;
            border-radius: 6px;
            box-shadow: 0 1px 4px 0 rgba(240,185,11,0.08);
            position: relative;
        }
        .message.system .text::before {
            /* content: "★ 시스템"; */
            color: #f0b90b;
            font-size: 0.85em;
            font-weight: bold;
            margin-right: 8px;
            letter-spacing: 1px;
        }
        .message.user {
            background: rgba(60, 60, 80, 0.18);
            border-radius: 6px;
            padding: 8px 12px;
            margin: 8px 0;
        }

        /* ======================================================================= */
        /* <<< ✨ 추가된 CSS 스타일 ✨ >>>                                         */
        /* ======================================================================= */
        .message.pending {
            opacity: 0.6;
        }

        /*
        .free-chat-section { margin-top: 30px; }
        .free-chat-window {
          background: #23272a;
          border-radius: 8px;
          padding: 10px;
          height: 180px;
          overflow-y: auto;
          margin-bottom: 8px;
        }
        .free-message { margin-bottom: 8px; font-size: 0.95em; }
        .free-message .display-name { color: #99aab5; font-weight: bold; margin-right: 6px; }
        .free-message.mine .display-name { color: #7289da; }
        .free-chat-input { display: flex; }
        .free-chat-input input { flex: 1; margin-right: 8px; }
        */

    `}</style>
);

function AppLiteWithStyles() {
  return (
      <>
        <GlobalStyles />
        <AppLite />
      </>
  );
}

export default AppLiteWithStyles;