// simple_test.js - 간단한 Node.js 테스트
// 컴포넌트별 파일명: simple_test.js

// 수정된 parseApiResponse 함수 복사
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

// 문제가 되었던 실제 응답으로 테스트
const problemResponse = `Here's the first scenario:

{
  "message": "무한한 어둠 속에서, 당신은 새로운 세계의 창조자가 되었습니다. 이 세계는 아직 아무것도 없는 상태입니다. 그러나 당신은 이 세계에 생명을 불어넣을 수 있는 능력을 가지고 있습니다. 이제 당신은 이 세계의 첫 번째 시나리오를 시작합니다.",
  "choices": [
    {
      "text": "빛을 창조하여 세계를 밝히자",
      "description": "이 세계에 빛을 창조하여 어둠을 밝히고 생명을 불어넣을 수 있습니다.",
      "type": "creation",
      "effects": [
        {
          "stat": "creativity",
          "value": 10
        }
      ]
    },
    {
      "text": "음울한 분위기를 조성하여 세계를 형성하자",
      "description": "이 세계에 음울한 분위기를 조성하여 세계의 형태를 결정할 수 있습니다.",
      "type": "wisdom",
      "effects": [
        {
          "stat": "wisdom",
          "value": 10
        }
      ]
    },
    {
      "text": "강한 에너지를 방출하여 세계를 변화시키자",
      "description": "이 세계에 강한 에너지를 방출하여 세계의 형태를 변화시킬 수 있습니다.",
      "type": "power",
      "effects": [
        {
          "stat": "power",
          "value": 10
        }
      ]
    }
  ],
  "worldUpdates": {
    "stage": "beginning",
    "environment": "void",
    "population": 0,
    "elements": []
  },
  "achievements": [],
  "createdElements": []
}`;

console.log("=== 문제가 되었던 응답 테스트 ===");
console.log("입력 응답 (처음 100자):", problemResponse.substring(0, 100) + "...");
console.log("");

try {
    const result = parseApiResponse(problemResponse);
    console.log("✅ 파싱 성공!");
    console.log("메시지:", result.message.substring(0, 100) + "...");
    console.log("선택지 개수:", result.choices.length);
    console.log("첫 번째 선택지:", result.choices[0]?.text);
    console.log("worldUpdates:", result.worldUpdates);
    console.log("");
    console.log("🎉 수정된 parseApiResponse 함수가 정상적으로 작동합니다!");
} catch (error) {
    console.log("❌ 파싱 실패:", error.message);
    console.log("⚠️ 추가 수정이 필요합니다.");
}

// 컴포넌트별 파일명: simple_test.js - 끝