// Import React
import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import PropTypes from 'prop-types';

// Import Firebase
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8',
  authDomain: 'text-adventure-game-cb731.firebaseapp.com',
  projectId: 'text-adventure-game-cb731',
  storageBucket: 'text-adventure-game-cb731.appspot.com',
  messagingSenderId: '1092941614820',
  appId: '1:1092941614820:web:5545f36014b73c268026f1',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const firebase = { doc, getDoc, setDoc, collection, getDocs };

// LLM API module
// 다중 API 키 관리 및 LLM 서비스 폴백 메커니즘 구현
// 호출 시도 순서:
// 1. Groq LLM > MAIN_GROQ_API_KEY
// 2. Groq LLM > SUBGROQ_API_KEY
// 3. GEMINI LLM > MAIN_GEMINI_API_KEY
// 4. GEMINI LLM > SUB_GEMINI_API_KEY
// 5. GEMINI LLM > THIRD_GEMINI_API_KEY
// 
// 각 LLM 서비스는 API 키 오류(인증, 사용량 제한 등)가 발생하면 다음 API 키로 자동 전환
// 모든 API 키가 실패하면 다음 LLM 서비스로 전환
// 모든 LLM 서비스와 API 키 조합이 실패하면 오류 메시지 반환
// 한글 응답 보장을 위한 추가 방어 로직 포함
const LlmApi = {
  // 한글만 포함되어 있는지 확인하는 함수
  isKoreanOnly: (text) => {
    // 한글, 숫자, 일부 특수문자만 허용하는 정규식
    const nonKoreanRegex = /[^가-힣ㄱ-ㅎㅏ-ㅣ\d\s.,?!()"'+-]/u;
    return !nonKoreanRegex.test(text);
  },
  // JSON 객체 내의 모든 문자열 값이 한글인지 확인하는 함수
  checkKoreanInObject: (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string' && obj[key].trim() !== '') {
        if (!LlmApi.isKoreanOnly(obj[key])) {
          console.log(`비한글 텍스트 감지: "${key}" 필드에서 "${obj[key].substring(0, 30)}..."`);
          return false;
        }
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        if (Array.isArray(obj[key])) {
          for (const item of obj[key]) {
            if (typeof item === 'object' && item !== null) {
              if (!LlmApi.checkKoreanInObject(item)) return false;
            } else if (typeof item === 'string' && item.trim() !== '') {
              if (!LlmApi.isKoreanOnly(item)) {
                console.log(`비한글 텍스트 감지: 배열 내 "${item.substring(0, 30)}..."`);
                return false;
              }
            }
          }
        } else {
          if (!LlmApi.checkKoreanInObject(obj[key])) return false;
        }
      }
    }
    return true;
  },
  robustJsonParse: (text) => {
    try {
      return JSON.parse(text);
    } catch (e) {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch && jsonMatch[0]) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e2) { throw new Error("Extracted JSON is also invalid"); }
      }
      throw new Error("No valid JSON object found in the response");
    }
  },
  callApiForText: async (prompt) => {
    const GROQ_API_KEY = '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';
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const payload = { model: "llama3-70b-8192", messages: [{ role: 'user', content: prompt }], temperature: 0.7 };
    
    // 한글 응답을 위한 방어 로직 구현
    const maxRetries = 10; // 최대 재시도 횟수
    let retryCount = 0;
    let content = '';
    
    while (retryCount < maxRetries) {
      try {
        const response = await fetch(url, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` }, 
          body: JSON.stringify(payload) 
        });
        
        if (!response.ok) throw new Error(`Text API Error: ${response.status}`);
        
        const result = await response.json();
        content = result.choices?.[0]?.message?.content || '';
        
        // 한글만 포함된 응답인지 확인
        if (LlmApi.isKoreanOnly(content)) {
          console.log(`한글 응답 성공 (시도: ${retryCount + 1}/${maxRetries})`);
          return content;
        }
        
        console.log(`비한글 응답 감지, 재시도 중... (${retryCount + 1}/${maxRetries})`);
        retryCount++;
        
        // 한글 변환 요청 추가
        if (retryCount >= 3) {
          // 몇 번 실패하면 명시적으로 한글 변환 요청
          payload.messages = [{ 
            role: 'user', 
            content: `다음 내용을 한국어로만 답변해주세요. 영어나 다른 언어는 절대 포함하지 마세요: ${prompt}` 
          }];
        }
      } catch (error) {
        console.error(`API 호출 오류 (시도: ${retryCount + 1}/${maxRetries}):`, error);
        retryCount++;
        // 잠시 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // 최대 재시도 횟수를 초과한 경우, 마지막으로 받은 응답 반환
    console.warn(`최대 재시도 횟수(${maxRetries})를 초과했습니다. 마지막 응답을 반환합니다.`);
    return content;
  },
  callGroq: async (history, systemPrompt) => {
    const MAIN_GROQ_API_KEY = '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';
    const SUBGROQ_API_KEY = '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';
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const originalPayload = { 
      model: "llama3-70b-8192", 
      messages: [
        { role: 'system', content: systemPrompt + "\n\n중요: 모든 텍스트는 반드시 한국어로만 작성해야 합니다. 영어나 다른 언어는 절대 포함하지 마세요." }, 
        ...history
      ], 
      temperature: 0.8, 
      max_tokens: 2048, 
      response_format: { type: 'json_object' } 
    };
    
    // 한글 응답을 위한 방어 로직 구현
    const maxRetries = 10; // 최대 재시도 횟수
    let retryCount = 0;
    let content = '{}';
    let parsedContent = {};
    let currentApiKey = MAIN_GROQ_API_KEY; // 시작은 메인 API 키로
    let isUsingMainKey = true; // 현재 메인 키 사용 여부 추적
    
    while (retryCount < maxRetries) {
      try {
        // 페이로드 복사 (수정될 수 있으므로)
        const payload = JSON.parse(JSON.stringify(originalPayload));
        
        // 재시도 횟수에 따라 시스템 프롬프트 강화
        if (retryCount > 0) {
          payload.messages[0].content = systemPrompt + `\n\n매우 중요: 이전 응답에 한국어가 아닌 텍스트가 포함되어 있었습니다. 모든 텍스트는 반드시 한국어로만 작성해야 합니다. 영어나 다른 언어는 절대 포함하지 마세요. 이는 ${retryCount}번째 재시도입니다.`;
        }
        
        const response = await fetch(url, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentApiKey}` },
          body: JSON.stringify(payload) 
        });
        
        if (!response.ok) {
          // API 키 관련 오류 (401, 403, 429 등)인 경우 API 키 전환
          if ([401, 403, 429].includes(response.status) && isUsingMainKey) {
            console.warn(`Groq 메인 API 키 오류 (${response.status}), 보조 API 키로 전환합니다.`);
            currentApiKey = SUBGROQ_API_KEY;
            isUsingMainKey = false;
            continue; // 재시도 카운트 증가 없이 즉시 다시 시도
          }
          throw new Error(`Groq API Error: ${response.status}`);
        }
        
        const result = await response.json();
        content = result.choices?.[0]?.message?.content || '{}';
        
        try {
          // JSON 파싱 시도
          parsedContent = LlmApi.robustJsonParse(content);
          
          // JSON 내의 모든 문자열 값이 한글인지 확인
          let allKorean = true;
          
          if (LlmApi.checkKoreanInObject(parsedContent)) {
            console.log(`한글 JSON 응답 성공 (시도: ${retryCount + 1}/${maxRetries}, API 키: ${isUsingMainKey ? '메인' : '보조'})`);
            return parsedContent;
          }
          
          console.log(`JSON에 비한글 텍스트 포함, 재시도 중... (${retryCount + 1}/${maxRetries})`);
        } catch (parseError) {
          // JSON 파싱 실패 시 수정 시도
          console.log(`JSON 파싱 실패, 수정 시도 중... (${retryCount + 1}/${maxRetries})`);
          const fixPrompt = `다음 텍스트는 유효하지 않은 JSON입니다. 다른 설명 없이, 오직 유효한 JSON 객체만 반환하도록 수정해주세요. 모든 텍스트는 반드시 한국어로만 작성해야 합니다:\n\n${content}`;
          const fixedContent = await LlmApi.callApiForText(fixPrompt);
          
          try {
            parsedContent = LlmApi.robustJsonParse(fixedContent);
            // 수정된 JSON도 한글인지 확인
            if (LlmApi.checkKoreanInObject(parsedContent)) {
              console.log(`수정된 한글 JSON 응답 성공 (시도: ${retryCount + 1}/${maxRetries}, API 키: ${isUsingMainKey ? '메인' : '보조'})`);
              return parsedContent;
            }
          } catch (e) {
            console.error(`수정된 JSON도 파싱 실패 (시도: ${retryCount + 1}/${maxRetries})`);
          }
        }
        
        retryCount++;
        // 잠시 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`API 호출 오류 (시도: ${retryCount + 1}/${maxRetries}, API 키: ${isUsingMainKey ? '메인' : '보조'}):`, error);
        
        // 메인 키 사용 중 오류 발생 시 보조 키로 전환
        if (isUsingMainKey) {
          console.warn(`Groq 메인 API 키 오류, 보조 API 키로 전환합니다.`);
          currentApiKey = SUBGROQ_API_KEY;
          isUsingMainKey = false;
          // 키 전환 시에는 재시도 카운트를 증가시키지 않음
          continue;
        }
        
        retryCount++;
        // 잠시 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    // 최대 재시도 횟수를 초과한 경우, 마지막으로 받은 응답 반환
    console.warn(`최대 재시도 횟수(${maxRetries})를 초과했습니다. 마지막 응답을 반환합니다.`);
    
    try {
      return parsedContent;
    } catch (e) {
      // 마지막 시도로 기본 객체 반환
      return { chatMessage: "[시스템 오류] 한글 응답을 받지 못했습니다.", choices: [] };
    }
  },
  callGemini: async (history, systemPrompt) => {
    const MAIN_GEMINI_API_KEY = 'AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8';
    const SUB_GEMINI_API_KEY = 'AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84';
    const THIRD_GEMINI_API_KEY = 'AIzaSyCH-v67rjijFO_So2mTDj_-qIy2aNJYgz0';
    
    const convertedHistory = history.map(item => ({ 
      role: item.role === 'assistant' ? 'model' : 'user', 
      parts: [{ text: item.content }] 
    }));
    
    const enhancedSystemPrompt = systemPrompt + "\n\n중요: 모든 텍스트는 반드시 한국어로만 작성해야 합니다. 영어나 다른 언어는 절대 포함하지 마세요.";
    
    const originalPayload = { 
      contents: convertedHistory, 
      systemInstruction: { parts: [{ text: enhancedSystemPrompt }] }, 
      generationConfig: { responseMimeType: "application/json", temperature: 0.8 } 
    };
    
    // 한글 응답을 위한 방어 로직 구현
    const maxRetries = 10; // 최대 재시도 횟수
    let retryCount = 0;
    let content = '{}';
    let parsedContent = {};
    
    // API 키 관리
    const apiKeys = [MAIN_GEMINI_API_KEY, SUB_GEMINI_API_KEY, THIRD_GEMINI_API_KEY];
    let currentKeyIndex = 0;
    let currentApiKey = apiKeys[currentKeyIndex];
    
    while (retryCount < maxRetries) {
      try {
        // 현재 API 키로 URL 구성
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${currentApiKey}`;
        
        // 페이로드 복사 (수정될 수 있으므로)
        const payload = JSON.parse(JSON.stringify(originalPayload));
        
        // 재시도 횟수에 따라 시스템 프롬프트 강화
        if (retryCount > 0) {
          payload.systemInstruction.parts[0].text = enhancedSystemPrompt + 
            `\n\n매우 중요: 이전 응답에 한국어가 아닌 텍스트가 포함되어 있었습니다. 모든 텍스트는 반드시 한국어로만 작성해야 합니다. 영어나 다른 언어는 절대 포함하지 마세요. 이는 ${retryCount}번째 재시도입니다.`;
        }
        
        const response = await fetch(url, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload) 
        });
        
        if (!response.ok) {
          // API 키 관련 오류 (401, 403, 429 등)인 경우 다음 API 키로 전환
          if ([401, 403, 429].includes(response.status) && currentKeyIndex < apiKeys.length - 1) {
            currentKeyIndex++;
            currentApiKey = apiKeys[currentKeyIndex];
            console.warn(`Gemini API 키 오류 (${response.status}), 다음 API 키로 전환합니다. (${currentKeyIndex + 1}/${apiKeys.length})`);
            continue; // 재시도 카운트 증가 없이 즉시 다시 시도
          }
          throw new Error(`Gemini API Error: ${response.status}`);
        }
        
        const result = await response.json();
        content = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        try {
          // JSON 파싱 시도
          parsedContent = LlmApi.robustJsonParse(content);
          
          // JSON 내의 모든 문자열 값이 한글인지 확인
          let allKorean = true;
          
          if (LlmApi.checkKoreanInObject(parsedContent)) {
            console.log(`한글 JSON 응답 성공 (시도: ${retryCount + 1}/${maxRetries}, API 키: ${currentKeyIndex + 1}/${apiKeys.length})`);
            return parsedContent;
          }
          
          console.log(`JSON에 비한글 텍스트 포함, 재시도 중... (${retryCount + 1}/${maxRetries})`);
        } catch (parseError) {
          // JSON 파싱 실패 시 수정 시도
          console.log(`JSON 파싱 실패, 수정 시도 중... (${retryCount + 1}/${maxRetries})`);
          const fixPrompt = `다음 텍스트는 유효하지 않은 JSON입니다. 다른 설명 없이, 오직 유효한 JSON 객체만 반환하도록 수정해주세요. 모든 텍스트는 반드시 한국어로만 작성해야 합니다:\n\n${content}`;
          const fixedContent = await LlmApi.callApiForText(fixPrompt);
          
          try {
            parsedContent = LlmApi.robustJsonParse(fixedContent);
            // 수정된 JSON도 한글인지 확인
            if (LlmApi.checkKoreanInObject(parsedContent)) {
              console.log(`수정된 한글 JSON 응답 성공 (시도: ${retryCount + 1}/${maxRetries}, API 키: ${currentKeyIndex + 1}/${apiKeys.length})`);
              return parsedContent;
            }
          } catch (e) {
            console.error(`수정된 JSON도 파싱 실패 (시도: ${retryCount + 1}/${maxRetries})`);
          }
        }
        
        retryCount++;
        // 잠시 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`API 호출 오류 (시도: ${retryCount + 1}/${maxRetries}, API 키: ${currentKeyIndex + 1}/${apiKeys.length}):`, error);
        
        // 현재 키에서 오류 발생 시 다음 키로 전환 (마지막 키가 아닌 경우)
        if (currentKeyIndex < apiKeys.length - 1) {
          currentKeyIndex++;
          currentApiKey = apiKeys[currentKeyIndex];
          console.warn(`Gemini API 키 오류, 다음 API 키로 전환합니다. (${currentKeyIndex + 1}/${apiKeys.length})`);
          // 키 전환 시에는 재시도 카운트를 증가시키지 않음
          continue;
        }
        
        retryCount++;
        // 잠시 대기 후 재시도
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    // 최대 재시도 횟수를 초과한 경우, 마지막으로 받은 응답 반환
    console.warn(`최대 재시도 횟수(${maxRetries})를 초과했습니다. 마지막 응답을 반환합니다.`);
    
    try {
      return parsedContent;
    } catch (e) {
      // 마지막 시도로 기본 객체 반환
      return { chatMessage: "[시스템 오류] 한글 응답을 받지 못했습니다.", choices: [] };
    }
  },
  callApi: async (history, systemPrompt, setLoadingMessage) => {
    // 메인 API 호출 함수 - 지정된 순서대로 LLM 서비스 시도
    // 1. Groq LLM > MAIN_GROQ_API_KEY
    // 2. Gorq LLM > SUBGROQ_API_KEY
    // 3. GEMINI LLM > MAIN_GEMINI_API_KEY
    // 4. GEMINI LLM > SUB_GEMINI_API_KEY
    // 5. GEMINI LLM > THIRD_GEMINI_API_KEY
    
    const maxRetries = 5;
    let delay = 1500;
    let lastError = null;
    let response = null;

    // 시스템 프롬프트에 한글 응답 요청 추가
    const enhancedSystemPrompt = systemPrompt +
      "\n\n중요: 모든 응답은 반드시 한국어로만 작성되어야 합니다. 영어나 다른 언어는 절대 포함하지 마세요.";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 1-2. Groq API 시도 (내부적으로 MAIN_GROQ_API_KEY와 SUBGROQ_API_KEY를 순차적으로 시도)
        setLoadingMessage(`응답을 기다리는 중... (시도 ${attempt}/${maxRetries})`);
        console.log(`Groq API 호출 시도 중... (${attempt}/${maxRetries})`);
        
        try {
          response = await LlmApi.callGroq(history, enhancedSystemPrompt);
          // 응답이 성공적으로 반환되면 즉시 반환
          console.log(`Groq API 호출 성공 (시도: ${attempt}/${maxRetries})`);
          return response;
        } catch (groqError) {
          // Groq 실패 시 Gemini 시도
          lastError = groqError;
          console.error(`Groq API 완전 실패, Gemini로 전환 중... (${attempt}/${maxRetries}):`, groqError.message);
          
          // 3-5. Gemini API 시도 (내부적으로 세 개의 API 키를 순차적으로 시도)
          setLoadingMessage(`다른 방법으로 시도 중... (시도 ${attempt}/${maxRetries})`);
          console.log(`Gemini API 호출 시도 중... (${attempt}/${maxRetries})`);
          
          try {
            response = await LlmApi.callGemini(history, enhancedSystemPrompt);
            // 응답이 성공적으로 반환되면 즉시 반환
            console.log(`Gemini API 호출 성공 (시도: ${attempt}/${maxRetries})`);
            return response;
          } catch (geminiError) {
            lastError = geminiError;
            console.error(`Gemini API 완전 실패 (시도: ${attempt}/${maxRetries}):`, geminiError.message);
            // 모든 API 키가 실패한 경우 다음 시도로 넘어감
          }
        }
      } catch (error) {
        // 예상치 못한 오류 처리
        lastError = error;
        console.error(`예상치 못한 오류 발생 (시도: ${attempt}/${maxRetries}):`, error.message);
      }

      // 다음 시도 전 지수 백오프 대기
      if (attempt < maxRetries) {
        console.log(`재시도 대기 중... (${delay}ms)`);
        await new Promise(res => setTimeout(res, delay *= 2));
      }
    }

    // 모든 시도 실패 시 오류 메시지 반환
    console.error(`모든 API 호출 시도 실패 (${maxRetries}회) - 모든 LLM 서비스와 API 키 조합이 실패했습니다.`);
    return {
      chatMessage: `[시스템 오류] 스토리 생성에 최종적으로 실패했습니다. (원인: ${lastError.message})`,
      choices: []
    };
  }
};

// Game Context
const GameContext = createContext();
const useGame = () => useContext(GameContext);

// Game Provider Component
const GameProvider = ({ children }) => {
  const [playerStats, setPlayerStats] = useState({
    info: { name: '용사', level: 1, wins: 0, losses: 0, lastDuelTitle: '신출내기' },
    baseStats: { hp: 100, maxHp: 100, str: 10, int: 10 },
    stats: { hp: 100, maxHp: 100, str: 10, int: 10 },
    equipment: {
      weapon: { name: '낡은 주먹', type: 'weapon', price: 0, effects: [{ stat: 'str', value: 1 }] },
      armor: { name: '허름한 옷', type: 'armor', price: 0, effects: [{ stat: 'maxHp', value: 5 }] }
    },
    inventory: [{ name: '빨간 포션', quantity: 3, type: 'potion', price: 10, effects: [{ stat: 'hp', value: 20 }] }],
    gold: 50,
  });
  const [gameLog, setGameLog] = useState([{ type: 'system', message: '오른쪽 메뉴 또는 하단 탭에서 행동을 선택하여 모험을 시작하세요.' }]);
  const [choices, setChoices] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [currentScenario, setCurrentScenario] = useState(null);
  const [storyHistory, setStoryHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('game');
  const [isDuelModalOpen, setIsDuelModalOpen] = useState(false);

  const storyLogEndRef = useRef(null);
  const playerId = "player01";

  const recalculateStats = (currentStats) => {
    const newStats = { ...currentStats.baseStats };
    Object.values(currentStats.equipment).forEach(item => {
      if (item && item.effects) {
        item.effects.forEach(effect => {
          newStats[effect.stat] = (newStats[effect.stat] || 0) + effect.value;
        });
      }
    });
    if (newStats.hp > newStats.maxHp) newStats.hp = newStats.maxHp;
    return { ...currentStats, stats: newStats };
  };

  useEffect(() => {
    const loadData = async () => {
      if (!db) return;
      setIsLoading(true);
      const playerDocRef = doc(db, "players", playerId);
      try {
        const docSnap = await getDoc(playerDocRef);
        if (docSnap.exists()) {
          const loadedData = docSnap.data();
          const initialStats = { ...playerStats, ...loadedData, info: { ...playerStats.info, ...loadedData.info }, baseStats: { ...playerStats.baseStats, ...loadedData.baseStats }, equipment: { ...playerStats.equipment, ...loadedData.equipment }, inventory: loadedData.inventory || playerStats.inventory };
          setPlayerStats(recalculateStats(initialStats));
        } else {
          await saveData(recalculateStats(playerStats));
        }
      } catch (e) { console.error("Error loading data:", e); }
      finally { setIsLoading(false); }
    };
    setTimeout(loadData, 500);
  }, []);

  const saveData = async (stats, id = playerId) => {
    if (!db) return;
    await setDoc(doc(db, "players", id), stats, { merge: true });
  };

  useEffect(() => {
    storyLogEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameLog]);

  const addToLog = (message, type = 'story') => {
    setGameLog(prev => [...prev, { type, message }]);
  };

  const getSystemPrompt = () => `
                당신은 한국어 전문 스토리텔러(GM)입니다. 당신은 플레이어의 선택에 따라 흥미진진한 상황과 2~3개의 선택지를 제시해야 합니다.
                플레이어의 현재 상태: ${JSON.stringify(playerStats)}.
                **매우 중요한 규칙:**
                1.  선택지의 결과로 플레이어가 보상을 얻거나 잃을 수 있습니다. 보상은 'rewards' 객체를 사용하여 표현합니다.
                2.  'rewards' 객체는 'gold'(골드), 'items'(아이템/장비), 'stats'(영구 능력치)를 포함할 수 있습니다.
                3.  이야기의 흐름이 자연스럽게 끝나면, 선택지에 "endScenario": true 플래그를 포함해주세요.
                4.  플레이어의 인벤토리에 있는 스토리 관련 아이템('type'이 'story'인 아이템)을 확인하고, 이를 스토리에 통합하세요.
                5.  스토리 아이템을 사용하는 선택지를 제공할 때는 "useStoryItem": "아이템이름" 속성을 포함하세요.
                6.  장착 아이템('type'이 'weapon' 또는 'armor')도 스토리에 반영하여 장비가 스토리에 영향을 주도록 하세요.
                7.  모든 응답은 반드시 아래 예시와 같은 JSON 형식이어야 합니다.
                **응답 JSON 형식 예시:**
                {
                  "chatMessage": "동굴 깊은 곳에서 반짝이는 보물 상자를 발견했습니다!",
                  "choices": [
                    {
                      "text": "상자를 연다",
                      "narration": "상자를 열자 눈부신 빛과 함께 강력한 검과 금화가 나타났습니다! 당신의 힘이 영구적으로 증가한 것 같습니다.",
                      "rewards": {
                        "gold": 100,
                        "items": [{ "name": "빛나는 롱소드", "type": "weapon", "price": 200, "effects": [{"stat": "str", "value": 10}] }],
                        "stats": [{"stat": "str", "value": 1}]
                      },
                      "endScenario": true
                    },
                    { "text": "함정일지 모르니 그냥 지나간다", "narration": "당신은 조심스럽게 상자를 지나쳤습니다.", "endScenario": true },
                    {
                      "text": "고대의 열쇠를 사용한다",
                      "narration": "고대의 열쇠가 상자의 자물쇠에 완벽하게 들어맞습니다. 상자가 열리자 강력한 마법 지팡이가 나타났습니다!",
                      "useStoryItem": "고대의 열쇠",
                      "rewards": {
                        "items": [{ "name": "마법사의 지팡이", "type": "weapon", "price": 300, "effects": [{"stat": "int", "value": 15}] }]
                      }
                    }
                  ]
                }
                **최종 지시:** 이제, 위 규칙과 형식을 완벽하게 준수하여 응답을 생성하세요. 플레이어의 인벤토리에 있는 스토리 아이템과 장착 아이템을 확인하고, 이를 스토리에 자연스럽게 통합하세요.
            `;

  const getShopSystemPrompt = () => `
                당신은 RPG 게임의 창의적이고 능숙한 상점 주인입니다. 당신은 플레이어의 현재 상태를 보고 그에게 흥미로운 물건을 '창작'하여 판매해야 합니다.
                플레이어의 현재 상태: ${JSON.stringify(playerStats)}.
                **매우 중요한 규칙:**
                1.  당신은 플레이어에게 판매할 독창적인 아이템 4개를 '창작'해야 합니다.
                2.  각 아이템은 반드시 'name', 'type', 'price', 'effects' 속성을 가져야 합니다.
                3.  'effects'는 반드시 [{"stat": "능력치이름", "value": 숫자}] 형식의 배열이어야 합니다.
                4.  아이템 타입은 다음 중 하나여야 합니다:
                    - 'weapon': 무기 (장착 가능)
                    - 'armor': 방어구 (장착 가능)
                    - 'potion': 소모성 아이템 (사용 시 효과 발동)
                    - 'story': 스토리 관련 아이템 (스토리 진행에 사용됨)
                5.  'story' 타입 아이템은 특별한 아이템으로, 스토리 진행 중에 사용될 수 있습니다. 이 아이템은 'description' 속성을 추가로 가져야 합니다.
                6.  플레이어의 소지 골드(${playerStats.gold}G)를 고려하여, 구매 가능한 아이템과 불가능한 아이템을 섞어서 제시하세요.
                7.  당신의 모든 응답은 반드시, 예외 없이, 아래와 같은 JSON 형식이어야 합니다. 'choices' 배열은 절대 비워두면 안 됩니다.
                **응답 JSON 형식 예시:**
                {
                  "chatMessage": "어서오게, 용사여! 내게는 아주 특별한 물건들이 있지. 한번 보겠나?",
                  "choices": [
                    { "type": "buy", "item": { "name": "번개가 깃든 강철 검", "type": "weapon", "price": 120, "effects": [{"stat": "str", "value": 8}, {"stat": "int", "value": 2}] } },
                    { "type": "buy", "item": { "name": "트롤 가죽 갑옷", "type": "armor", "price": 75, "effects": [{"stat": "maxHp", "value": 30}] } },
                    { "type": "buy", "item": { "name": "고대의 열쇠", "type": "story", "price": 50, "effects": [], "description": "오래된 던전의 비밀 문을 열 수 있는 신비한 열쇠입니다." } },
                    { "type": "event", "text": "상점 주인의 모험담을 듣는다", "narration": "주인의 이야기에 감명받자, 그는 당신의 통찰력이 늘어났다며 기뻐했습니다.", "rewards": { "stats": [{"stat": "int", "value": 1}] }, "endScenario": false },
                    { "type": "leave", "text": "상점을 나간다" }
                  ]
                }
                **최종 지시:** 이제, 위 규칙과 형식을 완벽하게 준수하여 응답을 생성하세요. 반드시 'story' 타입의 아이템을 하나 이상 포함시키세요. 이 아이템은 스토리 진행에 중요한 역할을 할 수 있는 흥미로운 아이템이어야 합니다.
            `;

  const batchEnsureKorean = async (textsToTranslate) => {
    const nonKoreanRegex = /[^가-힣ㄱ-ㅎㅏ-ㅣ\d\s.,?!()"'+-]/u;
    const textsWithIndices = textsToTranslate.map((text, index) => ({ text, index, needsTranslation: nonKoreanRegex.test(text) }));
    const toTranslate = textsWithIndices.filter(item => item.needsTranslation);

    if (toTranslate.length === 0) return textsToTranslate;

    const prompt = `다음 JSON 배열에 포함된 텍스트들을 자연스러운 한국어로 번역하고, 원래의 JSON 구조를 유지하여 응답해줘. 번역이 필요 없는 텍스트는 그대로 둬.:\n${JSON.stringify(toTranslate.map(t => t.text))}`;

    try {
      const translatedArrayStr = await LlmApi.callApiForText(prompt);
      const translatedArray = JSON.parse(translatedArrayStr);

      const finalTexts = [...textsToTranslate];
      toTranslate.forEach((item, i) => {
        finalTexts[item.index] = translatedArray[i] || item.text;
      });
      return finalTexts;
    } catch (e) {
      console.error("배치 번역 실패:", e);
      return textsToTranslate;
    }
  };

  const processLlmResponse = async (response) => {
    if (!response || !response.chatMessage) {
      addToLog(response.chatMessage || "[시스템 오류] 응답이 비어있습니다.", 'system');
      setChoices([]);
      return;
    }

    const texts = [response.chatMessage, ...(response.choices || []).map(c => c.text), ...(response.choices || []).map(c => c.narration).filter(Boolean)];
    const translatedTexts = await batchEnsureKorean(texts);

    const chatMessage = translatedTexts[0];
    let choices = (response.choices || []).map((choice, index) => ({
      ...choice,
      text: translatedTexts[index + 1],
      narration: choice.narration ? translatedTexts[index + 1 + (response.choices || []).length] : ""
    }));

    if (chatMessage) {
      addToLog(chatMessage);
      setStoryHistory(prev => [...prev, { role: 'assistant', content: chatMessage }]);
    }

    if (choices.length === 0) {
      addToLog("[시스템] 다음 행동을 선택할 수 없습니다. 메뉴로 돌아갑니다.", 'system');
      choices.push({ type: 'leave', text: '메뉴로 돌아가기', endScenario: true });
    }
    setChoices(choices);
  };

  const handleMenuAction = async (action) => {
    if (action === '결투') { setIsDuelModalOpen(true); return; }
    setIsLoading(true);
    setChoices([]);
    setStoryHistory([]);
    setCurrentScenario(action);
    setActiveTab('game');
    addToLog(`[메뉴] ${action}(으)로 향합니다...`, 'action');
    const isShop = action === '상점';
    const systemPrompt = isShop ? getShopSystemPrompt() : getSystemPrompt();
    const userPrompt = `플레이어가 '${action}'에 도착했습니다. 상황을 묘사하고 선택지를 제시해주세요.`;
    const initialHistory = [{ role: 'user', content: userPrompt }];
    setStoryHistory(initialHistory);
    const response = await LlmApi.callApi(initialHistory, systemPrompt, setLoadingMessage);
    await processLlmResponse(response);
    setIsLoading(false);
    setLoadingMessage("");
  };

  const addToInventory = (inventory, itemToAdd) => {
    const existingItemIndex = inventory.findIndex(i => i.name === itemToAdd.name);
    if (itemToAdd.type !== 'weapon' && itemToAdd.type !== 'armor' && existingItemIndex > -1) {
      inventory[existingItemIndex].quantity = (inventory[existingItemIndex].quantity || 1) + 1;
    } else {
      inventory.push({ ...itemToAdd, quantity: 1 });
    }
    return [...inventory];
  };

  const handleChoiceAction = async (choice) => {
    setIsLoading(true);
    setChoices([]);

    let newStats = JSON.parse(JSON.stringify(playerStats));
    let shouldRecalculate = false;

    // 스토리 아이템 사용 처리
    if (choice.useStoryItem) {
      const itemName = choice.useStoryItem;
      const itemIndex = newStats.inventory.findIndex(item => item.name === itemName && item.type === 'story');
      
      if (itemIndex === -1) {
        addToLog(`[오류] ${itemName}을(를) 찾을 수 없습니다.`, 'system');
        setIsLoading(false);
        setChoices(choices);
        return;
      }
      
      // 아이템 사용 로그 추가
      addToLog(`${itemName}을(를) 사용했습니다.`, 'system');
      
      // 아이템 제거 (수량이 1 이상이면 감소, 아니면 제거)
      if (newStats.inventory[itemIndex].quantity > 1) {
        newStats.inventory[itemIndex].quantity -= 1;
      } else {
        newStats.inventory.splice(itemIndex, 1);
      }
    }

    if (choice.type === 'buy') {
      const item = choice.item;
      if (newStats.gold >= item.price) {
        newStats.gold -= item.price;
        if (item.type === 'weapon' || item.type === 'armor') {
          const oldItem = newStats.equipment[item.type];
          if (oldItem) newStats.inventory = addToInventory(newStats.inventory, oldItem);
          newStats.equipment[item.type] = item;
          addToLog(`${item.name}을(를) 장착했습니다.`, 'system');
        } else {
          newStats.inventory = addToInventory(newStats.inventory, item);
          addToLog(`${item.name}을(를) 구매했습니다.`, 'system');
        }
        shouldRecalculate = true;
      } else {
        addToLog("골드가 부족합니다.", 'system');
        setIsLoading(false);
        setChoices(choices);
        return;
      }
    }

    const logText = choice.text || `${choice.item?.name || ''} 구매`;
    addToLog(`> ${logText}`, 'choice');
    if (choice.narration) addToLog(choice.narration);

    const rewards = choice.rewards || {};
    if (choice.updates) {
      rewards.stats = rewards.stats ? [...rewards.stats, ...choice.updates] : choice.updates;
    }

    if (rewards.gold) {
      newStats.gold += rewards.gold;
      addToLog(`${rewards.gold} 골드를 획득했습니다!`, 'system');
    }
    if (rewards.items) {
      rewards.items.forEach(item => {
        newStats.inventory = addToInventory(newStats.inventory, item);
        addToLog(`[획득] ${item.name}`, 'system');
      });
    }
    if (rewards.stats) {
      rewards.stats.forEach(statUpdate => {
        if (Object.prototype.hasOwnProperty.call(newStats.baseStats, statUpdate.stat)) {
          newStats.baseStats[statUpdate.stat] += statUpdate.value;
          shouldRecalculate = true;
        } else if (Object.prototype.hasOwnProperty.call(newStats.stats, statUpdate.stat)) {
          newStats.stats[statUpdate.stat] += statUpdate.value;
        }
        addToLog(`능력치 ${statUpdate.stat}이(가) ${statUpdate.value}만큼 변화했습니다!`, 'system');
      });
    }

    if(shouldRecalculate) {
      newStats = recalculateStats(newStats);
    }
    setPlayerStats(newStats);
    await saveData(newStats);

    if (choice.endScenario || choice.type === 'buy' || choice.type === 'leave') {
      setCurrentScenario(null);
      setStoryHistory([]);
      if(choice.type !== 'leave' && !choice.endScenario) addToLog("상점 주인이 고개를 끄덕입니다.", 'story');
      addToLog("다음엔 무엇을 할까요?", "system");
    } else {
      const userPrompt = `플레이어는 방금 "${choice.text}"을(를) 선택했습니다. 이어서 스토리를 진행하고 다음 선택지들을 제시해주세요.`;
      const newHistory = [...storyHistory, { role: 'user', content: userPrompt }];
      const systemPrompt = currentScenario === '상점' ? getShopSystemPrompt() : getSystemPrompt();
      const response = await LlmApi.callApi(newHistory, systemPrompt, setLoadingMessage);
      await processLlmResponse(response);
    }

    setIsLoading(false);
    setLoadingMessage("");
  };

  return (
    <GameContext.Provider value={{ playerStats, setPlayerStats, saveData, gameLog, choices, isLoading, loadingMessage, handleMenuAction, handleChoiceAction, storyLogEndRef, activeTab, setActiveTab, isDuelModalOpen, setIsDuelModalOpen, currentScenario, addToLog, recalculateStats, playerId }}>
      {children}
    </GameContext.Provider>
  );
};

GameProvider.propTypes = {
  children: PropTypes.node.isRequired
};

// UI Components
// Item Modal Component
const ItemModal = ({ item, onClose, onUse, onEquip, onUnequip }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md flex flex-col">
        <h2 className="text-2xl font-bold text-purple-400 mb-2">{item.name}</h2>
        <div className="mb-4">
          <p className="text-gray-300 mb-2">
            <span className="font-semibold">종류:</span> {
              item.type === 'weapon' ? '무기' : 
              item.type === 'armor' ? '방어구' : 
              item.type === 'story' ? '스토리 아이템' : 
              '소모품'
            }
          </p>
          {item.quantity > 1 && (
            <p className="text-gray-300 mb-2">
              <span className="font-semibold">수량:</span> {item.quantity}
            </p>
          )}
          <p className="text-gray-300 mb-2">
            <span className="font-semibold">가치:</span> {item.price} G
          </p>
          <div className="text-gray-300 mb-2">
            <span className="font-semibold">효과:</span>
            <ul className="ml-4">
              {item.effects.map((effect, index) => (
                <li key={index}>
                  {effect.stat === 'str' ? '힘' : 
                   effect.stat === 'int' ? '지능' : 
                   effect.stat === 'hp' ? '체력' : 
                   effect.stat === 'maxHp' ? '최대 체력' : 
                   effect.stat} +{effect.value}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-gray-300 mt-4 italic">
            {item.description || `${item.name}은(는) ${item.type === 'weapon' ? '적에게 피해를 줄 수 있는 무기입니다.' : 
                                                     item.type === 'armor' ? '당신을 보호해주는 방어구입니다.' : 
                                                     '사용하면 특별한 효과를 발휘하는 아이템입니다.'}`}
          </p>
        </div>
        <div className="flex flex-col space-y-2">
          {item.type === 'weapon' || item.type === 'armor' ? (
            <button 
              onClick={onEquip} 
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            >
              장착하기
            </button>
          ) : item.type === 'story' ? (
            <button 
              onClick={onUse} 
              className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded"
            >
              스토리에서 사용하기
            </button>
          ) : (
            <button 
              onClick={onUse} 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              사용하기
            </button>
          )}
          {(item.type === 'weapon' || item.type === 'armor') && (
            <button 
              onClick={onUnequip} 
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
            >
              장착 해제
            </button>
          )}
          <button 
            onClick={onClose} 
            className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

// PropTypes for ItemModal
ItemModal.propTypes = {
  item: PropTypes.shape({
    name: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
    price: PropTypes.number.isRequired,
    quantity: PropTypes.number,
    effects: PropTypes.arrayOf(
      PropTypes.shape({
        stat: PropTypes.string.isRequired,
        value: PropTypes.number.isRequired
      })
    ).isRequired,
    description: PropTypes.string
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onUse: PropTypes.func.isRequired,
  onEquip: PropTypes.func.isRequired,
  onUnequip: PropTypes.func.isRequired
};

const StatusWindow = () => {
  const { playerStats, setPlayerStats, saveData, addToLog, recalculateStats } = useGame();
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(playerStats.info.name);
  const [selectedItem, setSelectedItem] = useState(null);
  
  const statTranslations = { hp: '체력', maxHp: '최대 체력', str: '힘', int: '지능' };
  
  const handleSaveName = () => {
    if (newName.trim() === '') return;
    
    const updatedStats = {
      ...playerStats,
      info: {
        ...playerStats.info,
        name: newName.trim()
      }
    };
    
    setPlayerStats(updatedStats);
    saveData(updatedStats);
    setIsEditingName(false);
  };

  const handleItemClick = (item) => {
    setSelectedItem(item);
  };

  const handleCloseItemModal = () => {
    setSelectedItem(null);
  };

  const handleUseItem = async () => {
    if (!selectedItem) return;

    // 스토리 아이템 처리
    if (selectedItem.type === 'story') {
      addToLog(`${selectedItem.name}은(는) 스토리 진행 중에만 사용할 수 있는 아이템입니다.`, 'system');
      addToLog(`모험을 계속하면서 적절한 상황에서 사용할 수 있을 것입니다.`, 'story');
      setSelectedItem(null);
      return;
    }

    // 아이템 사용 로직
    const newStats = JSON.parse(JSON.stringify(playerStats));
    let itemUsed = false;

    // 아이템 효과 적용
    if (selectedItem.effects) {
      selectedItem.effects.forEach(effect => {
        if (effect.stat === 'hp') {
          newStats.stats.hp = Math.min(newStats.stats.hp + effect.value, newStats.stats.maxHp);
          itemUsed = true;
        } else if (['str', 'int', 'maxHp'].includes(effect.stat)) {
          // 다른 스탯(힘, 지능, 최대 체력 등) 효과 적용
          newStats.stats[effect.stat] += effect.value;
          itemUsed = true;
        }
      });
    }

    // 아이템 수량 감소
    if (itemUsed) {
      const itemIndex = newStats.inventory.findIndex(i => i.name === selectedItem.name);
      if (itemIndex > -1) {
        if (newStats.inventory[itemIndex].quantity > 1) {
          newStats.inventory[itemIndex].quantity -= 1;
        } else {
          newStats.inventory.splice(itemIndex, 1);
        }
      }

      // 아이템 사용 로그 추가
      addToLog(`${selectedItem.name}을(를) 사용했습니다.`, 'system');

      // LLM에 아이템 사용 정보 전달
      const itemUsePrompt = `플레이어가 ${selectedItem.name}을(를) 사용했습니다. 이 아이템은 ${selectedItem.effects.map(e => {
        const statName = statTranslations[e.stat] || e.stat;
        const action = e.stat === 'hp' ? '회복시킵니다' : '증가시킵니다';
        return `${statName}을(를) ${e.value} ${action}`;
      }).join(', ')}. 이 상황을 간략하게 묘사해주세요.`;
      
      // LLM 호출 및 응답 처리
      let itemUseDescription = "";
      try {
        // LLM API 호출 시도
        itemUseDescription = await LlmApi.callApiForText(itemUsePrompt);
        
        // 응답이 비어있는지 확인
        if (!itemUseDescription || itemUseDescription.trim() === '') {
          throw new Error("빈 응답이 반환되었습니다");
        }
        
        // 응답을 스토리 로그에 추가
        addToLog(itemUseDescription, 'story');
      } catch (error) {
        console.error("아이템 사용 설명 생성 오류:", error);
        // 사용자에게 오류 메시지 표시
        addToLog(`[시스템] 아이템 사용 효과를 설명하는 중 오류가 발생했습니다: ${error.message || "알 수 없는 오류"}`, 'system');
        
        // 기본 메시지 추가 (아이템 효과에 따라 다른 메시지 표시)
        const mainEffect = selectedItem.effects[0]; // 첫 번째 효과 사용
        if (mainEffect) {
          const statName = statTranslations[mainEffect.stat] || mainEffect.stat;
          const action = mainEffect.stat === 'hp' ? '회복되었습니다' : '증가되었습니다';
          addToLog(`${selectedItem.name}의 효과로 ${statName}이(가) ${action}.`, 'story');
        } else {
          addToLog(`${selectedItem.name}을(를) 사용했습니다.`, 'story');
        }
      }

      // 플레이어 상태 업데이트 및 저장
      setPlayerStats(newStats);
      saveData(newStats);
      
      // 상태 변화 로그 추가 - 모든 스탯 변화 표시
      selectedItem.effects.forEach(effect => {
        const statName = statTranslations[effect.stat] || effect.stat;
        const oldValue = effect.stat === 'hp' ? playerStats.stats.hp : playerStats.stats[effect.stat] || 0;
        const newValue = effect.stat === 'hp' 
          ? Math.min(newStats.stats.hp, newStats.stats.maxHp) 
          : newStats.stats[effect.stat] || 0;
        
        if (effect.value > 0) {
          const action = effect.stat === 'hp' ? '회복되었습니다' : '증가되었습니다';
          addToLog(`${statName}이(가) ${effect.value} ${action}. (${oldValue} → ${newValue})`, 'system');
        }
      });
    }

    setSelectedItem(null);
  };

  const handleEquipItem = () => {
    if (!selectedItem || (selectedItem.type !== 'weapon' && selectedItem.type !== 'armor')) return;

    const newStats = JSON.parse(JSON.stringify(playerStats));
    
    // 현재 장착된 아이템 인벤토리로 이동
    const currentEquipment = newStats.equipment[selectedItem.type];
    if (currentEquipment && currentEquipment.name) {
      const existingItemIndex = newStats.inventory.findIndex(i => i.name === currentEquipment.name);
      if (existingItemIndex > -1) {
        newStats.inventory[existingItemIndex].quantity = (newStats.inventory[existingItemIndex].quantity || 1) + 1;
      } else {
        newStats.inventory.push({ ...currentEquipment, quantity: 1 });
      }
    }
    
    // 새 아이템 장착
    newStats.equipment[selectedItem.type] = { ...selectedItem };
    
    // 인벤토리에서 아이템 제거
    const itemIndex = newStats.inventory.findIndex(i => i.name === selectedItem.name);
    if (itemIndex > -1) {
      if (newStats.inventory[itemIndex].quantity > 1) {
        newStats.inventory[itemIndex].quantity -= 1;
      } else {
        newStats.inventory.splice(itemIndex, 1);
      }
    }
    
    // 능력치 재계산
    const recalculatedStats = recalculateStats(newStats);
    
    addToLog(`${selectedItem.name}을(를) 장착했습니다.`, 'system');
    setPlayerStats(recalculatedStats);
    saveData(recalculatedStats);
    setSelectedItem(null);
  };

  const handleUnequipItem = () => {
    if (!selectedItem || (selectedItem.type !== 'weapon' && selectedItem.type !== 'armor')) return;

    const newStats = JSON.parse(JSON.stringify(playerStats));
    
    // 장착된 아이템 확인
    const currentEquipment = newStats.equipment[selectedItem.type];
    if (!currentEquipment || currentEquipment.name !== selectedItem.name) {
      addToLog(`${selectedItem.name}은(는) 현재 장착되어 있지 않습니다.`, 'system');
      setSelectedItem(null);
      return;
    }
    
    // 장착 해제된 아이템을 인벤토리로 이동
    const existingItemIndex = newStats.inventory.findIndex(i => i.name === currentEquipment.name);
    if (existingItemIndex > -1) {
      newStats.inventory[existingItemIndex].quantity = (newStats.inventory[existingItemIndex].quantity || 1) + 1;
    } else {
      newStats.inventory.push({ ...currentEquipment, quantity: 1 });
    }
    
    // 기본 장비로 대체
    if (selectedItem.type === 'weapon') {
      newStats.equipment.weapon = { name: '낡은 주먹', type: 'weapon', price: 0, effects: [{ stat: 'str', value: 1 }] };
    } else {
      newStats.equipment.armor = { name: '허름한 옷', type: 'armor', price: 0, effects: [{ stat: 'maxHp', value: 5 }] };
    }
    
    // 능력치 재계산
    const recalculatedStats = recalculateStats(newStats);
    
    addToLog(`${selectedItem.name}을(를) 장착 해제했습니다.`, 'system');
    setPlayerStats(recalculatedStats);
    saveData(recalculatedStats);
    setSelectedItem(null);
  };
  
  const renderSection = (title, data, renderItem) => (
    <div className="mb-4">
      <h4 className="text-lg font-semibold text-purple-300 border-b border-gray-700 pb-1 mb-2">{title}</h4>
      <ul className="space-y-1 text-sm text-gray-300">{data.map(renderItem)}</ul>
    </div>
  );
  
  return (
    <div className="bg-gray-800 p-4 rounded-lg h-full flex flex-col">
      <h3 className="text-xl font-bold text-purple-400 border-b border-gray-600 pb-2 mb-4 flex-shrink-0">내 정보</h3>
      <div className="flex-grow overflow-y-auto pr-2">
        {renderSection("기본 정보", Object.entries(playerStats.info), ([key, value]) => {
          const keyMap = { name: '이름', level: '레벨', wins: '승리', losses: '패배', lastDuelTitle: '칭호' };
          
          if (key === 'name') {
            return (
              <li key={key} className="flex justify-between items-center">
                <span>{keyMap[key] || key}:</span>
                {isEditingName ? (
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="bg-gray-700 text-white px-2 py-1 rounded mr-2 text-sm"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveName}
                      className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs"
                    >
                      저장
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <span className="text-right mr-2">{value}</span>
                    <button
                      onClick={() => setIsEditingName(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                    >
                      수정
                    </button>
                  </div>
                )}
              </li>
            );
          }
          
          return (<li key={key} className="flex justify-between"><span>{keyMap[key] || key}:</span> <span className="text-right">{value}</span></li>);
        })}
        {renderSection("능력치", Object.entries(playerStats.stats).filter(([key]) => key !== 'maxHp'), ([key, value]) => (<li key={key} className="flex justify-between"><span>{statTranslations[key] || key}:</span> <span>{value}{key === 'hp' ? ` / ${playerStats.stats.maxHp}` : ''}</span></li>))}
        {renderSection("장비", Object.entries(playerStats.equipment), ([key, item]) => (
          <li key={key} className="flex justify-between">
            <span>{key === 'weapon' ? '무기' : '방어구'}:</span> 
            <button 
              className="text-right text-blue-400 hover:underline"
              onClick={() => handleItemClick(item)}
            >
              {item.name}
            </button>
          </li>
        ))}
        {renderSection("소지품", playerStats.inventory, (item, i) => (
          <li key={i} className="flex justify-between">
            <button 
              className="text-left text-blue-400 hover:underline"
              onClick={() => handleItemClick(item)}
            >
              {item.name}
            </button> 
            <span>x{item.quantity}</span>
          </li>
        ))}
        <div className="flex justify-between font-bold text-yellow-400 mt-4"><span>골드:</span> <span>{playerStats.gold} G</span></div>
      </div>
      
      {selectedItem && (
        <ItemModal 
          item={selectedItem} 
          onClose={handleCloseItemModal}
          onUse={handleUseItem}
          onEquip={handleEquipItem}
          onUnequip={handleUnequipItem}
        />
      )}
    </div>
  );
};

const StoryWindow = () => {
  const { gameLog, storyLogEndRef, isLoading, loadingMessage } = useGame();
  const logColor = { story: "text-gray-200", system: "text-yellow-400 italic", action: "text-green-400 font-semibold", choice: "text-blue-400" };
  return (
    <div className="bg-gray-800 p-4 rounded-lg h-full flex flex-col">
      <h3 className="text-xl font-bold text-green-400 border-b border-gray-600 pb-2 mb-4 flex-shrink-0">스토리</h3>
      <div className="flex-grow overflow-y-auto pr-2">
        {gameLog.map((log, i) => <p key={i} className={`mb-2 ${logColor[log.type]}`}>{log.message}</p>)}
        {isLoading && <p className="text-cyan-400 animate-pulse">{loadingMessage || '이야기를 생성하는 중...'}</p>}
        <div ref={storyLogEndRef} />
      </div>
    </div>
  );
};

const MenuWindow = () => {
  const { handleMenuAction, isLoading } = useGame();
  return (
    <div className="bg-gray-800 p-4 rounded-lg h-full flex flex-col">
      <h3 className="text-xl font-bold text-blue-400 border-b border-gray-600 pb-2 mb-4 flex-shrink-0">메뉴</h3>
      <div className="flex flex-col space-y-2">
        {['여관', '상점', '던전', '결투'].map(item => (
          <button 
            key={item} 
            onClick={() => handleMenuAction(item)} 
            disabled={isLoading} 
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors duration-200"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
};

const ChoiceWindow = () => {
  const { choices, handleChoiceAction, isLoading, currentScenario, playerStats } = useGame();
  return (
    <div className="bg-gray-800 p-4 rounded-lg h-full flex flex-col">
      <h3 className="text-xl font-bold text-red-400 border-b border-gray-600 pb-2 mb-4 flex-shrink-0">선택지</h3>
      <div className="flex-grow overflow-y-auto pr-2">
        {choices.length === 0 ? (
          <p className="text-gray-500">...</p>
        ) : (
          <div className="flex flex-col space-y-2">
            {choices.map((choice, i) => {
              const isShopItem = currentScenario === '상점' && choice.type === 'buy';
              const canAfford = isShopItem ? playerStats.gold >= choice.item.price : true;
              return (
                <button 
                  key={i} 
                  onClick={() => handleChoiceAction(choice)} 
                  disabled={isLoading || !canAfford} 
                  className={`text-white font-bold py-2 px-4 rounded transition-colors duration-200 text-left ${!canAfford ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
                >
                  {isShopItem ? `${choice.item.name} (${choice.item.price}G)` : choice.text}
                  {isShopItem && !canAfford && <span className="text-xs ml-2">(골드 부족)</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const DuelModal = () => {
  const { playerStats, setPlayerStats, saveData, setIsDuelModalOpen, playerId, addToLog } = useGame();
  const [opponents, setOpponents] = useState([]);
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [duelLog, setDuelLog] = useState([]);
  const [playerHp, setPlayerHp] = useState(0);
  const [opponentHp, setOpponentHp] = useState(0);
  const [isFighting, setIsFighting] = useState(false);
  const [isDuelOver, setIsDuelOver] = useState(false);
  const [duelResult, setDuelResult] = useState("");
  const [playerAction, setPlayerAction] = useState(null);
  const [opponentAction, setOpponentAction] = useState(null);
  const [duelId, setDuelId] = useState(null);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);

  useEffect(() => {
    const fetchOpponents = async () => {
      const querySnapshot = await getDocs(collection(db, "players"));
      const playersList = querySnapshot.docs
        .map(doc => ({ 
          id: doc.id, 
          ...doc.data(),
          isAI: doc.id === "player01" // 자기 자신과의 결투는 AI로 처리
        }))
        .filter(player => player.id !== playerId); // 자기 자신은 제외
      
      // AI 상대 추가 (실제 DB에 저장되지 않는 가상의 상대)
      const aiOpponents = [
        {
          id: "ai_opponent_1",
          isAI: true,
          info: { name: "연습용 허수아비", level: 1, wins: 0, losses: 0 },
          stats: { hp: 80, maxHp: 80, str: 8, int: 5 },
          baseStats: { hp: 80, maxHp: 80, str: 8, int: 5 },
          equipment: {},
          inventory: []
        }
      ];
      
      setOpponents([...playersList, ...aiOpponents]);
    };
    fetchOpponents();
  }, []);

  const startDuel = async (opponent) => {
    setSelectedOpponent(opponent);
    setPlayerHp(playerStats.stats.hp);
    setOpponentHp(opponent.stats.hp);
    setIsFighting(true);
    
    // 결투 시작 메시지를 설정
    setDuelLog([`'${opponent.info.name}'(와)과의 결투가 시작되었습니다! 행동을 선택하세요.`]);
    
    // AI 상대가 아닌 경우 실시간 결투 문서 생성
    if (!opponent.isAI) {
      try {
        // 결투 문서 생성
        const duelRef = doc(collection(db, "duels"));
        const duelData = {
          player1: {
            id: playerId,
            name: playerStats.info.name,
            hp: playerStats.stats.hp,
            maxHp: playerStats.stats.hp,
            action: null
          },
          player2: {
            id: opponent.id,
            name: opponent.info.name,
            hp: opponent.stats.hp,
            maxHp: opponent.stats.hp,
            action: null
          },
          status: "in_progress",
          createdAt: new Date(),
          log: [`'${opponent.info.name}'(와)과의 결투가 시작되었습니다! 행동을 선택하세요.`]
        };
        
        await setDoc(duelRef, duelData);
        setDuelId(duelRef.id);
        
        // 결투 문서 변경 감지 리스너 설정
        const unsubscribe = onSnapshot(duelRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const duelData = docSnapshot.data();
            
            // 상대방이 행동을 선택했는지 확인
            const isPlayer1 = playerId === duelData.player1.id;
            const player = isPlayer1 ? duelData.player1 : duelData.player2;
            const opponent = isPlayer1 ? duelData.player2 : duelData.player1;
            
            // 로그 업데이트
            if (duelData.log && duelData.log.length > 0) {
              setDuelLog(duelData.log);
            }
            
            // HP 업데이트
            if (isPlayer1) {
              setPlayerHp(duelData.player1.hp);
              setOpponentHp(duelData.player2.hp);
            } else {
              setPlayerHp(duelData.player2.hp);
              setOpponentHp(duelData.player1.hp);
            }
            
            // 상대방이 행동을 선택했고, 자신도 행동을 선택한 경우 결투 진행
            if (player.action && opponent.action) {
              // 결투 진행 로직은 handleAction에서 처리
            } else if (opponent.action && !player.action) {
              // 상대방은 선택했지만 자신은 아직 선택하지 않은 경우
              setIsWaitingForOpponent(false);
            }
            
            // 결투가 종료된 경우
            if (duelData.status === "completed") {
              setIsFighting(false);
              setIsDuelOver(true);
              setDuelResult(duelData.result || "결투가 종료되었습니다.");
            }
          }
        });
        
        // 컴포넌트 언마운트 시 리스너 해제
        return () => unsubscribe();
      } catch (error) {
        console.error("실시간 결투 설정 오류:", error);
        addToLog("실시간 결투 설정 중 오류가 발생했습니다.", "system");
      }
    }
  };

  const handleAction = async (playerAction) => {
    // 플레이어 행동 저장
    setPlayerAction(playerAction);
    
    if (selectedOpponent.isAI) {
      // AI 상대인 경우 기존 로직 사용
      const actions = ['공격', '방어', '특수행동'];
      const opponentAction = actions[Math.floor(Math.random() * actions.length)];
      await processDuelTurn(playerAction, opponentAction);
    } else {
      // 실제 사용자 상대인 경우 Firestore에 행동 저장
      if (!duelId) {
        addToLog("결투 정보를 찾을 수 없습니다.", "system");
        return;
      }
      
      try {
        // 결투 문서 참조
        const duelRef = doc(db, "duels", duelId);
        const duelSnapshot = await getDoc(duelRef);
        
        if (!duelSnapshot.exists()) {
          addToLog("결투 정보를 찾을 수 없습니다.", "system");
          return;
        }
        
        const duelData = duelSnapshot.data();
        const isPlayer1 = playerId === duelData.player1.id;
        
        // 플레이어 행동 업데이트
        if (isPlayer1) {
          await setDoc(duelRef, {
            player1: { ...duelData.player1, action: playerAction }
          }, { merge: true });
        } else {
          await setDoc(duelRef, {
            player2: { ...duelData.player2, action: playerAction }
          }, { merge: true });
        }
        
        // 상대방의 행동 확인
        const opponentAction = isPlayer1 ? duelData.player2.action : duelData.player1.action;
        
        if (opponentAction) {
          // 상대방이 이미 행동을 선택한 경우 결투 진행
          await processDuelTurn(playerAction, opponentAction, duelRef, duelData);
        } else {
          // 상대방이 아직 행동을 선택하지 않은 경우 대기 상태로 전환
          setIsWaitingForOpponent(true);
          setDuelLog([...duelLog, "상대방의 선택을 기다리고 있습니다..."]);
        }
      } catch (error) {
        console.error("결투 행동 처리 오류:", error);
        addToLog("결투 행동 처리 중 오류가 발생했습니다.", "system");
      }
    }
  };
  
  // 결투 턴 처리 함수
  const processDuelTurn = async (playerAction, opponentAction, duelRef = null, duelData = null) => {
    let playerDamage = 0;
    let opponentDamage = 0;
    let isCritical = false;
    const actionMap = { '공격': 0, '방어': 1, '특수행동': 2 };
    const resultMatrix = [[0, -1, 1], [1, 0, -1], [-1, 1, 0]];
    const result = resultMatrix[actionMap[playerAction]][actionMap[opponentAction]];
    const criticalChance = 0.15 + (playerStats.stats.int * 0.001);
    
    if (result === -1 && Math.random() < criticalChance) isCritical = true;
    
    if (isCritical) {
      opponentDamage = Math.max(1, playerStats.stats.str - Math.floor(selectedOpponent.stats.str / 3));
    } else {
      if (result === 1) {
        opponentDamage = Math.max(1, playerStats.stats.str - Math.floor(selectedOpponent.stats.str / 3));
      } else if (result === -1) {
        playerDamage = Math.max(1, selectedOpponent.stats.str - Math.floor(playerStats.stats.str / 3));
      } else {
        opponentDamage = Math.max(1, Math.floor(playerStats.stats.str / 2));
        playerDamage = Math.max(1, Math.floor(selectedOpponent.stats.str / 2));
      }
    }
    
    const newPlayerHp = playerHp - playerDamage;
    const newOpponentHp = opponentHp - opponentDamage;
    
    // HP가 0 미만으로 내려가지 않도록 제한
    const finalPlayerHp = Math.max(0, newPlayerHp);
    const finalOpponentHp = Math.max(0, newOpponentHp);
    
    // 결투 상황 묘사 생성
    const descriptionPrompt = `다음 결투 상황을 한국어로 생생하고 박진감 넘치게 묘사해줘: 플레이어(체력:${playerHp})는 '${playerAction}'을, 상대(체력:${opponentHp})는 '${opponentAction}'을 선택. ${isCritical ? '크리티컬 이벤트가 발생했다!' : ''} 그 결과, 플레이어는 ${playerDamage}의 피해를, 상대는 ${opponentDamage}의 피해를 입었다.`;
    const description = await LlmApi.callApiForText(descriptionPrompt);
    
    // 결투 로그 업데이트
    const newDuelLog = [...duelLog, description];
    setDuelLog(newDuelLog);
    
    // HP 업데이트
    setPlayerHp(finalPlayerHp);
    setOpponentHp(finalOpponentHp);
    
    // 실제 사용자 상대인 경우 Firestore 업데이트
    if (duelRef && duelData) {
      const isPlayer1 = playerId === duelData.player1.id;
      const updateData = {
        log: newDuelLog
      };
      
      if (isPlayer1) {
        updateData.player1 = {
          ...duelData.player1,
          hp: finalPlayerHp,
          action: null
        };
        updateData.player2 = {
          ...duelData.player2,
          hp: finalOpponentHp,
          action: null
        };
      } else {
        updateData.player1 = {
          ...duelData.player1,
          hp: finalOpponentHp,
          action: null
        };
        updateData.player2 = {
          ...duelData.player2,
          hp: finalPlayerHp,
          action: null
        };
      }
      
      // 결투 종료 여부 확인
      if (finalPlayerHp <= 0 || finalOpponentHp <= 0) {
        updateData.status = "completed";
        await setDoc(duelRef, updateData, { merge: true });
        endDuel(finalPlayerHp, finalOpponentHp, duelRef);
      } else {
        // 행동 초기화 및 다음 턴 준비
        await setDoc(duelRef, updateData, { merge: true });
        setPlayerAction(null);
        setOpponentAction(null);
        setIsWaitingForOpponent(false);
      }
    } else if (finalPlayerHp <= 0 || finalOpponentHp <= 0) {
      // AI 상대인 경우 결투 종료
      endDuel(finalPlayerHp, finalOpponentHp);
    }
  };

  const endDuel = async (finalPlayerHp, finalOpponentHp, duelRef = null) => {
    setIsFighting(false);
    setIsDuelOver(true);
    setIsWaitingForOpponent(false);
    
    const winner = finalPlayerHp > 0 ? playerStats : selectedOpponent;
    const loser = finalPlayerHp > 0 ? selectedOpponent : playerStats;
    const resultText = `${winner.info.name}의 승리!`;
    
    // 결투 내용을 종합한 최종 평가 생성
    const summaryPrompt = `다음은 한 결투의 기록입니다:\n---\n${duelLog.join("\n")}\n---\n이 결투의 전체 내용을 종합하여 간략하게 평가해주세요. 승자의 전략, 패자의 실수, 결정적 순간 등을 포함해서 3-4문장으로 요약해주세요.`;
    const duelSummary = await LlmApi.callApiForText(summaryPrompt);
    
    // 칭호 생성
    const titlePrompt = `다음은 한 결투의 기록입니다:\n---\n${duelLog.join("\n")}\n---\n이 전투의 가장 인상적인 순간을 요약해서, 승자와 패자가 들어간 재미있는 칭호를 딱 하나만 만들어줘. (예: "압도적인 힘으로 승리한 자", "방심하다 한 방에 역전패한 어리석은 자")`;
    const duelTitle = await LlmApi.callApiForText(titlePrompt);
    
    // 랜덤 보상 생성
    const isPlayerWinner = winner.info.name === playerStats.info.name;
    const baseGold = isPlayerWinner ? 50 : 10;
    const randomBonus = Math.floor(Math.random() * 30) + 1; // 1-30 사이의 랜덤 보너스
    const totalGold = baseGold + (isPlayerWinner ? randomBonus : 0);
    
    // 결과 설정
    const resultMessage = `${resultText}\n\n${duelSummary}\n\n획득한 칭호: ${duelTitle}\n\n보상: ${totalGold} 골드${isPlayerWinner ? ` (기본 ${baseGold} + 보너스 ${randomBonus})` : ""}`;
    setDuelResult(resultMessage);
    
    // 플레이어 상태 업데이트
    const newPlayerStats = JSON.parse(JSON.stringify(playerStats));
    newPlayerStats.info.wins += (isPlayerWinner ? 1 : 0);
    newPlayerStats.info.losses += (!isPlayerWinner ? 1 : 0);
    newPlayerStats.info.lastDuelTitle = duelTitle;
    newPlayerStats.gold += totalGold;
    setPlayerStats(newPlayerStats);
    await saveData(newPlayerStats, playerId);
    
    // 상대방 상태 업데이트 (AI가 아닌 경우)
    if (!selectedOpponent.isAI) {
      const newOpponentStats = JSON.parse(JSON.stringify(selectedOpponent));
      newOpponentStats.info.wins += (!isPlayerWinner ? 1 : 0);
      newOpponentStats.info.losses += (isPlayerWinner ? 1 : 0);
      await saveData(newOpponentStats, selectedOpponent.id);
      
      // 실시간 결투 문서 업데이트
      if (duelRef) {
        await setDoc(duelRef, {
          status: "completed",
          result: resultMessage,
          winner: isPlayerWinner ? playerId : selectedOpponent.id,
          completedAt: new Date()
        }, { merge: true });
      }
    }
    
    // 상태 초기화
    setPlayerAction(null);
    setOpponentAction(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl h-4/5 flex flex-col">
        <h2 className="text-2xl font-bold text-yellow-400 mb-4">결투장</h2>
        {!selectedOpponent ? (
          <>
            <h3 className="text-lg mb-4">결투 상대를 선택하세요:</h3>
            <ul className="space-y-2 overflow-y-auto">
              {opponents.map(o => (
                <li key={o.id}>
                  <button 
                    onClick={() => startDuel(o)} 
                    className="w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    {o.info.name} (Lv.{o.info.level})
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="h-full flex flex-col">
            <div className="grid grid-cols-2 gap-4 mb-4 text-center">
              <div>
                <h3 className="font-bold">{playerStats.info.name}</h3>
                <p>HP: {playerHp}/{playerStats.stats.hp}</p>
              </div>
              <div>
                <h3 className="font-bold">{selectedOpponent.info.name}</h3>
                <p>HP: {opponentHp}/{selectedOpponent.stats.hp}</p>
              </div>
            </div>
            <div className="flex-grow bg-gray-900 p-2 rounded overflow-y-auto mb-4">
              {duelLog.map((log, i) => <p key={i} className="mb-2">{log}</p>)}
            </div>
            {isFighting && !isWaitingForOpponent && (
              <div className="flex justify-around">
                {['공격', '방어', '특수행동'].map(action => (
                  <button 
                    key={action} 
                    onClick={() => handleAction(action)} 
                    className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded"
                  >
                    {action}
                  </button>
                ))}
              </div>
            )}
            {isFighting && isWaitingForOpponent && (
              <div className="text-center">
                <p className="text-yellow-400 mb-4">상대방의 선택을 기다리고 있습니다...</p>
                <div className="animate-pulse flex justify-center">
                  <div className="h-4 w-4 bg-yellow-400 rounded-full mx-1"></div>
                  <div className="h-4 w-4 bg-yellow-400 rounded-full mx-1 animate-delay-200"></div>
                  <div className="h-4 w-4 bg-yellow-400 rounded-full mx-1 animate-delay-400"></div>
                </div>
              </div>
            )}
            {isDuelOver && (
              <div className="text-center">
                <p className="text-xl font-bold whitespace-pre-wrap">{duelResult}</p>
                <button 
                  onClick={() => setIsDuelModalOpen(false)} 
                  className="mt-4 bg-blue-600 px-4 py-2 rounded"
                >
                  닫기
                </button>
              </div>
            )}
          </div>
        )}
        {!isFighting && !isDuelOver && (
          <button 
            onClick={() => setIsDuelModalOpen(false)} 
            className="mt-4 bg-gray-600 px-4 py-2 rounded self-start"
          >
            취소
          </button>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const { isDuelModalOpen, activeTab, setActiveTab } = useGame();
  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col">
      {isDuelModalOpen && <DuelModal />}
      <h1 className="text-3xl md:text-4xl font-bold text-center text-purple-300 my-4 flex-shrink-0">LLM 텍스트 어드벤처 RPG</h1>
      <div className="md:hidden flex mb-4 rounded-lg overflow-hidden border border-gray-700">
        <button 
          onClick={() => setActiveTab('game')} 
          className={`py-2 px-4 w-full font-bold transition-colors duration-200 ${activeTab === 'game' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
        >
          모험
        </button>
        <button 
          onClick={() => setActiveTab('info')} 
          className={`py-2 px-4 w-full font-bold transition-colors duration-200 ${activeTab === 'info' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'}`}
        >
          정보
        </button>
      </div>
      <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-4" style={{minHeight: 0}}>
        <div className={`${activeTab === 'game' ? 'grid' : 'hidden'} grid-rows-2 md:grid md:col-span-2 gap-4`} style={{minHeight: 0}}>
          <StoryWindow />
          <ChoiceWindow />
        </div>
        <div className={`${activeTab === 'info' ? 'grid' : 'hidden'} md:grid md:grid-rows-2 gap-4`} style={{minHeight: 0}}>
          <StatusWindow />
          <MenuWindow />
        </div>
      </div>
    </div>
  );
};

// Create a wrapped version of App that includes the GameProvider
const WrappedApp = () => (
  <GameProvider>
    <App />
  </GameProvider>
);

// Export the wrapped component as default
export default WrappedApp;

// For development/testing, we can keep the ReactDOM.render call
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(
  <GameProvider>
    <App />
  </GameProvider>
);
