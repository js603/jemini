/**
 * @file TutorialSystem.jsx
 * 게임 튜토리얼 및 도움말 시스템을 제공하는 컴포넌트입니다.
 * 게임의 다양한 기능에 대한 단계별 가이드와 컨텍스트 도움말을 제공합니다.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// 튜토리얼 단계 정의
const tutorialSteps = {
  // 게임 시작 튜토리얼
  game_start: [
    {
      title: '게임 시작하기',
      content: '왕관의 회의에 오신 것을 환영합니다! 이 튜토리얼에서는 게임의 기본 개념을 안내해 드립니다.',
      image: null,
      highlight: null
    },
    {
      title: '국가 선택',
      content: '먼저 플레이할 국가를 선택해야 합니다. 각 국가는 고유한 시작 위치와 특성을 가지고 있습니다.',
      image: null,
      highlight: '.nation-selection'
    },
    {
      title: '게임 인터페이스',
      content: '화면 상단의 탭을 사용하여 지도, 대시보드, 보좌관, 외교, 기술, 이벤트 화면으로 이동할 수 있습니다.',
      image: null,
      highlight: 'nav'
    }
  ],
  
  // 지도 튜토리얼
  map: [
    {
      title: '지도 보기',
      content: '지도는 게임의 핵심입니다. 여기서 영토와 군대를 확인하고 전략을 세울 수 있습니다.',
      image: null,
      highlight: '.map-container'
    },
    {
      title: '영토 정보',
      content: '영토를 클릭하면 해당 영토의 상세 정보와 가능한 행동을 볼 수 있습니다.',
      image: null,
      highlight: '.territory'
    },
    {
      title: '군대 이동',
      content: '자신의 영토를 선택한 후 인접한 다른 영토를 선택하여 군대를 이동하거나 공격할 수 있습니다.',
      image: null,
      highlight: '.territory-actions'
    }
  ],
  
  // 자원 관리 튜토리얼
  resources: [
    {
      title: '자원 관리',
      content: '자원은 게임에서 가장 중요한 요소 중 하나입니다. 자원을 사용하여 군대를 훈련하고 기술을 연구할 수 있습니다.',
      image: null,
      highlight: '.resources-display'
    },
    {
      title: '자원 생산',
      content: '각 턴마다 소유한 영토에 따라 자원이 생산됩니다. 농업 기술을 연구하면 생산량이 증가합니다.',
      image: null,
      highlight: '.production-info'
    },
    {
      title: '자원 소비',
      content: '군대 훈련, 기술 연구 등의 활동은 자원을 소비합니다. 자원이 부족하면 안정도가 감소할 수 있습니다.',
      image: null,
      highlight: '.consumption-info'
    }
  ],
  
  // 보좌관 튜토리얼
  advisors: [
    {
      title: '보좌관 시스템',
      content: '보좌관은 게임 플레이를 도와주는 AI 조력자입니다. 각 보좌관은 특정 분야를 담당합니다.',
      image: null,
      highlight: '.advisors-panel'
    },
    {
      title: '보좌관 명령',
      content: '보좌관에게 자연어로 명령을 내릴 수 있습니다. 예: "군대를 10명 훈련시켜줘" 또는 "농업 기술을 연구해줘"',
      image: null,
      highlight: '.advisor-command-input'
    },
    {
      title: '충성도 관리',
      content: '보좌관의 충성도는 중요합니다. 충성도가 낮으면 배신할 수 있으며, 안정도에도 영향을 줍니다.',
      image: null,
      highlight: '.loyalty-indicator'
    }
  ],
  
  // 전투 튜토리얼
  combat: [
    {
      title: '전투 시스템',
      content: '전투는 턴이 끝날 때 자동으로 처리됩니다. 공격 명령을 내리고 턴을 종료하면 결과를 확인할 수 있습니다.',
      image: null,
      highlight: null
    },
    {
      title: '전투력 계산',
      content: '전투력은 군대 수, 기술 레벨, 지형 보너스 등 여러 요소에 의해 결정됩니다.',
      image: null,
      highlight: '.combat-info'
    },
    {
      title: '영토 점령',
      content: '적 영토를 성공적으로 공격하면 해당 영토를 점령할 수 있습니다. 수도를 점령하면 해당 국가가 멸망합니다.',
      image: null,
      highlight: null
    }
  ],
  
  // 기술 연구 튜토리얼
  technology: [
    {
      title: '기술 연구',
      content: '기술 연구는 국가의 발전에 중요합니다. 다양한 기술을 연구하여 게임에서 우위를 점할 수 있습니다.',
      image: null,
      highlight: '.technology-tree'
    },
    {
      title: '농업 기술',
      content: '농업 기술은 자원 생산량을 증가시킵니다. 레벨이 높을수록 더 많은 자원을 생산합니다.',
      image: null,
      highlight: '.tech-agriculture'
    },
    {
      title: '공학 기술',
      content: '공학 기술은 전투력을 향상시키고 건설 비용을 감소시킵니다.',
      image: null,
      highlight: '.tech-engineering'
    },
    {
      title: '첩보 기술',
      content: '첩보 기술은 적국의 정보를 얻고 특수 작전을 수행하는 데 도움이 됩니다.',
      image: null,
      highlight: '.tech-espionage'
    }
  ],
  
  // 턴 진행 튜토리얼
  turns: [
    {
      title: '턴 시스템',
      content: '이 게임은 턴제 방식으로 진행됩니다. 각 턴마다 다양한 명령을 내릴 수 있습니다.',
      image: null,
      highlight: '.turn-controls'
    },
    {
      title: '턴 종료',
      content: '모든 행동을 완료한 후 턴 종료 버튼을 클릭하여 다음 턴으로 넘어갑니다.',
      image: null,
      highlight: '.end-turn-button'
    },
    {
      title: '턴 처리',
      content: '모든 플레이어가 턴을 종료하면 전투, 자원 생산, 이벤트 등이 처리됩니다.',
      image: null,
      highlight: null
    }
  ]
};

// 컨텍스트 도움말 정의
const contextualHelp = {
  map: {
    title: '지도',
    content: '지도에서는 영토와 군대를 확인하고 전략적 결정을 내릴 수 있습니다. 영토를 클릭하여 상세 정보를 확인하세요.'
  },
  dashboard: {
    title: '대시보드',
    content: '대시보드에서는 국가의 전반적인 상태, 자원, 안정도 등을 확인할 수 있습니다.'
  },
  advisors: {
    title: '보좌관',
    content: '보좌관은 게임 플레이를 도와주는 AI 조력자입니다. 자연어로 명령을 내릴 수 있으며, 충성도 관리가 중요합니다.'
  },
  diplomacy: {
    title: '외교',
    content: '외교 화면에서는 다른 국가와의 관계를 관리하고 동맹을 맺거나 전쟁을 선포할 수 있습니다.'
  },
  technology: {
    title: '기술',
    content: '기술 연구를 통해 국가의 능력을 향상시킬 수 있습니다. 각 기술은 게임의 다양한 측면에 영향을 줍니다.'
  },
  events: {
    title: '이벤트',
    content: '이벤트 로그에서는 게임에서 발생한 모든 중요한 사건을 확인할 수 있습니다.'
  }
};

/**
 * 튜토리얼 및 도움말 시스템 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 속성
 * @param {string} props.currentSection - 현재 게임 섹션 (map, dashboard 등)
 * @param {boolean} props.showTutorial - 튜토리얼 표시 여부
 * @param {string} props.tutorialType - 표시할 튜토리얼 유형
 * @param {Function} props.onComplete - 튜토리얼 완료 시 호출될 함수
 * @param {Function} props.onClose - 튜토리얼 닫기 시 호출될 함수
 * @param {boolean} props.showContextHelp - 컨텍스트 도움말 표시 여부
 */
