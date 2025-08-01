// edge_case_test.js - Edge case 테스트
// 컴포넌트별 파일명: edge_case_test.js

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

// Edge case 테스트 케이스들
const edgeCases = [
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
        shouldSucceed: true
    },
    {
        name: "여러 줄의 설명이 앞에 있는 경우",
        input: `이것은 첫 번째 줄입니다.
이것은 두 번째 줄입니다.
여기서 JSON이 시작됩니다:

{
  "message": "여러 줄 설명 테스트",
  "choices": [],
  "worldUpdates": {},
  "achievements": [],
  "createdElements": []
}`,
        shouldSucceed: true
    },
    {
        name: "JSON 뒤에 추가 텍스트가 있는 경우",
        input: `{
  "message": "뒤쪽 텍스트 테스트",
  "choices": [],
  "worldUpdates": {},
  "achievements": [],
  "createdElements": []
}

이것은 JSON 뒤의 추가 설명입니다.`,
        shouldSucceed: true
    },
    {
        name: "중첩된 JSON 객체",
        input: `{
  "message": "중첩 객체 테스트",
  "choices": [
    {
      "text": "선택지 1",
      "effects": [{"stat": "power", "value": 5}]
    }
  ],
  "worldUpdates": {
    "nested": {
      "deep": {
        "value": "깊은 중첩"
      }
    }
  },
  "achievements": [],
  "createdElements": []
}`,
        shouldSucceed: true
    },
    {
        name: "message 필드가 없는 경우",
        input: `{
  "choices": [],
  "worldUpdates": {},
  "achievements": [],
  "createdElements": []
}`,
        shouldSucceed: true
    },
    {
        name: "잘못된 JSON 구조",
        input: `{
  "message": "잘못된 JSON",
  "choices": [
    {
      "text": "미완성 객체
    }
  ]
}`,
        shouldSucceed: false
    },
    {
        name: "JSON이 전혀 없는 텍스트",
        input: "이것은 단순한 텍스트입니다. JSON이 없습니다.",
        shouldSucceed: false
    },
    {
        name: "빈 문자열",
        input: "",
        shouldSucceed: false
    }
];

// 테스트 실행
console.log("=== Edge Case 테스트 시작 ===\n");

let passedTests = 0;
let totalTests = edgeCases.length;

edgeCases.forEach((testCase, index) => {
    console.log(`테스트 ${index + 1}: ${testCase.name}`);
    
    try {
        const result = parseApiResponse(testCase.input);
        
        if (testCase.shouldSucceed) {
            if (result && result.message && Array.isArray(result.choices)) {
                console.log("✅ 성공: 올바른 구조 반환");
                console.log(`   메시지: ${result.message.substring(0, 50)}...`);
                passedTests++;
            } else {
                console.log("❌ 실패: 예상된 구조가 아님");
                console.log(`   결과: ${JSON.stringify(result).substring(0, 100)}...`);
            }
        } else {
            if (result && result.message.includes("AI가 응답을 생성하는 중 문제가 발생했습니다")) {
                console.log("✅ 성공: 예상대로 폴백 응답 반환");
                passedTests++;
            } else {
                console.log("❌ 실패: 폴백 응답이 반환되지 않음");
                console.log(`   결과: ${JSON.stringify(result).substring(0, 100)}...`);
            }
        }
    } catch (error) {
        if (testCase.shouldSucceed) {
            console.log(`❌ 실패: 예외 발생 - ${error.message}`);
        } else {
            console.log("✅ 성공: 예상대로 예외 발생");
            passedTests++;
        }
    }
    
    console.log("---");
});

console.log(`\n=== 테스트 완료: ${passedTests}/${totalTests} 통과 ===`);

if (passedTests === totalTests) {
    console.log("🎉 모든 Edge Case 테스트가 통과했습니다!");
    console.log("✅ parseApiResponse 함수가 안정적으로 작동합니다.");
} else {
    console.log("⚠️ 일부 테스트가 실패했습니다. 추가 수정이 필요할 수 있습니다.");
}

// 컴포넌트별 파일명: edge_case_test.js - 끝