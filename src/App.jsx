// App.jsx - 메인 애플리케이션 컴포넌트
import React, { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, query, where, orderBy, limit } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// 컴포넌트 임포트
import ChatInterface from "./components/ChatInterface";
import ChoiceButtons from "./components/ChoiceButtons";
import MessageInput from "./components/MessageInput";
import useGameMaster from "./components/GameMaster";

// 스토어 임포트
import useGameStore from "./stores/gameStore";

// 스타일 임포트
import "./styles/App.css";

// Firebase 구성
const firebaseConfig = {
    apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
    authDomain: "text-adventure-game-cb731.firebaseapp.com",
    projectId: "text-adventure-game-cb731",
    storageBucket: "text-adventure-game-cb731.appspot.com",
    messagingSenderId: "1092941614820",
    appId: "1:1092941614820:web:5545f36014b73c268026f1"
};

// Groq API 호출 함수
const callGroqLlmApi = async (prompt, systemPrompt, model = "llama-3.1-405b-reasoning") => {
    const GROQ_API_KEY = "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";
    const url = "https://api.groq.com/openai/v1/chat/completions";
    const payload = {
        model,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        response_format: { type: "text" },
    };
    
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`,
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

// Gemini API 호출 함수
const callGeminiLlmApi = async (userPrompt, systemPromptToUse) => {
    const mainApiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
    const backupApiKey = "AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84";
    const getApiUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [
            { role: "user", parts: [{ text: systemPromptToUse }] },
            { role: "model", parts: [{ text: "{\"response_format\": \"json\"}" }] },
            { role: "user", parts: [{ text: userPrompt }] }
        ],
        generationConfig: {
            responseMimeType: "application/json",
        }
    };
    
    const tryGeminiCall = async (apiKey) => fetch(getApiUrl(apiKey), { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify(payload) 
    });

    try {
        let response = await tryGeminiCall(mainApiKey);
        if (!response.ok) response = await tryGeminiCall(backupApiKey);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const result = await response.json();
        const llmOutputText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

        const jsonMatch = llmOutputText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
        if (jsonMatch && jsonMatch[0]) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.warn("JSON 파싱 실패, 원본 텍스트를 반환하여 재시도 로직에서 처리합니다.", e);
                return llmOutputText;
            }
        }

        console.warn("LLM 응답에서 유효한 JSON 객체나 배열을 찾지 못했습니다.");
        return llmOutputText;

    } catch (error) {
        console.error("LLM API 호출 중 치명적 오류 발생:", error);
        return null;
    }
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

/**
 * 메인 애플리케이션 컴포넌트
 * - 전체 게임 레이아웃 관리
 * - 컴포넌트 간 통신 조율
 * - Firebase 인증 처리
 * - 게임 상태 초기화
 */
function App() {
  // 게임 스토어 상태
  const { 
    isGameStarted, 
    isWaitingForChoice, 
    startGame, 
    addMessage,
    updatePlayerStats,
    setError 
  } = useGameStore();
  
  // 로컬 상태
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  // GameMaster 훅 사용
  const gameMaster = useGameMaster({
    groqApiCall: callGroqLlmApi,
    geminiApiCall: callGeminiLlmApi
  });

  // Firebase 인증 초기화
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        console.log("사용자 인증됨:", user.uid);
      } else {
        // 익명 로그인
        try {
          const result = await signInAnonymously(auth);
          setUser(result.user);
          console.log("익명 사용자 생성됨:", result.user.uid);
        } catch (error) {
          console.error("익명 로그인 실패:", error);
          setError("인증 중 오류가 발생했습니다.");
        }
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, [setError]);

  // 게임 시작 핸들러
  const handleStartGame = useCallback(() => {
    startGame();
  }, [startGame]);

  // 선택지 선택 핸들러
  const handleChoiceSelect = useCallback(async (selectedChoice) => {
    try {
      // 선택지 효과 적용
      if (selectedChoice.effects && selectedChoice.effects.length > 0) {
        const statUpdates = {};
        selectedChoice.effects.forEach(effect => {
          if (effect.stat && typeof effect.value === 'number') {
            statUpdates[effect.stat] = effect.value;
          }
        });
        
        if (Object.keys(statUpdates).length > 0) {
          updatePlayerStats(statUpdates);
        }
      }
      
      // AI에게 선택 결과 처리 요청
      await gameMaster.handlePlayerAction(selectedChoice.text);
      
    } catch (error) {
      console.error('선택지 처리 오류:', error);
      setError('선택지 처리 중 오류가 발생했습니다.');
    }
  }, [gameMaster, updatePlayerStats, setError]);

  // 메시지 전송 핸들러
  const handleSendMessage = useCallback(async (message) => {
    try {
      // 플레이어 메시지 추가
      addMessage({
        type: 'player',
        content: message,
        sender: 'Player'
      });
      
      // AI에게 메시지 처리 요청
      await gameMaster.handlePlayerAction(message);
      
    } catch (error) {
      console.error('메시지 전송 오류:', error);
      setError('메시지 전송 중 오류가 발생했습니다.');
    }
  }, [gameMaster, addMessage, setError]);

  // 로딩 중 화면
  if (isAuthLoading) {
    return (
      <div className="app-loading">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <h2>창조의 여정을 준비하는 중...</h2>
          <p>잠시만 기다려주세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-container">
        {!isGameStarted ? (
          // 게임 시작 화면
          <div className="game-start-screen">
            <div className="start-content">
              <div className="game-logo">
                <span className="logo-icon">🌟</span>
                <h1>창조의 여정</h1>
                <p className="game-subtitle">AI와 함께하는 인터랙티브 시뮬레이션</p>
              </div>
              
              <div className="game-description">
                <h3>🌌 새로운 세계의 창조자가 되어보세요</h3>
                <ul>
                  <li>🎭 AI 게임 마스터가 들려주는 흥미진진한 스토리</li>
                  <li>⚡ 당신의 선택이 만들어가는 독특한 세계</li>
                  <li>🏆 창조와 발전을 통한 성취감</li>
                  <li>💫 무한한 가능성의 인터랙티브 경험</li>
                </ul>
              </div>
              
              <button 
                className="start-game-button"
                onClick={handleStartGame}
              >
                <span className="button-icon">🚀</span>
                창조의 여정 시작하기
              </button>
              
              <div className="start-footer">
                <p>당신의 선택이 새로운 세계를 만들어갑니다</p>
              </div>
            </div>
          </div>
        ) : (
          // 게임 플레이 화면
          <div className="game-play-screen">
            {/* 채팅 인터페이스 */}
            <div className="chat-section">
              <ChatInterface />
            </div>
            
            {/* 선택지 또는 입력창 */}
            <div className="interaction-section">
              {isWaitingForChoice ? (
                <ChoiceButtons onChoiceSelect={handleChoiceSelect} />
              ) : (
                <MessageInput onSendMessage={handleSendMessage} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
// App.jsx 끝