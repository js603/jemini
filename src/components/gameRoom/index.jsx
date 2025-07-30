/**
 * @file index.jsx
 * 게임 플레이 컴포넌트입니다.
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { useResponsive } from '../../hooks';
import { useGameState } from '../../hooks/useGameState';

// Import game components
import MapView from '../game/map/MapView';
import TurnControls from '../game/turns/TurnControls';
import Dashboard from '../game/dashboard/Dashboard';
import AdvisorView from '../game/advisors/AdvisorView';
import DiplomacyView from '../game/diplomacy/DiplomacyView';
import TechnologyView from '../game/technology/TechnologyView';
import EventLog from '../game/events/EventLog';

// Import sub-components
import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import GameOverState from './GameOverState';
import WaitingRoomState from './WaitingRoomState';

/**
 * GameRoom - 게임 플레이 컴포넌트
 * 
 * 실제 게임 플레이가 이루어지는 메인 컨테이너입니다.
 * 게임 상태에 따라 다양한 화면을 표시하고, 탭 기반 네비게이션을 제공합니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 * 
 * @param {Object} props - 컴포넌트 속성
 * @param {Object} props.db - Firestore 데이터베이스 인스턴스
 * @param {Object} props.user - 현재 사용자 정보
 * @param {string} props.gameId - 현재 게임 ID
 * @param {Function} props.setGameId - 게임 ID 설정 함수
 */
function GameRoom({ db, user, gameId, setGameId }) {
  // 게임 상태 관리 훅 사용
  const { 
    gameData, 
    loading, 
    error, 
    handleSelectNation, 
    handleStartGame, 
    handleEndTurn, 
    handleCommand,
    getMyNation,
    getCurrentPlayer
  } = useGameState(db, gameId, user);
  
  const { isMinWidth } = useResponsive();
  const [activeTab, setActiveTab] = useState('map');

  // 현재 플레이어와 국가 정보
  const currentPlayer = getCurrentPlayer();
  const myNation = getMyNation();

  // 로딩 상태
  if (loading) {
    return <LoadingState />;
  }
  
  // 에러 상태
  if (error || !gameData) {
    return <ErrorState error={error} onReturn={() => setGameId(null)} />;
  }

  // 게임 오버 상태 (패배 또는 승리)
  if (currentPlayer?.status === 'eliminated' || gameData.status === 'finished') {
    return (
      <GameOverState 
        isWinner={gameData.winner === myNation?.name}
        winner={gameData.winner}
        onReturn={() => setGameId(null)}
      />
    );
  }

  // 게임 대기 상태 (게임 시작 전)
  if (gameData.status === 'waiting') {
    return (
      <WaitingRoomState 
        gameData={gameData}
        user={user}
        onSelectNation={handleSelectNation}
        onStartGame={handleStartGame}
        onReturn={() => setGameId(null)}
      />
    );
  }

  // 탭 변경 핸들러
  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  // 게임 플레이 상태 (게임 진행 중)
  return (
    <div className="bg-gray-900 rounded-lg shadow-xl overflow-hidden border border-gray-700">
      {/* 게임 헤더 */}
      <div className="bg-gradient-to-r from-indigo-800 to-purple-800 p-4 text-white">
        <div className="flex justify-between items-center">
          <h2 className="text-xl md:text-2xl font-bold">{gameData.name}</h2>
          <div className="text-sm opacity-75">ID: {gameData.id.substring(0, 8)}...</div>
        </div>
        <div className="mt-2 text-sm flex flex-wrap gap-2">
          <span className="bg-indigo-900/70 px-3 py-1 rounded-full flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            턴 {gameData.turn}
          </span>
          <span className="bg-green-900/70 px-3 py-1 rounded-full flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
            {gameData.players.filter(p => p.status === 'playing').length}명 플레이
          </span>
          {myNation && (
            <span className="bg-blue-900/70 px-3 py-1 rounded-full flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
              </svg>
              {myNation.name}
            </span>
          )}
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="border-b border-gray-700 bg-gray-800">
        <nav className="flex flex-wrap overflow-x-auto">
          {[
            { id: 'map', label: '지도', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
            { id: 'dashboard', label: '대시보드', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            { id: 'advisors', label: '보좌관', icon: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
            { id: 'diplomacy', label: '외교', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
            { id: 'technology', label: '기술', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
            { id: 'events', label: '이벤트', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center px-4 py-3 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-700 text-white border-b-2 border-indigo-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
              }`}
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-5 w-5 mr-1.5" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              <span className={isMinWidth.md ? '' : 'sr-only'}>{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* 턴 컨트롤 - 항상 표시 */}
      <div className="p-4 bg-gray-900">
        <TurnControls 
          gameData={gameData} 
          currentPlayer={currentPlayer} 
          onEndTurn={handleEndTurn} 
        />
      </div>

      {/* 탭 콘텐츠 */}
      <div className="p-4 bg-gray-900">
        {activeTab === 'map' && (
          <MapView mapData={gameData.map} nations={gameData.nations} />
        )}
        
        {activeTab === 'dashboard' && (
          <Dashboard myNation={myNation} gameData={gameData} />
        )}
        
        {activeTab === 'advisors' && (
          <AdvisorView 
            db={db} 
            gameData={gameData} 
            myNation={myNation} 
            user={user} 
            onCommand={handleCommand} 
          />
        )}
        
        {activeTab === 'diplomacy' && (
          <DiplomacyView 
            db={db} 
            gameData={gameData} 
            myNation={myNation} 
          />
        )}
        
        {activeTab === 'technology' && (
          <TechnologyView 
            myNation={myNation} 
            db={db} 
            gameData={gameData} 
            onResearch={handleCommand}
          />
        )}
        
        {activeTab === 'events' && (
          <EventLog events={gameData.events} user={user} />
        )}
      </div>
      
      {/* 로비로 돌아가기 버튼 */}
      <div className="border-t border-gray-700 p-4 text-center bg-gray-800">
        <button 
          onClick={() => setGameId(null)}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-800"
        >
          로비로 돌아가기
        </button>
      </div>
    </div>
  );
}

// Define PropTypes for GameRoom component
GameRoom.propTypes = {
  db: PropTypes.object.isRequired,
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired,
  gameId: PropTypes.string.isRequired,
  setGameId: PropTypes.func.isRequired
};

export default GameRoom;