/**
 * @file llmService.js
 * Groq API를 사용하여 LLM과 통신하는 서비스를 제공합니다.
 */

// 주의: 실제 프로덕션 환경에서는 API 키를 클라이언트 코드에 노출하면 안 됩니다.
// 환경 변수나 안전한 백엔드 서비스를 통해 관리하는 것이 좋습니다.
const GROQ_API_KEY = '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';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Groq API를 호출하여 LLM 응답을 받아옵니다.
 * 
 * @param {string} prompt - 사용자 프롬프트
 * @param {string} systemPrompt - 시스템 프롬프트
 * @param {string} model - 사용할 모델 (기본값: "llama-3.1-405b-reasoning")
 * @returns {Promise<Object>} LLM 응답 객체
 */
export const callGroqLlmApi = async (prompt, systemPrompt, model = "llama-3.1-405b-reasoning") => {
  // 시스템 프롬프트에 'JSON'이 포함되어 있는지 여부에 따라 응답 형식을 동적으로 변경합니다.
  const isJsonRequest = systemPrompt.includes('JSON');
  const payload = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 1024,
    ...(isJsonRequest && { response_format: { type: 'json_object' } }),
  };
  
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
      console.error(`Groq API 호출 실패 (상태: ${response.status})`);
      return { error: `Groq API 호출 실패 (상태: ${response.status})` };
    }
    
    const result = await response.json();
    const llmOutputText = result.choices?.[0]?.message?.content || '{}';
    
    if (isJsonRequest) {
      try { 
        return JSON.parse(llmOutputText); 
      } catch (parseError) { 
        return { error: "JSON 파싱 실패", content: llmOutputText }; 
      }
    }
    
    return { content: llmOutputText };
  } catch (error) {
    console.error("Groq API 호출 중 오류:", error);
    return { error: `Groq API 호출 중 오류: ${error.message}` };
  }
};

export default callGroqLlmApi;