function TutorialSystem({ 
  currentSection, 
  showTutorial, 
  tutorialType, 
  onComplete, 
  onClose,
  showContextHelp
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedTutorials, setCompletedTutorials] = useState(() => {
    // 로컬 스토리지에서 완료된 튜토리얼 불러오기
    const saved = localStorage.getItem('completedTutorials');
    return saved ? JSON.parse(saved) : [];
  });
  
  // 현재 튜토리얼 단계 가져오기
  const currentTutorial = tutorialSteps[tutorialType] || [];
  const totalSteps = currentTutorial.length;
  const stepInfo = currentTutorial[currentStep] || { title: '', content: '' };
  
  // 현재 섹션에 대한 컨텍스트 도움말 가져오기
  const contextHelp = contextualHelp[currentSection] || { title: '', content: '' };
  
  // 튜토리얼 완료 시 로컬 스토리지에 저장
  useEffect(() => {
    localStorage.setItem('completedTutorials', JSON.stringify(completedTutorials));
  }, [completedTutorials]);
  
  // 하이라이트 요소 스크롤 및 강조 효과
  useEffect(() => {
    if (showTutorial && stepInfo.highlight) {
      const element = document.querySelector(stepInfo.highlight);
      if (element) {
        // 요소로 스크롤
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // 강조 효과 추가
        element.classList.add('tutorial-highlight');
        
        return () => {
          // 강조 효과 제거
          element.classList.remove('tutorial-highlight');
        };
      }
    }
  }, [showTutorial, currentStep, stepInfo.highlight]);
  
  // 다음 단계로 이동
  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // 튜토리얼 완료
      if (!completedTutorials.includes(tutorialType)) {
        setCompletedTutorials([...completedTutorials, tutorialType]);
      }
      if (onComplete) onComplete(tutorialType);
    }
  };
  
  // 이전 단계로 이동
  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  // 튜토리얼 닫기
  const handleClose = () => {
    if (onClose) onClose();
  };
  
  // 튜토리얼이 표시되지 않을 때는 컨텍스트 도움말만 표시
  if (!showTutorial) {
    return showContextHelp ? (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-indigo-900/90 text-white p-4 rounded-lg shadow-lg max-w-xs">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold">{contextHelp.title} 도움말</h3>
            <button 
              onClick={handleClose}
              className="text-indigo-300 hover:text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-indigo-100">{contextHelp.content}</p>
          <div className="mt-3 text-xs text-indigo-300">
            <button 
              onClick={() => onComplete && onComplete('context')}
              className="underline hover:text-white"
            >
              이 도움말 다시 보지 않기
            </button>
          </div>
        </div>
      </div>
    ) : null;
  }
  
  // 튜토리얼 UI
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4 overflow-hidden border border-indigo-800">
        {/* 헤더 */}
        <div className="bg-indigo-900 p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">
            {stepInfo.title}
          </h2>
          <button 
            onClick={handleClose}
            className="text-indigo-300 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        
        {/* 콘텐츠 */}
        <div className="p-6">
          {stepInfo.image && (
            <div className="mb-4 rounded overflow-hidden">
              <img src={stepInfo.image} alt="튜토리얼 이미지" className="w-full" />
            </div>
          )}
          <p className="text-gray-300 mb-6">
            {stepInfo.content}
          </p>
          
          {/* 진행 상태 표시 */}
          <div className="flex justify-center space-x-1 mb-6">
            {currentTutorial.map((_, index) => (
              <div 
                key={index}
                className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                  index === currentStep ? 'bg-indigo-500' : 
                  index < currentStep ? 'bg-indigo-800' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
        
        {/* 푸터 */}
        <div className="bg-gray-800 p-4 flex justify-between">
          <button 
            onClick={handlePrev}
            disabled={currentStep === 0}
            className={`px-4 py-2 rounded ${
              currentStep === 0 
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
          >
            이전
          </button>
          <div className="text-gray-400 flex items-center">
            {currentStep + 1} / {totalSteps}
          </div>
          <button 
            onClick={handleNext}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded"
          >
            {currentStep < totalSteps - 1 ? '다음' : '완료'}
          </button>
        </div>
      </div>
    </div>
  );
}

TutorialSystem.propTypes = {
  currentSection: PropTypes.string,
  showTutorial: PropTypes.bool,
  tutorialType: PropTypes.string,
  onComplete: PropTypes.func,
  onClose: PropTypes.func,
  showContextHelp: PropTypes.bool
};

TutorialSystem.defaultProps = {
  showTutorial: false,
  tutorialType: 'game_start',
  showContextHelp: false
};

export default TutorialSystem;