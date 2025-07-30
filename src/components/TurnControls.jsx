import React from 'react';
import PropTypes from 'prop-types';
import { useResponsive } from '../hooks';

/**
 * TurnControls.jsx - 턴 진행 상태와 제어를 담당하는 컴포넌트
 * 
 * 현재 턴 번호, 플레이어 준비 상태, 턴 종료 버튼을 표시합니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 */
function TurnControls({ gameData, currentPlayer, onEndTurn }) {
  const { isMinWidth } = useResponsive();
  
  const activePlayers = gameData.players.filter(p => p.status === 'playing');
  const readyPlayers = activePlayers.filter(p => p.isTurnReady);
  
  // 턴 종료 버튼 비활성화 조건
  const isEndTurnDisabled = !currentPlayer || currentPlayer.isTurnReady;
  
  // 준비 상태에 따른 진행률 계산
  const progressPercentage = activePlayers.length > 0 
    ? Math.round((readyPlayers.length / activePlayers.length) * 100) 
    : 0;

  return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4">
      <div className="flex flex-wrap items-center justify-between mb-3">
        <h3 className="text-xl font-bold text-white">
          턴 {gameData.turn} 진행 상황
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-gray-300 text-sm">
            준비 완료: {readyPlayers.length}/{activePlayers.length}
          </span>
          <div className="w-16 h-4 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-green-500 transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 플레이어 준비 상태 */}
      <div className="mb-4 space-y-2">
        {activePlayers.map(player => (
          <div 
            key={player.uid} 
            className={`flex justify-between items-center p-2 rounded-md ${
              player.isTurnReady 
                ? 'bg-green-900/50 border border-green-700' 
                : 'bg-red-900/30 border border-red-800'
            }`}
          >
            <span className="text-gray-200">
              {player.name} ({player.nation})
            </span>
            <span className={`text-sm px-2 py-1 rounded-full ${
              player.isTurnReady 
                ? 'bg-green-700 text-green-100' 
                : 'bg-red-800 text-red-100'
            }`}>
              {player.isTurnReady ? '✓ 준비 완료' : '대기 중...'}
            </span>
          </div>
        ))}
      </div>

      {/* 턴 종료 버튼 */}
      {currentPlayer && !currentPlayer.isTurnReady && (
        <button
          onClick={onEndTurn}
          disabled={isEndTurnDisabled}
          className={`w-full py-3 px-4 rounded-md font-bold text-white transition-all duration-200 ${
            isEndTurnDisabled
              ? 'bg-gray-600 cursor-not-allowed opacity-50'
              : 'bg-green-600 hover:bg-green-700 active:transform active:scale-95'
          }`}
        >
          턴 종료
        </button>
      )}
      
      {/* 모든 플레이어가 준비 완료된 경우 메시지 표시 */}
      {readyPlayers.length === activePlayers.length && activePlayers.length > 0 && (
        <div className="mt-3 text-center text-yellow-300 animate-pulse">
          모든 플레이어가 준비 완료되었습니다. 턴 처리 중...
        </div>
      )}
    </div>
  );
}

// Define PropTypes for TurnControls component
TurnControls.propTypes = {
  gameData: PropTypes.shape({
    turn: PropTypes.number.isRequired,
    players: PropTypes.arrayOf(PropTypes.shape({
      uid: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      nation: PropTypes.string,
      status: PropTypes.string.isRequired,
      isTurnReady: PropTypes.bool.isRequired
    })).isRequired
  }).isRequired,
  currentPlayer: PropTypes.shape({
    uid: PropTypes.string.isRequired,
    isTurnReady: PropTypes.bool.isRequired
  }),
  onEndTurn: PropTypes.func.isRequired
};

export default TurnControls;