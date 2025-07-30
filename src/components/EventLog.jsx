import React from 'react';
import PropTypes from 'prop-types';
import { useResponsive } from '../hooks';

/**
 * EventLog.jsx - 게임 이벤트 히스토리 컴포넌트
 * 
 * 게임 내에서 발생한 이벤트들을 시각적으로 표시합니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 */
function EventLog({ events, user }) {
  const { isMinWidth } = useResponsive();
  const [filter, setFilter] = React.useState('all');
  
  // 최근 이벤트를 먼저 표시하기 위해 역순 정렬
  const recentEvents = [...events].reverse();
  
  // 이벤트 필터링
  const filteredEvents = filter === 'all' 
    ? recentEvents 
    : recentEvents.filter(event => event.type === filter);
  
  // 이벤트 유형에 따른 색상 및 아이콘 결정
  const getEventTypeInfo = (type) => {
    const types = {
      battle: { 
        color: 'bg-red-900/50 border-red-700', 
        icon: '⚔️',
        label: '전투'
      },
      conquest: { 
        color: 'bg-green-900/50 border-green-700', 
        icon: '🏆',
        label: '정복'
      },
      elimination: { 
        color: 'bg-pink-900/50 border-pink-700', 
        icon: '💀',
        label: '멸망'
      },
      diplomacy: { 
        color: 'bg-blue-900/50 border-blue-700', 
        icon: '🤝',
        label: '외교'
      },
      technology: { 
        color: 'bg-purple-900/50 border-purple-700', 
        icon: '🔬',
        label: '기술'
      },
      betrayal: { 
        color: 'bg-orange-900/50 border-orange-700', 
        icon: '🗡️',
        label: '배신'
      },
      production: { 
        color: 'bg-teal-900/50 border-teal-700', 
        icon: '⚒️',
        label: '생산'
      },
      stability: { 
        color: 'bg-gray-800/50 border-gray-700', 
        icon: '⚖️',
        label: '안정도'
      },
      dynamic_event: { 
        color: 'bg-yellow-900/50 border-yellow-700', 
        icon: '🎭',
        label: '이벤트'
      },
      economy: { 
        color: 'bg-yellow-900/50 border-yellow-700', 
        icon: '💰',
        label: '경제'
      },
      game_start: { 
        color: 'bg-indigo-900/50 border-indigo-700', 
        icon: '🎮',
        label: '게임 시작'
      },
      victory: { 
        color: 'bg-yellow-900/50 border-yellow-700', 
        icon: '👑',
        label: '승리'
      },
      collapse: { 
        color: 'bg-red-900/50 border-red-700', 
        icon: '🏚️',
        label: '붕괴'
      },
      troop_movement: { 
        color: 'bg-blue-900/50 border-blue-700', 
        icon: '🚶',
        label: '부대 이동'
      },
      military: { 
        color: 'bg-red-900/50 border-red-700', 
        icon: '🛡️',
        label: '군사'
      }
    };
    
    return types[type] || { 
      color: 'bg-gray-800/50 border-gray-700', 
      icon: '📜',
      label: '기타'
    };
  };

  // 사용 가능한 이벤트 유형 목록 생성 (중복 제거)
  const eventTypes = ['all', ...new Set(events.map(event => event.type))];

  return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4">
      <div className="flex flex-wrap items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white">이벤트 로그</h3>
        
        {/* 이벤트 필터 */}
        <div className="flex flex-wrap gap-1 mt-2 sm:mt-0">
          {eventTypes.map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                filter === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {type === 'all' ? '전체' : getEventTypeInfo(type).label}
            </button>
          ))}
        </div>
      </div>
      
      {/* 이벤트 목록 */}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {filteredEvents.length > 0 ? (
          filteredEvents.map((event, index) => {
            // 비밀 이벤트는 해당 플레이어에게만 표시
            if (event.isPrivate && event.recipient !== user.uid) return null;
            
            const typeInfo = getEventTypeInfo(event.type);
            
            return (
              <div 
                key={index} 
                className={`p-3 rounded-md border ${typeInfo.color} ${
                  event.isPrivate ? 'ring-1 ring-yellow-500' : ''
                }`}
              >
                <div className="flex items-start">
                  <span className="text-xl mr-2 mt-0.5">{typeInfo.icon}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-gray-300 text-sm font-medium">
                        턴 {event.turn}
                      </span>
                      {event.nation && (
                        <span className="bg-gray-700 px-2 py-0.5 rounded-full text-xs text-gray-300">
                          {event.nation}
                        </span>
                      )}
                      {event.isPrivate && (
                        <span className="bg-yellow-900/70 px-2 py-0.5 rounded-full text-xs text-yellow-300 flex items-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                          </svg>
                          비밀
                        </span>
                      )}
                    </div>
                    <p className="text-gray-200 text-sm">{event.content}</p>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <p>표시할 이벤트가 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Define PropTypes for EventLog component
EventLog.propTypes = {
  events: PropTypes.arrayOf(PropTypes.shape({
    turn: PropTypes.number.isRequired,
    type: PropTypes.string.isRequired,
    content: PropTypes.string.isRequired,
    isPrivate: PropTypes.bool,
    recipient: PropTypes.string,
    nation: PropTypes.string
  })).isRequired,
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired
};

export default EventLog;