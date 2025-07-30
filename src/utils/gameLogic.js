/**
 * 게임 로직 유틸리티: 턴 처리 및 게임 상태 업데이트 함수를 제공합니다.
 */
import { doc, updateDoc, arrayUnion, writeBatch, increment } from 'firebase/firestore';
import { techTree } from '../data';
import { ai as aiService } from '../services';

/**
 * 턴 처리 함수: 모든 플레이어가 턴을 종료하면 실행되는 핵심 로직입니다.
 * @param {Object} db - Firestore 데이터베이스 인스턴스
 * @param {Object} gameData - 현재 게임 데이터
 * @returns {Promise<void>}
 */
export const processTurn = async (db, gameData) => {
  const batch = writeBatch(db);
  const gameRef = doc(db, 'games', gameData.id);
  // 데이터의 안전한 처리를 위해 깊은 복사(deep copy) 사용
  let updatedMap = JSON.parse(JSON.stringify(gameData.map));
  let updatedNations = JSON.parse(JSON.stringify(gameData.nations));
  let updatedPlayers = JSON.parse(JSON.stringify(gameData.players));
  let updatedAdvisors = JSON.parse(JSON.stringify(gameData.advisors));
  let newEvents = [];

  // [1] 보좌관 배신 단계
  await processAdvisorBetrayal(updatedPlayers, updatedAdvisors, updatedNations, gameData.turn, newEvents);
  
  // [2] 동적 이벤트 발생 단계
  await processDynamicEvents(gameData, updatedNations, updatedMap, newEvents);
  
  // [3] 전투 단계
  processBattles(gameData, updatedMap, updatedNations, updatedPlayers, newEvents);
  
  // [4] 자원 생산 단계
  processResourceProduction(updatedPlayers, updatedNations, updatedMap, gameData.turn, newEvents);
  
  // [5] 안정도 업데이트
  processStabilityUpdates(updatedPlayers, updatedNations, updatedAdvisors, gameData.turn, newEvents);
  
  // [6] 승리 조건 확인
  const activePlayers = updatedPlayers.filter(p => p.status === 'playing');
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    newEvents.push({
      turn: gameData.turn,
      type: 'victory',
      content: `${winner.nation}이 최후의 승자가 되었습니다!`
    });

    // 게임 종료 상태 업데이트
    batch.update(gameRef, {
      status: 'finished',
      winner: winner.nation,
      players: updatedPlayers,
      nations: updatedNations,
      map: updatedMap,
      advisors: updatedAdvisors,
      events: [...gameData.events, ...newEvents],
      turn: gameData.turn + 1,
      pendingActions: []
    });
  } else {
    // 다음 턴 준비
    updatedPlayers.forEach(p => { p.isTurnReady = false; });

    batch.update(gameRef, {
      players: updatedPlayers,
      nations: updatedNations,
      map: updatedMap,
      advisors: updatedAdvisors,
      events: [...gameData.events, ...newEvents],
      turn: gameData.turn + 1,
      pendingActions: []
    });
  }

  await batch.commit();
};

/**
 * 보좌관 배신 처리 함수
 * @param {Array} players - 플레이어 목록
 * @param {Object} advisors - 보좌관 정보
 * @param {Object} nations - 국가 정보
 * @param {number} turn - 현재 턴
 * @param {Array} events - 이벤트 목록
 */
const processAdvisorBetrayal = async (players, advisors, nations, turn, events) => {
  for (const player of players) {
    if (player.status !== 'playing') continue;
    const playerAdvisors = advisors[player.uid];
    const playerNation = nations[player.nation];
    for (const advisorType in playerAdvisors) {
      const advisor = playerAdvisors[advisorType];
      if (advisor.loyalty < 20 && Math.random() < 0.33) {
        const stolenResources = Math.floor(playerNation.resources * 0.1);
        playerNation.resources -= stolenResources;
        events.push({
          turn: turn,
          type: 'betrayal',
          nation: player.nation,
          content: `[비밀 보고] ${advisorType} 장관의 횡령으로 자원 ${stolenResources}이 사라졌습니다!`,
          isPrivate: true,
          recipient: player.uid
        });
        events.push({
          turn: turn,
          type: 'economy',
          nation: player.nation,
          content: `국고에서 원인 불명의 자원 손실이 발생했습니다.`
        });
      }
    }
  }
};

