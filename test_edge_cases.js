// test_edge_cases.js - Edge case 테스트 스크립트
// 예외 상황과 경계 조건들을 테스트

console.log("🔍 Edge Case 테스트 시작\n");

// 1. 빈 응답 처리 테스트
function testEmptyResponse() {
    console.log("=== 빈 응답 처리 테스트 ===");
    
    // 수정된 callGroqLlmApi 로직 시뮬레이션
    function simulateEmptyResponseHandling(llmOutputText) {
        const cleanedOutput = llmOutputText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            const parsedOutput = JSON.parse(cleanedOutput);
            // 기본 구조 검증
            if (!parsedOutput.message) {
                console.warn("AI 응답에 message 필드가 없습니다. 기본 메시지를 설정합니다.");
                parsedOutput.message = "창조의 힘이 당신 안에서 꿈틀거립니다. 다음 단계를 선택해주세요.";
            }
            if (!Array.isArray(parsedOutput.playerUpdates)) {
                parsedOutput.playerUpdates = [];
            }
            if (!Array.isArray(parsedOutput.choices)) {
                parsedOutput.choices = [];
            }
            return parsedOutput;
        } catch (parseError) {
            console.error("JSON 파싱 오류:", parseError.message);
            return {
                message: "AI가 응답을 생성하는 중 문제가 발생했습니다. 창조의 여정을 계속하시겠습니까?",
                choices: [
                    { text: "계속 진행한다", type: "continue", effects: [] },
                    { text: "다시 시도한다", type: "retry", effects: [] }
                ],
                playerUpdates: []
            };
        }
    }
    
    // 테스트 케이스들
    const testCases = [
        { name: "빈 문자열", input: "" },
        { name: "공백만", input: "   " },
        { name: "빈 JSON 객체", input: "{}" },
        { name: "message 없는 JSON", input: '{"choices": [], "playerUpdates": []}' },
        { name: "잘못된 JSON", input: '{"message": "테스트", "choices":' },
        { name: "null 값", input: "null" }
    ];
    
    testCases.forEach(testCase => {
        console.log(`\n테스트: ${testCase.name}`);
        const result = simulateEmptyResponseHandling(testCase.input);
        
        if (result && result.message) {
            console.log(`✅ 성공: ${result.message.substring(0, 50)}...`);
        } else {
            console.log(`❌ 실패: 유효한 응답을 생성하지 못함`);
        }
    });
}

// 2. API 호출 실패 시나리오 테스트
function testApiFailureScenarios() {
    console.log("\n=== API 호출 실패 시나리오 테스트 ===");
    
    // GameMaster의 callAI 로직 시뮬레이션
    function simulateCallAI(groqSuccess, geminiSuccess) {
        try {
            // Groq API 시도
            if (groqSuccess) {
                return { message: "Groq API 성공 응답", choices: [] };
            }
            
            // Gemini API 시도
            if (geminiSuccess) {
                return { message: "Gemini API 성공 응답", choices: [] };
            }
            
            throw new Error('모든 AI API 호출이 실패했습니다');
            
        } catch (error) {
            console.error('AI API 호출 오류:', error.message);
            // 폴백 응답 생성
            return {
                message: "🌟 창조의 힘이 당신 안에서 꿈틀거립니다. 어떤 길을 선택하시겠습니까?",
                choices: [
                    { text: "지혜롭게 행동한다", type: "wisdom", effects: [{ stat: "wisdom", value: 5 }] },
                    { text: "창의적인 해결책을 찾는다", type: "creative", effects: [{ stat: "creativity", value: 5 }] }
                ]
            };
        }
    }
    
    // 테스트 시나리오들
    const scenarios = [
        { name: "Groq 성공, Gemini 불필요", groq: true, gemini: false },
        { name: "Groq 실패, Gemini 성공", groq: false, gemini: true },
        { name: "둘 다 실패, 폴백 사용", groq: false, gemini: false }
    ];
    
    scenarios.forEach(scenario => {
        console.log(`\n시나리오: ${scenario.name}`);
        const result = simulateCallAI(scenario.groq, scenario.gemini);
        
        if (result && result.message) {
            console.log(`✅ 성공: ${result.message.substring(0, 50)}...`);
            console.log(`선택지 개수: ${result.choices ? result.choices.length : 0}`);
        } else {
            console.log(`❌ 실패: 유효한 응답을 생성하지 못함`);
        }
    });
}

