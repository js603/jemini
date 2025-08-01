// test_api_parsing_fix.js - API 파싱 수정 사항 테스트
// 컴포넌트별 파일명: test_api_parsing_fix.js

/**
 * 테스트 시나리오:
 * 1. 문제가 되었던 "Here's the first scenario:" 형태의 응답
 * 2. 정상적인 JSON 응답
 * 3. 코드블록이 포함된 응답
 * 4. 잘못된 JSON 형태
 * 5. 빈 응답
 */

// apiUtils.js에서 parseApiResponse 함수를 가져오기 위한 모듈 시뮬레이션
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

// 테스트 케이스들
const testCases = [
    {
        name: "문제가 되었던 응답 형태 (Here's the first scenario:)",
        input: `Here's the first scenario:

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
}`,
        expectedSuccess: true
    },
    {
        name: "정상적인 JSON 응답",
        input: `{
  "message": "테스트 메시지",
  "choices": [],
  "worldUpdates": {},
  "achievements": [],
  "createdElements": []
}`,
        expectedSuccess: true
    },
    {
        name: "코드블록이 포함된 응답",
        input: `\`\`\`json
{
  "message": "코드블록 테스트",
  "choices": [],
  "worldUpdates": {},
  "achievements": [],
  "createdElements": []
}
\`\`\``,
        expectedSuccess: true
    },
    {
        name: "설명 텍스트가 앞뒤로 있는 경우",
        input: `이것은 설명입니다.

{
  "message": "앞뒤 텍스트 테스트",
  "choices": [],
  "worldUpdates": {},
  "achievements": [],
  "createdElements": []
}

이것은 뒤쪽 설명입니다.`,
        expectedSuccess: true
    },
    {
        name: "잘못된 JSON 형태",
        input: `{
  "message": "잘못된 JSON",
  "choices": [
    {
      "text": "미완성
    }
  ]
}`,
        expectedSuccess: false
    },
    {
        name: "JSON이 없는 텍스트만",
        input: "이것은 단순한 텍스트입니다. JSON이 없습니다.",
        expectedSuccess: false
    }
];

// 테스트 실행 함수
function runTests() {
    console.log("=== API 파싱 수정 사항 테스트 시작 ===\n");
    
    let passedTests = 0;
    let totalTests = testCases.length;
    
    testCases.forEach((testCase, index) => {
        console.log(`테스트 ${index + 1}: ${testCase.name}`);
        console.log("입력:", testCase.input.substring(0, 100) + "...");
        
        try {
            const result = parseApiResponse(testCase.input);
            
            if (testCase.expectedSuccess) {
                if (result && result.message && Array.isArray(result.choices)) {
                    console.log("✅ 성공: 올바른 구조의 객체 반환");
                    console.log("메시지:", result.message.substring(0, 50) + "...");
                    passedTests++;
                } else {
                    console.log("❌ 실패: 예상된 구조가 아님");
                    console.log("결과:", result);
                }
            } else {
                if (result && result.message === "AI가 응답을 생성하는 중 문제가 발생했습니다. 창조의 여정을 계속하시겠습니까?") {
                    console.log("✅ 성공: 예상대로 폴백 응답 반환");
                    passedTests++;
                } else {
                    console.log("❌ 실패: 폴백 응답이 반환되지 않음");
                    console.log("결과:", result);
                }
            }
        } catch (error) {
            if (testCase.expectedSuccess) {
                console.log("❌ 실패: 예외 발생", error.message);
            } else {
                console.log("✅ 성공: 예상대로 예외 발생");
                passedTests++;
            }
        }
        
        console.log("---\n");
    });
    
    console.log(`=== 테스트 완료: ${passedTests}/${totalTests} 통과 ===`);
    
    if (passedTests === totalTests) {
        console.log("🎉 모든 테스트가 통과했습니다!");
        return true;
    } else {
        console.log("⚠️ 일부 테스트가 실패했습니다.");
        return false;
    }
}

// 테스트 실행
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runTests, parseApiResponse };
} else {
    runTests();
}

// 컴포넌트별 파일명: test_api_parsing_fix.js - 끝