/**
 * AI 서비스: Groq API를 사용하여 LLM과 통신하는 함수를 제공합니다.
 * API 연결 실패 시 로컬 폴백 메커니즘을 포함합니다.
 */

// 주의: 실제 프로덕션 환경에서는 API 키를 클라이언트 코드에 노출하면 안 됩니다.
// 이상적으로는 환경 변수나 안전한 백엔드 서비스를 통해 관리해야 합니다.
const GROQ_API_KEY = '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';

// 연결 상태 추적
let apiStatus = {
  lastCallTime: null,
  lastCallSuccess: true,
  failureCount: 0,
  inCooldown: false,
  cooldownUntil: null
};

// 로컬 캐시 (최근 응답 저장)
const responseCache = new Map();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

// 기본 이벤트 및 응답 세트 (API 실패 시 사용)
const DEFAULT_EVENTS = [
  {
    title: "예상치 못한 기후 변화",
    description: "갑작스러운 기후 변화로 인해 농작물 생산에 영향이 발생했습니다.",
    effects: [
      { nation: "로마", effect: "자원변경", value: -30 },
      { nation: "페르시아", effect: "안정도변경", value: -5 }
    ]
  },
  {
    title: "무역로 발견",
    description: "새로운 무역로가 발견되어 자원 생산이 증가했습니다.",
    effects: [
      { nation: "로마", effect: "자원변경", value: 50 },
      { nation: "페르시아", effect: "자원변경", value: 50 }
    ]
  },
  {
    title: "기술 혁신",
    description: "연구자들이 중요한 기술적 돌파구를 발견했습니다.",
    effects: [
      { nation: "로마", effect: "기술발전", value: 1, tech_name: "engineering" },
      { nation: "페르시아", effect: "기술발전", value: 1, tech_name: "agriculture" }
    ]
  },
  {
    title: "질병 발생",
    description: "전염병이 발생하여 군사력에 영향을 미쳤습니다.",
    effects: [
      { nation: "로마", effect: "군사력변경", value: -3 },
      { nation: "페르시아", effect: "군사력변경", value: -3 }
    ]
  },
  {
    title: "외교적 성공",
    description: "성공적인 외교 협상으로 국가 안정도가 향상되었습니다.",
    effects: [
      { nation: "로마", effect: "안정도변경", value: 10 },
      { nation: "페르시아", effect: "안정도변경", value: 10 }
    ]
  }
];

// 보좌관 명령 기본 응답 (API 실패 시 사용)
const DEFAULT_ADVISOR_RESPONSES = {
  "국방": [
    { action: "build_military", value: 10, explanation: "10명의 군대를 훈련합니다." },
    { action: "attack", from: "로마", to: "카르타고", explanation: "로마에서 카르타고를 공격합니다." }
  ],
  "재무": [
    { action: "research", tech_name: "agriculture", explanation: "농업 기술을 연구합니다." },
    { action: "research", tech_name: "engineering", explanation: "공학 기술을 연구합니다." }
  ],
  "외교": [
    { action: "research", tech_name: "diplomacy", explanation: "외교 기술을 연구합니다." },
    { action: "move_troops", from: "로마", to: "시칠리아", value: 5, explanation: "로마에서 시칠리아로 5명의 부대를 이동합니다." }
  ],
  "정보": [
    { action: "research", tech_name: "espionage", explanation: "첩보 기술을 연구합니다." },
    { action: "build_military", value: 5, explanation: "5명의 군대를 훈련합니다." }
  ]
};

/**
 * 캐시 키를 생성합니다.
 * @param {string} prompt - 사용자 프롬프트
 * @param {string} systemPrompt - 시스템 프롬프트
 * @returns {string} 캐시 키
 */
const createCacheKey = (prompt, systemPrompt) => {
  return `${systemPrompt}:${prompt}`;
};

/**
 * 캐시에서 응답을 가져옵니다.
 * @param {string} key - 캐시 키
 * @returns {Object|null} 캐시된 응답 또는 null
 */
