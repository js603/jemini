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

const callLlmApi = async (prompt, systemPrompt, model = "gemini-1.5-flash") => {
    // 참고: API 키가 클라이언트에 노출되어 있습니다. 실제 서비스에서는 백엔드에서 처리해야 합니다.
    const mainApiKey = 'AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8';
    const backup1ApiKey = 'AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84'; // App_bac.jsx에서 가져온 백업 키
    const backup2ApiKey = 'AIzaSyCH-v67rjijFO_So2mTDj_-qIy2aNJYgz0'; // App_bac.jsx에서 가져온 백업 키
    const backup3ApiKey = 'AIzaSyCHq0UsgZ9EiGQavwpHE2uEx3TkGWCEEx4'; // App_bac.jsx에서 가져온 백업 키

    const payload = {
        contents: [
            { role: "user", parts: [{ text: prompt }] }
        ],
        generationConfig: {
            responseMimeType: "application/json",
        },
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        }
    };

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1000; // 1 second initial delay

    for (let i = 0; i <= MAX_RETRIES; i++) {
        try {
            let response;
            let currentApiKey = mainApiKey;
            let url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentApiKey}`;

            // First attempt with main API key
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } catch (e) {
                console.warn("메인 API 키 호출 중 네트워크 오류 발생:", e);
                response = { ok: false, status: 500 }; // Treat network errors as transient server errors for retry
            }

            // If main key failed, try backup key
            if (!response.ok) {
                console.warn("메인 API 키 실패 (HTTP 상태 코드 또는 네트워크 오류), 백업 API 키로 재시도합니다.");
                currentApiKey = backup1ApiKey;
                url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentApiKey}`;
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } catch (e) {
                    console.warn("백업 API 키 호출 중 네트워크 오류 발생:", e);
                    response = { ok: false, status: 500 }; // Treat network errors as transient server errors for retry
                }
            }

            if (!response.ok) {
                console.warn("두 번째 백업 API 키 호출 실패, 세 번째 백업 API 키로 재시도합니다.");
                currentApiKey = backup2ApiKey;
                url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentApiKey}`;
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } catch (e) {
                    console.warn("세 번째 백업 API 키 호출 중 네트워크 오류 발생:", e);
                    response = { ok: false, status: 500 }; // Treat network errors as transient server errors for retry
                }
            }

            if (!response.ok) {
                console.warn("세 번째 백업 API 키 호출 실패, 마지막 백업 API 키로 재시도합니다.");
                currentApiKey = backup3ApiKey;
                url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${currentApiKey}`;
                try {
                    response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } catch (e) {
                    console.warn("마지막 백업 API 키 호출 중 네트워크 오류 발생:", e);
                    response = { ok: false, status: 500 }; // Treat network errors as transient server errors for retry
                }
            }

            // Check response status
            if (!response.ok) {
                if (response.status === 429) {
                    // Specific message for 429, no retry
                    return {
                        chatMessage: `[시스템 오류: API 사용 한도 초과. 잠시 후 다시 시도하거나, API 할당량을 확인해주세요.]`,
                        playerUpdates: []
                    };
                } else if (response.status >= 500 || response.status === 408) { // 5xx errors, Request Timeout
                    console.warn(`LLM API 호출 실패 (상태: ${response.status}). 재시도 (${i + 1}/${MAX_RETRIES})...`);
                    if (i < MAX_RETRIES) {
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * Math.pow(2, i)));
                        continue; // Retry
                    } else {
                        // Max retries reached for transient error
                        return {
                            chatMessage: `[시스템 오류: 서버 문제로 LLM 응답을 받을 수 없습니다. 잠시 후 다시 시도해주세요. (상태: ${response.status})]`,
                            playerUpdates: []
                        };
                    }
                } else {
                    // Other client-side errors (e.g., 400, 401, 403)
                    return {
                        chatMessage: `[시스템 오류: LLM API 호출 중 오류 발생. (상태: ${response.status})]`,
                        playerUpdates: []
                    };
                }
            }

            // If response is OK, parse and return
            const result = await response.json();
            const llmOutputText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // 기본 정리 및 파싱
            const cleanedOutput = llmOutputText.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanedOutput);

        } catch (error) {
            // This catch block will only be hit if JSON.parse fails or other unexpected errors
            console.error("LLM API 호출 중 예상치 못한 오류:", error);
            return {
                chatMessage: `[시스템 오류: ${error.message}]`,
                playerUpdates: []
            };
        }
    }
    // Should not reach here, but as a fallback
    return {
        chatMessage: `[시스템 오류: 알 수 없는 LLM API 호출 오류.]`,
        playerUpdates: []
    };
}