/**
 * 동적 이벤트 처리 함수
 * @param {Object} gameData - 게임 데이터
 * @param {Object} nations - 국가 정보
 * @param {Object} map - 지도 정보
 * @param {Array} events - 이벤트 목록
 */
const processDynamicEvents = async (gameData, nations, map, events) => {
  if (Math.random() < 0.25) {
    const systemPrompt = `당신은 이 지정학 게임의 스토리텔러입니다. 현재 게임 상황을 바탕으로 흥미로운 무작위 이벤트를 생성하세요. 결과는 반드시 다음 JSON 형식이어야 합니다: {"title": "이벤트 제목", "description": "이벤트 설명", "effects": [{"nation": "국가명", "effect": "자원변경/안정도변경/군사력변경/기술발전", "value": 숫자, "tech_name": "기술명(기술발전인 경우만)"}]}. 효과는 게임에 참여중인 국가 중 하나 이상에 적용되어야 합니다.`;
    const userPrompt = `현재 게임 상태: ${JSON.stringify(gameData.nations)}`;
    const eventResult = await aiService.callGroqLlmApi(userPrompt, systemPrompt);
    if (eventResult && !eventResult.error && eventResult.effects) {
      events.push({
        turn: gameData.turn,
        type: 'dynamic_event',
        content: `${eventResult.title}: ${eventResult.description}`
      });
      for (const effect of eventResult.effects) {
        if (nations[effect.nation]) {
          if (effect.effect === '자원변경') {
            nations[effect.nation].resources += effect.value;
          } else if (effect.effect === '안정도변경') {
            nations[effect.nation].stability = Math.max(0, Math.min(100, nations[effect.nation].stability + effect.value));
          } else if (effect.effect === '군사력변경') {
            // 군사력 변경은 수도에 적용
            const capitalId = Object.values(map.territories)
              .find(t => t.owner === effect.nation && t.isCapital)?.id;
            if (capitalId) {
              map.territories[capitalId].army = Math.max(0, map.territories[capitalId].army + effect.value);
            }
          } else if (effect.effect === '기술발전' && effect.tech_name && techTree[effect.tech_name]) {
            // 기술 레벨 향상
            const techKey = effect.tech_name;
            if (nations[effect.nation].technologies[techKey]) {
              nations[effect.nation].technologies[techKey].level += effect.value;
              events.push({
                turn: gameData.turn,
                type: 'technology',
                nation: effect.nation,
                content: `${effect.nation}이(가) ${techTree[techKey].name} 기술에서 돌파구를 발견했습니다! (레벨 +${effect.value})`
              });
            }
          }
        }
      }
    }
  }
};

/**
 * 전투 처리 함수
 * @param {Object} gameData - 게임 데이터
 * @param {Object} map - 지도 정보
 * @param {Object} nations - 국가 정보
 * @param {Array} players - 플레이어 목록
 * @param {Array} events - 이벤트 목록
 */
