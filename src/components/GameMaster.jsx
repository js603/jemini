// GameMaster.jsx - AI 게임 마스터 커스텀 훅
import { useCallback, useEffect } from 'react';
import useGameStore from '../stores/gameStore';

/**
 * AI 게임 마스터 커스텀 훅
 * - 시나리오 생성 및 스토리텔링
 * - 선택지 제안 시스템
 * - 게임 진행 로직 관리
 * - AI API 호출 및 응답 처리
 * - 게임 상태 업데이트
 */
const useGameMaster = ({ groqApiCall, geminiApiCall }) => {
  const {
    isGameStarted,
    messages,
    world,
    player,
    addMessage,
    setChoices,
    setLoading,
    setError,
    updatePlayerStats,
    updateWorld,
    addCreatedElement,
    addAchievement,
    getRecentMessages
  } = useGameStore();

  // 시스템 프롬프트 생성
  const generateSystemPrompt = useCallback(() => {
    return `당신은 "창조의 여정"이라는 인터랙티브 시뮬레이션 게임의 AI 게임 마스터입니다.

게임 설정:
- 플레이어는 새로운 세계의 창조자입니다
- 행성과 인류 창조의 시나리오를 스토리텔링합니다
- 플레이어의 선택에 따라 세계가 발전합니다

현재 게임 상태:
- 세계 단계: ${world.stage}
- 환경: ${world.environment}
- 인구: ${world.population}
- 창조된 요소들: ${world.elements.join(', ') || '없음'}
- 플레이어 능력치: 지혜(${player.stats.wisdom}), 힘(${player.stats.power}), 자비(${player.stats.compassion}), 창의성(${player.stats.creativity})

응답 규칙:
1. 항상 JSON 형식으로 응답하세요
2. 한국어로 작성하세요
3. 창의적이고 몰입감 있는 스토리텔링을 하세요
4. 플레이어의 선택이 의미 있는 결과를 가져오도록 하세요

JSON 응답 형식:
{
  "message": "게임 마스터의 메시지 (스토리텔링)",
  "choices": [
    {
      "text": "선택지 텍스트",
      "description": "선택지 설명 (선택사항)",
      "type": "creative|wisdom|power|compassion|destruction|creation|exploration|protection",
      "effects": [
        {
          "stat": "wisdom|power|compassion|creativity",
          "value": 숫자 (양수/음수)
        }
      ]
    }
  ],
  "worldUpdates": {
    "stage": "beginning|creation|development|advanced",
    "environment": "환경 설명",
    "population": 숫자,
    "elements": ["새로운 요소들"]
  },
  "achievements": ["달성한 업적들"],
  "createdElements": ["새로 창조된 요소들"]
}`;
  }, [world, player]);

  // AI API 호출 (Groq 우선, 실패시 Gemini)
  const callAI = useCallback(async (userPrompt) => {
    const systemPrompt = generateSystemPrompt();
    
    try {
      // Groq API 먼저 시도
      if (groqApiCall) {
        const groqResponse = await groqApiCall(userPrompt, systemPrompt);
        if (groqResponse && groqResponse.message) {
          return parseAIResponse(groqResponse.message);
        }
      }
      
      // Groq 실패시 Gemini API 시도
      if (geminiApiCall) {
        const geminiResponse = await geminiApiCall(userPrompt, systemPrompt);
        if (geminiResponse) {
          return parseAIResponse(geminiResponse);
        }
      }
      
      throw new Error('모든 AI API 호출이 실패했습니다');
      
    } catch (error) {
      console.error('AI API 호출 오류:', error);
      return generateFallbackResponse(userPrompt);
    }
  }, [generateSystemPrompt, groqApiCall, geminiApiCall]);

  // AI 응답 파싱
  const parseAIResponse = (response) => {
    try {
      // 문자열인 경우 JSON 파싱 시도
      if (typeof response === 'string') {
        // JSON 코드블록 제거
        const cleanedResponse = response
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();
        
        // JSON 추출 시도
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        
        // JSON이 아닌 경우 기본 응답 생성
        return {
          message: response,
          choices: generateDefaultChoices(),
          worldUpdates: {},
          achievements: [],
          createdElements: []
        };
      }
      
      // 이미 객체인 경우 검증 후 반환
      if (typeof response === 'object' && response.message) {
        return {
          message: response.message,
          choices: response.choices || generateDefaultChoices(),
          worldUpdates: response.worldUpdates || {},
          achievements: response.achievements || [],
          createdElements: response.createdElements || []
        };
      }
      
      throw new Error('유효하지 않은 응답 형식');
      
    } catch (error) {
      console.error('AI 응답 파싱 오류:', error);
      return generateFallbackResponse();
    }
  };

  // 동적 선택지 생성 (이야기 흐름 기반)
  const generateDefaultChoices = useCallback(() => {
    // 최근 메시지에서 컨텍스트 추출
    const recentMessages = getRecentMessages(3);
    const lastMessage = recentMessages[recentMessages.length - 1];
    const context = lastMessage ? lastMessage.content.toLowerCase() : '';
    
    // 게임 단계별 기본 선택지 풀
    const choicesByStage = {
      beginning: [
        {
          text: "빛을 창조하여 어둠을 밝힌다",
          type: "creation",
          description: "세상에 첫 번째 빛을 가져옵니다",
          effects: [{ stat: "creativity", value: 8 }, { stat: "wisdom", value: 3 }]
        },
        {
          text: "대지의 기반을 다진다",
          type: "creation",
          description: "견고한 땅을 만들어 생명의 터전을 마련합니다",
          effects: [{ stat: "power", value: 6 }, { stat: "wisdom", value: 4 }]
        },
        {
          text: "생명의 씨앗을 뿌린다",
          type: "compassion",
          description: "작은 생명체들이 자랄 수 있는 환경을 조성합니다",
          effects: [{ stat: "compassion", value: 8 }, { stat: "creativity", value: 2 }]
        },
        {
          text: "시간의 흐름을 관찰한다",
          type: "wisdom",
          description: "성급하지 않고 자연의 변화를 지켜봅니다",
          effects: [{ stat: "wisdom", value: 10 }]
        }
      ],
      creation: [
        {
          text: "다양한 생명체를 창조한다",
          type: "creative",
          description: "세상을 풍요롭게 할 새로운 생명들을 만듭니다",
          effects: [{ stat: "creativity", value: 7 }, { stat: "compassion", value: 3 }]
        },
        {
          text: "자연의 균형을 맞춘다",
          type: "wisdom",
          description: "생태계가 조화롭게 발전하도록 조절합니다",
          effects: [{ stat: "wisdom", value: 8 }, { stat: "compassion", value: 2 }]
        },
        {
          text: "강력한 힘으로 변화를 가속화한다",
          type: "power",
          description: "창조의 속도를 높여 빠른 발전을 이룹니다",
          effects: [{ stat: "power", value: 8 }, { stat: "creativity", value: 2 }]
        },
        {
          text: "생명체들을 보호하고 돌본다",
          type: "compassion",
          description: "약한 생명들이 살아갈 수 있도록 도움을 줍니다",
          effects: [{ stat: "compassion", value: 9 }, { stat: "wisdom", value: 1 }]
        }
      ],
      development: [
        {
          text: "지능을 가진 존재를 창조한다",
          type: "creative",
          description: "사고할 수 있는 고등 생명체를 만듭니다",
          effects: [{ stat: "creativity", value: 10 }, { stat: "wisdom", value: 5 }]
        },
        {
          text: "문명의 발전을 이끈다",
          type: "wisdom",
          description: "지혜로운 발전 방향을 제시합니다",
          effects: [{ stat: "wisdom", value: 12 }, { stat: "power", value: 3 }]
        },
        {
          text: "자연재해로 시련을 준다",
          type: "power",
          description: "어려움을 통해 더 강한 존재로 성장시킵니다",
          effects: [{ stat: "power", value: 10 }, { stat: "wisdom", value: -2 }]
        },
        {
          text: "평화로운 공존을 도모한다",
          type: "compassion",
          description: "모든 존재가 조화롭게 살아가도록 합니다",
          effects: [{ stat: "compassion", value: 12 }, { stat: "creativity", value: 3 }]
        }
      ],
      advanced: [
        {
          text: "우주로 진출할 기술을 제공한다",
          type: "creative",
          description: "새로운 세계로 나아갈 길을 열어줍니다",
          effects: [{ stat: "creativity", value: 15 }, { stat: "power", value: 5 }]
        },
        {
          text: "영원한 지혜를 전수한다",
          type: "wisdom",
          description: "깊은 깨달음과 진리를 가르칩니다",
          effects: [{ stat: "wisdom", value: 18 }, { stat: "compassion", value: 2 }]
        },
        {
          text: "절대적인 힘을 부여한다",
          type: "power",
          description: "무한한 가능성을 실현할 힘을 줍니다",
          effects: [{ stat: "power", value: 20 }]
        },
        {
          text: "완전한 사랑으로 축복한다",
          type: "compassion",
          description: "모든 존재에게 무조건적인 사랑을 베풉니다",
          effects: [{ stat: "compassion", value: 20 }]
        }
      ]
    };
    
    // 컨텍스트 기반 선택지 필터링
    let availableChoices = choicesByStage[world.stage] || choicesByStage.beginning;
    
    // 최근 메시지 내용에 따른 맥락적 선택지 조정
    if (context.includes('창조') || context.includes('만들') || context.includes('생성')) {
      availableChoices = availableChoices.filter(choice => 
        choice.type === 'creative' || choice.type === 'creation'
      );
    } else if (context.includes('파괴') || context.includes('없애') || context.includes('변화')) {
      availableChoices = availableChoices.filter(choice => 
        choice.type === 'power' || choice.type === 'destruction'
      );
    } else if (context.includes('도움') || context.includes('구원') || context.includes('보호')) {
      availableChoices = availableChoices.filter(choice => 
        choice.type === 'compassion' || choice.type === 'protection'
      );
    } else if (context.includes('생각') || context.includes('고민') || context.includes('판단')) {
      availableChoices = availableChoices.filter(choice => 
        choice.type === 'wisdom'
      );
    }
    
    // 필터링 결과가 없으면 전체 선택지 사용
    if (availableChoices.length === 0) {
      availableChoices = choicesByStage[world.stage] || choicesByStage.beginning;
    }
    
    // 랜덤하게 3개 선택 (중복 방지)
    const shuffled = [...availableChoices].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, [world.stage, getRecentMessages]);

  // 폴백 응답 생성 (개선된 버전)
  const generateFallbackResponse = (userPrompt = '') => {
    const fallbackMessages = [
      "🌟 창조의 힘이 당신 안에서 꿈틀거립니다. 어떤 길을 선택하시겠습니까?",
      "🌍 세계가 당신의 결정을 기다리고 있습니다. 신중하게 선택해주세요.",
      "✨ 창조자로서의 여정이 계속됩니다. 다음 단계를 결정해주세요.",
      "🚀 무한한 가능성이 펼쳐져 있습니다. 어떤 방향으로 나아가시겠습니까?",
      "💫 당신의 의지가 새로운 현실을 만들어갑니다. 선택해주세요.",
      "🎭 이야기는 계속됩니다. 당신의 다음 행동을 결정해주세요."
    ];
    
    // 사용자 입력에 따른 맥락적 메시지 제공
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
    
    const selectedMessage = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];
    
    return {
      message: contextualMessage + selectedMessage,
      choices: generateDefaultChoices(),
      worldUpdates: {},
      achievements: [],
      createdElements: []
    };
  };

  // 게임 시작 처리
  const handleGameStart = useCallback(async () => {
    if (!isGameStarted) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const startPrompt = "게임을 시작합니다. 창조자가 된 플레이어에게 첫 번째 시나리오를 제시하고 선택지를 제공해주세요.";
      const aiResponse = await callAI(startPrompt);
      
      // AI 응답을 게임에 적용
      await applyAIResponse(aiResponse);
      
    } catch (error) {
      console.error('게임 시작 오류:', error);
      setError('게임 시작 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [isGameStarted, callAI]);

  // 플레이어 액션 처리
  const handlePlayerAction = useCallback(async (action) => {
    setLoading(true);
    setError(null);
    
    try {
      // 최근 메시지 컨텍스트 포함
      const recentMessages = getRecentMessages(5);
      const context = recentMessages.map(msg => 
        `${msg.sender}: ${msg.content}`
      ).join('\n');
      
      const actionPrompt = `플레이어 액션: "${action}"
      
최근 대화 컨텍스트:
${context}

이 액션에 대한 결과를 생성하고 다음 선택지를 제공해주세요.`;
      
      const aiResponse = await callAI(actionPrompt);
      
      // AI 응답을 게임에 적용
      await applyAIResponse(aiResponse);
      
    } catch (error) {
      console.error('플레이어 액션 처리 오류:', error);
      setError('액션 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [callAI, getRecentMessages]);

  // AI 응답을 게임 상태에 적용
  const applyAIResponse = useCallback(async (aiResponse) => {
    try {
      // GM 메시지 추가
      if (aiResponse.message) {
        addMessage({
          type: 'gm',
          content: aiResponse.message,
          sender: 'GM'
        });
      }
      
      // 선택지 설정
      if (aiResponse.choices && aiResponse.choices.length > 0) {
        setChoices(aiResponse.choices);
      }
      
      // 플레이어 스탯 업데이트
      if (aiResponse.choices) {
        // 선택지의 효과는 선택 시 적용되므로 여기서는 처리하지 않음
      }
      
      // 세계 상태 업데이트
      if (aiResponse.worldUpdates && Object.keys(aiResponse.worldUpdates).length > 0) {
        updateWorld(aiResponse.worldUpdates);
      }
      
      // 업적 추가
      if (aiResponse.achievements && aiResponse.achievements.length > 0) {
        aiResponse.achievements.forEach(achievement => {
          addAchievement(achievement);
          addMessage({
            type: 'achievement',
            content: `🏆 업적 달성: ${achievement}`,
            sender: 'System'
          });
        });
      }
      
      // 창조 요소 추가
      if (aiResponse.createdElements && aiResponse.createdElements.length > 0) {
        aiResponse.createdElements.forEach(element => {
          addCreatedElement(element);
        });
      }
      
    } catch (error) {
      console.error('AI 응답 적용 오류:', error);
      setError('게임 상태 업데이트 중 오류가 발생했습니다.');
    }
  }, [addMessage, setChoices, updateWorld, addAchievement, addCreatedElement, setError]);

  // 게임 시작 시 자동 실행
  useEffect(() => {
    if (isGameStarted && messages.length <= 1) {
      handleGameStart();
    }
  }, [isGameStarted, messages.length, handleGameStart]);

  // 외부에서 사용할 수 있는 메서드들을 반환
  return {
    handlePlayerAction,
    handleGameStart,
    callAI,
    applyAIResponse
  };
};

export default useGameMaster;
// GameMaster.jsx 끝