
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

// --- 로딩 스피너 컴포넌트 ---
const LoadingSpinner = ({ size = "w-6 h-6", color = "text-purple-400" }) => (
    <div className={`${size} ${color} animate-spin`}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

// --- 귀여운 로딩 애니메이션 컴포넌트 ---
const CuteLoadingAnimation = () => (
    <div className="flex items-center justify-center space-x-2 py-4">
        <div className="flex space-x-1">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
            <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
        </div>
        <span className="text-purple-300 text-sm ml-3 animate-pulse">✨ AI가 마법을 부리는 중... ✨</span>
    </div>
);

// --- 반짝이는 별 아이콘 ---
const SparkleIcon = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0l3.09 6.26L22 9l-6.91 2.74L12 18l-3.09-6.26L2 9l6.91-2.74L12 0z"/>
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

// --- 개선된 타이핑 애니메이션 컴포넌트 ---
const TypingText = ({ text, speed = 30, onComplete, delay = 0 }) => {
    const [displayedText, setDisplayedText] = useState('');
    const [isComplete, setIsComplete] = useState(false);
    const intervalRef = useRef(null);
    const onCompleteRef = useRef(onComplete);
    const hasCalledComplete = useRef(false);

    // onComplete 콜백 참조 업데이트
    useEffect(() => {
        onCompleteRef.current = onComplete;
    }, [onComplete]);

    useEffect(() => {
        // 초기화
        setDisplayedText('');
        setIsComplete(false);
        hasCalledComplete.current = false;

        // 지연 시간 후 타이핑 시작
        const startTyping = () => {
            let currentIndex = 0;

            intervalRef.current = setInterval(() => {
                if (currentIndex < text.length) {
                    setDisplayedText(text.slice(0, currentIndex + 1));
                    currentIndex++;
                } else {
                    // 타이핑 완료
                    clearInterval(intervalRef.current);
                    setIsComplete(true);

                    // 완료 콜백 호출 (중복 방지)
                    if (onCompleteRef.current && !hasCalledComplete.current) {
                        hasCalledComplete.current = true;
                        setTimeout(() => {
                            onCompleteRef.current();
                        }, 100);
                    }
                }
            }, speed);
        };

        const timeoutId = setTimeout(startTyping, delay);

        return () => {
            clearTimeout(timeoutId);
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [text, speed, delay]);

    return (
        <span className={`typing-text-container ${!isComplete ? 'typing-cursor' : ''}`}>
            {displayedText.split('\n').map((line, index) => (
                <span key={index}>
                    {line}
                    {index < displayedText.split('\n').length - 1 && <br />}
                </span>
            ))}
        </span>
    );
};

// --- 문단별 타이핑 컴포넌트 ---
const ParagraphTypingText = ({ paragraphs, onComplete, shouldAnimate = true }) => {
    const [currentParagraphIndex, setCurrentParagraphIndex] = useState(0);
    const [showNextButton, setShowNextButton] = useState(false);
    // eslint-disable-next-line no-unused-vars
    const [allCompleted, setAllCompleted] = useState(false);

    // paragraphs가 변경되면 초기화
    useEffect(() => {
        setCurrentParagraphIndex(0);
        setShowNextButton(false);
        setAllCompleted(false);
    }, [paragraphs]);

    // 애니메이션이 비활성화된 경우 모든 문단을 바로 표시
    if (!shouldAnimate) {
        return (
            <div>
                {paragraphs.map((paragraph, index) => (
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
                ))}
            </div>
        );
    }

    const handleParagraphComplete = () => {
        if (currentParagraphIndex === paragraphs.length - 1) {
            // 모든 문단 완료
            setAllCompleted(true);
            if (onComplete) {
                setTimeout(() => {
                    onComplete();
                }, 200);
            }
        } else {
            // 다음 문단 버튼 표시
            setShowNextButton(true);
        }
    };

    const handleNextParagraph = () => {
        setShowNextButton(false);
        setTimeout(() => {
            setCurrentParagraphIndex(prev => prev + 1);
        }, 100);
    };

    return (
        <div>
            {/* 완료된 문단들 */}
            {paragraphs.slice(0, currentParagraphIndex).map((paragraph, index) => (
                <div key={`completed-${index}`} className={`${index > 0 ? 'mt-6' : ''}`}>
                    <p className="text-white text-lg leading-relaxed">
                        {paragraph.trim().split('\n').map((line, lineIndex) => (
                            <span key={lineIndex}>
                                {line}
                                {lineIndex < paragraph.trim().split('\n').length - 1 && <br />}
                            </span>
                        ))}
                    </p>
                </div>
            ))}

            {/* 현재 타이핑 중인 문단 */}
            {currentParagraphIndex < paragraphs.length && (
                <div className={`${currentParagraphIndex > 0 ? 'mt-6' : ''}`}>
                    <p className="text-white text-lg leading-relaxed">
                        <TypingText
                            key={`paragraph-${currentParagraphIndex}`}
                            text={paragraphs[currentParagraphIndex].trim()}
                            speed={30}
                            onComplete={handleParagraphComplete}
                        />
                    </p>
                </div>
            )}

            {/* 다음 문단 버튼 */}
            {showNextButton && (
                <div className="mt-6 text-center">
                    <button
                        onClick={handleNextParagraph}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors shadow-lg flex items-center justify-center space-x-2 mx-auto"
                    >
                        <span>다음 대화 보기</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 18 6-6-6-6"/>
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};

// --- 컴포넌트: 다음 대화 버튼 ---
// eslint-disable-next-line no-unused-vars
const NextConversationButton = ({ onClick }) => {
    return (
        <button
            onClick={onClick}
            className="mt-6 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors shadow-lg flex items-center justify-center space-x-2 mx-auto"
        >
            <span>다음 대화 보기</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6"/>
            </svg>
        </button>
    );
};


// StoryLogItem 컴포넌트 수정
const StoryLogItem = ({ item, onChoiceClick, isLatest, onTypingComplete, isTyping, storyOnlyMode }) => {
    if (item.type === 'narrative') {
        const paragraphs = item.text.split(/\n\s*\n/).filter(p => p.trim());

        return (
            <div className="mx-auto mb-8 fade-in">
                <div className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl p-10 shadow-2xl border border-white border-opacity-10">
                    <div className="prose prose-lg prose-invert max-w-none">
                        <ParagraphTypingText
                            paragraphs={paragraphs}
                            shouldAnimate={isLatest}
                            onComplete={onTypingComplete}
                        />
                    </div>
                </div>
            </div>
        );
    }

    if (item.type === 'choice') {
        // 타이핑 중일 때는 선택지를 숨김
        if (isTyping) {
            return null;
        }

        // 스토리 전용 모드일 때는 선택지를 숨김
        if (storyOnlyMode) {
            return null;
        }

        // 선택지 데이터 구조 확인 및 정규화
        // eslint-disable-next-line no-console
        console.log('Choice item 구조:', item);

        // 선택지 배열이 존재하는지 확인
        const choices = item.choices || [];

        if (choices.length === 0) {
            // eslint-disable-next-line no-console
            console.warn('선택지가 비어있습니다:', item);
            return null;
        }

        return (
            <div className="mx-auto flex flex-col items-center my-10 fade-in">
                <div className="mb-8">
                    <p className="text-base text-purple-300 font-semibold text-center opacity-90">
                        {item.speaker || "선택지"}
                    </p>
                </div>
                <div className="space-y-6 w-full">
                    {choices.map((choice, index) => {
                        // 다양한 선택지 데이터 구조 처리
                        let choiceText = '';

                        if (typeof choice === 'string') {
                            choiceText = choice;
                        } else if (typeof choice === 'object') {
                            // 가능한 프로퍼티들을 확인
                            choiceText = choice.text || choice.content || choice.description || choice.title || JSON.stringify(choice);
                        } else {
                            choiceText = String(choice);
                        }

                        // eslint-disable-next-line no-console
                        console.log(`선택지 ${index + 1}:`, choiceText);

                        if (!choiceText.trim()) {
                            // eslint-disable-next-line no-console
                            console.warn(`선택지 ${index + 1}이 비어있습니다:`, choice);
                            return null;
                        }

                        return (
                            <button
                                key={index}
                                onClick={() => {
                                    // eslint-disable-next-line no-console
                                    console.log('선택지 클릭:', choiceText);
                                    onChoiceClick(choiceText);
                                }}
                                className="group w-full text-left transition-all duration-300 transform hover:scale-102 hover:-translate-y-1 choice-button"
                            >
                                <div className="bg-gradient-to-r from-slate-800/70 via-purple-900/30 to-slate-700/70 group-hover:from-purple-800/80 group-hover:via-pink-800/40 group-hover:to-purple-700/80 border border-slate-600 group-hover:border-purple-400 rounded-xl px-8 py-6 shadow-lg group-hover:shadow-purple-500/30 backdrop-blur-sm relative overflow-hidden">
                                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <SparkleIcon className="w-4 h-4 text-yellow-400 animate-pulse" />
                                    </div>
                                    <div className="flex items-start">
                                        <div className="flex-1">
                                            <p className="text-white text-lg font-serif leading-relaxed group-hover:text-purple-100 transition-colors duration-300">
                                                ✨ {choiceText}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    if (item.type === 'user') {
        return (
            <div className="mx-auto mb-6 flex justify-end">
                <div className="bg-gradient-to-r from-purple-600 to-purple-500 rounded-xl px-8 py-5 shadow-lg">
                    <p className="text-white text-lg leading-relaxed">{item.text}</p>
                </div>
            </div>
        );
    }

    return null;
};

// --- 컴포넌트: 하단 인터페이스 ---
const BottomInterface = ({ onSubmit, isProcessing, tendency, onResetData, isTyping, storyOnlyMode, onStoryOnlyModeChange }) => {
    const [message, setMessage] = useState('');
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!message.trim() || isProcessing || isTyping) return;
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
            <div className="mx-auto">
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
        <div className="mx-auto">
            <div className="text-center mb-2 flex justify-center items-center space-x-4">
                <p className="text-xs text-purple-300">현재 성향: <span className="font-bold">{tendency}</span></p>
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-purple-300">스토리 전용</span>
                    <button
                        onClick={() => onStoryOnlyModeChange(!storyOnlyMode)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                            storyOnlyMode ? 'bg-purple-600' : 'bg-gray-600'
                        }`}
                        title="스토리 전용 모드 - 선택지 없이 이야기만 보기"
                    >
                        <span
                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                storyOnlyMode ? 'translate-x-5' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
                <button
                    onClick={handleResetClick}
                    className="flex items-center space-x-1 text-xs text-red-300 hover:text-red-200 transition-colors"
                    title="게임 데이터 초기화"
                >
                    <RefreshIcon className="w-4 h-4" />
                    <span>초기화</span>
                </button>
            </div>
            <form onSubmit={handleSubmit} className="flex items-center bg-gradient-to-r from-slate-800/80 to-purple-900/60 backdrop-blur-sm rounded-full p-3 shadow-inner border border-purple-500/30 hover:border-purple-400/50 transition-all duration-300">
                <SmileIcon className={`w-6 h-6 mx-3 transition-colors duration-300 ${isProcessing || isTyping ? 'text-yellow-400 animate-pulse' : 'text-purple-400 hover:text-yellow-300'}`} />
                {(isProcessing || isTyping) && (
                    <div className="flex items-center mr-2">
                        <LoadingSpinner size="w-4 h-4" color="text-purple-400" />
                        <SparkleIcon className="w-3 h-3 text-yellow-400 animate-pulse ml-1" />
                    </div>
                )}
                <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={isProcessing ? "✨ AI가 마법을 부리는 중이에요... ✨" : isTyping ? "🎭 AI가 이야기를 들려주고 있어요... 🎭" : "🌟 창조주님, 어떤 선택을 하시겠어요? 🌟"}
                    disabled={isProcessing || isTyping}
                    className="flex-grow bg-transparent text-white placeholder-purple-300 focus:outline-none text-lg"
                />
                <QuoteIcon className="w-6 h-6 mx-3 text-purple-400 hover:text-pink-300 cursor-pointer transition-colors duration-300" />
                <UserIcon className="w-6 h-6 mx-3 text-purple-400 hover:text-blue-300 cursor-pointer transition-colors duration-300" />
                <button
                    type="submit"
                    disabled={isProcessing || isTyping || !message.trim()}
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-full p-3 ml-2 transition-all duration-300 disabled:from-slate-600 disabled:to-slate-700 disabled:opacity-50 transform hover:scale-105 active:scale-95 shadow-lg hover:shadow-purple-500/25"
                >
                    {isProcessing || isTyping ? (
                        <LoadingSpinner size="w-5 h-5" color="text-white" />
                    ) : (
                        <SendIcon className="w-5 h-5 text-white" />
                    )}
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
    const [isTyping, setIsTyping] = useState(false);
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [lastProcessedLogLength, setLastProcessedLogLength] = useState(0); // 마지막으로 처리된 로그 길이 추적
    const [typedNarrativeIds, setTypedNarrativeIds] = useState(new Set()); // 타이핑 완료된 내러티브 ID 추적
    const [storyOnlyMode, setStoryOnlyMode] = useState(false); // 스토리 전용 모드 상태

    const scrollRef = useRef(null);
    const docRef = useRef(null);

    // 초기 로딩 화면 컴포넌트
    const InitialLoadingScreen = () => (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col items-center justify-center p-4">
            <div className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl p-10 shadow-2xl border border-purple-500/30 max-w-lg text-center">
                <h1 className="text-3xl font-bold text-purple-300 mb-6 flex items-center justify-center">
                    <SparkleIcon className="w-8 h-8 text-yellow-400 mr-3 animate-pulse" />
                    마법의 세계로 초대합니다
                    <SparkleIcon className="w-8 h-8 text-yellow-400 ml-3 animate-pulse" />
                </h1>
                <CuteLoadingAnimation />
                <p className="text-purple-200 mt-4">
                    🌟 창조주님을 위한 특별한 모험이 준비되고 있어요! 🌟
                </p>
            </div>
        </div>
    );

    // --- Firebase 초기화 및 인증 (개선된 오류 처리) ---
    useEffect(() => {
        const firebaseConfig = {
            apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
            authDomain: "text-adventure-game-cb731.firebaseapp.com",
            projectId: "text-adventure-game-cb731",
            storageBucket: "text-adventure-game-cb731.appspot.com",
            messagingSenderId: "1092941614820",
            appId: "1:1092941614820:web:5545f36014b73c268026f1"
        };

        const initializeFirebase = async () => {
            try {
                // eslint-disable-next-line no-console
                console.log("Firebase 초기화 시작...");
                
                // Firebase 앱 초기화
                const app = initializeApp(firebaseConfig);
                // eslint-disable-next-line no-console
                console.log("Firebase 앱 초기화 성공");
                
                // Auth 서비스 초기화
                const auth = getAuth(app);
                // eslint-disable-next-line no-console
                console.log("Firebase Auth 서비스 초기화 성공");
                
                // Firestore 서비스 초기화
                const firestore = getFirestore(app);
                // eslint-disable-next-line no-console
                console.log("Firebase Firestore 서비스 초기화 성공");
                
                setDb(firestore);

                // 인증 상태 변경 리스너 설정
                onAuthStateChanged(auth, async (user) => {
                    // eslint-disable-next-line no-console
                    console.log("인증 상태 변경:", user ? "사용자 인증됨" : "사용자 인증되지 않음");
                    
                    if (user) {
                        // eslint-disable-next-line no-console
                        console.log("사용자 ID 설정:", user.uid);
                        setUserId(user.uid);
                    } else {
                        try {
                            // eslint-disable-next-line no-console
                            console.log("익명 인증 시도...");
                            const token = user?.getIdTokenResult()?.token;
                            
                            if (token) {
                                // eslint-disable-next-line no-console
                                console.log("커스텀 토큰으로 인증 시도");
                                await signInWithCustomToken(auth, token);
                            } else {
                                // eslint-disable-next-line no-console
                                console.log("익명 인증 시도");
                                await signInAnonymously(auth);
                            }
                            // eslint-disable-next-line no-console
                            console.log("익명 인증 성공");
                        } catch (authError) {
                            // eslint-disable-next-line no-console
                            console.error("인증 실패:", authError);
                            
                            // 인증 실패 시 재시도
                            try {
                                // eslint-disable-next-line no-console
                                console.log("인증 재시도...");
                                await signInAnonymously(auth);
                                // eslint-disable-next-line no-console
                                console.log("인증 재시도 성공");
                            } catch (retryError) {
                                // eslint-disable-next-line no-console
                                console.error("인증 재시도 실패:", retryError);
                                alert("인증에 실패했습니다. 페이지를 새로고침하여 다시 시도해주세요.");
                            }
                        }
                    }
                    
                    setIsAuthReady(true);
                    // eslint-disable-next-line no-console
                    console.log("인증 준비 완료");
                });
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error("Firebase 초기화 오류:", error);
                
                // 사용자에게 오류 알림
                alert("앱 초기화에 실패했습니다. 페이지를 새로고침하여 다시 시도해주세요.");
                
                // 5초 후 페이지 새로고침 시도
                setTimeout(() => {
                    // eslint-disable-next-line no-console
                    console.log("페이지 자동 새로고침 시도...");
                    window.location.reload();
                }, 5000);
            }
        };

        initializeFirebase();
    }, []);

    // --- 데이터 로딩 및 동기화 (개선된 오류 처리) ---
    useEffect(() => {
        if (!isAuthReady || !db || !userId) {
            // eslint-disable-next-line no-console
            console.log("데이터 로딩 준비되지 않음:", { isAuthReady, hasDb: !!db, hasUserId: !!userId });
            return;
        }

        // eslint-disable-next-line no-console
        console.log("데이터 로딩 및 동기화 시작...");
        
        try {
            const appId = "1:1092941614820:web:5545f36014b73c268026f1";
            const docPath = `artifacts/${appId}/users/${userId}/narrative-sessions/main`;
            // eslint-disable-next-line no-console
            console.log("Firestore 문서 경로:", docPath);
            
            docRef.current = doc(db, "artifacts", appId, "users", userId, "narrative-sessions", "main");

            // Firestore 업데이트 감지 설정
            // eslint-disable-next-line no-console
            console.log("Firestore 실시간 업데이트 리스너 설정...");
            
            const unsubscribe = onSnapshot(
                docRef.current, 
                (doc) => {
                    try {
                        if (doc.exists()) {
                            // eslint-disable-next-line no-console
                            console.log("Firestore 문서 존재함, 데이터 로드 중...");
                            const data = doc.data();
                            
                            // 데이터 유효성 검사
                            if (!data) {
                                // eslint-disable-next-line no-console
                                console.error("Firestore 문서가 비어있습니다.");
                                setIsProcessing(false);
                                return;
                            }
                            
                            const newLog = data.log || [];

                            // 디버깅: 로그의 각 아이템 구조 확인
                            // eslint-disable-next-line no-console
                            console.log('전체 로그 구조:', newLog);
                            newLog.forEach((item, index) => {
                                if (item.type === 'choice') {
                                    // eslint-disable-next-line no-console
                                    console.log(`선택지 아이템 ${index}:`, item);
                                    // eslint-disable-next-line no-console
                                    console.log('선택지 배열:', item.choices);
                                }
                            });

                            const lastItem = newLog.length > 0 ? newLog[newLog.length - 1] : null;

                            // eslint-disable-next-line no-console
                            console.log('Firestore 업데이트 감지:', {
                                newLogLength: newLog.length,
                                prevLogLength: lastProcessedLogLength,
                                lastItemType: lastItem?.type,
                                shouldType: newLog.length > lastProcessedLogLength && lastItem && lastItem.type === 'narrative'
                            });

                            setIsProcessing(false);

                            // 새로 추가된 아이템들 중에 내러티브가 있는지 확인
                            if (newLog.length > lastProcessedLogLength) {
                                const newItems = newLog.slice(lastProcessedLogLength);
                                const hasNewNarrative = newItems.some(item => item.type === 'narrative');
                                
                                if (hasNewNarrative) {
                                    // eslint-disable-next-line no-console
                                    console.log('새 내러티브 감지, 타이핑 효과 활성화');
                                    setIsTyping(true);
                                }
                            }

                            setLog(newLog);
                            setLastProcessedLogLength(newLog.length);
                            setPlayerTendency(data.tendency || '미정');

                            // eslint-disable-next-line no-console
                            console.log("Firestore 데이터 로드 완료");
                        } else {
                            // eslint-disable-next-line no-console
                            console.log('세션 문서 없음, 새 게임 시작');
                            startGame().catch(error => {
                                // eslint-disable-next-line no-console
                                console.error("게임 시작 실패:", error);
                                alert("게임 시작에 실패했습니다. 페이지를 새로고침하여 다시 시도해주세요.");
                            });
                            setIsProcessing(false);
                        }
                    } catch (docError) {
                        // eslint-disable-next-line no-console
                        console.error("Firestore 문서 처리 오류:", docError);
                        setIsProcessing(false);
                        alert("데이터 처리 중 오류가 발생했습니다. 페이지를 새로고침하여 다시 시도해주세요.");
                    }
                }, 
                (error) => {
                    // eslint-disable-next-line no-console
                    console.error("Firestore 실시간 업데이트 오류:", error);
                    setIsProcessing(false);
                    
                    // 네트워크 오류인 경우 재연결 시도
                    if (error.code === 'unavailable' || error.code === 'network-request-failed') {
                        // eslint-disable-next-line no-console
                        console.log("네트워크 오류 감지, 재연결 시도...");
                        alert("네트워크 연결이 불안정합니다. 자동으로 재연결을 시도합니다.");
                        
                        // 3초 후 페이지 새로고침
                        setTimeout(() => {
                            window.location.reload();
                        }, 3000);
                    } else {
                        alert("데이터 연결에 실패했습니다. 페이지를 새로고침하여 다시 시도해주세요.");
                    }
                }
            );

            // eslint-disable-next-line no-console
            console.log("Firestore 실시간 업데이트 리스너 설정 완료");
            
            return () => {
                // eslint-disable-next-line no-console
                console.log("Firestore 리스너 정리 중...");
                unsubscribe();
                // eslint-disable-next-line no-console
                console.log("Firestore 리스너 정리 완료");
            };
        } catch (setupError) {
            // eslint-disable-next-line no-console
            console.error("Firestore 설정 오류:", setupError);
            setIsProcessing(false);
            alert("데이터 연결 설정에 실패했습니다. 페이지를 새로고침하여 다시 시도해주세요.");
            
            // 5초 후 페이지 새로고침
            setTimeout(() => {
                window.location.reload();
            }, 5000);
            
            return () => {}; // 빈 cleanup 함수 반환
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
    }, [log, isProcessing, isTyping]);

    // --- 새로운 이야기 등장 시 자동 스크롤 (향상된 버전) ---
    useEffect(() => {
        if (scrollRef.current && log.length > 0) {
            const lastItem = log[log.length - 1];
            
            // 새로운 narrative 또는 choice가 추가되었을 때 즉시 스크롤
            if (lastItem && (lastItem.type === 'narrative' || lastItem.type === 'choice')) {
                const scrollToBottom = () => {
                    scrollRef.current.scrollTo({
                        top: scrollRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                };

                // 즉시 스크롤 (DOM 업데이트 대기 없이)
                scrollToBottom();
                
                // 추가적으로 약간의 지연 후 다시 스크롤 (타이핑 애니메이션 고려)
                const timeoutId = setTimeout(scrollToBottom, 200);
                return () => clearTimeout(timeoutId);
            }
        }
    }, [log.length, log]);

    // --- 타이핑 진행 중 지속적인 스크롤 ---
    useEffect(() => {
        if (scrollRef.current && isTyping) {
            const scrollInterval = setInterval(() => {
                scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            }, 500); // 타이핑 중 0.5초마다 스크롤 확인

            return () => clearInterval(scrollInterval);
        }
    }, [isTyping]);

    // 타이핑 완료 핸들러
    const handleTypingComplete = () => {
        // eslint-disable-next-line no-console
        console.log('부모 컴포넌트: 타이핑 완료 이벤트 수신');

        // 가장 최근 내러티브 아이템 찾기
        const lastNarrativeItem = [...log].reverse().find(item => item.type === 'narrative');
        if (lastNarrativeItem && lastNarrativeItem.id) {
            // 타이핑 완료된 내러티브 ID 추가
            setTypedNarrativeIds(prev => new Set([...prev, lastNarrativeItem.id]));
            // eslint-disable-next-line no-console
            console.log('타이핑 완료된 내러티브 ID 추가:', lastNarrativeItem.id);
        }

        // 타이핑이 완료되면 isTyping 상태를 false로 설정
        setIsTyping(false);

        // 스크롤을 아래로 이동하여 선택지가 보이도록 함
        if (scrollRef.current) {
            // 지연 시간을 늘려 확실하게 스크롤이 작동하도록 함
            setTimeout(() => {
                scrollRef.current.scrollTo({
                    top: scrollRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            }, 300);
        }

        // 스토리 전용 모드일 때 자동으로 다음 이야기 생성
        if (storyOnlyMode && !isProcessing) {
            // eslint-disable-next-line no-console
            console.log('스토리 전용 모드: 자동 이야기 계속 생성');
            
            // 자연스러운 흐름을 위해 2초 후 다음 이야기 생성
            setTimeout(() => {
                if (storyOnlyMode && !isProcessing) { // 다시 한번 확인
                    requestIntegratedContent(log, playerTendency, true);
                }
            }, 2000);
        }
    };


    // --- 데이터 초기화 함수 ---
    const resetGameData = async () => {
        if (!docRef.current) return;

        try {
            setIsProcessing(true);
            setIsTyping(false);
            setLastProcessedLogLength(0); // 추적 상태 초기화
            setTypedNarrativeIds(new Set()); // 타이핑 완료된 내러티브 ID 초기화

            // Firestore 문서 삭제
            await deleteDoc(docRef.current);

            // 로컬 상태 초기화
            setLog([]);
            setPlayerTendency('미정');

            // 잠시 후 새 게임 시작 (onSnapshot이 문서 삭제를 감지하고 startGame을 호출할 것임)
            // eslint-disable-next-line no-console
            console.log("게임 데이터가 초기화되었습니다.");

        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("데이터 초기화 실패:", error);
            setIsProcessing(false);

            // 오류 발생 시 직접 게임 재시작
            try {
                await startGame();
            } catch (startError) {
                // eslint-disable-next-line no-console
                console.error("게임 재시작 실패:", startError);
            }
        }
    };

    // --- Gemini API 공통 설정 ---
    const mainApiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
    const backupApiKey = "AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84";

    // --- 통합된 내러티브 및 선택지 API 호출 ---
    const callGeminiIntegratedAPI = async (currentLog, currentTendency, isStoryOnlyMode = false) => {
        let prompt;
        
        if (isStoryOnlyMode) {
            // 스토리 전용 모드: 연속적인 내러티브만 생성
            prompt = `
            당신은 텍스트 기반 RPG의 게임 마스터(GM)입니다.
            스타일:
            신화적 판타지 세계 창조
            
            신화적 판타지: 고대 신과 불사의 존재가 등장하며, 그들이 만든 세계에서 생명과 죽음, 창조와 파괴를 주제로 한 이야기.
            
            이계의 신 스타일: 신이 다른 세계를 창조하고, 그 안에서 생명체들이 발전하는 과정에서 신이 등장하고 그들과 상호작용하는 이야기.
            
            **중요: 스토리 전용 모드**
            현재 스토리 전용 모드가 활성화되어 있습니다. 선택지나 플레이어 입력을 기다리지 말고, 연속적으로 흘러가는 이야기만 생성하세요.
            이야기는 자연스럽게 다음 장면으로 이어져야 하며, 멈춤 없이 계속 진행되어야 합니다.
            
            **스토리텔링 규칙:**
            1. 각 문단은 반드시 두 개의 줄바꿈(\n\n)으로 구분하여 작성하세요.
            2. 한 문단 안에서 문장들은 하나의 줄바꿈(\n)으로 구분하세요.
            3. 감정적 몰입도를 높이기 위해 섬세한 묘사와 장면 전환을 사용하세요.
            4. 시각적, 청각적, 촉각적 세부사항을 포함하여 생생한 장면을 연출하세요.
            5. 각 문단은 하나의 완결된 장면이나 상황을 담아야 합니다.
            6. 대화와 상황 묘사를 적절히 조합하여 드라마틱한 효과를 만들어주세요.
            7. **연속성 중시:** 이야기가 멈추지 않고 자연스럽게 다음 상황으로 흘러가도록 하세요.
            8. **능동적 전개:** 창조주의 의지나 세계의 변화가 자동으로 일어나도록 서술하세요.
            
            **성향 시스템:**
            플레이어의 현재 성향은 [${currentTendency}] 입니다.
            이 성향을 바탕으로 창조주의 행동과 세계의 변화를 자연스럽게 이어가세요.
            
            **응답 형식:**
            
            **타입: story-only**
            내용: "첫 번째 문단입니다.\n세부 내용이 있습니다.\n\n두 번째 문단입니다.\n추가 설명이 있습니다.\n\n세 번째 문단에서 이야기가 자연스럽게 계속됩니다."
            성향: "${currentTendency}"
            
            다음은 지금까지의 게임 로그입니다:
            ${currentLog.map(item => {
                if (item.type === 'narrative') return `[내러티브] ${item.text}`;
                if (item.type === 'user') return `[플레이어] ${item.text}`;
                return '';
            }).join('\n\n')}
            
            위 로그를 바탕으로 연속적으로 흘러가는 다음 이야기를 생성해주세요. 선택지는 생성하지 마세요.`;
        } else {
            // 일반 모드: 내러티브와 선택지 함께 생성
            prompt = `
            당신은 텍스트 기반 RPG의 게임 마스터(GM)입니다.
            스타일:
            신화적 판타지 세계 창조
            
            신화적 판타지: 고대 신과 불사의 존재가 등장하며, 그들이 만든 세계에서 생명과 죽음, 창조와 파괴를 주제로 한 이야기.
            
            이계의 신 스타일: 신이 다른 세계를 창조하고, 그 안에서 생명체들이 발전하는 과정에서 신이 등장하고 그들과 상호작용하는 이야기.
            
            이 프롬프트를 사용해 세계를 설정하고, 이야기를 점차적으로 만들어가며 각 생명체들의 성장과 진화를 다룬 신화적 판타지 세계를 창조해 보세요!

            
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
            각 선택지는 다음과 같은 요소를 포함해야 합니다:
            1. 창조주의 의도와 목적
            2. 예상되는 결과나 변화
            3. **소설적 문체:** 모든 서술은 판타지 소설처럼 문학적이고 서사적인 문체를 사용해야 합니다. 감각적인 묘사(시각, 청각, 후각 등)와 인물의 내면 묘사를 풍부하게 사용하여 몰입감을 극대화하세요.
            4. **장대한 서사:** 플레이어의 작은 의지나 관찰로부터 시작하여, 세계의 숨겨진 역사, 잊혀진 마법, 고대 존재들의 갈등 등 거대한 이야기로 확장시켜 나가세요.
            
            각 선택지는 최소 15-30단어 이상의 상세한 설명을 포함해야 하며,
            신화적 판타지: 고대 신과 불사의 존재가 등장하며, 그들이 만든 세계에서 생명과 죽음, 창조와 파괴를 주제로 한 이야기.
            이계의 신 스타일: 신이 다른 세계를 창조하고, 그 안에서 생명체들이 발전하는 과정에서 신이 등장하고 그들과 상호작용하는 이야기.
            같은 스타일에 선택지를 제시해야 합니다.
            
            **성향 시스템:**
            당신은 플레이어의 선택과 입력 내용을 분석하여 그의 성향을 판단해야 합니다. 성향은 '자비로운 창조주', '냉정한 설계자', '혼돈의 관찰자', '파괴적인 폭군', '완벽주의 건축가', '자연주의 수호자' 등과 같이 명확해야 합니다.
            플레이어의 현재 성향은 [${currentTendency}] 입니다.
            당신은 플레이어의 최근 행동을 바탕으로 이 성향을 유지하거나, 더 적절한 성향으로 변경하여 응답에 포함해야 합니다.
            
            **응답 형식:**
            
            **타입: integrated**
            내용: "첫 번째 문단입니다.\n세부 내용이 있습니다.\n\n두 번째 문단입니다.\n추가 설명이 있습니다."
            스피커: "창조주"
            선택지:
            1. "첫 번째 선택지에 대한 상세한 설명입니다."
            2. "두 번째 선택지에 대한 상세한 설명입니다."
            3. "세 번째 선택지에 대한 상세한 설명입니다."
            성향: "자비로운 창조주"
            
            다음은 지금까지의 게임 로그입니다:
            ${currentLog.map(item => {
                if (item.type === 'narrative') return `[내러티브] ${item.text}`;
                if (item.type === 'choice') return `[선택지] ${item.speaker}: ${item.choices.join(', ')}`;
                if (item.type === 'user') return `[플레이어] ${item.text}`;
                return '';
            }).join('\n\n')}
            
            위 로그를 바탕으로 다음 이야기와 선택지를 함께 생성해주세요.`;
        }

        return await callGeminiAPI(prompt);
    };


    // --- 기본 Gemini API 호출 함수 (업데이트됨) ---
    const callGeminiAPI = async (prompt) => {
        const tryAPI = async (apiKey) => {
            // 먼저 v1 엔드포인트 시도
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: prompt
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.8,
                            topK: 40,
                            topP: 0.95,
                            maxOutputTokens: 2048,
                        }
                    })
                });

                if (!response.ok) {
                    // eslint-disable-next-line no-console
                    console.warn(`v1 API 응답 오류: ${response.status}. v1beta 엔드포인트 시도...`);
                    // eslint-disable-next-line no-console
                    throw new Error(`v1 API 응답 오류: ${response.status}`);
                }

                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content && 
                    data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                    return data.candidates[0].content.parts[0].text;
                } else {
                    throw new Error("API 응답 형식이 예상과 다릅니다.");
                }
            } catch (v1Error) {
                // v1 실패 시 v1beta 엔드포인트 시도
                // eslint-disable-next-line no-console
                console.warn("v1 엔드포인트 실패, v1beta 시도:", v1Error.message);
                
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: prompt
                            }]
                        }],
                        generationConfig: {
                            temperature: 0.8,
                            topK: 40,
                            topP: 0.95,
                            maxOutputTokens: 2048,
                        }
                    })
                });

                if (!response.ok) {
                    throw new Error(`v1beta API 응답 오류: ${response.status}`);
                }

                const data = await response.json();
                if (data.candidates && data.candidates[0] && data.candidates[0].content && 
                    data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                    return data.candidates[0].content.parts[0].text;
                } else {
                    throw new Error("API 응답 형식이 예상과 다릅니다.");
                }
            }
        };

        try {
            return await tryAPI(mainApiKey);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.warn("Main API 실패, 백업 API 시도:", error.message);
            try {
                return await tryAPI(backupApiKey);
            } catch (backupError) {
                // eslint-disable-next-line no-console
                console.error("백업 API도 실패:", backupError.message);
                throw new Error("모든 API 호출이 실패했습니다.");
            }
        }
    };

    // --- 게임 시작 ---
    const startGame = async () => {
        if (!docRef.current) return;

        try {
            setIsProcessing(true);

            // 통합된 API 호출로 게임 시작 (내러티브와 선택지 함께 생성)
            const response = await callGeminiIntegratedAPI([], '미정', false);
            const parsedResponse = parseIntegratedResponse(response);

            const newLog = [];
            let newTendency = '미정';

            if (parsedResponse.narrative) {
                const narrativeItem = {
                    id: Date.now() + Math.random(),
                    type: 'narrative',
                    text: parsedResponse.narrative,
                    timestamp: new Date().toISOString()
                };
                newLog.push(narrativeItem);
            }

            if (parsedResponse.choice && parsedResponse.choice.choices && parsedResponse.choice.choices.length > 0) {
                const choiceItem = {
                    id: Date.now() + Math.random() + 1,
                    type: 'choice',
                    speaker: parsedResponse.choice.speaker,
                    choices: parsedResponse.choice.choices,
                    timestamp: new Date().toISOString()
                };
                newLog.push(choiceItem);
            }

            if (parsedResponse.tendency) {
                newTendency = parsedResponse.tendency;
            }

            if (newLog.length > 0) {
                await setDoc(docRef.current, {
                    log: newLog,
                    tendency: newTendency,
                    lastUpdated: new Date().toISOString()
                });

                // eslint-disable-next-line no-console
                console.log("게임이 시작되었습니다. 내러티브와 선택지가 함께 생성되었습니다.");
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("게임 시작 실패:", error);
            setIsProcessing(false);
        }
    };

    // --- 통합된 응답 파싱 ---
    const parseIntegratedResponse = (text) => {
        try {
            const result = {
                narrative: null,
                choice: null,
                tendency: null
            };

            // 성향 추출
            const tendencyMatch = text.match(/성향:\s*["']?([^"'\n]+)["']?/);
            if (tendencyMatch) {
                result.tendency = tendencyMatch[1].trim();
            }

            // 내러티브 추출
            if (text.includes('**타입: story-only**') || text.includes('타입: story-only')) {
                // 스토리 전용 모드 응답 처리
                const contentMatch = text.match(/내용:\s*["']?(.*?)["']?(?=\n성향:|성향:|$)/s);
                if (contentMatch) {
                    result.narrative = contentMatch[1].trim().replace(/\\n/g, '\n');
                } else {
                    // 내용 태그가 없는 경우 전체 텍스트에서 타입과 성향 부분을 제외한 내용을 추출
                    let narrativeText = text
                        .replace(/\*\*타입: story-only\*\*|\*\*타입:story-only\*\*|타입: story-only|타입:story-only/g, '')
                        .replace(/성향:\s*["']?([^"'\n]+)["']?/g, '')
                        .trim();

                    // "내용:" 태그가 있으면 제거
                    narrativeText = narrativeText.replace(/내용:\s*/g, '').trim();

                    result.narrative = narrativeText;
                }
                
                // 스토리 전용 모드에서는 선택지를 생성하지 않음
                // eslint-disable-next-line no-console
                console.log("스토리 전용 모드 응답 파싱 완료");
                
            } else if (text.includes('**타입: integrated**') || text.includes('타입: integrated')) {
                const contentMatch = text.match(/내용:\s*["']?(.*?)["']?(?=\n스피커:|스피커:|$)/s);
                if (contentMatch) {
                    result.narrative = contentMatch[1].trim().replace(/\\n/g, '\n');
                } else {
                    // 내용 태그가 없는 경우 전체 텍스트에서 타입과 성향 부분을 제외한 내용을 추출
                    let narrativeText = text
                        .replace(/\*\*타입: integrated\*\*|\*\*타입:integrated\*\*|타입: integrated|타입:integrated/g, '')
                        .replace(/성향:\s*["']?([^"'\n]+)["']?/g, '')
                        .replace(/스피커:[\s\S]*$/g, '')
                        .trim();

                    // "내용:" 태그가 있으면 제거
                    narrativeText = narrativeText.replace(/내용:\s*/g, '').trim();

                    result.narrative = narrativeText;
                }

                // 스피커 추출
                const speakerMatch = text.match(/스피커:\s*["']?([^"'\n]+)["']?/);
                const speaker = speakerMatch ? speakerMatch[1].trim() : '창조주';

                // 선택지 섹션 추출
                const choicesSection = text.match(/선택지:[\s\S]*?(?=성향:|$)/);

                if (choicesSection) {
                    const choices = [];
                    const choicesSectionText = choicesSection[0];

                    // eslint-disable-next-line no-console
                    console.log("선택지 섹션 전체:", choicesSectionText);

                    // 숫자로 시작하는 선택지 블록을 찾음 (여러 줄에 걸쳐 있을 수 있음)
                    const choiceBlockRegex = /^\d+\.\s*([\s\S]*?)(?=^\d+\.|\s*$)/gm;
                    let choiceBlocks = [];

                    // 정규식으로 선택지 블록 추출 시도
                    const choiceBlockMatches = choicesSectionText.matchAll(choiceBlockRegex);
                    for (const blockMatch of choiceBlockMatches) {
                        if (blockMatch[1] && blockMatch[1].trim()) {
                            choiceBlocks.push(blockMatch[1].trim());
                        }
                    }

                    // 정규식으로 추출 실패 시 대체 방법 사용
                    if (choiceBlocks.length === 0) {
                        // 선택지 라인 추출 (숫자로 시작하는 라인)
                        const choiceLines = choicesSectionText.split('\n')
                            .filter(line => /^\d+\./.test(line.trim()));

                        for (const line of choiceLines) {
                            const choiceMatch = line.match(/^\d+\.\s*(.*?)$/);
                            if (choiceMatch && choiceMatch[1].trim()) {
                                choiceBlocks.push(choiceMatch[1].trim());
                            }
                        }
                    }

                    // 디버깅: 추출된 선택지 블록 출력
                    // eslint-disable-next-line no-console
                    console.log("추출된 선택지 블록:", choiceBlocks);

                    // 선택지 배열 생성
                    choices.push(...choiceBlocks.map(block => block.replace(/^["']|["']$/g, '')));

                    // 선택지가 없는 경우, 기본 선택지를 사용
                    if (choices.length === 0) {
                        choices.push(...getFallbackChoices());
                    }

                    if (choices.length > 0) {
                        result.choice = {
                            speaker: speaker,
                            choices: choices
                        };
                    }
                }
            } else {
                // 타입 태그가 없는 경우 전체 텍스트를 내러티브로 처리
                result.narrative = text.trim();
            }

            // eslint-disable-next-line no-console
            console.log("파싱된 통합 응답:", {
                narrative: result.narrative ? result.narrative.substring(0, 100) + "..." : "없음",
                choice: result.choice ? `${result.choice.choices.length}개` : "없음",
                tendency: result.tendency
            });

            return result;
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("통합 응답 파싱 오류:", error);
            return {
                narrative: text.trim(),
                choice: {
                    speaker: '창조주',
                    choices: getFallbackChoices()
                },
                tendency: '미정'
            };
        }
    };



    // --- 기본 선택지 (API 호출 실패 시 폴백) ---
    const getFallbackChoices = () => {
        return [
            "희미해진 마법의 힘을 되살려 세상에 균형을 되찾고, 자연의 순환을 회복시킨다. 이는 필멸자들의 삶에 직접적인 영향을 미치며, 그들의 문명에 마법이 다시 스며들게 할 것이다. 하지만 과도한 마법의 힘은 예측불가능한 혼란을 초래할 수도 있다. 고대의 유적에서 마법의 핵심을 찾아내고, 그것을 이용하여 세상의 균형을 조절하는 위험하고도 웅장한 계획이다.",
            "필멸자들의 문명을 관찰하고, 그들의 발전을 지원하며, 그들과 공존하는 방법을 찾는다. 이는 장기적인 계획이며, 나의 힘을 은밀히 사용하여 그들의 사회 발전에 도움을 주는 방식으로 진행될 것이다. 하지만 그들의 발전 속도와 방향을 예측하기 어렵고, 내가 원하는 방향으로 이끌 수 없을 가능성도 있다. 섬세하고 장기적인 관찰과 조율이 필요한 전략이다.",
            "현재의 세상을 버리고, 새로운 세상을 창조하거나, 혹은 과거의 찬란했던 시대로 돌아가는 방법을 모색한다. 이것은 가장 강력하지만 동시에 가장 위험한 선택지이다. 현재 세상의 모든 생명체를 희생할 가능성도 있지만, 나의 의지대로 세상을 다시 만들 수 있는 기회이기도 하다. 하지만 과거로의 회귀는 불가능할 수도 있으며, 새로운 세상의 창조는 또 다른 긴 시간과 엄청난 노력을 필요로 할 것이다."
        ];
    };

    // --- 기본 내러티브 (API 호출 실패 시 폴백) ---
    const getFallbackNarrative = () => {
        return `당신은 눈을 뜨자마자 주변의 모든 것이 낯설게 느껴집니다.\n오랜 시간 동안 잠들어 있었던 것 같은 느낌이 듭니다.\n\n주변을 둘러보니, 한때 당신이 창조했던 세상은 많이 변해 있습니다.\n마법의 기운은 희미해졌고, 고대의 유적들은 폐허가 되었으며, 필멸자들은 자신들만의 문명을 발전시켜 왔습니다.\n\n당신은 이제 이 변화된 세상에서 무엇을 할지 결정해야 합니다.`;
    };


    // --- 통합된 내러티브 및 선택지 요청 함수 (개선된 오류 처리) ---
    const requestIntegratedContent = async (currentLog, currentTendency, isStoryOnlyMode = false) => {
        if (!docRef.current) {
            // eslint-disable-next-line no-console
            console.error("Firestore 문서 참조가 없습니다.");
            setIsProcessing(false);
            return;
        }

        // eslint-disable-next-line no-console
        console.log("통합된 내용 요청 시작:", { logLength: currentLog.length, tendency: currentTendency, storyOnlyMode: isStoryOnlyMode });

        const newItems = [];
        let updatedTendency = currentTendency;

        try {
            // 통합된 API 호출 (스토리 전용 모드에 따라 다른 프롬프트 사용)
            const response = await callGeminiIntegratedAPI(currentLog, currentTendency, isStoryOnlyMode);
            const parsedResponse = parseIntegratedResponse(response);

            if (parsedResponse.narrative && parsedResponse.narrative.trim()) {
                // eslint-disable-next-line no-console
                console.log("내러티브 파싱 성공:", {
                    narrativeLength: parsedResponse.narrative.length,
                    tendency: parsedResponse.tendency
                });

                const narrativeItem = {
                    id: Date.now() + Math.random(),
                    type: 'narrative',
                    text: parsedResponse.narrative,
                    timestamp: new Date().toISOString()
                };
                newItems.push(narrativeItem);
            } else {
                // eslint-disable-next-line no-console
                console.warn("내러티브 생성 실패: 유효한 내러티브가 없습니다. 기본 내러티브를 사용합니다.");

                // 폴백 내러티브 사용
                const narrativeItem = {
                    id: Date.now() + Math.random(),
                    type: 'narrative',
                    text: getFallbackNarrative(),
                    timestamp: new Date().toISOString()
                };
                newItems.push(narrativeItem);
            }

            // 스토리 전용 모드가 아닐 때만 선택지 생성
            if (!isStoryOnlyMode) {
                if (parsedResponse.choice && parsedResponse.choice.choices && parsedResponse.choice.choices.length > 0) {
                    // eslint-disable-next-line no-console
                    console.log("선택지 파싱 성공:", {
                        choiceCount: parsedResponse.choice.choices.length,
                        speaker: parsedResponse.choice.speaker
                    });

                    const choiceItem = {
                        id: Date.now() + Math.random() + 1,
                        type: 'choice',
                        speaker: parsedResponse.choice.speaker,
                        choices: parsedResponse.choice.choices,
                        timestamp: new Date().toISOString()
                    };
                    newItems.push(choiceItem);
                } else {
                    // eslint-disable-next-line no-console
                    console.warn("선택지 생성 실패: 유효한 선택지가 없습니다. 기본 선택지를 사용합니다.");

                    // 폴백 선택지 사용
                    const choiceItem = {
                        id: Date.now() + Math.random() + 1,
                        type: 'choice',
                        speaker: '창조주',
                        choices: getFallbackChoices(),
                        timestamp: new Date().toISOString()
                    };
                    newItems.push(choiceItem);
                }
            } else {
                // eslint-disable-next-line no-console
                console.log("스토리 전용 모드: 선택지 생성 건너뜀");
            }

            // 성향 업데이트
            if (parsedResponse.tendency) {
                updatedTendency = parsedResponse.tendency;
            }
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("통합된 내용 요청 실패:", error);

            // 오류 발생 시 폴백 내용 사용
            const narrativeItem = {
                id: Date.now() + Math.random(),
                type: 'narrative',
                text: getFallbackNarrative(),
                timestamp: new Date().toISOString()
            };
            newItems.push(narrativeItem);
            
            // 스토리 전용 모드가 아닐 때만 폴백 선택지 생성
            if (!isStoryOnlyMode) {
                const choiceItem = {
                    id: Date.now() + Math.random() + 1,
                    type: 'choice',
                    speaker: '창조주',
                    choices: getFallbackChoices(),
                    timestamp: new Date().toISOString()
                };
                newItems.push(choiceItem);
            }
        }

        try {
            // 현재 로그에 새 아이템들 추가
            const updatedLog = [...currentLog, ...newItems];

            // Firestore 업데이트
            await setDoc(docRef.current, {
                log: updatedLog,
                tendency: updatedTendency,
                lastUpdated: new Date().toISOString()
            });

            // eslint-disable-next-line no-console
            console.log("통합된 내용이 성공적으로 추가되었습니다.");
            
            // 성공 시에도 처리 상태 해제
            setIsProcessing(false);
        } catch (dbError) {
            // eslint-disable-next-line no-console
            console.error("Firestore 업데이트 실패:", dbError);
            setIsProcessing(false);
        }
    };

    // --- 사용자 입력 처리 ---
    const handleSubmit = async (message) => {
        if (!docRef.current) return;

        try {
            setIsProcessing(true);

            // 사용자 메시지 추가
            const userItem = {
                id: Date.now() + Math.random(),
                type: 'user',
                text: message,
                timestamp: new Date().toISOString()
            };

            const updatedLog = [...log, userItem];

            // Firestore 업데이트 (사용자 메시지만)
            await setDoc(docRef.current, {
                log: updatedLog,
                tendency: playerTendency,
                lastUpdated: new Date().toISOString()
            });

            // 사용자 입력 후 통합된 내용 요청 (스토리 전용 모드에 따라 다른 내용 생성)
            await requestIntegratedContent(updatedLog, playerTendency, storyOnlyMode);

        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("메시지 처리 실패:", error);
            setIsProcessing(false);
        }
    };

    // --- 선택지 클릭 처리 ---
    const handleChoiceClick = async (choiceText) => {
        await handleSubmit(choiceText);
    };

    // --- 스토리 전용 모드 토글 처리 ---
    const handleStoryOnlyModeChange = (newMode) => {
        // eslint-disable-next-line no-console
        console.log('스토리 전용 모드 변경:', newMode ? '활성화' : '비활성화');
        setStoryOnlyMode(newMode);
        
        if (newMode && !isTyping && !isProcessing && log.length > 0) {
            // 스토리 전용 모드가 활성화되고, 현재 타이핑 중이 아니며, 처리 중이 아닐 때
            // 마지막 아이템이 내러티브라면 자동으로 다음 이야기 생성 시작
            const lastItem = log[log.length - 1];
            if (lastItem && lastItem.type === 'narrative') {
                // eslint-disable-next-line no-console
                console.log('스토리 전용 모드 활성화: 즉시 다음 이야기 생성');
                setTimeout(() => {
                    if (storyOnlyMode && !isProcessing) {
                        requestIntegratedContent(log, playerTendency, true);
                    }
                }, 1000);
            }
        } else if (!newMode && !isTyping && !isProcessing && log.length > 0) {
            // 스토리 전용 모드가 비활성화될 때의 처리
            const lastItem = log[log.length - 1];
            if (lastItem && lastItem.type === 'narrative') {
                // eslint-disable-next-line no-console
                console.log('스토리 전용 모드 비활성화: 현재 이야기 맥락을 유지하면서 선택지 생성');
                // 현재 이야기 맥락을 유지하면서 선택지 생성
                setTimeout(() => {
                    if (!storyOnlyMode && !isProcessing) {
                        requestIntegratedContent(log, playerTendency, false);
                    }
                }, 1000);
            }
        }
    };

    // 초기 로딩 상태 (인증이 준비되지 않았거나 초기 데이터 로딩 중)
    if (!isAuthReady || (isProcessing && log.length === 0)) {
        return <InitialLoadingScreen />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white h-screen w-full flex flex-col font-sans" style={{
            fontSize: '12px',
            backgroundImage: `url('https://images.unsplash.com/photo-1578662996442-48f60103fc96?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed'
        }}>
            <div className="mx-auto px-4 py-8">
                <div
                    ref={scrollRef}
                    className="space-y-6 mb-8 h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-purple-600 scrollbar-track-slate-800"
                >
                    {log.map((item, index) => {
                        // 현재 타이핑 중이고, 이 아이템이 가장 최근에 추가된 narrative이며, 아직 타이핑 완료되지 않은 경우 isLatest를 true로 설정
                        let isLatest = false;
                        if (item.type === 'narrative' && isTyping && !typedNarrativeIds.has(item.id)) {
                            // 가장 최근에 추가된 narrative 아이템 찾기
                            const lastNarrativeIndex = log.map((logItem, idx) => logItem.type === 'narrative' ? idx : -1)
                                .filter(idx => idx !== -1)
                                .pop();
                            isLatest = index === lastNarrativeIndex;
                        }

                        return (
                            <StoryLogItem
                                key={item.id || `${item.type}-${index}`}
                                item={item}
                                onChoiceClick={handleChoiceClick}
                                isLatest={isLatest}
                                onTypingComplete={handleTypingComplete}
                                isTyping={isTyping}
                                storyOnlyMode={storyOnlyMode}
                            />
                        );
                    })}

                    {isProcessing && log.length > 0 && (
                        <div className="mx-auto mb-8 fade-in">
                            <div className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl p-8 shadow-2xl border border-purple-500/30 text-center">
                                <CuteLoadingAnimation />
                                <p className="text-purple-200 mt-2">
                                    🎭 창조주님의 선택을 바탕으로 새로운 이야기를 만들고 있어요! 🎭
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <BottomInterface
                    onSubmit={handleSubmit}
                    isProcessing={isProcessing}
                    tendency={playerTendency}
                    onResetData={resetGameData}
                    isTyping={isTyping}
                    storyOnlyMode={storyOnlyMode}
                    onStoryOnlyModeChange={handleStoryOnlyModeChange}
                />
            </div>
        </div>
    );
}