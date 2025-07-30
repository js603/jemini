import React from 'react';
import PropTypes from 'prop-types';
import { useResponsive } from '../hooks';

/**
 * Dashboard.jsx - 국가 현황 표시 컴포넌트
 * 
 * 플레이어의 국가 정보(자원, 안정도, 영토, 군사력 등)를 시각적으로 표시합니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 */
function Dashboard({ myNation, gameData }) {
  const { isMinWidth } = useResponsive();
  
  if (!myNation) {
    return (
      <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4 text-center text-gray-300">
        국가를 선택해주세요.
      </div>
    );
  }

  // 보유 영토 및 총 군사력 계산
  const territories = Object.values(gameData.map.territories).filter(t => t.owner === myNation.name);
  const totalArmy = territories.reduce((sum, t) => sum + t.army, 0);
  
  // 안정도에 따른 색상 결정
  const getStabilityColor = (stability) => {
    if (stability >= 80) return 'text-green-400';
    if (stability >= 60) return 'text-green-300';
    if (stability >= 40) return 'text-yellow-300';
    if (stability >= 20) return 'text-orange-300';
    return 'text-red-400';
  };
  
  // 자원 증가율 계산 (농업 기술 레벨에 따라)
  const agricultureLevel = myNation.technologies?.agriculture?.level || 0;
  const resourceGrowthRate = territories.length * 50 * (1 + agricultureLevel * 0.15);

  return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">
          {myNation.name} 대시보드
        </h3>
        <div className="px-3 py-1 bg-blue-900/50 border border-blue-700 rounded-full text-blue-200 text-sm">
          턴당 수입: +{Math.round(resourceGrowthRate)}
        </div>
      </div>
      
      {/* 주요 지표 */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
          <div className="text-gray-400 text-sm mb-1">자원</div>
          <div className="text-xl font-bold text-yellow-300">
            {myNation.resources.toLocaleString()}
          </div>
        </div>
        
        <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
          <div className="text-gray-400 text-sm mb-1">안정도</div>
          <div className={`text-xl font-bold ${getStabilityColor(myNation.stability)}`}>
            {myNation.stability}%
          </div>
        </div>
        
        <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
          <div className="text-gray-400 text-sm mb-1">영토</div>
          <div className="text-xl font-bold text-blue-300">
            {territories.length}개
          </div>
        </div>
        
        <div className="bg-gray-700/50 rounded-lg p-3 border border-gray-600">
          <div className="text-gray-400 text-sm mb-1">총 군사력</div>
          <div className="text-xl font-bold text-red-300">
            {totalArmy.toLocaleString()}
          </div>
        </div>
      </div>
      
      {/* 보유 영토 목록 */}
      <div>
        <h4 className="text-white font-bold mb-2 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          보유 영토
        </h4>
        
        <div className="max-h-48 overflow-y-auto pr-1 space-y-1">
          {territories.map(territory => (
            <div 
              key={territory.id} 
              className={`flex justify-between items-center p-2 rounded-md text-sm ${
                territory.isCapital 
                  ? 'bg-yellow-900/30 border border-yellow-800' 
                  : 'bg-gray-700/50 border border-gray-600'
              }`}
            >
              <div className="flex items-center">
                {territory.isCapital && (
                  <span className="text-yellow-400 mr-1">👑</span>
                )}
                <span className="text-gray-200">{territory.name}</span>
              </div>
              <div className="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-red-400 mr-1" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10 3.5a1.5 1.5 0 013 0V4a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-.5a1.5 1.5 0 000 3h.5a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-.5a1.5 1.5 0 00-3 0v.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1h-.5a1.5 1.5 0 010-3H4a1 1 0 001-1V6a1 1 0 011-1h3a1 1 0 001-1v-.5z" />
                </svg>
                <span className="text-red-300 font-medium">{territory.army}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Define PropTypes for Dashboard component
Dashboard.propTypes = {
  myNation: PropTypes.shape({
    name: PropTypes.string.isRequired,
    resources: PropTypes.number.isRequired,
    stability: PropTypes.number.isRequired,
    technologies: PropTypes.objectOf(PropTypes.shape({
      level: PropTypes.number.isRequired
    }))
  }),
  gameData: PropTypes.shape({
    map: PropTypes.shape({
      territories: PropTypes.objectOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        owner: PropTypes.string,
        army: PropTypes.number.isRequired,
        isCapital: PropTypes.bool.isRequired
      }))
    }).isRequired
  }).isRequired
};

export default Dashboard;