const processBattles = (gameData, map, nations, players, events) => {
  // 전투 순서를 결정 (동시 공격 처리를 위해 정렬)
  const attackActions = gameData.pendingActions
    .filter(a => a.action === 'attack' && a.turn === gameData.turn)
    .sort((a, b) => {
      // 수도 방어가 우선 (수도 방어 > 일반 방어 > 공격)
      const aToTerritory = map.territories[a.details.toId];
      const bToTerritory = map.territories[b.details.toId];
      
      if (aToTerritory.isCapital && !bToTerritory.isCapital) return -1;
      if (!aToTerritory.isCapital && bToTerritory.isCapital) return 1;
      
      // 그 외에는 무작위 순서 (하지만 일관성을 위해 ID로 정렬)
      return a.details.fromId.localeCompare(b.details.fromId);
    });
  
  // 전투 처리
  for (const action of attackActions) {
    const { fromId, toId } = action.details;
    const attackerTerritory = map.territories[fromId];
    const defenderTerritory = map.territories[toId];
    const attackerNation = action.fromNation;
    const defenderNation = defenderTerritory.owner;

    // 유효성 검사
    if (attackerTerritory.owner !== attackerNation || defenderTerritory.owner === attackerNation) {
      events.push({
        turn: gameData.turn,
        type: 'battle_error',
        content: `${attackerNation}의 ${attackerTerritory.name}에서 ${defenderTerritory.name}로의 공격이 무효화되었습니다. (소유권 변경)`
      });
      continue;
    }

    // 공학 기술 레벨에 따른 전투력 보너스 적용 (보너스 증가: 5% -> 8% per level)
    const attackerEngLevel = nations[attackerNation]?.technologies?.engineering?.level || 0;
    const defenderEngLevel = defenderNation ? nations[defenderNation]?.technologies?.engineering?.level || 0 : 0;
    
    const attackerBonus = attackerEngLevel * (techTree.engineering.combatBonusPerLevel + 0.03);
    const defenderBonus = defenderEngLevel * (techTree.engineering.combatBonusPerLevel + 0.03);
    
    // 방어측 지형 보너스 (수비 이점)
    const defenderTerrainBonus = 0.1; // 10% 방어 보너스
    
    // 수도 방어 보너스
    const capitalDefenseBonus = defenderTerritory.isCapital ? 0.2 : 0; // 수도는 20% 추가 방어 보너스
    
    // 전투력 계산 (랜덤성 감소: 20% -> 10%)
    const randomFactor = 0.1; // 랜덤 요소 감소
    const attackerRandom = 1 + (Math.random() * randomFactor);
    const defenderRandom = 1 + (Math.random() * randomFactor);
    
    const attackerPower = attackerTerritory.army * attackerRandom * (1 + attackerBonus);
    const defenderPower = defenderTerritory.army * defenderRandom * (1 + defenderBonus + defenderTerrainBonus + capitalDefenseBonus);
    
    // 전투 결과 계산 (손실률 조정)
    const totalPower = attackerPower + defenderPower;
    
    // 손실률 계산 (더 예측 가능하게 조정)
    // 기본 손실률은 상대방의 전투력 비율에 비례하지만, 최소/최대 손실률 제한
    const MIN_LOSS_RATE = 0.1; // 최소 10% 손실
    const MAX_LOSS_RATE = 0.7; // 최대 70% 손실
    
    let attackerLossRate = (defenderPower / totalPower) * 1.1; // 약간 더 높은 손실률
    let defenderLossRate = (attackerPower / totalPower) * 1.0;
    
    // 손실률 제한 적용
    attackerLossRate = Math.max(MIN_LOSS_RATE, Math.min(MAX_LOSS_RATE, attackerLossRate));
    defenderLossRate = Math.max(MIN_LOSS_RATE, Math.min(MAX_LOSS_RATE, defenderLossRate));
    
    // 최종 손실 계산
    const attackerLosses = Math.round(attackerTerritory.army * attackerLossRate);
    const defenderLosses = Math.round(defenderTerritory.army * defenderLossRate);
    
    // 전투 결과 적용
    attackerTerritory.army -= attackerLosses;
    defenderTerritory.army -= defenderLosses;
    
    // 전투 상세 정보 생성
    const battleDetails = {
      attackerArmy: attackerTerritory.army + attackerLosses,
      defenderArmy: defenderTerritory.army + defenderLosses,
      attackerBonus: Math.round(attackerBonus * 100),
      defenderBonus: Math.round((defenderBonus + defenderTerrainBonus + capitalDefenseBonus) * 100),
      attackerLosses,
      defenderLosses
    };
    
    // 전투 이벤트 추가
    events.push({
      turn: gameData.turn,
      type: 'battle',
      content: `${attackerNation}의 ${attackerTerritory.name}(${battleDetails.attackerArmy}명)가 ${defenderNation ? defenderNation + '의 ' : ''}${defenderTerritory.name}(${battleDetails.defenderArmy}명)를 공격! 피해: (공격측: ${attackerLosses}, 수비측: ${defenderLosses})`,
      details: battleDetails
    });

    // 전투 결과에 따른 영토 점령 처리
    if (defenderTerritory.army <= 0) {
      // 점령 처리
      const previousOwner = defenderTerritory.owner;
      defenderTerritory.owner = attackerNation;
      
      // 점령 후 군대 배치 (공격 군대의 일부만 이동)
      const occupyingForce = Math.max(1, Math.floor(attackerTerritory.army * 0.6));
      defenderTerritory.army = occupyingForce;
      attackerTerritory.army = Math.max(0, attackerTerritory.army - occupyingForce);
      
      events.push({
        turn: gameData.turn,
        type: 'conquest',
        content: `${attackerNation}이 ${defenderTerritory.name}을 점령했습니다! (주둔군: ${occupyingForce}명)`
      });

      // 수도 점령 시 국가 멸망 처리
      if (defenderTerritory.isCapital && previousOwner) {
        // 멸망 처리
        nations[previousOwner].status = 'eliminated';
        const eliminatedPlayer = players.find(p => p.nation === previousOwner);
        if (eliminatedPlayer) eliminatedPlayer.status = 'eliminated';
        
        // 멸망 이벤트 추가
        events.push({
          turn: gameData.turn,
          type: 'elimination',
          content: `${previousOwner}의 수도가 함락되어 멸망했습니다! ${attackerNation}의 승리!`
        });
        
        // 멸망한 국가의 모든 영토를 정복자에게 이전
        Object.values(map.territories).forEach(territory => {
          if (territory.owner === previousOwner && territory.id !== defenderTerritory.id) {
            territory.owner = attackerNation;
            // 최소 주둔군 배치
            territory.army = Math.max(1, Math.floor(territory.army * 0.3));
            
            events.push({
              turn: gameData.turn,
              type: 'conquest',
              content: `${attackerNation}이 멸망한 ${previousOwner}의 영토 ${territory.name}을 획득했습니다.`
            });
          }
        });
      }
    }
  }
};

