/**
 * @file GameOverState.jsx
 * 게임 종료 상태를 표시하는 컴포넌트입니다.
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * 게임이 종료되었을 때 표시되는 컴포넌트
 * 승리 또는 패배 상태를 표시합니다.
 * 
 * @param {Object} props - 컴포넌트 속성
 * @param {boolean} props.isWinner - 플레이어가 승리했는지 여부
 * @param {string} props.winner - 승리한 국가 이름
 * @param {Function} props.onReturn - 로비로 돌아가기 버튼 클릭 시 호출될 함수
 */
function GameOverState({ isWinner, winner, onReturn }) {
  return (
    <div className="bg-gray-900 rounded-lg shadow-xl overflow-hidden border border-gray-700">
      <div className={`p-8 ${isWinner ? 'bg-gradient-to-r from-yellow-600 to-amber-600' : 'bg-gradient-to-r from-gray-800 to-gray-900'}`}>
        <div className="flex flex-col items-center justify-center py-12">
          {isWinner ? (
            <div className="bg-yellow-500/30 p-4 rounded-full mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-yellow-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          ) : (
            <div className="bg-gray-700/30 p-4 rounded-full mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
          
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 text-center">
            {isWinner ? '승리했습니다!' : '패배했습니다'}
          </h2>
          
          <p className="text-xl text-gray-200 text-center mb-8">
            {isWinner 
              ? '당신의 뛰어난 전략과 외교로 왕관의 회의에서 승리했습니다!' 
              : `${winner}가 왕관의 회의에서 승리했습니다.`}
          </p>
          
          <button 
            onClick={onReturn}
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            로비로 돌아가기
          </button>
        </div>
      </div>
      
      <div className="p-6 border-t border-gray-700">
        <h3 className="text-xl font-semibold text-white mb-4">게임 결과</h3>
        <p className="text-gray-400">
          {isWinner 
            ? '축하합니다! 당신은 이 게임에서 승리했습니다. 다른 게임을 시작하거나 친구들을 초대하여 새로운 게임을 즐겨보세요.' 
            : '아쉽게도 이번 게임에서는 패배했습니다. 다시 도전하여 다른 전략을 시도해보세요.'}
        </p>
      </div>
    </div>
  );
}

GameOverState.propTypes = {
  isWinner: PropTypes.bool.isRequired,
  winner: PropTypes.string.isRequired,
  onReturn: PropTypes.func.isRequired
};

export default GameOverState;