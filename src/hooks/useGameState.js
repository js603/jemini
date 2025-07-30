/**
 * @file useGameState.js
 * 게임 상태 관리를 위한 커스텀 훅을 제공합니다.
 * 호스트 역할 자동 이전 메커니즘이 포함되어 있습니다.
 */

import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { processTurn } from '../utils/gameLogic';
import { executeCommand } from '../utils/commandHandlers';

// 호스트 활동 타임아웃 (밀리초)
const HOST_ACTIVITY_TIMEOUT_MS = 60000; // 1분

/**
 * 게임 상태를 관리하는 커스텀 훅
 * 
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {string} gameId - 게임 ID
 * @param {Object} user - 현재 사용자 정보
 * @returns {Object} 게임 상태 및 관련 함수들
 */
const useGameState = (db, gameId, user) => {
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const lastActivityTimestamp = useRef(Date.now());
  const hostCheckInterval = useRef(null);

  // 플레이어 활동 상태 업데이트 함수
  const updatePlayerActivity = async () => {
    if (!db || !gameId || !user || !gameData) return;
    
    try {
      const gameRef = doc(db, 'games', gameId);
      const playerIndex = gameData.players.findIndex(p => p.uid === user.uid);
      
      if (playerIndex !== -1) {
        // 플레이어 활동 시간 업데이트
        const updatedPlayers = [...gameData.players];
        updatedPlayers[playerIndex].lastActive = new Date().toISOString(); // Use ISO string instead of serverTimestamp
        
        await updateDoc(gameRef, { 
          players: updatedPlayers,
          lastActivityTimestamp: serverTimestamp() // Store server timestamp at the top level
        });
        
        lastActivityTimestamp.current = Date.now();
      }
    } catch (err) {
      console.warn('플레이어 활동 상태 업데이트 중 오류:', err);
    }
  };

  // 호스트 역할 확인 및 필요시 이전
  const checkAndTransferHostRole = async () => {
    if (!db || !gameId || !user || !gameData) return;
    
    try {
      // 현재 호스트 확인
      const currentHost = gameData.players[0];
      if (!currentHost) return;
      
      // 호스트가 비활성 상태인지 확인
      const hostLastActive = currentHost.lastActive?.toDate?.() || new Date(0);
      const now = new Date();
      const hostInactive = now - hostLastActive > HOST_ACTIVITY_TIMEOUT_MS;
      
      // 호스트가 비활성 상태이고 현재 사용자가 호스트가 아니면서 활성 상태인 경우
      if (hostInactive && currentHost.uid !== user.uid && gameData.players.some(p => p.uid === user.uid && p.status === 'playing')) {
        console.log('호스트가 비활성 상태입니다. 호스트 역할 이전 시도 중...');
        
        // 활성 상태인 플레이어 중 가장 오래 접속한 플레이어를 새 호스트로 선택
        const activePlayers = gameData.players
          .filter(p => p.status === 'playing')
          .sort((a, b) => {
            // lastActive가 없으면 가장 최근으로 간주
            const aTime = a.lastActive?.toDate?.() || new Date();
            const bTime = b.lastActive?.toDate?.() || new Date();
            return aTime - bTime; // 오래된 순으로 정렬
          });
        
        if (activePlayers.length > 0 && activePlayers[0].uid === user.uid) {
          // 현재 사용자가 새 호스트가 될 자격이 있음
          const gameRef = doc(db, 'games', gameId);
          
          // 플레이어 순서 재정렬 (새 호스트를 첫 번째로)
          const updatedPlayers = [
            ...gameData.players.filter(p => p.uid === user.uid),
            ...gameData.players.filter(p => p.uid !== user.uid)
          ];
          
          // Create a new event with current timestamp instead of serverTimestamp
          const newEvent = {
            turn: gameData.turn,
            type: 'system',
            timestamp: new Date().toISOString(), // Add client timestamp for the event
            content: `호스트 역할이 ${currentHost.nation || '이전 호스트'}에서 ${updatedPlayers[0].nation || '새 호스트'}로 이전되었습니다.`
          };
          
          await updateDoc(gameRef, { 
            players: updatedPlayers,
            hostTransferred: true,
            hostTransferTime: serverTimestamp(), // Keep serverTimestamp for top-level field
            events: [...gameData.events, newEvent]
          });
          
          console.log('호스트 역할이 성공적으로 이전되었습니다.');
          setIsHost(true);
        }
      } else if (currentHost.uid === user.uid) {
        setIsHost(true);
      } else {
        setIsHost(false);
      }
    } catch (err) {
      console.error('호스트 역할 이전 중 오류:', err);
    }
  };

  // Firestore의 게임 데이터를 실시간으로 구독하고, 턴 종료 조건을 확인합니다.
  useEffect(() => {
    if (!db || !gameId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const gameRef = doc(db, 'games', gameId);
    
    // 초기 플레이어 활동 상태 업데이트
    updatePlayerActivity();
    
    // 주기적인 활동 상태 업데이트 (5분마다)
    const activityInterval = setInterval(() => {
      updatePlayerActivity();
    }, 5 * 60 * 1000);
    
    // 호스트 역할 확인 인터벌 (30초마다)
    hostCheckInterval.current = setInterval(() => {
      checkAndTransferHostRole();
    }, 30 * 1000);
    
    const unsubscribe = onSnapshot(
      gameRef, 
      (docSnap) => {
        if (docSnap.exists()) {
          const data = { id: docSnap.id, ...docSnap.data() };
          setGameData(data);
          
          // 호스트 상태 확인
          const isCurrentUserHost = data.players[0]?.uid === user?.uid;
          setIsHost(isCurrentUserHost);
          
          // 턴 종료 조건 확인 및 처리
          const activePlayers = data.players.filter(p => p.status === 'playing');
          const allPlayersReady = data.status === 'playing' && 
                                 activePlayers.length > 0 && 
                                 activePlayers.every(p => p.isTurnReady);
          
          // 호스트만 턴 처리 수행
          if (allPlayersReady && isCurrentUserHost) {
            processTurn(db, data);
          }
        } else {
          setError('게임을 찾을 수 없습니다.');
        }
        setLoading(false);
      },
      (err) => {
        console.error('게임 데이터 구독 중 오류:', err);
        setError(`게임 데이터를 불러오는 중 오류가 발생했습니다: ${err.message}`);
        setLoading(false);
      }
    );

    // 컴포넌트 언마운트 시 구독 및 인터벌 해제
    return () => {
      unsubscribe();
      clearInterval(activityInterval);
      if (hostCheckInterval.current) {
        clearInterval(hostCheckInterval.current);
      }
    };
  }, [db, gameId, user]);

  /**
   * 국가 선택 핸들러
   * @param {string} nationName - 선택할 국가 이름
   * @returns {Promise<void>}
   */
  const handleSelectNation = async (nationName) => {
    if (!gameData || !user) return;
    
    const playerIndex = gameData.players.findIndex(p => p.uid === user.uid);
    if (playerIndex === -1 || gameData.nations[nationName].owner) return;
    
    try {
      const gameRef = doc(db, 'games', gameId);
      const updatedPlayers = [...gameData.players];
      updatedPlayers[playerIndex].nation = nationName;
      updatedPlayers[playerIndex].lastActive = new Date().toISOString(); // Use ISO string instead of serverTimestamp
      
      const updatedNations = { 
        ...gameData.nations, 
        [nationName]: { 
          ...gameData.nations[nationName], 
          owner: user.uid 
        } 
      };
      
      await updateDoc(gameRef, { 
        players: updatedPlayers, 
        nations: updatedNations,
        lastNationSelectionTime: serverTimestamp() // Store server timestamp at the top level
      });
      
      // 활동 타임스탬프 업데이트
      lastActivityTimestamp.current = Date.now();
    } catch (err) {
      console.error('국가 선택 중 오류:', err);
      setError(`국가 선택 중 오류가 발생했습니다: ${err.message}`);
    }
  };

  /**
   * 게임 시작 핸들러
   * @returns {Promise<void>}
   */
  const handleStartGame = async () => {
    if (!gameData) return;
    
    if (gameData.players.every(p => p.nation)) {
      try {
        // 모든 플레이어의 활동 시간 초기화
        const currentTime = new Date().toISOString();
        const updatedPlayers = gameData.players.map(player => ({
          ...player,
          lastActive: currentTime // Use ISO string instead of serverTimestamp
        }));
        
        await updateDoc(doc(db, 'games', gameId), { 
          status: 'playing',
          players: updatedPlayers,
          gameStartTime: serverTimestamp(), // Keep serverTimestamp for top-level field
          lastPlayersActivityUpdate: serverTimestamp() // Add a top-level field for tracking player activity updates
        });
        
        // 활동 타임스탬프 업데이트
        lastActivityTimestamp.current = Date.now();
      } catch (err) {
        console.error('게임 시작 중 오류:', err);
        setError(`게임 시작 중 오류가 발생했습니다: ${err.message}`);
      }
    } else {
      setError('모든 플레이어가 국가를 선택해야 게임을 시작할 수 있습니다.');
    }
  };

  /**
   * 턴 종료 핸들러
   * @returns {Promise<void>}
   */
  const handleEndTurn = async () => {
    if (!gameData || !user) return;
    
    const playerIndex = gameData.players.findIndex(p => p.uid === user.uid);
    if (playerIndex === -1) return;
    
    try {
      const updatedPlayers = [...gameData.players];
      updatedPlayers[playerIndex].isTurnReady = true;
      updatedPlayers[playerIndex].lastActive = new Date().toISOString(); // Use ISO string instead of serverTimestamp
      
      await updateDoc(doc(db, 'games', gameId), { 
        players: updatedPlayers,
        lastTurnReadyTime: serverTimestamp() // Store server timestamp at the top level
      });
      
      // 활동 타임스탬프 업데이트
      lastActivityTimestamp.current = Date.now();
    } catch (err) {
      console.error('턴 종료 중 오류:', err);
      setError(`턴 종료 중 오류가 발생했습니다: ${err.message}`);
    }
  };

  /**
   * 명령 실행 핸들러
   * @param {Object} command - 실행할 명령 객체
   * @returns {Promise<Object>} - 명령 실행 결과
   */
  const handleCommand = async (command) => {
    if (!gameData || !user || !db) {
      return { success: false, message: '게임 데이터가 로드되지 않았습니다.' };
    }
    
    try {
      // 명령 실행 시 활동 상태 업데이트
      updatePlayerActivity();
      
      return await executeCommand(db, gameId, gameData, user, command);
    } catch (err) {
      console.error('명령 실행 중 오류:', err);
      return { success: false, message: `명령 실행 중 오류가 발생했습니다: ${err.message}` };
    }
  };

  /**
   * 현재 플레이어의 국가 정보 가져오기
   * @returns {Object|null} 현재 플레이어의 국가 정보
   */
  const getMyNation = () => {
    if (!gameData || !user) return null;
    
    const currentPlayer = gameData.players.find(p => p.uid === user.uid);
    if (!currentPlayer || !currentPlayer.nation) return null;
    
    return gameData.nations[currentPlayer.nation];
  };

  /**
   * 현재 플레이어 정보 가져오기
   * @returns {Object|null} 현재 플레이어 정보
   */
  const getCurrentPlayer = () => {
    if (!gameData || !user) return null;
    return gameData.players.find(p => p.uid === user.uid) || null;
  };

  /**
   * 호스트 역할 수동 이전 (현재 사용자가 호스트인 경우)
   * @param {string} newHostUid - 새 호스트의 UID
   * @returns {Promise<boolean>} 성공 여부
   */
  const transferHostRole = async (newHostUid) => {
    if (!gameData || !user || !db || !isHost) {
      return false;
    }
    
    try {
      const gameRef = doc(db, 'games', gameId);
      const newHostPlayer = gameData.players.find(p => p.uid === newHostUid);
      
      if (!newHostPlayer) {
        console.error('새 호스트 플레이어를 찾을 수 없습니다.');
        return false;
      }
      
      // 플레이어 순서 재정렬 (새 호스트를 첫 번째로)
      const updatedPlayers = [
        newHostPlayer,
        ...gameData.players.filter(p => p.uid !== newHostUid)
      ];
      
      // Create a new event with current timestamp instead of serverTimestamp
      const newEvent = {
        turn: gameData.turn,
        type: 'system',
        timestamp: new Date().toISOString(), // Add client timestamp for the event
        content: `호스트 역할이 ${gameData.players[0].nation || '이전 호스트'}에서 ${newHostPlayer.nation || '새 호스트'}로 수동 이전되었습니다.`
      };
      
      await updateDoc(gameRef, { 
        players: updatedPlayers,
        hostTransferred: true,
        hostTransferTime: serverTimestamp(), // Keep serverTimestamp for top-level field
        events: [...gameData.events, newEvent]
      });
      
      console.log('호스트 역할이 성공적으로 이전되었습니다.');
      setIsHost(false);
      return true;
    } catch (err) {
      console.error('호스트 역할 수동 이전 중 오류:', err);
      return false;
    }
  };

  return {
    gameData,
    loading,
    error,
    isHost,
    handleSelectNation,
    handleStartGame,
    handleEndTurn,
    handleCommand,
    getMyNation,
    getCurrentPlayer,
    transferHostRole,
    updatePlayerActivity
  };
};

export { useGameState };