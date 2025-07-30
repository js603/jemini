/**
 * 명령 실행 유틸리티: AI 보좌관에게 내린 자연어 명령을 해석하고 실행하는 함수를 제공합니다.
 */
import { doc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { techTree } from '../data';

/**
 * AI 보좌관에게 내린 자연어 명령을 해석하고 실행합니다.
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {Object} gameData - 현재 게임 데이터
 * @param {Object} user - 현재 사용자 정보
 * @param {Object} command - 해석된 명령 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
export const executeCommand = async (db, gameData, user, command) => {
  // 기본 유효성 검사
  if (!command || typeof command !== 'object') {
    return { success: false, message: "명령을 처리할 수 없습니다. 다시 시도해주세요." };
  }
  
  const myNationName = gameData.players.find(p => p.uid === user.uid)?.nation;
  if (!myNationName) return { success: false, message: "국가를 선택하지 않았습니다." };
  
  // 게임 상태 확인
  if (gameData.status !== 'playing') {
    return { success: false, message: "게임이 아직 시작되지 않았거나 이미 종료되었습니다." };
  }
  
  // 턴 준비 상태 확인
  const currentPlayer = gameData.players.find(p => p.uid === user.uid);
  if (currentPlayer.isTurnReady) {
    return { success: false, message: "이미 턴을 종료했습니다. 다음 턴까지 기다려주세요." };
  }

  const gameRef = doc(db, 'games', gameData.id);
  let updates = {};
  let event = null;
  let loyaltyChange = {};

  // 명령 유형에 따른 처리
  switch (command.action) {
    case 'attack':
      return await handleAttackCommand(command, gameData, myNationName, user, gameRef, updates);
    
    case 'build_military':
      return await handleBuildMilitaryCommand(command, gameData, myNationName, user, gameRef, updates, event);
    
    case 'research':
      return await handleResearchCommand(command, gameData, myNationName, user, gameRef, updates, event);
    
    case 'move_troops':
      return await handleMoveTroopsCommand(command, gameData, myNationName, user, gameRef, updates, event);
    
    default:
      return { success: false, message: "알 수 없는 명령입니다." };
  }
};

/**
 * 공격 명령을 처리합니다.
 * @param {Object} command - 명령 객체
 * @param {Object} gameData - 게임 데이터
 * @param {string} myNationName - 플레이어 국가 이름
 * @param {Object} user - 현재 사용자 정보
 * @param {Object} gameRef - 게임 문서 참조
 * @param {Object} updates - 업데이트할 필드
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleAttackCommand = async (command, gameData, myNationName, user, gameRef, updates) => {
  const fromTerritory = Object.values(gameData.map.territories).find(t => t.name === command.from);
  const toTerritory = Object.values(gameData.map.territories).find(t => t.name === command.to);
  
  // 유효성 검사
  if (!fromTerritory || !toTerritory) return { success: false, message: "잘못된 영토 이름입니다." };
  if (fromTerritory.owner !== myNationName) return { success: false, message: "공격을 시작할 영토는 당신의 소유가 아닙니다." };
  if (fromTerritory.army <= 0) return { success: false, message: "공격에 사용할 군대가 없습니다." };
  if (!fromTerritory.neighbors.includes(toTerritory.id)) return { success: false, message: "인접하지 않은 영토는 공격할 수 없습니다."};
  if (toTerritory.owner === myNationName) return { success: false, message: "자신의 영토를 공격할 수 없습니다."};

  updates['pendingActions'] = arrayUnion({ 
    fromNation: myNationName, 
    action: 'attack', 
    details: { fromId: fromTerritory.id, toId: toTerritory.id }, 
    turn: gameData.turn 
  });
  
  const loyaltyChange = { '국방': 5, '외교': -5, '재무': -2 };
  await applyLoyaltyChanges(gameRef, gameData, user.uid, loyaltyChange, updates);
  
  try {
    await updateDoc(gameRef, updates);
    return { 
      success: true, 
      message: `${fromTerritory.name}에서 ${toTerritory.name}으로의 공격이 다음 턴에 실행됩니다.` 
    };
  } catch (error) {
    console.error("Firestore 업데이트 중 오류 발생:", error);
    return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
};

/**
 * 군사 훈련 명령을 처리합니다.
 * @param {Object} command - 명령 객체
 * @param {Object} gameData - 게임 데이터
 * @param {string} myNationName - 플레이어 국가 이름
 * @param {Object} user - 현재 사용자 정보
 * @param {Object} gameRef - 게임 문서 참조
 * @param {Object} updates - 업데이트할 필드
 * @param {Object} event - 이벤트 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleBuildMilitaryCommand = async (command, gameData, myNationName, user, gameRef, updates, event) => {
  const engLevel = gameData.nations[myNationName].technologies.engineering.level;
  
  // 향상된 공학 기술 효과 적용
  const discount = 1 - (engLevel * techTree.engineering.discountPerLevel);
  const baseCost = command.value * 10;
  const cost = Math.round(baseCost * discount);
  const savings = baseCost - cost;
  
  // 자원 확인
  if (gameData.nations[myNationName].resources < cost) return { 
    success: false, 
    message: `자원이 부족합니다. (필요: ${cost}, 보유: ${gameData.nations[myNationName].resources})` 
  };

  // 수도 확인
  const capitalId = Object.values(gameData.map.territories).find(t => t.owner === myNationName && t.isCapital)?.id;
  if(!capitalId) return { success: false, message: "수도가 없어 군대를 훈련할 수 없습니다." };

  // 업데이트 필드 설정
  updates[`map.territories.${capitalId}.army`] = increment(command.value);
  updates[`nations.${myNationName}.resources`] = increment(-cost);
  
  // 이벤트 메시지에 공학 기술 할인 정보 추가
  let eventMessage = `수도에서 군사 유닛 ${command.value}개를 훈련했습니다.`;
  if (savings > 0) {
    eventMessage += ` (공학 기술 할인: ${savings} 자원 절약)`;
  }
  
  // 이벤트 추가
  updates['events'] = arrayUnion({ 
    turn: gameData.turn, 
    type: 'military', 
    nation: myNationName, 
    content: eventMessage
  });
  
  // 보좌관 충성도 변경
  const loyaltyChange = { '국방': 3, '재무': -1 };
  await applyLoyaltyChanges(gameRef, gameData, user.uid, loyaltyChange, updates);
  
  try {
    await updateDoc(gameRef, updates);
    return { success: true, message: eventMessage };
  } catch (error) {
    console.error("Firestore 업데이트 중 오류 발생:", error);
    return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
};

/**
 * 기술 연구 명령을 처리합니다.
 * @param {Object} command - 명령 객체
 * @param {Object} gameData - 게임 데이터
 * @param {string} myNationName - 플레이어 국가 이름
 * @param {Object} user - 현재 사용자 정보
 * @param {Object} gameRef - 게임 문서 참조
 * @param {Object} updates - 업데이트할 필드
 * @param {Object} event - 이벤트 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleResearchCommand = async (command, gameData, myNationName, user, gameRef, updates, event) => {
  const techKey = command.tech_name;
  const tech = techTree[techKey];
  
  // 유효성 검사
  if (!tech) return { success: false, message: "존재하지 않는 기술입니다." };
  
  const currentLevel = gameData.nations[myNationName].technologies[techKey].level;
  const cost = tech.baseCost * (currentLevel + 1);
  
  // 자원 확인
  if (gameData.nations[myNationName].resources < cost) return { 
    success: false, 
    message: `연구 자금이 부족합니다. (필요: ${cost})` 
  };

  // 업데이트 필드 설정
  updates[`nations.${myNationName}.resources`] = increment(-cost);
  updates[`nations.${myNationName}.technologies.${techKey}.level`] = increment(1);
  
  // 이벤트 추가
  updates['events'] = arrayUnion({ 
    turn: gameData.turn, 
    type: 'technology', 
    nation: myNationName, 
    content: `'${tech.name}' 기술 연구를 완료했습니다! (레벨 ${currentLevel + 1})` 
  });
  
  // 보좌관 충성도 변경
  const loyaltyChange = { '재무': 5, '국방': 1, '정보': 1 };
  await applyLoyaltyChanges(gameRef, gameData, user.uid, loyaltyChange, updates);
  
  try {
    await updateDoc(gameRef, updates);
    return { 
      success: true, 
      message: `'${tech.name}' 기술 연구를 완료했습니다! (레벨 ${currentLevel + 1})` 
    };
  } catch (error) {
    console.error("Firestore 업데이트 중 오류 발생:", error);
    return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
};

/**
 * 부대 이동 명령을 처리합니다.
 * @param {Object} command - 명령 객체
 * @param {Object} gameData - 게임 데이터
 * @param {string} myNationName - 플레이어 국가 이름
 * @param {Object} gameRef - 게임 문서 참조
 * @param {Object} updates - 업데이트할 필드
 * @param {Object} event - 이벤트 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleMoveTroopsCommand = async (command, gameData, myNationName, gameRef, updates, event) => {
  const fromTerritory = Object.values(gameData.map.territories).find(t => t.name === command.from);
  const toTerritory = Object.values(gameData.map.territories).find(t => t.name === command.to);
  
  // 유효성 검사
  if (!fromTerritory || !toTerritory) return { success: false, message: "잘못된 영토 이름입니다." };
  if (fromTerritory.owner !== myNationName) return { success: false, message: "출발 영토는 당신의 소유가 아닙니다." };
  if (toTerritory.owner !== myNationName) return { success: false, message: "도착 영토는 당신의 소유가 아닙니다." };
  if (!fromTerritory.neighbors.includes(toTerritory.id)) return { success: false, message: "인접하지 않은 영토로는 이동할 수 없습니다."};
  
  const troopsToMove = Math.min(fromTerritory.army - 1, command.value); // 최소 1개 부대는 남겨둠
  if (troopsToMove <= 0) return { 
    success: false, 
    message: "이동할 수 있는 부대가 없습니다. 최소 1개 부대는 영토에 남겨두어야 합니다." 
  };
  
  // 업데이트 필드 설정
  updates[`map.territories.${fromTerritory.id}.army`] = increment(-troopsToMove);
  updates[`map.territories.${toTerritory.id}.army`] = increment(troopsToMove);
  
  // 이벤트 추가
  updates['events'] = arrayUnion({ 
    turn: gameData.turn, 
    type: 'troop_movement', 
    nation: myNationName, 
    content: `${fromTerritory.name}에서 ${toTerritory.name}으로 ${troopsToMove}개 부대를 이동했습니다.` 
  });
  
  // 보좌관 충성도 변경
  const loyaltyChange = { '국방': 2, '정보': 1 };
  await applyLoyaltyChanges(gameRef, gameData, user.uid, loyaltyChange, updates);
  
  try {
    await updateDoc(gameRef, updates);
    return { 
      success: true, 
      message: `${fromTerritory.name}에서 ${toTerritory.name}으로 ${troopsToMove}개 부대를 이동했습니다.` 
    };
  } catch (error) {
    console.error("Firestore 업데이트 중 오류 발생:", error);
    return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
};

/**
 * 보좌관 충성도 변경을 적용합니다.
 * @param {Object} gameRef - 게임 문서 참조
 * @param {Object} gameData - 게임 데이터
 * @param {string} userId - 사용자 ID
 * @param {Object} loyaltyChange - 충성도 변경 객체
 * @param {Object} updates - 업데이트할 필드
 */
const applyLoyaltyChanges = async (gameRef, gameData, userId, loyaltyChange, updates) => {
  if (Object.keys(loyaltyChange).length > 0) {
    for (const advisor in loyaltyChange) {
      updates[`advisors.${userId}.${advisor}.loyalty`] = increment(loyaltyChange[advisor]);
    }
  }
};

export default {
  executeCommand
};