const getFromCache = (key) => {
  if (!responseCache.has(key)) return null;
  
  const cachedItem = responseCache.get(key);
  const now = Date.now();
  
  // 캐시 TTL 확인
  if (now - cachedItem.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  
  return cachedItem.data;
};

/**
 * 응답을 캐시에 저장합니다.
 * @param {string} key - 캐시 키
 * @param {Object} data - 저장할 데이터
 */
const saveToCache = (key, data) => {
  // 캐시 크기 제한 확인
  if (responseCache.size >= CACHE_MAX_SIZE) {
    // 가장 오래된 항목 제거
    const oldestKey = [...responseCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
    responseCache.delete(oldestKey);
  }
  
  responseCache.set(key, {
    data,
    timestamp: Date.now()
  });
};

/**
 * 동적 이벤트 요청에 대한 로컬 폴백 응답을 생성합니다.
 * @param {Object} gameData - 게임 데이터
 * @returns {Object} 이벤트 응답
 */
const generateLocalEventResponse = (gameData) => {
  // 게임 데이터에서 국가 이름 추출
  let nationNames = [];
  try {
    if (gameData && gameData.nations) {
      nationNames = Object.keys(gameData.nations);
    }
  } catch (e) {
    console.warn('게임 데이터에서 국가 이름을 추출할 수 없습니다:', e);
  }
  
  // 기본 이벤트 중 하나를 무작위로 선택
  const randomEvent = { ...DEFAULT_EVENTS[Math.floor(Math.random() * DEFAULT_EVENTS.length)] };
  
  // 국가 이름이 있으면 이벤트의 국가 이름을 실제 게임의 국가 이름으로 대체
  if (nationNames.length > 0) {
    randomEvent.effects = randomEvent.effects.map(effect => {
      const randomNation = nationNames[Math.floor(Math.random() * nationNames.length)];
      return { ...effect, nation: randomNation };
    });
  }
  
  return randomEvent;
};

/**
 * 보좌관 명령에 대한 로컬 폴백 응답을 생성합니다.
 * @param {string} advisorType - 보좌관 유형
 * @param {string} command - 명령 텍스트
 * @param {Object} gameData - 게임 데이터
 * @returns {Object} 보좌관 명령 응답
 */
const generateLocalAdvisorResponse = (advisorType, command, gameData) => {
  // 해당 보좌관 유형의 기본 응답 중 하나를 무작위로 선택
  const responses = DEFAULT_ADVISOR_RESPONSES[advisorType] || DEFAULT_ADVISOR_RESPONSES["국방"];
  let response = { ...responses[Math.floor(Math.random() * responses.length)] };
  
  // 게임 데이터에서 영토 정보 추출하여 응답 조정
  try {
    if (gameData && gameData.map && gameData.map.territories) {
      const territories = Object.values(gameData.map.territories);
      const myTerritories = territories.filter(t => t.owner === gameData.currentNation);
      const enemyTerritories = territories.filter(t => t.owner !== gameData.currentNation && t.owner !== null);
      
      // 영토 정보가 있으면 응답의 영토 이름을 실제 게임의 영토 이름으로 대체
      if (response.action === 'attack' && myTerritories.length > 0 && enemyTerritories.length > 0) {
        response.from = myTerritories[0].name;
        response.to = enemyTerritories[0].name;
        response.explanation = `${response.from}에서 ${response.to}를 공격합니다.`;
      } else if (response.action === 'move_troops' && myTerritories.length >= 2) {
        response.from = myTerritories[0].name;
        response.to = myTerritories[1].name;
        response.explanation = `${response.from}에서 ${response.to}로 ${response.value}명의 부대를 이동합니다.`;
      }
    }
  } catch (e) {
    console.warn('게임 데이터에서 영토 정보를 추출할 수 없습니다:', e);
  }
  
  // 명령 텍스트에 특정 키워드가 있으면 그에 맞는 응답 선택
  if (command.includes('공격') || command.includes('침략')) {
    response = { ...DEFAULT_ADVISOR_RESPONSES["국방"][0] };
  } else if (command.includes('연구') || command.includes('기술')) {
    response = { ...DEFAULT_ADVISOR_RESPONSES["재무"][0] };
  } else if (command.includes('훈련') || command.includes('군대')) {
    response = { ...DEFAULT_ADVISOR_RESPONSES["국방"][1] };
  }
  
  return response;
};

/**
 * API 상태를 확인하고 쿨다운 상태를 업데이트합니다.
 * @returns {boolean} API 호출 가능 여부
 */
const checkApiStatus = () => {
  const now = Date.now();
  
  // 쿨다운 중인지 확인
  if (apiStatus.inCooldown && now < apiStatus.cooldownUntil) {
    return false;
  }
  
  // 쿨다운 종료
  if (apiStatus.inCooldown && now >= apiStatus.cooldownUntil) {
    apiStatus.inCooldown = false;
    apiStatus.failureCount = 0;
  }
  
  return true;
};

/**
 * API 호출 성공을 기록합니다.
 */
const recordApiSuccess = () => {
  apiStatus.lastCallTime = Date.now();
  apiStatus.lastCallSuccess = true;
  apiStatus.failureCount = 0;
  apiStatus.inCooldown = false;
};

/**
 * API 호출 실패를 기록하고 필요시 쿨다운을 설정합니다.
 */
const recordApiFailure = () => {
  apiStatus.lastCallTime = Date.now();
  apiStatus.lastCallSuccess = false;
  apiStatus.failureCount++;
  
  // 연속 실패 횟수에 따라 쿨다운 설정
  if (apiStatus.failureCount >= 3) {
    apiStatus.inCooldown = true;
    // 지수 백오프로 쿨다운 시간 설정 (최대 5분)
    const cooldownTime = Math.min(Math.pow(2, apiStatus.failureCount - 3) * 30000, 300000);
    apiStatus.cooldownUntil = Date.now() + cooldownTime;
    console.warn(`API 연속 실패로 ${cooldownTime / 1000}초 동안 쿨다운 설정됨`);
  }
};

/**
 * Groq API를 호출하여 LLM 응답을 받아옵니다.
 * API 실패 시 로컬 폴백 메커니즘을 사용합니다.
 * @param {string} prompt - 사용자 프롬프트
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} model - 사용할 모델 (기본값: "llama-3.1-405b-reasoning")
 * @param {Object} gameData - 게임 데이터 (로컬 폴백용)
 * @returns {Promise<Object>} - LLM 응답 객체
 */
export const callGroqLlmApi = async (prompt, systemPrompt, model = "llama-3.1-405b-reasoning", gameData = null) => {
  const cacheKey = createCacheKey(prompt, systemPrompt);
  const cachedResponse = getFromCache(cacheKey);
  
  // 캐시된 응답이 있으면 반환
  if (cachedResponse) {
    console.log('캐시된 응답 사용:', cacheKey);
    return cachedResponse;
  }
  
  // API 상태 확인 (쿨다운 중이면 로컬 폴백 사용)
  if (!checkApiStatus()) {
    console.warn('API 쿨다운 중, 로컬 폴백 사용');
    return handleLocalFallback(prompt, systemPrompt, gameData);
  }
  
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const isJsonRequest = systemPrompt.includes('JSON');
  const payload = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 1024,
    ...(isJsonRequest && { response_format: { type: 'json_object' } }),
  };
  
  try {
    console.log('Groq API 호출 중...');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`Groq API 호출 실패 (상태: ${response.status})`);
      recordApiFailure();
      return handleLocalFallback(prompt, systemPrompt, gameData);
    }
    
    const result = await response.json();
    const llmOutputText = result.choices?.[0]?.message?.content || '{}';
    let parsedResponse;
    
    if (isJsonRequest) {
      try {
        parsedResponse = JSON.parse(llmOutputText);
      } catch (parseError) {
        console.error("JSON 파싱 실패:", parseError);
        recordApiFailure();
        return handleLocalFallback(prompt, systemPrompt, gameData);
      }
    } else {
      parsedResponse = { content: llmOutputText };
    }
    
    // 성공적인 응답 캐싱 및 상태 업데이트
    saveToCache(cacheKey, parsedResponse);
    recordApiSuccess();
    return parsedResponse;
    
  } catch (error) {
    console.error("Groq API 호출 중 오류:", error);
    recordApiFailure();
    return handleLocalFallback(prompt, systemPrompt, gameData);
  }
};