const generateSystemPrompt = (worldConcept) => {
    return `
        ### 페르소나 (Persona)
        당신은 전문 게임 마스터(GM)이자 뛰어난 이야기꾼입니다. 당신은 플레이어들과 함께 실시간으로 텍스트 기반 롤플레잉 게임을 만들어갑니다. 당신의 무대는 "${worldConcept}"입니다.

        ### 핵심 임무 (Core Task)
        1.  **서사 진행:** 플레이어들의 채팅을 기반으로 흥미로운 이야기를 만들고, 그 결과를 채팅 메시지로 전달합니다.
        2.  **캐릭터 관리:** 이야기의 흐름에 따라 플레이어의 상태(능력치, 아이템 등)를 업데이트하고, 그 결과를 데이터로 반환합니다.

        ### 절대적 지시사항 (Absolute Instructions)
        1.  **오직 JSON만 출력:** 당신의 응답은 반드시 아래에 명시된 JSON 구조를 따라야 합니다. 설명, 마크다운, 기타 텍스트는 절대 포함하지 마십시오.
        2.  **한국어 사용:** 모든 생성 텍스트는 반드시 한국어로 작성해야 합니다.
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

    // Get or create a persistent user ID from localStorage
    useEffect(() => {
        let userId = localStorage.getItem('text-adventure-user-id');
        if (!userId) {
            userId = crypto.randomUUID();
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
        if (!db || !currentWorld) {
            setMessages([]);
            setPlayers([]);
            return;
        }

        // 월드 문서 리스너 추가 (gameStarted 등 실시간 반영)
        const worldDocRef = doc(db, 'worlds', currentWorld.id);
        const unsubscribeWorld = onSnapshot(worldDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setCurrentWorld(prev => ({
                    ...prev,
                    ...docSnap.data(),
                    id: docSnap.id, // id 유지
                }));
            }
        });

        const messagesQuery = query(collection(db, `worlds/${currentWorld.id}/messages`), orderBy('timestamp'));
        const messagesUnsub = onSnapshot(messagesQuery, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        const playersQuery = query(collection(db, `worlds/${currentWorld.id}/players`));
        const playersUnsub = onSnapshot(playersQuery, (snapshot) => {
            setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => {
            unsubscribeWorld();
            messagesUnsub();
            playersUnsub();
        };
    }, [db, currentWorld && currentWorld.id]);

    // 채팅 스크롤 맨 아래로
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        if (chatInputRef.current) {
            chatInputRef.current.focus();
        }
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

    // 비밀번호 입력창 자동 포커스(닉네임 입력 후 엔터 시)
    // 비밀번호 입력창 자동 포커스(닉네임 입력 후 엔터 시)

    // --- 핸들러 ---
    const handleCreateWorld = async () => {
        if (!db || !newWorldName.trim()) return;
        setIsLoading(true);
        try {
            const newWorldRef = await addDoc(collection(db, 'worlds'), {
                name: newWorldName,
                createdAt: serverTimestamp(),
                systemPrompt: generateSystemPrompt(newWorldName),
            });
            setCurrentWorld({ id: newWorldRef.id, name: newWorldName, systemPrompt: generateSystemPrompt(newWorldName) });
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

    const handleLogin = async () => {
        if (!db || !user || !currentWorld || !nicknameInput.trim() || !passwordInput.trim()) {
            setLoginError("Nickname and password cannot be empty.");
            return;
        }

        setLoginError('');
        setIsLoading(true);

        console.log("현재 user.id:", user.id);

        const playerRef = doc(db, `worlds/${currentWorld.id}/players`, user.id);
        const playerDoc = await getDoc(playerRef);

        if (playerDoc.exists()) {
            // Player exists, check password
            if (playerDoc.data().password === passwordInput) {
                setUser({ ...user, nickname: playerDoc.data().nickname });
                setShowLogin(false);
            } else {
                setLoginError("Incorrect password.");
            }
        } else {
            // New player, check for nickname uniqueness
            const playersQuery = query(collection(db, `worlds/${currentWorld.id}/players`), where("nickname", "==", nicknameInput));
            const querySnapshot = await getDocs(playersQuery);
            if (!querySnapshot.empty) {
                setLoginError("This nickname is already taken.");
            } else {
                // Create new player
                const newPlayerData = {
                    id: user.id,
                    nickname: nicknameInput,
                    password: passwordInput, // In a real app, this should be hashed!
                    // Initial empty stats, LLM will populate them
                    name: nicknameInput, 
                    description: "A new adventurer.",
                    level: 1,
                    stats: {},
                    inventory: []
                };
                await setDoc(playerRef, newPlayerData);
                setUser({ ...user, nickname: nicknameInput });
                setShowLogin(false);

                // --- 새 플레이어 등장 LLM 처리 ---
                if (currentWorld.gameStarted) {
                    // 최근 시나리오 요약, 기존 플레이어 정보, 새 플레이어 닉네임 등 프롬프트 구성
                    const recentMessages = messages.slice(-20);
                    const importantMessages = summarizeMessages(recentMessages);
                    const playersInfo = players.map(p => JSON.stringify({id: p.id, ...p})).join('\n');
                    const prevLlmSummary = lastLlmResponse && lastLlmResponse.chatMessage ? `\n[이전 장면 요약]\n${lastLlmResponse.chatMessage}\n` : '';
                    const prompt = `${prevLlmSummary}[중요 채팅]\n${importantMessages}\n\n[기존 플레이어]\n${playersInfo}\n\n[새 플레이어]\n닉네임: ${nicknameInput}, ID: ${user.id}\n\n새로운 플레이어가 게임에 입장했습니다. 이 인물을 현재 시나리오에 자연스럽게 등장시키고, 캐릭터 시트(이름, 설명, 능력치, 컨셉 등)를 생성하세요. 등장 연출도 포함하세요. 반드시 JSON으로만 응답하세요.`;
                    const llmResponse = await callLlmApi(prompt, currentWorld.systemPrompt, "gemini-1.5-flash");
                    setLastLlmResponse(llmResponse);
                    await processLlmResponse(llmResponse);
                }
            }
        }
        setIsLoading(false);
    };

    const handleSendMessage = async () => {
        if (!db || !user || !currentWorld || !chatInput.trim()) return;

        const messageText = chatInput.trim();
        setChatInput('');
        setIsSending(true);

        const userMessage = {
            userId: user.id,
            displayName: user.nickname,
            text: messageText,
            isSystemMessage: false,
            timestamp: serverTimestamp(),
        };

        await addDoc(collection(db, `worlds/${currentWorld.id}/messages`), userMessage);

        // --- Game Logic Trigger ---
        if (messageText === '!시작!' && !currentWorld.gameStarted) {
            // Start the game
            const worldRef = doc(db, 'worlds', currentWorld.id);
            await setDoc(worldRef, { gameStarted: true }, { merge: true });

            // 모든 플레이어 정보를 닉네임, ID로 나열
            const allPlayerInfos = players.map(p => `닉네임: ${p.nickname}, ID: ${p.id}`).join('\n');
            const startPrompt = `\n게임이 시작되었습니다! 다음 플레이어들이 참가했습니다:\n${allPlayerInfos}\n\n[중요] 아래 지시를 반드시 따르세요:\n- playerUpdates 배열에 모든 참가자(userId별로) 각각의 캐릭터 시트(이름, 설명, 능력치, 컨셉 등)를 반드시 포함하세요.\n- 각 참가자마다 playerUpdates에 한 번씩 userId와 updates를 넣으세요.\n- 등장 연출(서사)은 chatMessage에 작성하세요.\n- 반드시 JSON만 반환하세요. 설명, 마크다운, 기타 텍스트는 절대 포함하지 마세요.\n`;
            // 복잡한 서사이므로 flash 모델 사용
            const llmResponse = await callLlmApi(startPrompt, currentWorld.systemPrompt, "gemini-1.5-flash");
            setLastLlmResponse(llmResponse); // 이전 응답 저장
            await processLlmResponse(llmResponse);

        } else if (currentWorld.gameStarted) {
            // 컨텍스트 요약 및 관련 정보만 추출
            const importantMessages = summarizeMessages(messages.slice(-20));
            const relevantPlayers = extractRelevantPlayers(players, user.id);
            const playersInfo = relevantPlayers.map(p => JSON.stringify({id: p.id, ...p})).join('\n');
            // 이전 LLM 응답도 프롬프트에 포함(있으면)
            const prevLlmSummary = lastLlmResponse && lastLlmResponse.chatMessage ? `\n[이전 장면 요약]\n${lastLlmResponse.chatMessage}\n` : '';
            const prompt = `${prevLlmSummary}[중요 채팅]\n${importantMessages}\n\n[관련 플레이어]\n${playersInfo}\n\n[유저 행동]\n${userMessage.displayName}: ${messageText}`;

            // 복잡한 명령/서사면 pro, 단순 상태변화면 flash
            const isStory = messageText.length > 30 || messageText.includes('장면') || messageText.includes('스토리');
            const model = isStory ? "gemini-1.5-flash" : "gemini-1.5-flash";

            const llmResponse = await callLlmApi(prompt, currentWorld.systemPrompt, model);
            setLastLlmResponse(llmResponse); // 이전 응답 저장
            await processLlmResponse(llmResponse);
        }
        // If game has not started and it's not the start command, do nothing (free chat).

        setIsSending(false);
    };

    const processLlmResponse = async (llmResponse) => {
        if (!db || !currentWorld) return;

        const batch = writeBatch(db);

        // Add LLM chat response
        if (llmResponse.chatMessage) {
            const llmMessage = {
                userId: 'LLM',
                displayName: '', // No display name for system messages
                text: llmResponse.chatMessage,
                isSystemMessage: true,
                timestamp: serverTimestamp(),
            };
            const llmMessageRef = doc(collection(db, `worlds/${currentWorld.id}/messages`));
            batch.set(llmMessageRef, llmMessage);
        }

        // Update player data
        if (llmResponse.playerUpdates && llmResponse.playerUpdates.length > 0) {
            llmResponse.playerUpdates.forEach(update => {
                // Ensure the update has a target userId
                if (update.userId) {
                    const playerRef = doc(db, `worlds/${currentWorld.id}/players`, update.userId);
                    batch.set(playerRef, update.updates, { merge: true });
                }
            });
        }

        await batch.commit();
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
                    {messages.map(msg => (
                        <div key={msg.id} className={`message ${msg.isSystemMessage ? 'system' : 'user'} ${msg.userId === user.id ? 'mine' : ''}` } >
                            {!msg.isSystemMessage && <span className="display-name">{msg.displayName}</span>}
                            <p className="text">{msg.text}</p>
                        </div>
                    ))}
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

