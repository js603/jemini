/**
 * 명령 처리 유틸리티: 게임 내 명령을 처리하는 함수들을 제공합니다.
 */
import { doc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { techTree } from '../data';

/**
 * 명령 실행 함수: 플레이어가 내린 명령을 해석하고 실행합니다.
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {string} gameId - 게임 ID
 * @param {Object} gameData - 현재 게임 데이터
 * @param {Object} user - 현재 사용자 정보
 * @param {Object} command - 실행할 명령 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
export const executeCommand = async (db, gameId, gameData, user, command) => {
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

  // AI 보좌관 명령 처리
  if (command.action === 'advisor_command') {
    return await handleAdvisorCommand(db, gameId, gameData, user, command);
  }

  const gameRef = doc(db, 'games', gameId);
  let updates = {};
  let event = null;
  let loyaltyChange = {};

  // 공격 명령 처리
  if (command.action === 'attack') {
    return await handleAttackCommand(db, gameId, gameData, myNationName, command);
  }
  // 군사 훈련 명령 처리
  else if (command.action === 'build_military') {
    return await handleBuildMilitaryCommand(db, gameId, gameData, myNationName, command);
  }
  // 기술 연구 명령 처리
  else if (command.action === 'research') {
    return await handleResearchCommand(db, gameId, gameData, myNationName, command);
  }
  // 부대 이동 명령 처리
  else if (command.action === 'move_troops') {
    return await handleMoveTroopsCommand(db, gameId, gameData, myNationName, command);
  }

  return { success: false, message: "알 수 없는 명령입니다." };
};

/**
 * AI 보좌관 명령 처리 함수
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {string} gameId - 게임 ID
 * @param {Object} gameData - 현재 게임 데이터
 * @param {Object} user - 현재 사용자 정보
 * @param {Object} command - 실행할 명령 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleAdvisorCommand = async (db, gameId, gameData, user, command) => {
  const myNationName = gameData.players.find(p => p.uid === user.uid)?.nation;
  const advisor = command.advisor;
  const userCommand = command.command;

  // 여기서 AI 서비스를 호출하여 명령을 해석하고 적절한 게임 명령으로 변환할 수 있습니다.
  // 현재는 간단한 키워드 기반 해석을 구현합니다.

  const advisorPersonas = {
    '국방': { name: "국방부 장관", persona: "당신은 '매파'이며, 군사적 해결책을 선호합니다.", ambition: '군사력 극대화' },
    '재무': { name: "재무부 장관", persona: "당신은 신중한 '관료'이며, 경제적 안정성을 최우선으로 생각합니다.", ambition: '국고 최대화' },
    '외교': { name: "외교부 장관", persona: "당신은 '비둘기파'이며, 대화와 협상을 선호합니다.", ambition: '모든 국가와 동맹' },
    '정보': { name: "정보부 장관", persona: "당신은 '현실주의자'이며, 첩보와 공작을 선호합니다.", ambition: '정보망 장악' }
  };

  const systemPrompt = `${advisorPersonas[advisor].persona} 당신의 야망은 "${advisorPersonas[advisor].ambition}"입니다. 
  사용자의 명령을 분석하고 다음 중 하나의 액션으로 변환하세요:
  1. attack: 영토 공격 (from, to 영토명 필요)
  2. build_military: 군사 훈련 (value: 숫자)
  3. research: 기술 연구 (tech_name: agriculture/engineering/espionage)
  4. move_troops: 부대 이동 (from, to 영토명, value: 이동할 병력 수)
  5. invalid: 잘못된 명령
  
  JSON 형식으로 응답: {"action": "액션명", "from": "출발영토", "to": "목표영토", "value": 숫자, "tech_name": "기술명", "explanation": "설명"}`;

  const territories = Object.values(gameData.map.territories)
      .filter(t => t.owner === myNationName)
      .map(t => t.name);

  const userPrompt = `현재 보유 영토: ${territories.join(', ')}
  현재 자원: ${gameData.nations[myNationName].resources}
  사용자 명령: "${userCommand}"`;

  // 여기서 AI 서비스를 호출하여 명령을 해석합니다.
  // 실제 구현에서는 aiService.callGroqLlmApi(userPrompt, systemPrompt)를 호출할 수 있습니다.
  // 현재는 간단한 키워드 기반 해석을 구현합니다.

  let parsedCommand = { action: 'invalid', explanation: '명령을 이해할 수 없습니다.' };

  // 간단한 키워드 기반 해석 (실제 구현에서는 AI 서비스를 사용)
  if (userCommand.includes('공격')) {
    // 공격 명령 해석
    const territories = Object.values(gameData.map.territories);
    const myTerritories = territories.filter(t => t.owner === myNationName);
    const enemyTerritories = territories.filter(t => t.owner !== myNationName && t.owner !== null);
    
    if (myTerritories.length > 0 && enemyTerritories.length > 0) {
      // 간단한 예시: 첫 번째 내 영토에서 첫 번째 적 영토 공격
      parsedCommand = {
        action: 'attack',
        from: myTerritories[0].name,
        to: enemyTerritories[0].name,
        explanation: `${myTerritories[0].name}에서 ${enemyTerritories[0].name}을(를) 공격합니다.`
      };
    }
  } else if (userCommand.includes('훈련') || userCommand.includes('군대')) {
    // 군사 훈련 명령 해석
    const match = userCommand.match(/\d+/);
    const value = match ? parseInt(match[0]) : 10;
    
    parsedCommand = {
      action: 'build_military',
      value: value,
      explanation: `${value}명의 군대를 훈련합니다.`
    };
  } else if (userCommand.includes('연구') || userCommand.includes('기술')) {
    // 기술 연구 명령 해석
    let techName = 'agriculture'; // 기본값
    
    if (userCommand.includes('농업')) techName = 'agriculture';
    else if (userCommand.includes('공학')) techName = 'engineering';
    else if (userCommand.includes('첩보')) techName = 'espionage';
    else if (userCommand.includes('외교')) techName = 'diplomacy';
    
    parsedCommand = {
      action: 'research',
      tech_name: techName,
      explanation: `${techTree[techName].name} 기술을 연구합니다.`
    };
  } else if (userCommand.includes('이동')) {
    // 부대 이동 명령 해석
    const territories = Object.values(gameData.map.territories);
    const myTerritories = territories.filter(t => t.owner === myNationName);
    
    if (myTerritories.length >= 2) {
      const match = userCommand.match(/\d+/);
      const value = match ? parseInt(match[0]) : 5;
      
      parsedCommand = {
        action: 'move_troops',
        from: myTerritories[0].name,
        to: myTerritories[1].name,
        value: value,
        explanation: `${myTerritories[0].name}에서 ${myTerritories[1].name}으로 ${value}명의 부대를 이동합니다.`
      };
    }
  }

  if (parsedCommand.action === 'invalid') {
    return { success: false, message: `${advisorPersonas[advisor].name}: ${parsedCommand.explanation}` };
  }

  // 해석된 명령 실행
  let result;
  
  if (parsedCommand.action === 'attack') {
    result = await handleAttackCommand(db, gameId, gameData, myNationName, parsedCommand);
  } else if (parsedCommand.action === 'build_military') {
    result = await handleBuildMilitaryCommand(db, gameId, gameData, myNationName, parsedCommand);
  } else if (parsedCommand.action === 'research') {
    result = await handleResearchCommand(db, gameId, gameData, myNationName, parsedCommand);
  } else if (parsedCommand.action === 'move_troops') {
    result = await handleMoveTroopsCommand(db, gameId, gameData, myNationName, parsedCommand);
  }

  return {
    success: result.success,
    message: `${advisorPersonas[advisor].name}: ${parsedCommand.explanation}\n결과: ${result.message}`
  };
};

/**
 * 공격 명령 처리 함수
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {string} gameId - 게임 ID
 * @param {Object} gameData - 현재 게임 데이터
 * @param {string} myNationName - 현재 플레이어의 국가 이름
 * @param {Object} command - 실행할 명령 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleAttackCommand = async (db, gameId, gameData, myNationName, command) => {
  const fromTerritory = Object.values(gameData.map.territories).find(t => t.name === command.from);
  const toTerritory = Object.values(gameData.map.territories).find(t => t.name === command.to);
  
  if (!fromTerritory || !toTerritory) return { success: false, message: "잘못된 영토 이름입니다." };
  if (fromTerritory.owner !== myNationName) return { success: false, message: "공격을 시작할 영토는 당신의 소유가 아닙니다." };
  if (fromTerritory.army <= 0) return { success: false, message: "공격에 사용할 군대가 없습니다." };
  if (!fromTerritory.neighbors.includes(toTerritory.id)) return { success: false, message: "인접하지 않은 영토는 공격할 수 없습니다."};
  if (toTerritory.owner === myNationName) return { success: false, message: "자신의 영토를 공격할 수 없습니다."};

  const gameRef = doc(db, 'games', gameId);
  const updates = {
    'pendingActions': arrayUnion({ 
      fromNation: myNationName, 
      action: 'attack', 
      details: { fromId: fromTerritory.id, toId: toTerritory.id }, 
      turn: gameData.turn 
    })
  };

  // 보좌관 충성도 변경
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.국방.loyalty`] = increment(5);
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.외교.loyalty`] = increment(-5);
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.재무.loyalty`] = increment(-2);

  try {
    await updateDoc(gameRef, updates);
    return { success: true, message: `${fromTerritory.name}에서 ${toTerritory.name}을(를) 공격합니다. 결과는 턴 종료 후 확인할 수 있습니다.` };
  } catch (error) {
    console.error("Firestore 업데이트 중 오류 발생:", error);
    return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
};

/**
 * 군사 훈련 명령 처리 함수
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {string} gameId - 게임 ID
 * @param {Object} gameData - 현재 게임 데이터
 * @param {string} myNationName - 현재 플레이어의 국가 이름
 * @param {Object} command - 실행할 명령 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleBuildMilitaryCommand = async (db, gameId, gameData, myNationName, command) => {
  const engLevel = gameData.nations[myNationName].technologies.engineering.level;
  // 향상된 공학 기술 효과 적용
  const discount = 1 - (engLevel * techTree.engineering.discountPerLevel);
  const baseCost = command.value * 10;
  const cost = Math.round(baseCost * discount);
  const savings = baseCost - cost;
  
  if (gameData.nations[myNationName].resources < cost) return { 
    success: false, 
    message: `자원이 부족합니다. (필요: ${cost}, 보유: ${gameData.nations[myNationName].resources})` 
  };

  const capitalId = Object.values(gameData.map.territories).find(t => t.owner === myNationName && t.isCapital)?.id;
  if(!capitalId) return { success: false, message: "수도가 없어 군대를 훈련할 수 없습니다." };

  const gameRef = doc(db, 'games', gameId);
  const updates = {};
  
  updates[`map.territories.${capitalId}.army`] = increment(command.value);
  updates[`nations.${myNationName}.resources`] = increment(-cost);
  
  // 이벤트 메시지에 공학 기술 할인 정보 추가
  let eventMessage = `수도에서 군사 유닛 ${command.value}개를 훈련했습니다.`;
  if (savings > 0) {
    eventMessage += ` (공학 기술 할인: ${savings} 자원 절약)`;
  }
  
  updates['events'] = arrayUnion({ 
    turn: gameData.turn, 
    type: 'military', 
    nation: myNationName, 
    content: eventMessage
  });
  
  // 보좌관 충성도 변경
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.국방.loyalty`] = increment(3);
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.재무.loyalty`] = increment(-1);

  try {
    await updateDoc(gameRef, updates);
    return { success: true, message: eventMessage };
  } catch (error) {
    console.error("Firestore 업데이트 중 오류 발생:", error);
    return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
};

/**
 * 기술 연구 명령 처리 함수
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {string} gameId - 게임 ID
 * @param {Object} gameData - 현재 게임 데이터
 * @param {string} myNationName - 현재 플레이어의 국가 이름
 * @param {Object} command - 실행할 명령 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleResearchCommand = async (db, gameId, gameData, myNationName, command) => {
  const techKey = command.tech_name;
  const tech = techTree[techKey];
  
  if (!tech) return { success: false, message: "존재하지 않는 기술입니다." };
  
  const currentLevel = gameData.nations[myNationName].technologies[techKey].level;
  const cost = tech.baseCost * (currentLevel + 1);
  
  if (gameData.nations[myNationName].resources < cost) return { 
    success: false, 
    message: `연구 자금이 부족합니다. (필요: ${cost})` 
  };

  const gameRef = doc(db, 'games', gameId);
  const updates = {};
  
  updates[`nations.${myNationName}.resources`] = increment(-cost);
  updates[`nations.${myNationName}.technologies.${techKey}.level`] = increment(1);
  updates['events'] = arrayUnion({ 
    turn: gameData.turn, 
    type: 'technology', 
    nation: myNationName, 
    content: `'${tech.name}' 기술 연구를 완료했습니다! (레벨 ${currentLevel + 1})` 
  });
  
  // 보좌관 충성도 변경
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.재무.loyalty`] = increment(5);
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.국방.loyalty`] = increment(1);
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.정보.loyalty`] = increment(1);

  try {
    await updateDoc(gameRef, updates);
    return { success: true, message: `'${tech.name}' 기술 연구를 완료했습니다! (레벨 ${currentLevel + 1})` };
  } catch (error) {
    console.error("Firestore 업데이트 중 오류 발생:", error);
    return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
};

/**
 * 부대 이동 명령 처리 함수
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {string} gameId - 게임 ID
 * @param {Object} gameData - 현재 게임 데이터
 * @param {string} myNationName - 현재 플레이어의 국가 이름
 * @param {Object} command - 실행할 명령 객체
 * @returns {Promise<Object>} - 명령 실행 결과
 */
const handleMoveTroopsCommand = async (db, gameId, gameData, myNationName, command) => {
  const fromTerritory = Object.values(gameData.map.territories).find(t => t.name === command.from);
  const toTerritory = Object.values(gameData.map.territories).find(t => t.name === command.to);
  
  // 유효성 검사
  if (!fromTerritory || !toTerritory) return { success: false, message: "잘못된 영토 이름입니다." };
  if (fromTerritory.owner !== myNationName) return { success: false, message: "출발 영토는 당신의 소유가 아닙니다." };
  if (toTerritory.owner !== myNationName) return { success: false, message: "도착 영토는 당신의 소유가 아닙니다." };
  if (!fromTerritory.neighbors.includes(toTerritory.id)) return { success: false, message: "인접하지 않은 영토로는 이동할 수 없습니다."};
  
  const troopsToMove = Math.min(fromTerritory.army - 1, command.value); // 최소 1개 부대는 남겨둠
  if (troopsToMove <= 0) return { success: false, message: "이동할 수 있는 부대가 없습니다. 최소 1개 부대는 영토에 남겨두어야 합니다." };
  
  const gameRef = doc(db, 'games', gameId);
  const updates = {};
  
  // 부대 이동 처리
  updates[`map.territories.${fromTerritory.id}.army`] = increment(-troopsToMove);
  updates[`map.territories.${toTerritory.id}.army`] = increment(troopsToMove);
  updates['events'] = arrayUnion({ 
    turn: gameData.turn, 
    type: 'troop_movement', 
    nation: myNationName, 
    content: `${fromTerritory.name}에서 ${toTerritory.name}으로 ${troopsToMove}개 부대를 이동했습니다.` 
  });
  
  // 보좌관 충성도 변경
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.국방.loyalty`] = increment(2);
  updates[`advisors.${gameData.players.find(p => p.nation === myNationName).uid}.정보.loyalty`] = increment(1);

  try {
    await updateDoc(gameRef, updates);
    return { success: true, message: `${fromTerritory.name}에서 ${toTerritory.name}으로 ${troopsToMove}개 부대를 이동했습니다.` };
  } catch (error) {
    console.error("Firestore 업데이트 중 오류 발생:", error);
    return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
};

export default {
  executeCommand,
  handleAttackCommand,
  handleBuildMilitaryCommand,
  handleResearchCommand,
  handleMoveTroopsCommand,
  handleAdvisorCommand
};