/**
 * 자원 생산 처리 함수
 * @param {Array} players - 플레이어 목록
 * @param {Object} nations - 국가 정보
 * @param {Object} map - 지도 정보
 * @param {number} turn - 현재 턴
 * @param {Array} events - 이벤트 목록
 */
const processResourceProduction = (players, nations, map, turn, events) => {
  for (const player of players) {
    if (player.status !== 'playing') continue;
    const nation = nations[player.nation];
    const territories = Object.values(map.territories).filter(t => t.owner === player.nation);
    const agricultureLevel = nation.technologies.agriculture.level;
    
    // 기본 생산량 증가 (50 -> 75) 및 최소 생산량 보장
    const basePerTerritory = 75; // 영토당 기본 생산량 증가
    const minimumProduction = 100; // 최소 생산량 보장
    
    // 향상된 농업 기술 효과 적용 (효과 증가: 10% -> 15% per level)
    const baseProduction = Math.max(territories.length * basePerTerritory, minimumProduction);
    const bonusRate = agricultureLevel * (techTree.agriculture.effectPerLevel + 0.05); // 효과 증가
    const bonus = Math.floor(baseProduction * bonusRate);
    const totalProduction = baseProduction + bonus;
    
    // 자원 회복 메커니즘: 자원이 매우 적을 경우 추가 보너스 제공
    let recoveryBonus = 0;
    if (nation.resources < 100) {
      recoveryBonus = Math.floor((100 - nation.resources) * 0.5); // 부족한 자원의 50%를 추가 보너스로 제공
      events.push({
        turn: turn,
        type: 'economy',
        nation: player.nation,
        content: `자원 위기 회복 보조금 ${recoveryBonus}이 지급되었습니다.`
      });
    }
    
    nation.resources += totalProduction + recoveryBonus;
    
    // 자원 상한선 설정 (선택적)
    const resourceCap = 2000 + (agricultureLevel * 500); // 기본 2000 + 농업 레벨당 500 추가
    if (nation.resources > resourceCap) {
      nation.resources = resourceCap;
      events.push({
        turn: turn,
        type: 'economy',
        nation: player.nation,
        content: `자원 저장 한도(${resourceCap})에 도달했습니다.`
      });
    }
    
    events.push({
      turn: turn,
      type: 'production',
      nation: player.nation,
      content: `자원 ${totalProduction + recoveryBonus} 생산 (기본: ${baseProduction}, 농업 보너스: ${bonus}, 회복 보너스: ${recoveryBonus}, 농업 레벨: ${agricultureLevel})`
    });
  }
};

/**
 * 안정도 및 보좌관 충성도 업데이트 처리 함수
 * @param {Array} players - 플레이어 목록
 * @param {Object} nations - 국가 정보
 * @param {Object} advisors - 보좌관 정보
 * @param {number} turn - 현재 턴
 * @param {Array} events - 이벤트 목록
 */
