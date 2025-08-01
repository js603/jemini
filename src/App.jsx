import React, { useState, useEffect, useRef } from 'react';

// Using standard package paths for Firebase imports to resolve the "Dynamic require" error.
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';


// --- 아이콘 컴포넌트 ---
const SendIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
    </svg>
);
const QuoteIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 2v6c0 7 4 8 7 8Z"/><path d="M14 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2h-4c-1.25 0-2 .75-2 2v6c0 7 4 8 7 8Z"/>
    </svg>
);
const UserIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
);
const SmileIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
    </svg>
);
const RefreshIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/>
    </svg>
);

// --- 컴포넌트: 스토리 로그 아이템 ---
const StoryLogItem = ({ item, onChoiceClick }) => {
    // 텍스트를 문단으로 분할하는 함수
    const formatNarrativeText = (text) => {
        // 두 개 이상의 연속된 줄바꿈을 문단 구분자로 사용
        const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());

        return paragraphs.map((paragraph, index) => (
            <div key={index} className={`${index > 0 ? 'mt-6' : ''}`}>
                <p className="text-white text-lg leading-relaxed">
                    {paragraph.trim().split('\n').map((line, lineIndex) => (
                        <span key={lineIndex}>
                            {line}
                            {lineIndex < paragraph.trim().split('\n').length - 1 && <br />}
                        </span>
                    ))}
                </p>
            </div>
        ));
    };

    if (item.type === 'narrative') {
        return (
            <div className="w-full mx-auto mb-8">
                <div className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl p-10 shadow-2xl border border-white border-opacity-10">
                    <div className="prose prose-lg prose-invert max-w-none">
                        {formatNarrativeText(item.text)}
                    </div>
                </div>
            </div>
        );
    }

    if (item.type === 'choice') {
        return (
            <div className="w-full mx-auto flex flex-col items-center my-10">
                <div className="mb-8">
                    <p className="text-base text-purple-300 font-semibold text-center opacity-90">
                        {item.speaker}
                    </p>
                </div>
                <div className="space-y-6 w-full">
                    {item.choices.map((choiceText, index) => (
                        <button
                            key={index}
                            onClick={() => onChoiceClick(choiceText)}
                            className="group w-full text-center transition-all duration-300 transform hover:scale-102 hover:-translate-y-1"
                        >
                            <div className="bg-gradient-to-r from-slate-800/70 to-slate-700/70 group-hover:from-slate-700/90 group-hover:to-slate-600/90 border border-slate-600 group-hover:border-purple-400 rounded-xl px-8 py-6 shadow-lg group-hover:shadow-purple-500/20 backdrop-blur-sm">
                                <div className="flex items-start space-x-4">
                                    
                                    <p className="text-white text-lg font-serif leading-relaxed flex-1">
                                        &#34;{choiceText}&#34;
                                    </p>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (item.type === 'user') {
        return (
            <div className="w-full mx-auto mb-6 flex justify-end">
                <div className="bg-gradient-to-r from-purple-600 to-purple-500 rounded-xl px-8 py-5 shadow-lg">
                    <p className="text-white text-lg leading-relaxed">{item.text}</p>
                </div>
            </div>
        );
    }

    return null;
};

// --- 컴포넌트: 하단 인터페이스 ---
const BottomInterface = ({ onSubmit, isProcessing, tendency, onResetData }) => {
    const [message, setMessage] = useState('');
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!message.trim() || isProcessing) return;
        onSubmit(message);
        setMessage('');
    };

    const handleResetClick = () => {
        setShowResetConfirm(true);
    };

    const handleConfirmReset = () => {
        onResetData();
        setShowResetConfirm(false);
    };

    const handleCancelReset = () => {
        setShowResetConfirm(false);
    };

    if (showResetConfirm) {
        return (
            <div className="w-full mx-auto">
                <div className="bg-red-900/80 backdrop-blur-sm rounded-lg p-6 shadow-lg border border-red-500">
                    <h3 className="text-white text-lg font-bold mb-4 text-center">데이터 초기화 확인</h3>
                    <p className="text-red-100 text-center mb-6">
                        모든 게임 진행 상황이 삭제되고 처음부터 다시 시작됩니다.<br/>
                        정말로 초기화하시겠습니까?
                    </p>
                    <div className="flex justify-center space-x-4">
                        <button
                            onClick={handleConfirmReset}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg transition-colors"
                        >
                            확인
                        </button>
                        <button
                            onClick={handleCancelReset}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
                        >
                            취소
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full mx-auto">
            <div className="text-center mb-2 flex justify-center items-center space-x-4">
                <p className="text-xs text-purple-300">현재 성향: <span className="font-bold">{tendency}</span></p>
                <button
                    onClick={handleResetClick}
                    className="flex items-center space-x-1 text-xs text-red-300 hover:text-red-200 transition-colors"
                    title="게임 데이터 초기화"
                >
                    <RefreshIcon className="w-4 h-4" />
                    <span>초기화</span>
                </button>
            </div>
            <form onSubmit={handleSubmit} className="flex items-center bg-slate-800/80 backdrop-blur-sm rounded-full p-3 shadow-inner border border-slate-700">
                <SmileIcon className="w-6 h-6 mx-3 text-gray-400" />
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={isProcessing ? "AI가 응답을 생성 중입니다..." : "메시지를 입력하세요."}
                    disabled={isProcessing}
                    className="flex-grow bg-transparent text-white placeholder-gray-500 focus:outline-none text-lg"
                />
                <QuoteIcon className="w-6 h-6 mx-3 text-gray-400 hover:text-white cursor-pointer transition-colors" />
                <UserIcon className="w-6 h-6 mx-3 text-gray-400 hover:text-white cursor-pointer transition-colors" />
                <button
                    type="submit"
                    disabled={isProcessing || !message.trim()}
                    className="bg-purple-600 hover:bg-purple-700 rounded-full p-3 ml-2 transition-colors disabled:bg-slate-600 disabled:opacity-50"
                >
                    <SendIcon className="w-5 h-5 text-white" />
                </button>
            </form>
        </div>
    );
};

// --- 메인 앱 컴포넌트 ---
export default function App() {
    const [log, setLog] = useState([]);
    const [playerTendency, setPlayerTendency] = useState('미정');
    const [isProcessing, setIsProcessing] = useState(true);
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    const scrollRef = useRef(null);
    const docRef = useRef(null);

    // --- Firebase 초기화 및 인증 ---
    useEffect(() => {
        const firebaseConfig = {
            apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
            authDomain: "text-adventure-game-cb731.firebaseapp.com",
            projectId: "text-adventure-game-cb731",
            storageBucket: "text-adventure-game-cb731.appspot.com",
            messagingSenderId: "1092941614820",
            appId: "1:1092941614820:web:5545f36014b73c268026f1"
        };

        try {
            const app = initializeApp(firebaseConfig);
            const auth = getAuth(app);
            const firestore = getFirestore(app);
            setDb(firestore);

            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        const token = user?.getIdTokenResult()?.token;
                        if (token) {
                            await signInWithCustomToken(auth, token);
                        } else {
                            await signInAnonymously(auth);
                        }
                    } catch (error) {
                        console.error("Authentication failed:", error);
                    }
                }
                setIsAuthReady(true);
            });
        } catch (error) {
            console.error("Firebase initialization error:", error);
        }
    }, []);

    // --- 데이터 로딩 및 동기화 ---
    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;

        const appId = "1:1092941614820:web:5545f36014b73c268026f1";
        docRef.current = doc(db, "artifacts", appId, "users", userId, "narrative-sessions", "main");

        const unsubscribe = onSnapshot(docRef.current, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setLog(data.log || []);
                setPlayerTendency(data.tendency || '미정');
            } else {
                startGame();
            }
            setIsProcessing(false);
        }, (error) => {
            console.error("Firestore snapshot error:", error);
            setIsProcessing(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, userId]);

    // --- 스크롤 제어 (개선된 자동 스크롤) ---
    useEffect(() => {
        if (scrollRef.current) {
            const scrollToBottom = () => {
                scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            };

            // 약간의 지연을 주어 DOM 업데이트 완료 후 스크롤
            const timeoutId = setTimeout(scrollToBottom, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [log, isProcessing]);


    // --- 데이터 초기화 함수 ---
    const resetGameData = async () => {
        if (!docRef.current) return;

        try {
            setIsProcessing(true);

            // Firestore 문서 삭제
            await deleteDoc(docRef.current);

            // 로컬 상태 초기화
            setLog([]);
            setPlayerTendency('미정');

            // 잠시 후 새 게임 시작 (onSnapshot이 문서 삭제를 감지하고 startGame을 호출할 것임)
            console.log("게임 데이터가 초기화되었습니다.");

        } catch (error) {
            console.error("데이터 초기화 실패:", error);
            setIsProcessing(false);

            // 오류 발생 시 직접 게임 재시작
            try {
                await startGame();
            } catch (startError) {
                console.error("게임 재시작 실패:", startError);
            }
        }
    };

// --- Gemini API 호출 ---
    const callGeminiAPI = async (currentLog, currentTendency) => {
        const mainApiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
        const backupApiKey = "AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84";

        const systemPrompt = `
        당신은 텍스트 기반 RPG의 게임 마스터(GM)입니다.
        배경 이야기: 『Let there be light』 당신이 그렇게 외치자 세상은 밝아졌고, 지구와 인류를 창조해냈습니다. 지금 눈 앞에 펼쳐진 이 푸른 지구를 관찰하는 당신, 어떻게 바꿔나가실 계획인가요? 공룡이 멸종하지 않은 지구는 어떤 모습일까요? 만약 인류가 불을 발견하지 못했다면? 어쩌면, 아직도 원시시대같은 삶을 살 수도 있습니다. 이 모든걸 내가 쓰는데로 바꿔나가는 지구 시뮬레이터!
        
        플레이어는 '창조주'입니다. 플레이어의 선택에 따라 흥미진진한 이야기를 만들어주세요.
        
        **스토리텔링 규칙:**
        1. 각 문단은 반드시 두 개의 줄바꿈(\n\n)으로 구분하여 작성하세요.
        2. 한 문단 안에서 문장들은 하나의 줄바꿈(\n)으로 구분하세요.
        3. 감정적 몰입도를 높이기 위해 섬세한 묘사와 장면 전환을 사용하세요.
        4. 시각적, 청각적, 촉각적 세부사항을 포함하여 생생한 장면을 연출하세요.
        5. 각 문단은 하나의 완결된 장면이나 상황을 담아야 합니다.
        6. 대화와 상황 묘사를 적절히 조합하여 드라마틱한 효과를 만들어주세요.
        7. 문단 구조 예시:
           "첫 번째 문단의 첫 번째 문장입니다.\n두 번째 문장으로 장면을 확장합니다.\n\n두 번째 문단이 시작됩니다.\n새로운 장면이나 상황을 묘사합니다.\n\n세 번째 문단에서 절정이나 결론을 맺습니다."
        
        **선택지 작성 규칙:**
        선택지는 단순한 행동이 아닌, 창조주로서의 구체적이고 상세한 의도와 방법을 포함해야 합니다.
        각 선택지는 다음과 같은 요소를 포함해야 합니다:
        1. 구체적인 행동 방법과 과정
        2. 창조주의 의도와 목적
        3. 예상되는 결과나 변화
        4. 과학적이거나 신화적인 설명
        
        **선택지 예시:**
        - "원시 미생물의 번성에 적합한 대기 조성을 위해, 산소 농도를 서서히 증가시키고 이산화탄소 농도를 점진적으로 감소시킨다."
        - "대기의 압력과 온도를 조절하여 액체 상태의 물이 지표면에 안정적으로 존재할 수 있는 환경을 만든다."
        - "지구 전체에 걸쳐 대기의 구성 비율을 균일하게 조절하여, 모든 대륙에서 생명체가 살기에 적합한 환경을 조성한다."
        - "태양으로부터의 복사열을 적절히 차단할 수 있는 오존층을 형성하여, 생명체를 유해한 자외선으로부터 보호한다."
        - "지각판의 움직임을 조절하여 안정적인 대륙을 형성하고, 화산 활동을 통해 필요한 미네랄을 지표면에 공급한다."
        
        각 선택지는 최소 15-30단어 이상의 상세한 설명을 포함해야 하며, 창조주의 권능과 지혜를 보여주는 구체적인 방법론을 제시해야 합니다.
        
        **성향 시스템:**
        당신은 플레이어의 선택과 입력 내용을 분석하여 그의 성향을 판단해야 합니다. 성향은 '자비로운 창조주', '냉정한 설계자', '혼돈의 관찰자', '파괴적인 폭군', '완벽주의 건축가', '자연주의 수호자' 등과 같이 명확해야 합니다.
        플레이어의 현재 성향은 [${currentTendency}] 입니다.
        당신은 플레이어의 최근 행동을 바탕으로 이 성향을 유지하거나, 더 적절한 성향으로 변경하여 응답에 포함해야 합니다.
        그리고 새로 생성하는 선택지는 반드시 업데이트된 성향을 반영해야 합니다.
        
        **응답 형식 예시:**
        "창조주의 손길이 대지를 어루만지자, 거대한 변화의 바람이 불기 시작했다.\n하늘과 땅 사이로 신비로운 에너지가 흘러가며, 모든 생명체들이 그 기운을 느끼기 시작했다.\n\n산맥이 꿈틀거리며 새로운 형태로 솟아오르고, 강물은 새로운 길을 찾아 흘러간다.\n대지의 심장박동이 점점 빨라지며, 지각 변동의 전조를 알리고 있었다.\n\n하늘에서는 새로운 별들이 반짝이기 시작하며, 생명체들이 놀라운 진화를 맞이한다.\n이 모든 변화 속에서, 당신은 다음 순간을 결정해야 한다..."
        `;

        const mergedLog = [];
        for (const item of currentLog) {
            const role = item.type === 'user' ? 'user' : 'model';
            const text = item.type === 'choice' ? `선택지: ${item.choices.join(', ')}` : item.text;
            if (mergedLog.length > 0 && mergedLog[mergedLog.length - 1].role === role) {
                mergedLog[mergedLog.length - 1].parts[0].text += `\n${text}`;
            } else {
                mergedLog.push({ role, parts: [{ text }] });
            }
        }

        const payload = {
            contents: mergedLog,
            systemInstruction: { role: "user", parts: [{ text: systemPrompt }] },
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        narrative: { type: "STRING", description: "플레이어의 행동에 따른 결과 묘사 (문단 구분을 위해 \n\n 사용)" },
                        tendency: { type: "STRING", description: "분석된 플레이어의 새로운 성향" },
                        choice: {
                            type: "OBJECT",
                            properties: {
                                speaker: { type: "STRING" },
                                options: {
                                    type: "ARRAY",
                                    items: {
                                        type: "STRING",
                                        description: "각 선택지는 구체적인 방법론과 의도를 포함한 상세한 설명이어야 함 (최소 15-30단어)"
                                    },
                                    minItems: 2,
                                    maxItems: 4
                                }
                            }
                        }
                    },
                    required: ["narrative", "tendency", "choice"]
                }
            }
        };

        // API 호출 함수
        const makeApiCall = async (apiKey) => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} - ${response.statusText}`);
            }

            const result = await response.json();
            return JSON.parse(result.candidates[0].content.parts[0].text);
        };

        // 메인 API 키로 먼저 시도
        try {
            console.log("메인 API 키로 요청 시도 중...");
            return await makeApiCall(mainApiKey);
        } catch (mainError) {
            console.warn("메인 API 키 실패:", mainError.message);

            // 백업 API 키로 재시도
            try {
                console.log("백업 API 키로 재시도 중...");
                return await makeApiCall(backupApiKey);
            } catch (backupError) {
                console.error("백업 API 키도 실패:", backupError.message);

                // 모든 API 키가 실패한 경우 기본 응답 반환
                return {
                    narrative: "우주적 변수로 인해 당신의 권능이 잠시 불안정해졌습니다.\n\n잠시 후 다시 시도해보세요.",
                    tendency: currentTendency,
                    choice: {
                        speaker: "시스템",
                        options: [
                            "창조의 힘을 다시 집중하여 우주의 균형을 되찾기 위해 깊은 명상에 잠긴다.",
                            "시공간의 흐름을 재조정하여 안정적인 창조 환경을 구축한 후 다시 시도한다."
                        ]
                    }
                };
            }
        }
    };

    // --- 게임 로직 ---
    const updateGameData = async (newLogItems, newTendency) => {
        const currentLog = log || [];
        const updatedLog = [...currentLog, ...newLogItems];
        if (docRef.current) {
            await setDoc(docRef.current, { log: updatedLog, tendency: newTendency });
        }
    };

    const startGame = async () => {
        const initialNarrative = {
            id: Date.now(),
            type: 'narrative',
            text: '시간과 공간이 태동하고, 무에서 유가 생긴 그 순간.\n창조주는 자신이 빚어낸 광활한 우주를 바라보았다.\n\n무한한 어둠 속에서 반짝이는 별들, 소용돌이치는 은하수, 그리고 그 사이를 채우는 미지의 에너지.\n모든 것이 완벽한 조화를 이루며 장엄한 춤을 추고 있었다.\n\n창조주의 눈에는 경이로움과 동시에 책임감이 어렸다.\n이제 막 탄생한 우주는 너무나 연약해 보였고, 동시에 무한한 가능성을 품고 있었다.'
        };
        const initialChoice = {
            id: Date.now() + 1,
            type: 'choice',
            speaker: '창조주',
            choices: ["난 이 행성을 '지구'라 부르리라"]
        };
        if (docRef.current) {
            await setDoc(docRef.current, { log: [initialNarrative, initialChoice], tendency: '미정' });
        }
    };

    const handlePlayerAction = async (actionText) => {
        setIsProcessing(true);
        const playerEntry = { id: Date.now(), type: 'user', text: actionText };

        const tempLogForApi = [...log, playerEntry];
        const response = await callGeminiAPI(tempLogForApi, playerTendency);

        const narrativeEntry = { id: Date.now() + 1, type: 'narrative', text: response.narrative };
        const choiceEntry = { id: Date.now() + 2, type: 'choice', speaker: response.choice.speaker, choices: response.choice.options };

        await updateGameData([playerEntry, narrativeEntry, choiceEntry], response.tendency);
        // onSnapshot will handle the UI update and setIsProcessing(false)
    };

    return (
        <div
            className="h-screen w-full flex flex-col font-sans"
            style={{
                backgroundImage: `url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop&ixlib.rb-4.0.3&ixid.M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed'
            }}
        >
            <main ref={scrollRef} className="flex-grow overflow-y-auto p-6 flex flex-col items-center">
                {log.map(item => (
                    <StoryLogItem key={item.id} onChoiceClick={handlePlayerAction} item={item} />
                ))}
                {isProcessing && (
                    <div className="w-full mx-auto mb-8">
                        <div className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl p-10 shadow-2xl border border-white border-opacity-10">
                            <p className="text-white text-lg leading-relaxed animate-pulse">창조주의 의지가 현실로 구현되고 있습니다...</p>
                        </div>
                    </div>
                )}
            </main>

            <footer className="w-full flex-shrink-0 p-6 bg-black bg-opacity-30 backdrop-blur-sm">
                <BottomInterface
                    onSubmit={handlePlayerAction}
                    isProcessing={isProcessing}
                    tendency={playerTendency}
                    onResetData={resetGameData}
                />
            </footer>
        </div>
    );
}