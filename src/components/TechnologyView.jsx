import React from 'react';
import PropTypes from 'prop-types';
import { doc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { useResponsive } from '../hooks';
import { techTree } from '../data';

/**
 * TechnologyView.jsx - 기술 트리 표시 및 연구 컴포넌트
 * 
 * 플레이어가 보유한 기술 레벨을 표시하고 새로운 기술을 연구할 수 있는 인터페이스를 제공합니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 */
function TechnologyView({ myNation, db, gameData, onResearch }) {
  const { isMinWidth } = useResponsive();
  const [researchingTech, setResearchingTech] = React.useState(null);
  
  if (!myNation) {
    return (
      <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4 text-center text-gray-300">
        국가를 선택해주세요.
      </div>
    );
  }

  /**
   * 기술 연구 핸들러
   * @param {string} techKey - 연구할 기술 키
   */
  const handleResearch = async (techKey) => {
    if (researchingTech) return; // 이미 연구 중인 경우 중복 방지
    
    const tech = techTree[techKey];
    const currentLevel = myNation.technologies[techKey].level;
    
    // 최대 레벨 체크
    if (currentLevel >= tech.maxLevel) {
      return;
    }
    
    // 비용 계산
    const cost = tech.baseCost * (currentLevel + 1);
    
    // 자원 체크
    if (myNation.resources < cost) {
      return;
    }
    
    setResearchingTech(techKey);
    
    try {
      if (onResearch) {
        // 상위 컴포넌트에서 제공한 연구 핸들러 사용
        await onResearch({
          action: 'research',
          tech_name: techKey
        });
      } else if (db && gameData) {
        // 직접 Firebase 업데이트
        const gameRef = doc(db, 'games', gameData.id);
        await updateDoc(gameRef, {
          [`nations.${myNation.name}.resources`]: increment(-cost),
          [`nations.${myNation.name}.technologies.${techKey}.level`]: increment(1),
          events: arrayUnion({
            turn: gameData.turn,
            type: 'technology',
            nation: myNation.name,
            content: `'${tech.name}' 기술 연구를 완료했습니다! (레벨 ${currentLevel + 1})`
          })
        });
      }
    } catch (error) {
      console.error('기술 연구 중 오류:', error);
    } finally {
      setResearchingTech(null);
    }
  };

  /**
   * 기술 레벨에 따른 효과 텍스트 생성
   * @param {string} techKey - 기술 키
   * @param {number} level - 현재 레벨
   * @returns {string} 효과 텍스트
   */
  const getTechEffectText = (techKey, level) => {
    const tech = techTree[techKey];
    
    switch (techKey) {
      case 'agriculture':
        return `영토당 자원 생산량 +${Math.round(level * tech.effectPerLevel * 100)}%`;
      case 'engineering':
        return `군사 훈련 비용 -${Math.round(level * tech.discountPerLevel * 100)}%, 전투력 +${Math.round(level * tech.combatBonusPerLevel * 100)}%`;
      case 'espionage':
        return `적국 안정도 감소 효과 +${level * tech.stabilityEffectPerLevel}, 정보 획득 확률 +${Math.round(level * tech.infoChancePerLevel * 100)}%`;
      case 'diplomacy':
        return `조약 체결 시 안정도 +${level * tech.stabilityBonusPerLevel}, 제안 수락 확률 +${Math.round(level * tech.acceptanceChancePerLevel * 100)}%`;
      default:
        return '';
    }
  };

  /**
   * 기술 아이콘 가져오기
   * @param {string} techKey - 기술 키
   * @returns {string} 아이콘 문자
   */
  const getTechIcon = (techKey) => {
    const icons = {
      'agriculture': '🌾',
      'engineering': '⚙️',
      'espionage': '🕵️',
      'diplomacy': '🤝'
    };
    return icons[techKey] || '📚';
  };

  return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4">
      <h3 className="text-xl font-bold text-white mb-4">기술 현황</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(techTree).map(([key, tech]) => {
          const currentLevel = myNation.technologies[key]?.level || 0;
          const nextCost = tech.baseCost * (currentLevel + 1);
          const isMaxLevel = currentLevel >= tech.maxLevel;
          const canAfford = myNation.resources >= nextCost;
          const isResearching = researchingTech === key;
          
          // 연구 버튼 상태 결정
          let buttonState = 'default';
          if (isResearching) buttonState = 'researching';
          else if (isMaxLevel) buttonState = 'maxed';
          else if (!canAfford) buttonState = 'cantAfford';
          
          // 버튼 스타일 클래스
          const buttonClasses = {
            default: 'bg-blue-600 hover:bg-blue-700 text-white',
            researching: 'bg-blue-700 text-white cursor-wait',
            maxed: 'bg-gray-600 text-gray-400 cursor-not-allowed',
            cantAfford: 'bg-red-900/50 text-red-300 cursor-not-allowed'
          };
          
          // 버튼 텍스트
          const buttonText = {
            default: `연구 (${nextCost} 자원)`,
            researching: '연구 중...',
            maxed: '최대 레벨',
            cantAfford: `자원 부족 (${nextCost} 필요)`
          };
          
          return (
            <div 
              key={key} 
              className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 flex flex-col"
            >
              <div className="flex items-center mb-3">
                <span className="text-2xl mr-3">{getTechIcon(key)}</span>
                <div>
                  <h4 className="text-lg font-semibold text-white">{tech.name}</h4>
                  <p className="text-sm text-gray-400">{tech.description}</p>
                </div>
              </div>
              
              <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-gray-300 text-sm">현재 레벨: {currentLevel}</span>
                  <span className="text-gray-300 text-sm">최대: {tech.maxLevel}</span>
                </div>
                <div className="w-full h-2 bg-gray-600 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${(currentLevel / tech.maxLevel) * 100}%` }}
                  />
                </div>
              </div>
              
              <div className="mb-3 text-sm text-gray-300 bg-gray-800/50 p-2 rounded border border-gray-700">
                <span className="font-medium text-blue-300">현재 효과:</span> {getTechEffectText(key, currentLevel)}
              </div>
              
              <button
                onClick={() => handleResearch(key)}
                disabled={isResearching || isMaxLevel || !canAfford}
                className={`mt-auto py-2 px-4 rounded-md text-sm font-medium transition-colors ${buttonClasses[buttonState]}`}
              >
                {isResearching ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {buttonText[buttonState]}
                  </span>
                ) : buttonText[buttonState]}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Define PropTypes for TechnologyView component
TechnologyView.propTypes = {
  myNation: PropTypes.shape({
    name: PropTypes.string.isRequired,
    resources: PropTypes.number.isRequired,
    technologies: PropTypes.objectOf(PropTypes.shape({
      level: PropTypes.number.isRequired
    })).isRequired
  }),
  db: PropTypes.object,
  gameData: PropTypes.shape({
    id: PropTypes.string,
    turn: PropTypes.number
  }),
  onResearch: PropTypes.func
};

export default TechnologyView;