const processStabilityUpdates = (players, nations, advisors, turn, events) => {
  for (const player of players) {
    if (player.status !== 'playing') continue;
    const nation = nations[player.nation];
    const playerAdvisors = advisors[player.uid];

    // 보좌관 충성도 자연 회복 및 최소 충성도 보장
    const MIN_LOYALTY = 15; // 최소 충성도 보장
    const NATURAL_RECOVERY = 2; // 자연 회복량
    const HIGH_STABILITY_BONUS = 1; // 높은 안정도 보너스
    
    let loyaltyChanges = {};
    let lowLoyaltyCount = 0;
    
    for (const advisorType in playerAdvisors) {
      const advisor = playerAdvisors[advisorType];
      let loyaltyChange = 0;
      
      // 최소 충성도 보장
      if (advisor.loyalty < MIN_LOYALTY) {
        loyaltyChange += (MIN_LOYALTY - advisor.loyalty);
        events.push({
          turn: turn,
          type: 'advisor',
          nation: player.nation,
          content: `${advisorType} 장관의 충성도가 최소 수준(${MIN_LOYALTY})으로 회복되었습니다.`,
          isPrivate: true,
          recipient: player.uid
        });
      } 
      // 자연 회복 (낮은 충성도일수록 더 빠르게 회복)
      else if (advisor.loyalty < 50) {
        const recoveryRate = NATURAL_RECOVERY + Math.floor((50 - advisor.loyalty) / 10);
        loyaltyChange += recoveryRate;
      }
      // 높은 안정도 보너스
      if (nation.stability > 80) {
        loyaltyChange += HIGH_STABILITY_BONUS;
      }
      
      // 충성도 업데이트
      if (loyaltyChange !== 0) {
        const newLoyalty = Math.min(100, advisor.loyalty + loyaltyChange);
        playerAdvisors[advisorType].loyalty = newLoyalty;
        loyaltyChanges[advisorType] = loyaltyChange;
      }
      
      // 낮은 충성도 보좌관 카운트
      if (advisor.loyalty < 30) {
        lowLoyaltyCount++;
      }
    }
    
    // 충성도 변화 이벤트 추가
    if (Object.keys(loyaltyChanges).length > 0) {
      const loyaltyChangeText = Object.entries(loyaltyChanges)
        .map(([type, change]) => `${type}: +${change}`)
        .join(', ');
      
      events.push({
        turn: turn,
        type: 'advisor',
        nation: player.nation,
        content: `보좌관 충성도 변화: ${loyaltyChangeText}`,
        isPrivate: true,
        recipient: player.uid
      });
    }

    // 낮은 충성도 보좌관으로 인한 안정도 감소 (완화됨)
    let stabilityChange = 0;
    if (lowLoyaltyCount > 0) {
      // 이전: 보좌관당 -2, 변경: 첫 번째 보좌관 -1, 두 번째 -1, 세 번째 이상 -2
      stabilityChange -= Math.min(lowLoyaltyCount, 2) + (lowLoyaltyCount > 2 ? lowLoyaltyCount - 2 : 0);
    }

    // 자원 부족으로 인한 안정도 감소 (완화됨: -5 -> -3)
    if (nation.resources < 100) {
      stabilityChange -= 3;
    }
    
    // 안정도 자연 회복 (매우 낮은 안정도일 경우)
    if (nation.stability < 20) {
      stabilityChange += 1; // 매우 낮은 안정도에서 약간의 자연 회복
      events.push({
        turn: turn,
        type: 'stability',
        nation: player.nation,
        content: `국가 위기 관리로 안정도가 약간 회복되었습니다.`
      });
    }

    // 안정도 업데이트
    nation.stability = Math.max(0, Math.min(100, nation.stability + stabilityChange));

    if (stabilityChange !== 0) {
      events.push({
        turn: turn,
        type: 'stability',
        nation: player.nation,
        content: `안정도가 ${stabilityChange > 0 ? '+' : ''}${stabilityChange} 변화했습니다.`
      });
    }

    // 안정도가 0이 되면 국가 멸망 (경고 메시지 추가)
    if (nation.stability <= 10 && nation.stability > 0) {
      events.push({
        turn: turn,
        type: 'warning',
        nation: player.nation,
        content: `경고: 안정도가 매우 낮습니다(${nation.stability})! 안정도가 0이 되면 국가가 붕괴합니다.`,
        isPrivate: true,
        recipient: player.uid
      });
    } else if (nation.stability <= 0) {
      nation.status = 'eliminated';
      player.status = 'eliminated';
      events.push({
        turn: turn,
        type: 'collapse',
        content: `${player.nation}이 내부 혼란으로 붕괴했습니다!`
      });
    }
  }
};

export default {
  processTurn
};