/**
 * API 실패 시 로컬 폴백 응답을 생성합니다.
 * @param {string} prompt - 사용자 프롬프트
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {Object} gameData - 게임 데이터
 * @returns {Object} 로컬 폴백 응답
 */
const handleLocalFallback = (prompt, systemPrompt, gameData) => {
  console.log('로컬 폴백 응답 생성 중...');
  
  // 동적 이벤트 요청인 경우
  if (systemPrompt.includes('스토리텔러') && systemPrompt.includes('무작위 이벤트')) {
    const localEvent = generateLocalEventResponse(gameData);
    console.log('로컬 이벤트 생성됨:', localEvent.title);
    return localEvent;
  }
  
  // 보좌관 명령 요청인 경우
  if (systemPrompt.includes('사용자의 명령을 분석')) {
    // 보좌관 유형 추출 시도
    let advisorType = "국방"; // 기본값
    try {
      const advisorMatch = systemPrompt.match(/당신은 '([^']+)'이며/);
      if (advisorMatch && advisorMatch[1]) {
        if (advisorMatch[1] === '매파') advisorType = "국방";
        else if (advisorMatch[1] === '관료') advisorType = "재무";
        else if (advisorMatch[1] === '비둘기파') advisorType = "외교";
        else if (advisorMatch[1] === '현실주의자') advisorType = "정보";
      }
    } catch (e) {
      console.warn('보좌관 유형을 추출할 수 없습니다:', e);
    }
    
    const localResponse = generateLocalAdvisorResponse(advisorType, prompt, gameData);
    console.log('로컬 보좌관 응답 생성됨:', localResponse.action);
    return localResponse;
  }
  
  // 기타 요청의 경우 기본 응답
  return {
    content: "AI 서비스에 연결할 수 없습니다. 나중에 다시 시도해주세요.",
    isLocalFallback: true
  };
};

/**
 * 현재 API 상태 정보를 반환합니다.
 * @returns {Object} API 상태 정보
 */
export const getApiStatus = () => {
  return {
    ...apiStatus,
    cacheSize: responseCache.size,
    isAvailable: !apiStatus.inCooldown
  };
};

export default {
  callGroqLlmApi,
  getApiStatus
};