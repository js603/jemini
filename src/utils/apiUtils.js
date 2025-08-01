// apiUtils.js - API 호출 유틸리티 함수들
// 컴포넌트별 분리를 통한 코드 품질 개선

/**
 * Groq API 호출 함수
 * @param {string} prompt - 사용자 프롬프트
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} model - 사용할 모델 (기본값: llama3-70b-8192)
 * @returns {Promise<Object>} API 응답 객체
 */
export const callGroqLlmApi = async (prompt, systemPrompt, model = "llama3-70b-8192") => {
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
            return createErrorResponse(`Groq API 호출 실패 (상태: ${response.status})`);
        }
        
        const result = await response.json();
        const llmOutputText = result.choices?.[0]?.message?.content || '';
        
        return parseApiResponse(llmOutputText);
        
    } catch (error) {
        console.error("Groq API 호출 중 오류:", error);
        return createErrorResponse(`Groq API 호출 중 오류: ${error.message}`);
    }
};

/**
 * Gemini API 호출 함수
 * @param {string} userPrompt - 사용자 프롬프트
 * @param {string} systemPromptToUse - 시스템 프롬프트
 * @returns {Promise<Object|string|null>} API 응답
 */
export const callGeminiLlmApi = async (userPrompt, systemPromptToUse) => {
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

/**
 * API 응답 파싱 함수 (개선된 버전)
 * @param {string} llmOutputText - LLM 원본 응답 텍스트
 * @returns {Object} 파싱된 응답 객체
 */
const parseApiResponse = (llmOutputText) => {
    try {
        // 1단계: 코드블록 제거
        let cleanedOutput = llmOutputText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        // 2단계: JSON 객체 추출 (더 견고한 방식)
        // JSON 객체는 { 로 시작하고 } 로 끝남
        const jsonMatch = cleanedOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch && jsonMatch[0]) {
            cleanedOutput = jsonMatch[0];
        } else {
            // JSON 배열도 확인 ([ 로 시작하고 ] 로 끝남)
            const arrayMatch = cleanedOutput.match(/\[[\s\S]*\]/);
            if (arrayMatch && arrayMatch[0]) {
                cleanedOutput = arrayMatch[0];
            } else {
                console.warn("유효한 JSON 구조를 찾을 수 없습니다:", cleanedOutput);
                return createFallbackResponse();
            }
        }
        
        // 3단계: JSON 파싱 시도
        const parsedOutput = JSON.parse(cleanedOutput);
        
        // 4단계: 기본 구조 검증 및 개선된 오류 처리
        if (!parsedOutput.message) {
            console.warn("AI 응답에 message 필드가 없습니다. 기본 메시지를 설정합니다.");
            parsedOutput.message = "창조의 힘이 당신 안에서 꿈틀거립니다. 다음 단계를 선택해주세요.";
        }
        
        // 필수 필드 검증 및 기본값 설정
        if (!Array.isArray(parsedOutput.playerUpdates)) {
            parsedOutput.playerUpdates = [];
        }
        if (!Array.isArray(parsedOutput.choices)) {
            parsedOutput.choices = [];
        }
        if (!parsedOutput.worldUpdates) {
            parsedOutput.worldUpdates = {};
        }
        if (!Array.isArray(parsedOutput.achievements)) {
            parsedOutput.achievements = [];
        }
        if (!Array.isArray(parsedOutput.createdElements)) {
            parsedOutput.createdElements = [];
        }
        
        return parsedOutput;
        
    } catch (parseError) {
        console.error("API 응답 파싱 오류:", parseError);
        console.error("정리된 응답:", llmOutputText);
        console.error("원본 응답:", llmOutputText);
        
        // 더 나은 폴백 응답 제공
        return createFallbackResponse();
    }
};

/**
 * 오류 응답 생성 함수
 * @param {string} errorMessage - 오류 메시지
 * @returns {Object} 오류 응답 객체
 */
const createErrorResponse = (errorMessage) => {
    return {
        message: `[시스템 오류: ${errorMessage}]`,
        choices: [],
        playerUpdates: [],
        worldUpdates: {},
        achievements: [],
        createdElements: []
    };
};

/**
 * 폴백 응답 생성 함수 (JSON 파싱 실패 시)
 * @returns {Object} 폴백 응답 객체
 */
const createFallbackResponse = () => {
    return {
        message: "AI가 응답을 생성하는 중 문제가 발생했습니다. 창조의 여정을 계속하시겠습니까?",
        choices: [
            {
                text: "계속 진행한다",
                type: "continue",
                effects: []
            },
            {
                text: "다시 시도한다",
                type: "retry",
                effects: []
            }
        ],
        playerUpdates: [],
        worldUpdates: {},
        achievements: [],
        createdElements: []
    };
};

/**
 * API 응답 검증 함수
 * @param {Object} response - 검증할 응답 객체
 * @returns {boolean} 유효성 여부
 */
export const validateApiResponse = (response) => {
    if (!response || typeof response !== 'object') {
        return false;
    }
    
    // 필수 필드 검증
    const requiredFields = ['message', 'choices', 'playerUpdates'];
    for (const field of requiredFields) {
        if (!(field in response)) {
            console.warn(`API 응답에 필수 필드 '${field}'가 없습니다.`);
            return false;
        }
    }
    
    // 타입 검증
    if (typeof response.message !== 'string') {
        console.warn("message 필드가 문자열이 아닙니다.");
        return false;
    }
    
    if (!Array.isArray(response.choices)) {
        console.warn("choices 필드가 배열이 아닙니다.");
        return false;
    }
    
    if (!Array.isArray(response.playerUpdates)) {
        console.warn("playerUpdates 필드가 배열이 아닙니다.");
        return false;
    }
    
    return true;
};

/**
 * API 호출 재시도 로직
 * @param {Function} apiCall - API 호출 함수
 * @param {Array} args - API 호출 인자들
 * @param {number} maxRetries - 최대 재시도 횟수
 * @returns {Promise<Object>} API 응답
 */
export const retryApiCall = async (apiCall, args, maxRetries = 3) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`API 호출 시도 ${attempt}/${maxRetries}`);
            const response = await apiCall(...args);
            
            if (validateApiResponse(response)) {
                return response;
            }
            
            throw new Error('API 응답 검증 실패');
            
        } catch (error) {
            lastError = error;
            console.warn(`API 호출 시도 ${attempt} 실패:`, error.message);
            
            if (attempt < maxRetries) {
                // 지수 백오프: 1초, 2초, 4초 대기
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`${delay}ms 후 재시도...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    console.error(`모든 API 호출 시도 실패. 마지막 오류:`, lastError);
    return createFallbackResponse();
};

// apiUtils.js 끝