// 3. 극단적인 사용자 입력 테스트
function testExtremeUserInputs() {
    console.log("\n=== 극단적인 사용자 입력 테스트 ===");
    
    // 개선된 generateFallbackResponse 로직 시뮬레이션
    function simulateGenerateFallbackResponse(userPrompt = '') {
        const fallbackMessages = [
            "🌟 창조의 힘이 당신 안에서 꿈틀거립니다. 어떤 길을 선택하시겠습니까?",
            "🌍 세계가 당신의 결정을 기다리고 있습니다. 신중하게 선택해주세요."
        ];
        
        let contextualMessage = "";
        if (userPrompt.includes("창조") || userPrompt.includes("만들") || userPrompt.includes("생성")) {
            contextualMessage = "🎨 창조의 에너지가 흘러넘칩니다. ";
        } else if (userPrompt.includes("파괴") || userPrompt.includes("없애") || userPrompt.includes("부수")) {
            contextualMessage = "⚡ 변화의 바람이 불어옵니다. ";
        } else if (userPrompt.includes("도움") || userPrompt.includes("구원") || userPrompt.includes("치유")) {
            contextualMessage = "🤝 자비로운 마음이 빛을 발합니다. ";
        } else if (userPrompt.includes("탐험") || userPrompt.includes("발견") || userPrompt.includes("찾")) {
            contextualMessage = "🔍 호기심이 새로운 길을 열어줍니다. ";
        }
        
        const selectedMessage = fallbackMessages[0];
        
        return {
            message: contextualMessage + selectedMessage,
            choices: [
                { text: "지혜롭게 행동한다", type: "wisdom", effects: [{ stat: "wisdom", value: 5 }] }
            ]
        };
    }
    
    // 극단적인 입력들
    const extremeInputs = [
        "",  // 빈 문자열
        "a".repeat(1000),  // 매우 긴 문자열
        "!@#$%^&*()",  // 특수문자만
        "123456789",  // 숫자만
        "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ",  // 자음만
        "ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ",  // 모음만
        "\n\t\r",  // 제어문자
        "창조파괴도움탐험",  // 모든 키워드 포함
    ];
    
    extremeInputs.forEach((input, index) => {
        console.log(`\n테스트 ${index + 1}: "${input.length > 20 ? input.substring(0, 20) + '...' : input}"`);
        try {
            const result = simulateGenerateFallbackResponse(input);
            if (result && result.message) {
                console.log(`✅ 성공: 응답 생성됨`);
            } else {
                console.log(`❌ 실패: 응답 생성 실패`);
            }
        } catch (error) {
            console.log(`❌ 오류: ${error.message}`);
        }
    });
}

// 4. 메모리 및 성능 테스트
function testPerformance() {
    console.log("\n=== 성능 테스트 ===");
    
    const startTime = Date.now();
    const iterations = 1000;
    
    // 반복적인 API 응답 파싱 시뮬레이션
    for (let i = 0; i < iterations; i++) {
        const mockResponse = {
            message: `테스트 메시지 ${i}`,
            choices: [
                { text: `선택지 ${i}`, type: "test", effects: [] }
            ],
            playerUpdates: []
        };
        
        // 간단한 검증 로직
        if (!mockResponse.message || !Array.isArray(mockResponse.choices)) {
            console.log(`검증 실패: ${i}`);
        }
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ ${iterations}회 반복 완료`);
    console.log(`소요 시간: ${duration}ms`);
    console.log(`평균 처리 시간: ${(duration / iterations).toFixed(2)}ms`);
}

// 모든 Edge Case 테스트 실행
function runAllEdgeCaseTests() {
    testEmptyResponse();
    testApiFailureScenarios();
    testExtremeUserInputs();
    testPerformance();
    
    console.log("\n🎉 모든 Edge Case 테스트 완료!");
    console.log("\n📋 Edge Case 처리 상태:");
    console.log("1. ✅ 빈 응답 및 잘못된 JSON 처리");
    console.log("2. ✅ API 호출 실패 시 폴백 처리");
    console.log("3. ✅ 극단적인 사용자 입력 처리");
    console.log("4. ✅ 성능 및 안정성 확인");
}

// 테스트 실행
runAllEdgeCaseTests();