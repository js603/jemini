/**
 * @file index.jsx
 * 게임 로비 컴포넌트입니다.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { collection, addDoc, doc, getDoc, updateDoc, arrayUnion, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useResponsive } from '../../hooks';
import { techTree, initialMapData, advisorPersonas } from '../../data';

/**
 * Lobby - 게임 로비 컴포넌트
 * 
 * 새 게임을 생성하거나 기존 게임에 참여하는 UI를 제공합니다.
 * 사용 가능한 게임 목록을 표시하고 선택하여 참여하거나, 게임 ID를 직접 입력하여 참여할 수 있습니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 * 
 * @param {Object} props - 컴포넌트 속성
 * @param {Object} props.db - Firestore 데이터베이스 인스턴스
 * @param {Object} props.user - 현재 사용자 정보
 * @param {Function} props.setGameId - 게임 ID 설정 함수
 * @param {boolean} props.isMobile - 모바일 환경 여부
 */
function Lobby({ db, user, setGameId, isMobile }) {
  const { isMinWidth } = useResponsive();
  const [newGameName, setNewGameName] = useState('');
  const [joinGameId, setJoinGameId] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [availableGames, setAvailableGames] = useState([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState('');

  /**
   * 사용 가능한 게임 목록을 가져오는 함수
   * 
   * Firebase에서 'waiting' 상태인 게임(아직 시작되지 않은 게임)을 최대 10개까지 가져옵니다.
   * 게임은 생성 시간 기준 내림차순으로 정렬됩니다(최신 게임이 먼저 표시).
   * 
   * 각 게임에 대해 ID, 이름, 플레이어 목록, 생성 시간, 플레이어 수를 추출하여 저장합니다.
   * 이 정보는 게임 목록 UI에 표시되고 게임 선택 및 참여에 사용됩니다.
   */
  const fetchAvailableGames = async () => {
    setIsLoadingGames(true);
    setError('');
    
    try {
      // 'waiting' 상태인 게임만 가져오기 (아직 시작되지 않은 게임)
      const gamesQuery = query(
        collection(db, 'games'),
        where('status', '==', 'waiting'),
        orderBy('createdAt', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(gamesQuery);
      const games = [];
      
      querySnapshot.forEach((doc) => {
        const gameData = doc.data();
        games.push({
          id: doc.id,
          name: gameData.name,
          players: gameData.players,
          createdAt: gameData.createdAt.toDate(),
          playerCount: gameData.players.length
        });
      });
      
      setAvailableGames(games);
    } catch (e) {
      console.error("게임 목록 가져오기 오류:", e);
      setError('게임 목록을 가져오는데 실패했습니다: ' + e.message);
    } finally {
      setIsLoadingGames(false);
    }
  };
  
  // 컴포넌트 마운트 시 게임 목록 가져오기
  useEffect(() => {
    fetchAvailableGames();
    
    // 30초마다 게임 목록 갱신
    const intervalId = setInterval(fetchAvailableGames, 30000);
    
    return () => clearInterval(intervalId);
  }, [db]);

  /**
   * 새 게임 생성 핸들러
   */
  const handleCreateGame = async () => {
    if (!newGameName.trim()) { 
      setError('게임 이름을 입력해주세요.'); 
      return; 
    }
    
    setError('');
    setSuccessMessage('');
    setIsCreating(true);
    
    try {
      // 게임에 필요한 모든 초기 데이터(기술, 국가, 보좌관, 지도 등)를 설정합니다.
      const initialTechs = Object.keys(techTree).reduce((acc, key) => ({...acc, [key]: { level: 0 }}), {});
      const nations = {
        '에라시아': { 
          name: '에라시아', 
          resources: 1000, 
          stability: 75, 
          owner: null, 
          status: 'active', 
          technologies: JSON.parse(JSON.stringify(initialTechs)) 
        },
        '브라카다': { 
          name: '브라카다', 
          resources: 1200, 
          stability: 80, 
          owner: null, 
          status: 'active', 
          technologies: JSON.parse(JSON.stringify(initialTechs)) 
        },
        '아블리': { 
          name: '아블리', 
          resources: 800, 
          stability: 65, 
          owner: null, 
          status: 'active', 
          technologies: JSON.parse(JSON.stringify(initialTechs)) 
        },
      };
      
      const playerInfo = { 
        uid: user.uid, 
        name: `플레이어 ${user.uid.substring(0, 4)}`, 
        nation: null, 
        isTurnReady: false, 
        status: 'playing' 
      };
      
      const initialAdvisors = {};
      Object.keys(advisorPersonas).forEach(key => {
        initialAdvisors[key] = { loyalty: 50, ambition: advisorPersonas[key].ambition };
      });

      // Firestore에 새 게임 문서를 생성합니다.
      const newGameDoc = await addDoc(collection(db, 'games'), {
        name: newGameName, 
        players: [playerInfo], 
        nations: nations,
        advisors: { [user.uid]: initialAdvisors },
        map: JSON.parse(JSON.stringify(initialMapData)),
        status: 'waiting', 
        turn: 1,
        events: [{ turn: 1, type: 'game_start', content: '새로운 역사가 시작됩니다.' }],
        diplomacy: { proposals: [], treaties: [], wars: [] },
        pendingActions: [], 
        createdAt: new Date(),
      });
      
      setSuccessMessage(`게임이 성공적으로 생성되었습니다! 게임 ID: ${newGameDoc.id}`);
      setNewGameName('');
      
      // 잠시 후 게임으로 이동
      setTimeout(() => {
        setGameId(newGameDoc.id);
      }, 1500);
    } catch (e) { 
      console.error("게임 생성 오류: ", e); 
      setError('게임 생성에 실패했습니다: ' + e.message); 
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * 기존 게임 참여 핸들러
   * 
   * 사용자가 게임에 참여할 수 있는 세 가지 방법을 지원합니다:
   * 1. 게임 목록에서 '참여' 버튼 클릭 (gameIdToJoin 매개변수로 전달)
   * 2. 게임 목록에서 게임 선택 후 하단 '참여' 버튼 클릭 (selectedGameId 상태 사용)
   * 3. 게임 ID 직접 입력 후 '참여' 버튼 클릭 (joinGameId 상태 사용)
   * 
   * 우선순위는 1 > 2 > 3 순서입니다.
   * 
   * @param {string} gameIdToJoin - 선택적 매개변수. 게임 목록에서 직접 '참여' 버튼을 클릭한 경우 해당 게임 ID
   */
  const handleJoinGame = async (gameIdToJoin) => {
    const targetGameId = gameIdToJoin || selectedGameId || joinGameId;
    
    if (!targetGameId.trim()) { 
      setError('참여할 게임을 선택하거나 ID를 입력해주세요.'); 
      return; 
    }
    
    setError('');
    setSuccessMessage('');
    setIsJoining(true);
    
    try {
      const gameRef = doc(db, 'games', targetGameId);
      const gameSnap = await getDoc(gameRef);
      
      if (gameSnap.exists()) {
        const gameData = gameSnap.data();
        
        // 이미 참여한 플레이어인지 확인
        if (gameData.players.some(p => p.uid === user.uid)) {
          setSuccessMessage('이미 참여한 게임입니다. 게임으로 이동합니다...');
          
          // 잠시 후 게임으로 이동
          setTimeout(() => {
            setGameId(targetGameId);
          }, 1500);
        } else {
          // 새로운 플레이어 정보와 보좌관 정보를 추가
          const playerInfo = { 
            uid: user.uid, 
            name: `플레이어 ${user.uid.substring(0, 4)}`, 
            nation: null, 
            isTurnReady: false, 
            status: 'playing' 
          };
          
          const initialAdvisors = {};
          Object.keys(advisorPersonas).forEach(key => {
            initialAdvisors[key] = { loyalty: 50, ambition: advisorPersonas[key].ambition };
          });
          
          await updateDoc(gameRef, {
            players: arrayUnion(playerInfo),
            [`advisors.${user.uid}`]: initialAdvisors
          });
          
          setSuccessMessage('게임에 성공적으로 참여했습니다! 게임으로 이동합니다...');
          setJoinGameId('');
          setSelectedGameId('');
          
          // 게임 목록 갱신
          fetchAvailableGames();
          
          // 잠시 후 게임으로 이동
          setTimeout(() => {
            setGameId(targetGameId);
          }, 1500);
        }
      } else {
        setError('존재하지 않는 게임 ID입니다.');
      }
    } catch (e) { 
      console.error("게임 참여 오류: ", e); 
      setError('게임 참여에 실패했습니다: ' + e.message); 
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl md:text-3xl font-bold text-center mb-6 text-indigo-600 dark:text-indigo-400">
        왕관의 회의 - 게임 로비
      </h2>
      
      {/* 알림 메시지 */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-300 rounded-md">
          <p className="text-center">{error}</p>
        </div>
      )}
      
      {successMessage && (
        <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/50 border-l-4 border-green-500 text-green-700 dark:text-green-300 rounded-md">
          <p className="text-center">{successMessage}</p>
        </div>
      )}
      
      <div className="grid md:grid-cols-2 gap-8">
        {/* 새 게임 만들기 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all hover:shadow-xl">
          <div className="bg-gradient-to-r from-indigo-600 to-blue-600 dark:from-indigo-800 dark:to-blue-800 p-4">
            <h3 className="text-xl font-semibold text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              새 게임 만들기
            </h3>
          </div>
          <div className="p-6">
            <div className="mb-4">
              <label htmlFor="newGameName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                </svg>
                게임 이름
              </label>
              <input 
                id="newGameName"
                type="text" 
                value={newGameName} 
                onChange={(e) => setNewGameName(e.target.value)} 
                placeholder="새 게임의 이름을 입력하세요" 
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <button 
              onClick={handleCreateGame} 
              disabled={isCreating || !newGameName.trim()}
              className={`w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                isCreating || !newGameName.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isCreating ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  게임 생성 중...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  새 게임 생성하기
                </span>
              )}
            </button>
            
            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              <p>새 게임을 생성하면 당신이 호스트가 됩니다. 게임 ID를 다른 플레이어들과 공유하여 함께 플레이할 수 있습니다.</p>
            </div>
          </div>
        </div>
        
        {/* 게임 참여하기 */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden transition-all hover:shadow-xl">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-800 dark:to-cyan-800 p-4">
            <h3 className="text-xl font-semibold text-white flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              게임 참여하기
            </h3>
          </div>
          <div className="p-6">
            {/* 사용 가능한 게임 목록 - 사용자가 참여할 수 있는 게임 목록을 표시합니다 */}
            <div className="mb-6">
              <h4 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-3 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
                참여 가능한 게임 목록
                <span className="ml-2 text-sm text-blue-500 font-normal">(아래 목록에서 선택하세요)</span>
              </h4>
              
              {/* 로딩 중 상태 표시 */}
              {isLoadingGames ? (
                <div className="flex justify-center items-center py-8">
                  <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : availableGames.length > 0 ? (
                // 게임 목록이 있는 경우 목록 표시
                <div className="border-2 border-blue-300 dark:border-blue-700 rounded-md overflow-hidden shadow-md">
                  <div className="bg-blue-50 dark:bg-blue-900/30 p-2 border-b border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">게임을 선택하고 참여 버튼을 클릭하세요</p>
                  </div>
                  <ul className="divide-y divide-gray-200 dark:divide-gray-700 max-h-72 overflow-y-auto">
                    {availableGames.map((game) => (
                      <li 
                        key={game.id}
                        // 게임 항목 클릭 시 해당 게임 선택
                        onClick={() => setSelectedGameId(game.id)}
                        // 선택된 게임은 배경색으로 강조 표시
                        className={`p-4 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          selectedGameId === game.id ? 'bg-blue-100 dark:bg-blue-900/50 border-l-4 border-blue-500' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <h5 className="font-medium text-gray-800 dark:text-gray-200 text-lg">{game.name}</h5>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              플레이어: {game.playerCount}명 | ID: {game.id}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              생성: {game.createdAt.toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center">
                            {selectedGameId === game.id && (
                              <span className="mr-3 text-blue-500 dark:text-blue-400">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </span>
                            )}
                            {/* 각 게임 항목에 직접 참여 버튼 제공 */}
                            <button
                              onClick={(e) => {
                                // 버블링 방지 (부모 요소의 클릭 이벤트가 발생하지 않도록)
                                e.stopPropagation();
                                // 해당 게임 ID로 직접 참여
                                handleJoinGame(game.id);
                              }}
                              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-md transition-colors font-medium"
                            >
                              참여하기
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                // 게임 목록이 없는 경우 안내 메시지와 새로고침 버튼 표시
                <div className="text-center py-8 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 mb-2">현재 참여 가능한 게임이 없습니다.</p>
                  <button 
                    onClick={fetchAvailableGames}
                    className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-md transition-colors font-medium"
                  >
                    게임 목록 새로고침
                  </button>
                </div>
              )}
            </div>
            
            {/* 선택한 게임 참여 버튼 - 목록에서 게임을 선택한 경우 표시 */}
            {selectedGameId && (
              <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                  <div>
                    <h5 className="font-medium text-blue-800 dark:text-blue-300">
                      선택된 게임: {availableGames.find(g => g.id === selectedGameId)?.name || selectedGameId}
                    </h5>
                    <p className="text-sm text-blue-600 dark:text-blue-400">
                      ID: {selectedGameId}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedGameId('')}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md transition-colors font-medium"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => handleJoinGame()}
                      disabled={isJoining}
                      className={`px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        isJoining ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {isJoining ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          참여 중...
                        </span>
                      ) : "선택한 게임에 참여하기"}
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* 게임 ID로 직접 참여 - 게임 ID를 알고 있는 경우 직접 입력하여 참여할 수 있습니다 */}
            <div className="mb-4">
              {/* 구분선 - 두 가지 참여 방법을 시각적으로 구분합니다 */}
              <div className="flex items-center mb-3">
                <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                <span className="mx-3 text-sm text-gray-500 dark:text-gray-400">또는</span>
                <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
              </div>
              
              <label htmlFor="joinGameId" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                게임 ID로 직접 참여
              </label>
              {/* 입력 필드와 버튼을 하나의 그룹으로 표시 */}
              <div className="flex">
                <input 
                  id="joinGameId"
                  type="text" 
                  value={joinGameId} 
                  onChange={(e) => {
                    setJoinGameId(e.target.value);
                    setSelectedGameId(''); // ID 입력 시 선택된 게임 초기화 (두 방식 간 충돌 방지)
                  }} 
                  placeholder="참여할 게임의 ID를 입력하세요" 
                  className="flex-grow px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-l-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                {/* 참여 버튼 - 게임 ID 입력이 있을 때만 활성화 */}
                <button 
                  onClick={() => handleJoinGame()} 
                  disabled={isJoining || !joinGameId.trim()}
                  className={`px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-r-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    isJoining || !joinGameId.trim() ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isJoining ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      참여 중...
                    </span>
                  ) : "참여"}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                게임 ID를 알고 있는 경우에만 사용하세요. 일반적으로는 위 목록에서 게임을 선택하는 것이 좋습니다.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center">
        <h3 className="text-lg font-medium text-blue-800 dark:text-blue-300 mb-2">게임 참여 방법</h3>
        <div className="flex flex-col md:flex-row justify-center items-center gap-4 md:gap-8 mb-4">
          <div className="flex items-center">
            <div className="bg-blue-100 dark:bg-blue-800 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-300">1</div>
            <p className="text-gray-700 dark:text-gray-300">목록에서 게임 선택</p>
          </div>
          <div className="hidden md:block text-gray-400">→</div>
          <div className="flex items-center">
            <div className="bg-blue-100 dark:bg-blue-800 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-300">2</div>
            <p className="text-gray-700 dark:text-gray-300">참여하기 버튼 클릭</p>
          </div>
          <div className="hidden md:block text-gray-400">→</div>
          <div className="flex items-center">
            <div className="bg-blue-100 dark:bg-blue-800 rounded-full w-8 h-8 flex items-center justify-center mr-3 text-blue-600 dark:text-blue-300">3</div>
            <p className="text-gray-700 dark:text-gray-300">국가 선택 후 게임 시작</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">게임 ID는 다른 플레이어들과 공유하여 같은 게임에 참여할 수 있습니다.</p>
        <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">각 플레이어는 서로 다른 국가를 선택하여 플레이합니다.</p>
      </div>
    </div>
  );
}

// Define PropTypes for Lobby component
Lobby.propTypes = {
  db: PropTypes.object.isRequired,
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired,
  setGameId: PropTypes.func.isRequired,
  isMobile: PropTypes.bool
};

export default Lobby;