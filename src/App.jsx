import React, { useState, useEffect, createContext } from "react";
import { useGameStore } from "./store/gameSlice";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, query, where, orderBy, limit } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import StatusBar from "./components/StatusBar";
import AdvisorPanel from "./components/AdvisorPanel";
import PolicyPanel from "./components/PolicyPanel";
import CityManager from "./components/CityManager";
import GameEngine from "./components/GameEngine";
import HistoryLog from "./components/HistoryLog";
import MapView from "./components/MapView";
import ResourceDashboard from "./components/ResourceDashboard";
import DiplomaticRelations from "./components/DiplomaticRelations";
import MilitaryCommand from "./components/MilitaryCommand";
import TechnologyTree from "./components/TechnologyTree";

// 서비스 컨텍스트 생성
export const ServiceContext = createContext(null);

// Firebase 구성 - 환경 변수 사용
const firebaseConfig = {
    apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
    authDomain: "text-adventure-game-cb731.firebaseapp.com",
    projectId: "text-adventure-game-cb731",
    storageBucket: "text-adventure-game-cb731.appspot.com",
    messagingSenderId: "1092941614820",
    appId: "1:1092941614820:web:5545f36014b73c268026f1"
};

// Groq API 구성 - 환경 변수 사용
const GROQ_API_KEY = "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// 환경 변수 사용 안내 로그
if (!process.env.REACT_APP_FIREBASE_API_KEY || !process.env.REACT_APP_GROQ_API_KEY) {
    console.warn("환경 변수가 설정되지 않았습니다. 기본값을 사용합니다. 프로덕션 환경에서는 .env 파일에 실제 API 키를 설정하세요.");
}

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export default function App() {
    const { gameOver, result } = useGameStore();
    const [showMap, setShowMap] = useState(false);
    const [showDashboard, setShowDashboard] = useState(false);
    const [showDiplomacy, setShowDiplomacy] = useState(false);
    const [showMilitary, setShowMilitary] = useState(false);
    const [showTechnology, setShowTechnology] = useState(false);
    
    // 사용자 인증 상태
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // AI 응답 상태
    const [aiResponse, setAiResponse] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);
    
    // Firebase 인증 처리
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                // 사용자가 이미 로그인되어 있음
                setUser(user);
                setLoading(false);
                
                // 사용자 인증 후 게임 데이터 로드
                loadGameData(user.uid);
            } else {
                // 익명 로그인 진행
                signInAnonymously(auth)
                    .then((result) => {
                        setUser(result.user);
                        setLoading(false);
                        
                        // 새 사용자 로그인 후 게임 데이터 로드
                        loadGameData(result.user.uid);
                    })
                    .catch((error) => {
                        console.error("익명 로그인 실패:", error);
                        setLoading(false);
                    });
            }
        });
        
        // 컴포넌트 언마운트 시 구독 해제
        return () => unsubscribe();
    }, []);
    
    // 게임 데이터 주기적 저장
    useEffect(() => {
        if (!user) return;
        
        // 5분마다 게임 데이터 자동 저장
        const saveInterval = setInterval(() => {
            saveGameData();
        }, 5 * 60 * 1000);
        
        return () => clearInterval(saveInterval);
    }, [user]);
    
    // 게임 데이터 로드 함수
    const loadGameData = async (userId) => {
        try {
            const docRef = doc(db, "gameData", userId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data && data.gameState) {
                    const gameState = JSON.parse(data.gameState);
                    // 게임 상태 복원
                    useGameStore.setState(gameState);
                    console.log("게임 데이터 로드 완료");
                }
            } else {
                console.log("저장된 게임 데이터가 없습니다. 새 게임을 시작합니다.");
            }
        } catch (error) {
            console.error("게임 데이터 로드 실패:", error);
        }
    };
    
    // 게임 데이터 저장 함수
    const saveGameData = async () => {
        if (!user) return;
        
        try {
            const gameState = useGameStore.getState();
            await setDoc(doc(db, "gameData", user.uid), {
                gameState: JSON.stringify(gameState),
                lastUpdated: new Date().toISOString()
            });
            console.log("게임 데이터 저장 완료");
        } catch (error) {
            console.error("게임 데이터 저장 실패:", error);
        }
    };
    
    // AI 어드바이저 함수
    const getAIAdvice = async (situation) => {
        setAiLoading(true);
        
        try {
            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "llama3-70b-8192",
                    messages: [
                        {
                            role: "system",
                            content: "당신은 왕국의 현명한 조언자입니다. 왕국의 상황을 분석하고 최선의 조언을 제공하세요."
                        },
                        {
                            role: "user",
                            content: situation
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.7
                })
            });
            
            const data = await response.json();
            
            if (data.choices && data.choices.length > 0) {
                setAiResponse(data.choices[0].message.content);
            } else {
                console.error("AI 응답 형식 오류:", data);
                setAiResponse("조언을 제공할 수 없습니다. 나중에 다시 시도해주세요.");
            }
        } catch (error) {
            console.error("AI 조언 요청 실패:", error);
            setAiResponse("네트워크 오류로 조언을 제공할 수 없습니다.");
        } finally {
            setAiLoading(false);
        }
    };

    // 서비스 컨텍스트에 제공할 값
    const serviceValue = {
        // Firebase 서비스
        auth,
        db,
        user,
        saveGameData,
        
        // AI 서비스
        getAIAdvice,
        aiResponse,
        aiLoading,
        
        // 상태
        loading
    };

    // 로딩 중 표시
    if (loading) {
        return (
            <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
                <h1>왕국 통치 시뮬레이션</h1>
                <p>게임 데이터를 불러오는 중입니다...</p>
            </div>
        );
    }

    return (
        <ServiceContext.Provider value={serviceValue}>
            <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif" }}>
                <h1>왕국 통치 시뮬레이션 (대형 SLG 버전)</h1>

                {gameOver ? (
                    <section>
                        <h2>게임 종료</h2>
                        <p>
                            {result.reason} 때문에 <strong>{result.result}</strong>했습니다.
                        </p>
                        <button 
                            onClick={() => useGameStore.getState().resetGame()}
                            style={{
                                padding: "0.5rem 1rem",
                                backgroundColor: "#4a90e2",
                                color: "#fff",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                marginTop: "1rem"
                            }}
                        >
                            새 게임 시작
                        </button>
                    </section>
                ) : (
                    <>
                        <StatusBar />
                        
                        <div className="game-controls" style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                            <button 
                                onClick={() => setShowMap(!showMap)}
                                className="control-button"
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: showMap ? "#4a90e2" : "#3a3a3a",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                {showMap ? "맵 숨기기" : "맵 보기"}
                            </button>
                            
                            <button 
                                onClick={() => setShowDashboard(!showDashboard)}
                                className="control-button"
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: showDashboard ? "#7ed321" : "#3a3a3a",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                {showDashboard ? "대시보드 숨기기" : "자원 대시보드"}
                            </button>
                            
                            <button 
                                onClick={() => setShowDiplomacy(!showDiplomacy)}
                                className="control-button"
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: showDiplomacy ? "#e74c3c" : "#3a3a3a",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                {showDiplomacy ? "외교 관계 숨기기" : "외교 관계"}
                            </button>
                            
                            <button 
                                onClick={() => setShowMilitary(!showMilitary)}
                                className="control-button"
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: showMilitary ? "#8e44ad" : "#3a3a3a",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                {showMilitary ? "군사 지휘부 숨기기" : "군사 지휘부"}
                            </button>
                            
                            <button 
                                onClick={() => setShowTechnology(!showTechnology)}
                                className="control-button"
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: showTechnology ? "#f39c12" : "#3a3a3a",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                {showTechnology ? "기술 트리 숨기기" : "기술 연구"}
                            </button>
                            
                            <button 
                                onClick={saveGameData}
                                className="control-button"
                                style={{
                                    padding: "0.5rem 1rem",
                                    backgroundColor: "#27ae60",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer"
                                }}
                            >
                                게임 저장
                            </button>
                        </div>
                        
                        {showMap && <MapView />}
                        {showDashboard && <ResourceDashboard />}
                        {showDiplomacy && <DiplomaticRelations />}
                        {showMilitary && <MilitaryCommand />}
                        {showTechnology && <TechnologyTree />}
                        
                        <div className="game-panels" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                            <div style={{ flex: "1", minWidth: "300px" }}>
                                <AdvisorPanel />
                                <PolicyPanel />
                            </div>
                            <div style={{ flex: "1", minWidth: "300px" }}>
                                <CityManager />
                                <GameEngine />
                            </div>
                        </div>
                    </>
                )}

                <HistoryLog />
            </div>
        </ServiceContext.Provider>
    );
}
