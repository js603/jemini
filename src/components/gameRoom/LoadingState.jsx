/**
 * @file LoadingState.jsx
 * 게임 로딩 상태를 표시하는 컴포넌트입니다.
 * 로딩 단계와 진행 상황을 시각적으로 표시합니다.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

// 로딩 단계별 메시지
const loadingSteps = [
  { id: 'connecting', message: '서버에 연결 중...' },
  { id: 'auth', message: '사용자 인증 중...' },
  { id: 'game_data', message: '게임 데이터 불러오는 중...' },
  { id: 'map', message: '게임 맵 준비 중...' },
  { id: 'resources', message: '게임 리소스 로딩 중...' },
  { id: 'finalizing', message: '최종 준비 중...' }
];

// 로딩 팁 메시지
const loadingTips = [
  "팁: 보좌관의 충성도를 높게 유지하면 안정도에 긍정적인 영향을 줍니다.",
  "팁: 농업 기술을 연구하면 자원 생산량이 증가합니다.",
  "팁: 공학 기술은 전투력과 건설 비용에 영향을 줍니다.",
  "팁: 수도를 방어하는 것이 가장 중요합니다. 수도가 함락되면 국가가 멸망합니다.",
  "팁: 자원이 부족하면 안정도가 감소합니다. 자원 관리에 주의하세요.",
  "팁: 여러 영토를 소유할수록 더 많은 자원을 생산할 수 있습니다.",
  "팁: 보좌관의 조언을 활용하면 게임을 더 효율적으로 진행할 수 있습니다."
];

/**
 * 게임 데이터 로딩 중일 때 표시되는 로딩 상태 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 속성
 * @param {string} props.message - 사용자 정의 로딩 메시지 (선택적)
 * @param {number} props.progress - 로딩 진행률 (0-100, 선택적)
 * @param {string} props.stage - 현재 로딩 단계 (선택적)
 * @param {boolean} props.isLongLoading - 오래 걸리는 로딩인지 여부 (선택적)
 */
function LoadingState({ message, progress, stage, isLongLoading }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [tipIndex, setTipIndex] = useState(Math.floor(Math.random() * loadingTips.length));
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showTip, setShowTip] = useState(false);

  // 로딩 단계 자동 진행 (실제 진행 상황이 없을 때)
  useEffect(() => {
    if (stage) return; // 실제 단계가 제공되면 자동 진행하지 않음
    
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev < loadingSteps.length - 1 ? prev + 1 : prev));
    }, 1500);
    
    return () => clearInterval(interval);
  }, [stage]);
  
  // 경과 시간 측정
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
      
      // 3초 후 팁 표시
      if (elapsedTime === 3) {
        setShowTip(true);
      }
      
      // 15초마다 팁 변경
      if (elapsedTime > 0 && elapsedTime % 15 === 0) {
        setTipIndex(prev => (prev + 1) % loadingTips.length);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [elapsedTime]);
  
  // 현재 단계 결정
  const currentStepInfo = stage 
    ? loadingSteps.find(s => s.id === stage) || loadingSteps[0]
    : loadingSteps[currentStep];
  
  // 진행률 계산
  const calculatedProgress = progress !== undefined 
    ? progress 
    : Math.min(Math.round((currentStep / (loadingSteps.length - 1)) * 100), 100);
  
  // 오래 걸리는 로딩 메시지 표시 여부
  const showLongLoadingMessage = isLongLoading || elapsedTime > 10;
  
  return (
    <div className="bg-gray-900 rounded-lg shadow-xl overflow-hidden border border-gray-700 p-8">
      <div className="flex flex-col items-center justify-center py-8">
        {/* 로딩 애니메이션 */}
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-indigo-500 text-xl font-bold">
              {calculatedProgress}%
            </div>
          </div>
          <svg className="w-24 h-24" viewBox="0 0 100 100">
            {/* 배경 원 */}
            <circle 
              cx="50" cy="50" r="40" 
              fill="none" 
              stroke="#374151" 
              strokeWidth="8"
            />
            {/* 진행 원 */}
            <circle 
              cx="50" cy="50" r="40" 
              fill="none" 
              stroke="#6366F1" 
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 40}`}
              strokeDashoffset={`${2 * Math.PI * 40 * (1 - calculatedProgress / 100)}`}
              transform="rotate(-90 50 50)"
              className="transition-all duration-300 ease-in-out"
            />
            {/* 중앙 펄스 효과 */}
            <circle 
              cx="50" cy="50" r="20" 
              fill="#4F46E5"
              className="animate-pulse"
            />
          </svg>
        </div>
        
        {/* 로딩 메시지 */}
        <h2 className="text-2xl font-bold text-white mb-2">게임 로딩 중...</h2>
        <p className="text-gray-300 text-center mb-4">
          {message || currentStepInfo.message}
        </p>
        
        {/* 진행 단계 표시 */}
        <div className="flex justify-center space-x-1 mb-6">
          {loadingSteps.map((step, index) => (
            <div 
              key={step.id}
              className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                index <= currentStep ? 'bg-indigo-500' : 'bg-gray-600'
              }`}
              title={step.message}
            />
          ))}
        </div>
        
        {/* 팁 표시 영역 */}
        {showTip && (
          <div className="bg-indigo-900/30 border border-indigo-800 rounded-lg p-4 max-w-md mt-2 text-center">
            <p className="text-indigo-300 text-sm">
              {loadingTips[tipIndex]}
            </p>
          </div>
        )}
        
        {/* 오래 걸리는 로딩 메시지 */}
        {showLongLoadingMessage && (
          <p className="text-gray-500 text-sm mt-6">
            로딩이 예상보다 오래 걸리고 있습니다. 잠시만 더 기다려주세요...
          </p>
        )}
        
        {/* 경과 시간 */}
        <p className="text-gray-600 text-xs mt-4">
          경과 시간: {elapsedTime}초
        </p>
      </div>
    </div>
  );
}

LoadingState.propTypes = {
  message: PropTypes.string,
  progress: PropTypes.number,
  stage: PropTypes.string,
  isLongLoading: PropTypes.bool
};

export default LoadingState;