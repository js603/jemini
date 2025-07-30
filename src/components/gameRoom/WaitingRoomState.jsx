/**
 * @file WaitingRoomState.jsx
 * 게임 대기실 상태를 표시하는 컴포넌트입니다.
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * 게임이 시작되기 전 대기실 상태를 표시하는 컴포넌트
 * 플레이어가 국가를 선택하고 게임을 시작할 수 있습니다.
 * 
 * @param {Object} props - 컴포넌트 속성
 * @param {Object} props.gameData - 게임 데이터
 * @param {Object} props.user - 현재 사용자 정보
 * @param {Function} props.onSelectNation - 국가 선택 시 호출될 함수
 * @param {Function} props.onStartGame - 게임 시작 시 호출될 함수
 * @param {Function} props.onReturn - 로비로 돌아가기 버튼 클릭 시 호출될 함수
 */
function WaitingRoomState({ gameData, user, onSelectNation, onStartGame, onReturn }) {
  // 현재 플레이어 정보
  const currentPlayer = gameData.players.find(p => p.uid === user.uid);
  
  // 선택 가능한 국가 목록
  const availableNations = Object.values(gameData.nations).filter(nation => 
    !gameData.players.some(player => player.nation === nation.name)
  );
  
  // 이미 선택된 국가 목록
  const selectedNations = gameData.players
    .filter(player => player.nation)
    .map(player => {
      const isCurrentUser = player.uid === user.uid;
      return {
        name: player.nation,
        playerName: player.name,
        isCurrentUser
      };
    });
  
  // 게임 시작 가능 여부 (모든 플레이어가 국가를 선택했는지)
  const canStartGame = gameData.players.every(player => player.nation) && 
    gameData.players.length >= 2 && 
    currentPlayer.nation; // 현재 플레이어도 국가를 선택했는지
  
  return (
    <div className="bg-gray-900 rounded-lg shadow-xl overflow-hidden border border-gray-700">
      <div className="bg-gradient-to-r from-indigo-800 to-purple-800 p-6">
        <h2 className="text-2xl font-bold text-white">게임 대기실</h2>
        <p className="text-indigo-200 mt-1">
          게임 ID: {gameData.id.substring(0, 8)}... | 플레이어: {gameData.players.length}명
        </p>
      </div>
      
      <div className="p-6">
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-white mb-4">참가자 ({gameData.players.length}명)</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {gameData.players.map(player => (
              <div 
                key={player.uid} 
                className={`p-4 rounded-lg border ${
                  player.uid === user.uid 
                    ? 'border-indigo-500 bg-indigo-900/20' 
                    : 'border-gray-700 bg-gray-800/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="bg-gray-700 rounded-full w-10 h-10 flex items-center justify-center mr-3">
                      <span className="text-gray-300 font-medium">{player.name.substring(0, 2)}</span>
                    </div>
                    <div>
                      <p className="font-medium text-white">{player.name}</p>
                      {player.nation ? (
                        <p className="text-green-400 text-sm">{player.nation} 선택됨</p>
                      ) : (
                        <p className="text-gray-400 text-sm">국가 선택 중...</p>
                      )}
                    </div>
                  </div>
                  {player.uid === user.uid && (
                    <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded">나</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {!currentPlayer.nation && (
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-white mb-4">국가 선택</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {availableNations.map(nation => (
                <button
                  key={nation.name}
                  onClick={() => onSelectNation(nation.name)}
                  className="p-4 border border-gray-700 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-left"
                >
                  <h4 className="font-bold text-lg text-white mb-1">{nation.name}</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm mt-3">
                    <div className="text-gray-400">자원:</div>
                    <div className="text-yellow-300">{nation.resources}</div>
                    <div className="text-gray-400">안정도:</div>
                    <div className="text-blue-300">{nation.stability}%</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {selectedNations.length > 0 && (
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-white mb-4">선택된 국가</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {selectedNations.map(nation => (
                <div
                  key={nation.name}
                  className={`p-4 border rounded-lg ${
                    nation.isCurrentUser 
                      ? 'border-indigo-500 bg-indigo-900/30' 
                      : 'border-gray-700 bg-gray-800'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-lg text-white">{nation.name}</h4>
                    {nation.isCurrentUser && (
                      <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded">내 국가</span>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mt-1">플레이어: {nation.playerName}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row justify-between gap-4 mt-8">
          <button 
            onClick={onReturn}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            로비로 돌아가기
          </button>
          
          {currentPlayer.nation && (
            <button 
              onClick={onStartGame}
              disabled={!canStartGame}
              className={`px-6 py-2 bg-green-600 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
                canStartGame ? 'hover:bg-green-700' : 'opacity-50 cursor-not-allowed'
              }`}
            >
              게임 시작
            </button>
          )}
        </div>
        
        {currentPlayer.nation && !canStartGame && (
          <p className="text-amber-400 text-sm mt-4 text-center">
            게임을 시작하려면 모든 플레이어가 국가를 선택해야 합니다.
          </p>
        )}
      </div>
    </div>
  );
}

WaitingRoomState.propTypes = {
  gameData: PropTypes.object.isRequired,
  user: PropTypes.object.isRequired,
  onSelectNation: PropTypes.func.isRequired,
  onStartGame: PropTypes.func.isRequired,
  onReturn: PropTypes.func.isRequired
};

export default WaitingRoomState;