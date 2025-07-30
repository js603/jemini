import React from 'react';
import PropTypes from 'prop-types';

/**
 * MapView.jsx - 게임 지도를 SVG로 시각화하는 컴포넌트
 * 
 * 영토, 소유권, 군사력 등을 시각적으로 표현합니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 */
function MapView({ mapData, nations }) {
  const getColorForOwner = (owner) => {
    if (!owner) return '#cccccc';
    const colors = { '에라시아': '#ff6b6b', '브라카다': '#4ecdc4', '아블리': '#45b7d1' };
    return colors[owner] || '#cccccc';
  };

  return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4">
      <h3 className="text-center text-xl font-bold mb-3 text-white">세계 지도</h3>
      <div className="relative w-full overflow-auto">
        <svg 
          viewBox="0 0 350 300" 
          className="w-full border border-gray-600 bg-gray-700 rounded-lg"
          style={{ minHeight: '250px' }}
        >
          {/* 연결선 먼저 그리기 (영토 뒤에 표시되도록) */}
          {Object.values(mapData.territories).map(territory =>
            territory.neighbors.map(neighborId => {
              const neighbor = mapData.territories[neighborId];
              if (!neighbor || territory.id > neighborId) return null; // 중복 방지
              return (
                <line
                  key={`${territory.id}-${neighborId}`}
                  x1={territory.x}
                  y1={territory.y}
                  x2={neighbor.x}
                  y2={neighbor.y}
                  stroke="#666"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
              );
            })
          )}

          {/* 영토 원형 그리기 */}
          {Object.values(mapData.territories).map(territory => (
            <g key={territory.id}>
              <circle
                cx={territory.x}
                cy={territory.y}
                r="25"
                fill={getColorForOwner(territory.owner)}
                stroke="#333"
                strokeWidth="2"
                className="transition-all duration-300 hover:stroke-white hover:stroke-3"
              />
              {territory.isCapital && (
                <circle
                  cx={territory.x}
                  cy={territory.y}
                  r="30"
                  fill="none"
                  stroke="#ffd700"
                  strokeWidth="3"
                  className="animate-pulse"
                />
              )}
              <text
                x={territory.x}
                y={territory.y - 35}
                textAnchor="middle"
                fontSize="12"
                fontWeight="bold"
                fill="#fff"
                className="pointer-events-none"
              >
                {territory.name}
              </text>
              <text
                x={territory.x}
                y={territory.y + 5}
                textAnchor="middle"
                fontSize="11"
                fill="#fff"
                className="pointer-events-none"
              >
                {territory.army}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {Object.entries(nations).map(([name, nation]) => (
          <div key={name} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border border-gray-600"
              style={{ backgroundColor: getColorForOwner(name) }}
            />
            <span className="text-sm text-gray-200">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Define PropTypes for MapView component
MapView.propTypes = {
  mapData: PropTypes.shape({
    territories: PropTypes.objectOf(PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      owner: PropTypes.string,
      army: PropTypes.number,
      isCapital: PropTypes.bool,
      x: PropTypes.number,
      y: PropTypes.number,
      neighbors: PropTypes.arrayOf(PropTypes.string)
    }))
  }).isRequired,
  nations: PropTypes.objectOf(PropTypes.object).isRequired
};

export default MapView;