import React, { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * AdvisorView.jsx - AI 보좌관과의 상호작용을 담당하는 컴포넌트
 * 
 * 플레이어가 AI 보좌관에게 자연어로 명령을 내리고 응답을 받을 수 있습니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 */
function AdvisorView({ db, gameData, myNation, user, onCommand }) {
  const [selectedAdvisor, setSelectedAdvisor] = useState('국방');
  const [userInput, setUserInput] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!myNation) return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4 text-center text-gray-300">
      국가를 선택해주세요.
    </div>
  );

  const myAdvisors = gameData.advisors[user.uid] || {};
  const advisorPersonas = {
    '국방': { name: "국방부 장관", persona: "당신은 '매파'이며, 군사적 해결책을 선호합니다.", ambition: '군사력 극대화', icon: "🛡️" },
    '재무': { name: "재무부 장관", persona: "당신은 신중한 '관료'이며, 경제적 안정성을 최우선으로 생각합니다.", ambition: '국고 최대화', icon: "💰" },
    '외교': { name: "외교부 장관", persona: "당신은 '비둘기파'이며, 대화와 협상을 선호합니다.", ambition: '모든 국가와 동맹', icon: "🤝" },
    '정보': { name: "정보부 장관", persona: "당신은 '현실주의자'이며, 첩보와 공작을 선호합니다.", ambition: '정보망 장악', icon: "🔍" }
  };

  const handleSendCommand = async () => {
    if (!userInput.trim()) return;

    setIsLoading(true);
    setResponse('처리 중...');

    try {
      const result = await onCommand({
        action: 'advisor_command',
        advisor: selectedAdvisor,
        command: userInput
      });
      
      setResponse(result.message || '명령을 처리했습니다.');
    } catch (error) {
      setResponse(`오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsLoading(false);
      setUserInput('');
    }
  };

  // 충성도에 따른 색상 및 배지 텍스트 계산
  const getLoyaltyInfo = (loyalty) => {
    if (loyalty >= 80) return { color: 'bg-green-600', text: '충성' };
    if (loyalty >= 60) return { color: 'bg-green-500', text: '신뢰' };
    if (loyalty >= 40) return { color: 'bg-yellow-500', text: '중립' };
    if (loyalty >= 20) return { color: 'bg-orange-500', text: '의심' };
    return { color: 'bg-red-600', text: '배신' };
  };

  return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4">
      <h3 className="text-xl font-bold text-white mb-3">AI 보좌관</h3>

      {/* 보좌관 선택 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.keys(advisorPersonas).map(advisorType => {
          const loyalty = myAdvisors[advisorType]?.loyalty || 50;
          const loyaltyInfo = getLoyaltyInfo(loyalty);
          
          return (
            <button
              key={advisorType}
              onClick={() => setSelectedAdvisor(advisorType)}
              className={`flex-1 min-w-[80px] p-2 rounded-md transition-all duration-200 ${
                selectedAdvisor === advisorType 
                  ? 'bg-indigo-700 text-white ring-2 ring-indigo-400' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <div className="flex flex-col items-center">
                <span className="text-lg mb-1">{advisorPersonas[advisorType].icon}</span>
                <span className="text-sm font-medium">{advisorType}</span>
                <div className={`mt-1 px-2 py-0.5 rounded-full text-xs text-white ${loyaltyInfo.color}`}>
                  {loyaltyInfo.text} {loyalty}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 보좌관 정보 */}
      <div className="mb-4 p-3 bg-gray-700 rounded-lg border-l-4 border-indigo-500">
        <div className="flex items-center">
          <span className="text-2xl mr-2">{advisorPersonas[selectedAdvisor].icon}</span>
          <div>
            <h4 className="font-bold text-white">{advisorPersonas[selectedAdvisor].name}</h4>
            <p className="text-sm text-gray-300 italic">&ldquo;{advisorPersonas[selectedAdvisor].persona}&rdquo;</p>
            <p className="text-xs text-gray-400 mt-1">야망: {advisorPersonas[selectedAdvisor].ambition}</p>
          </div>
        </div>
      </div>

      {/* 명령 입력 */}
      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="명령을 입력하세요 (예: 북부 산맥을 공격해, 군대 50명 훈련, 농업 기술 연구)"
            className="w-full p-3 pr-24 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSendCommand()}
            disabled={isLoading}
          />
          <button
            onClick={handleSendCommand}
            disabled={isLoading || !userInput.trim()}
            className="absolute right-2 top-2 px-4 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : '전송'}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          보좌관에게 자연어로 명령을 내릴 수 있습니다. 예: &ldquo;북부 산맥을 공격해&rdquo;, &ldquo;군대 50명 훈련&rdquo;, &ldquo;농업 기술 연구&rdquo;
        </p>
      </div>

      {/* AI 응답 */}
      {response && (
        <div className="p-3 bg-gray-700 border border-gray-600 rounded-lg whitespace-pre-line text-sm">
          <div className="flex items-center mb-2">
            <span className="text-lg mr-2">{advisorPersonas[selectedAdvisor].icon}</span>
            <span className="font-bold text-white">{advisorPersonas[selectedAdvisor].name}:</span>
          </div>
          <p className="text-gray-200">{response}</p>
        </div>
      )}
    </div>
  );
}

// Define PropTypes for AdvisorView component
AdvisorView.propTypes = {
  db: PropTypes.object.isRequired,
  gameData: PropTypes.shape({
    advisors: PropTypes.objectOf(PropTypes.object),
    map: PropTypes.shape({
      territories: PropTypes.objectOf(PropTypes.shape({
        owner: PropTypes.string,
        name: PropTypes.string
      }))
    }).isRequired
  }).isRequired,
  myNation: PropTypes.shape({
    name: PropTypes.string.isRequired,
    resources: PropTypes.number.isRequired
  }),
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired,
  onCommand: PropTypes.func.isRequired
};

export default AdvisorView;