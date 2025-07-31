import React, { useState } from "react";
import { useGameStore } from "../store/gameSlice";
import "../styles/MilitaryCommand.css";

// MilitaryCommand.jsx - 대형 SLG를 위한 군사 지휘 컴포넌트
const MilitaryCommand = () => {
  const gameState = useGameStore();
  const { 
    army,
    gold,
    iron,
    territories,
    discoveredTerritories,
    military_technology,
    military_readiness,
    military_defense,
    faction_east_relation,
    faction_west_relation,
    faction_south_relation,
    faction_north_relation
  } = gameState;
  
  const [activeTab, setActiveTab] = useState("units"); // units, armies, battles
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedArmy, setSelectedArmy] = useState(null);
  const [showRecruitModal, setShowRecruitModal] = useState(false);
  const [recruitAmount, setRecruitAmount] = useState(10);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [armyToMove, setArmyToMove] = useState(null);
  const [selectedDestination, setSelectedDestination] = useState(null);
  
  // 유닛 타입 정의
  const unitTypes = [
    {
      id: "infantry",
      name: "보병",
      icon: "⚔️",
      description: "기본적인 지상 전투 유닛으로, 방어에 강점이 있습니다.",
      attack: 5,
      defense: 8,
      speed: 3,
      cost: { gold: 10, iron: 2 },
      upkeep: 2,
      techRequired: 0
    },
    {
      id: "archer",
      name: "궁수",
      icon: "🏹",
      description: "원거리 공격이 가능한 유닛으로, 공격에 강점이 있습니다.",
      attack: 8,
      defense: 3,
      speed: 4,
      cost: { gold: 15, iron: 1 },
      upkeep: 3,
      techRequired: 0
    },
    {
      id: "cavalry",
      name: "기병",
      icon: "🐎",
      description: "빠른 이동 속도를 가진 유닛으로, 기동성에 강점이 있습니다.",
      attack: 7,
      defense: 5,
      speed: 8,
      cost: { gold: 25, iron: 3 },
      upkeep: 5,
      techRequired: 1
    },
    {
      id: "knight",
      name: "기사",
      icon: "🛡️",
      description: "중장갑을 착용한 정예 유닛으로, 공격과 방어에 모두 강점이 있습니다.",
      attack: 10,
      defense: 10,
      speed: 5,
      cost: { gold: 40, iron: 8 },
      upkeep: 8,
      techRequired: 2
    },
    {
      id: "siege",
      name: "공성 병기",
      icon: "🧱",
      description: "성벽과 요새를 공격하는데 특화된 유닛입니다.",
      attack: 15,
      defense: 2,
      speed: 2,
      cost: { gold: 50, iron: 10 },
      upkeep: 10,
      techRequired: 2
    },
    {
      id: "mage",
      name: "마법사",
      icon: "✨",
      description: "마법을 사용하는 유닛으로, 특수 공격이 가능합니다.",
      attack: 12,
      defense: 4,
      speed: 3,
      cost: { gold: 60, iron: 0, mana: 10 },
      upkeep: 12,
      techRequired: 3
    }
  ];
  
  // 군대 데이터 (실제로는 게임 상태에서 가져와야 함)
  const armies = [
    {
      id: "army_1",
      name: "중앙군",
      location: "region_1",
      units: {
        infantry: 50,
        archer: 30,
        cavalry: 20
      },
      commander: "장군 이순신",
      morale: 85,
      experience: 20,
      status: "대기 중"
    },
    {
      id: "army_2",
      name: "북방 수비대",
      location: "region_2",
      units: {
        infantry: 30,
        archer: 20
      },
      commander: "장군 김유신",
      morale: 70,
      experience: 10,
      status: "방어 중"
    },
    {
      id: "army_3",
      name: "동부 원정군",
      location: "region_3",
      units: {
        infantry: 40,
        archer: 25,
        cavalry: 15,
        knight: 5
      },
      commander: "장군 강감찬",
      morale: 90,
      experience: 30,
      status: "행군 중"
    }
  ];
  
  // 전투 데이터 (실제로는 게임 상태에서 가져와야 함)
  const battles = [
    {
      id: "battle_1",
      name: "북부 산맥 전투",
      location: "region_2",
      attacker: "army_1",
      defender: "faction_north",
      status: "진행 중",
      duration: 3,
      casualties: {
        friendly: { infantry: 10, archer: 5 },
        enemy: { infantry: 15, archer: 8 }
      },
      winChance: 65
    },
    {
      id: "battle_2",
      name: "동부 숲 방어전",
      location: "region_3",
      attacker: "faction_east",
      defender: "army_3",
      status: "승리",
      duration: 5,
      casualties: {
        friendly: { infantry: 5, archer: 3 },
        enemy: { infantry: 20, archer: 15, cavalry: 10 }
      },
      winChance: 100
    }
  ];
  
  // 위협 데이터 (실제로는 게임 상태에서 계산해야 함)
  const threats = [
    {
      faction: "faction_north",
      level: "높음",
      description: "북방 부족이 국경 지역에 군대를 집결시키고 있습니다.",
      armySize: "대규모",
      timeToAttack: "2턴 이내"
    },
    {
      faction: "faction_east",
      level: "중간",
      description: "동방 제국이 국경 지역에서 군사 훈련을 실시하고 있습니다.",
      armySize: "중간 규모",
      timeToAttack: "4턴 이내"
    }
  ];
  
  // 유닛 모집 가능 여부 확인
  const canRecruitUnit = (unitType, amount) => {
    // 기술 수준 확인
    if (military_technology < unitType.techRequired) {
      return { 
        canRecruit: false, 
        reason: `필요 기술 수준: ${unitType.techRequired}, 현재 기술 수준: ${military_technology}` 
      };
    }
    
    // 자원 확인
    const goldCost = unitType.cost.gold * amount;
    const ironCost = unitType.cost.iron * amount;
    
    if (gold < goldCost) {
      return { 
        canRecruit: false, 
        reason: `필요 금화: ${goldCost}, 보유 금화: ${gold}` 
      };
    }
    
    if (iron < ironCost) {
      return { 
        canRecruit: false, 
        reason: `필요 철: ${ironCost}, 보유 철: ${iron}` 
      };
    }
    
    return { canRecruit: true };
  };
  
  // 유닛 모집 처리
  const handleRecruitUnit = () => {
    if (!selectedUnit || recruitAmount <= 0) return;
    
    const unitType = unitTypes.find(u => u.id === selectedUnit);
    if (!unitType) return;
    
    const recruitCheck = canRecruitUnit(unitType, recruitAmount);
    if (!recruitCheck.canRecruit) {
      alert(`모집 불가: ${recruitCheck.reason}`);
      return;
    }
    
    // 실제 모집 처리 (게임 상태 업데이트 필요)
    alert(`${unitType.name} ${recruitAmount}명 모집 완료!`);
    setShowRecruitModal(false);
  };
  
  // 군대 강화 처리
  const handleUpgradeArmy = (armyId) => {
    // 실제 강화 처리 (게임 상태 업데이트 필요)
    alert("군대 강화 완료!");
  };
  
  // 전투 시작 처리
  const handleStartBattle = (armyId, targetRegion) => {
    // 실제 전투 처리 (게임 상태 업데이트 필요)
    alert("전투 시작!");
  };
  
  // 군대 이동 모달 표시
  const showMoveArmyModal = (armyId) => {
    const army = armies.find(a => a.id === armyId);
    if (!army) return;
    
    setArmyToMove(army);
    setSelectedDestination(null);
    setShowMoveModal(true);
  };
  
  // 군대 이동 처리
  const handleMoveArmy = () => {
    if (!armyToMove || !selectedDestination) return;
    
    // 게임 상태 업데이트를 위해 moveArmy 함수 호출
    const moveResult = gameState.moveArmy(armyToMove.id, selectedDestination);
    
    if (moveResult) {
      // 이동 성공 시 알림
      alert(`${armyToMove.name}이(가) ${territories.find(t => t.id === selectedDestination)?.name || selectedDestination}(으)로 이동했습니다.`);
    } else {
      // 이동 실패 시 알림
      alert("이동 실패: 군대 또는 목적지를 찾을 수 없습니다.");
    }
    
    // 모달 닫기
    setShowMoveModal(false);
    setArmyToMove(null);
    setSelectedDestination(null);
  };
  
  // 관계 상태에 따른 색상 가져오기
  const getRelationColor = (relation) => {
    if (relation >= 50) return "#2ecc71"; // 우호
    if (relation >= 0) return "#f1c40f"; // 중립
    if (relation >= -50) return "#e67e22"; // 적대
    return "#e74c3c"; // 전쟁
  };
  
  // 지형 이름 가져오기
  const getTerrainName = (terrain) => {
    switch (terrain) {
      case "plains": return "평원";
      case "mountains": return "산맥";
      case "forest": return "숲";
      case "coast": return "해안";
      case "highlands": return "고원";
      case "tundra": return "설원";
      case "hills": return "구릉지";
      case "wasteland": return "황무지";
      case "island": return "섬";
      case "swamp": return "습지";
      case "unknown": return "미지의 땅";
      case "lake": return "호수";
      case "vineyard": return "포도원";
      case "mines": return "광산";
      case "glacier": return "빙하";
      case "volcano": return "화산";
      case "jungle": return "정글";
      case "valley": return "계곡";
      case "desert": return "사막";
      case "cliffs": return "절벽";
      case "savanna": return "초원";
      default: return terrain;
    }
  };
  
  // 유닛 탭 렌더링
  const renderUnitsTab = () => {
    return (
      <div className="military-units">
        <div className="military-header">
          <h3>군사 유닛</h3>
          <button 
            className="recruit-button"
            onClick={() => setShowRecruitModal(true)}
          >
            유닛 모집
          </button>
        </div>
        
        <div className="unit-stats">
          <div className="stat-item">
            <span className="stat-icon">⚔️</span>
            <span className="stat-label">총 병력:</span>
            <span className="stat-value">{army}</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">🛡️</span>
            <span className="stat-label">방어력:</span>
            <span className="stat-value">{military_defense}</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">⚡</span>
            <span className="stat-label">전투 준비도:</span>
            <span className="stat-value">{military_readiness}%</span>
          </div>
          <div className="stat-item">
            <span className="stat-icon">📚</span>
            <span className="stat-label">군사 기술:</span>
            <span className="stat-value">{military_technology}</span>
          </div>
        </div>
        
        <div className="unit-list">
          {unitTypes.map(unit => {
            const recruitCheck = canRecruitUnit(unit, 1);
            
            return (
              <div 
                key={unit.id} 
                className={`unit-card ${!recruitCheck.canRecruit ? "locked" : ""}`}
                onClick={() => recruitCheck.canRecruit && setSelectedUnit(unit.id)}
              >
                <div className="unit-icon">{unit.icon}</div>
                <div className="unit-info">
                  <h4>{unit.name}</h4>
                  <p className="unit-description">{unit.description}</p>
                  <div className="unit-attributes">
                    <div className="attribute">
                      <span className="attribute-label">공격력:</span>
                      <span className="attribute-value">{unit.attack}</span>
                    </div>
                    <div className="attribute">
                      <span className="attribute-label">방어력:</span>
                      <span className="attribute-value">{unit.defense}</span>
                    </div>
                    <div className="attribute">
                      <span className="attribute-label">속도:</span>
                      <span className="attribute-value">{unit.speed}</span>
                    </div>
                  </div>
                  <div className="unit-cost">
                    <span className="cost-label">비용:</span>
                    <span className="cost-value">
                      {unit.cost.gold && <span className="gold-cost">💰 {unit.cost.gold}</span>}
                      {unit.cost.iron && <span className="iron-cost">⚒️ {unit.cost.iron}</span>}
                      {unit.cost.mana && <span className="mana-cost">✨ {unit.cost.mana}</span>}
                    </span>
                  </div>
                  {!recruitCheck.canRecruit && (
                    <div className="unit-locked-reason">
                      {recruitCheck.reason}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  // 군대 탭 렌더링
  const renderArmiesTab = () => {
    return (
      <div className="military-armies">
        <h3>군대 관리</h3>
        
        <div className="armies-list">
          {armies.map(army => {
            const location = territories.find(t => t.id === army.location);
            const totalUnits = Object.values(army.units).reduce((sum, count) => sum + count, 0);
            
            return (
              <div 
                key={army.id} 
                className={`army-card ${selectedArmy === army.id ? "selected" : ""}`}
                onClick={() => setSelectedArmy(army.id === selectedArmy ? null : army.id)}
              >
                <div className="army-header">
                  <h4>{army.name}</h4>
                  <div className="army-status">{army.status}</div>
                </div>
                
                <div className="army-info">
                  <div className="army-location">
                    <span className="info-label">위치:</span>
                    <span className="info-value">{location ? location.name : army.location}</span>
                  </div>
                  <div className="army-commander">
                    <span className="info-label">지휘관:</span>
                    <span className="info-value">{army.commander}</span>
                  </div>
                  <div className="army-stats">
                    <div className="army-stat">
                      <span className="stat-label">병력:</span>
                      <span className="stat-value">{totalUnits}</span>
                    </div>
                    <div className="army-stat">
                      <span className="stat-label">사기:</span>
                      <span className="stat-value">{army.morale}%</span>
                    </div>
                    <div className="army-stat">
                      <span className="stat-label">경험치:</span>
                      <span className="stat-value">{army.experience}</span>
                    </div>
                  </div>
                </div>
                
                <div className="army-units">
                  <h5>유닛 구성</h5>
                  <div className="army-unit-list">
                    {Object.entries(army.units).map(([unitId, count]) => {
                      const unit = unitTypes.find(u => u.id === unitId);
                      if (!unit) return null;
                      
                      return (
                        <div key={unitId} className="army-unit">
                          <span className="unit-icon">{unit.icon}</span>
                          <span className="unit-name">{unit.name}</span>
                          <span className="unit-count">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                <div className="army-actions">
                  <button 
                    className="action-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpgradeArmy(army.id);
                    }}
                  >
                    강화
                  </button>
                  <button 
                    className="action-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      showMoveArmyModal(army.id);
                    }}
                  >
                    이동
                  </button>
                  <button 
                    className="action-button attack"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartBattle(army.id);
                    }}
                  >
                    공격
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  // 전투 탭 렌더링
  const renderBattlesTab = () => {
    return (
      <div className="military-battles">
        <div className="battles-header">
          <h3>전투 상황</h3>
          <div className="threat-assessment">
            <h4>위협 평가</h4>
            <div className="threats-list">
              {threats.map((threat, index) => (
                <div key={index} className="threat-item">
                  <div className="threat-faction">
                    {getFactionName(threat.faction)}
                  </div>
                  <div className={`threat-level ${threat.level === "높음" ? "high" : threat.level === "중간" ? "medium" : "low"}`}>
                    {threat.level}
                  </div>
                  <div className="threat-details">
                    <p>{threat.description}</p>
                    <div className="threat-info">
                      <span>예상 병력: {threat.armySize}</span>
                      <span>예상 공격 시기: {threat.timeToAttack}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="battles-list">
          <h4>진행 중인 전투</h4>
          {battles.map(battle => {
            const location = territories.find(t => t.id === battle.location);
            const attackerArmy = armies.find(a => a.id === battle.attacker);
            const attackerName = attackerArmy ? attackerArmy.name : getFactionName(battle.attacker);
            const defenderArmy = armies.find(a => a.id === battle.defender);
            const defenderName = defenderArmy ? defenderArmy.name : getFactionName(battle.defender);
            
            const totalFriendlyCasualties = battle.casualties.friendly ? 
              Object.values(battle.casualties.friendly).reduce((sum, count) => sum + count, 0) : 0;
            const totalEnemyCasualties = battle.casualties.enemy ? 
              Object.values(battle.casualties.enemy).reduce((sum, count) => sum + count, 0) : 0;
            
            return (
              <div key={battle.id} className="battle-card">
                <div className="battle-header">
                  <h5>{battle.name}</h5>
                  <div className={`battle-status ${battle.status === "진행 중" ? "ongoing" : battle.status === "승리" ? "victory" : "defeat"}`}>
                    {battle.status}
                  </div>
                </div>
                
                <div className="battle-info">
                  <div className="battle-location">
                    <span className="info-label">위치:</span>
                    <span className="info-value">{location ? location.name : battle.location}</span>
                  </div>
                  <div className="battle-duration">
                    <span className="info-label">지속 시간:</span>
                    <span className="info-value">{battle.duration}턴</span>
                  </div>
                  <div className="battle-win-chance">
                    <span className="info-label">승리 확률:</span>
                    <span className="info-value">{battle.winChance}%</span>
                  </div>
                </div>
                
                <div className="battle-forces">
                  <div className="battle-force attacker">
                    <h6>공격자: {attackerName}</h6>
                    <div className="casualties">
                      피해: {totalFriendlyCasualties}
                    </div>
                  </div>
                  <div className="battle-vs">VS</div>
                  <div className="battle-force defender">
                    <h6>방어자: {defenderName}</h6>
                    <div className="casualties">
                      피해: {totalEnemyCasualties}
                    </div>
                  </div>
                </div>
                
                {battle.status === "진행 중" && (
                  <div className="battle-actions">
                    <button className="action-button">전술 변경</button>
                    <button className="action-button">증원 요청</button>
                    <button className="action-button retreat">후퇴</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  
  // 세력 이름 가져오기
  const getFactionName = (factionId) => {
    switch (factionId) {
      case "faction_east": return "동방 제국";
      case "faction_west": return "서방 연합";
      case "faction_south": return "남부 왕국";
      case "faction_north": return "북방 부족";
      default: return factionId;
    }
  };
  
  // 모집 모달 렌더링
  const renderRecruitModal = () => {
    if (!showRecruitModal) return null;
    
    const selectedUnitType = unitTypes.find(u => u.id === selectedUnit);
    
    return (
      <div className="recruit-modal">
        <div className="recruit-modal-content">
          <h3>유닛 모집</h3>
          
          {selectedUnitType ? (
            <>
              <div className="selected-unit">
                <div className="unit-icon">{selectedUnitType.icon}</div>
                <div className="unit-name">{selectedUnitType.name}</div>
              </div>
              
              <div className="recruit-amount">
                <label htmlFor="recruit-amount">모집할 수량:</label>
                <input 
                  type="number" 
                  id="recruit-amount" 
                  min="1" 
                  max="100" 
                  value={recruitAmount}
                  onChange={(e) => setRecruitAmount(parseInt(e.target.value) || 0)}
                />
              </div>
              
              <div className="recruit-cost">
                <h4>필요 자원:</h4>
                <div className="cost-item">
                  <span className="cost-icon">💰</span>
                  <span className="cost-label">금화:</span>
                  <span className="cost-value">{selectedUnitType.cost.gold * recruitAmount}</span>
                  <span className="cost-available">/ {gold}</span>
                </div>
                {selectedUnitType.cost.iron > 0 && (
                  <div className="cost-item">
                    <span className="cost-icon">⚒️</span>
                    <span className="cost-label">철:</span>
                    <span className="cost-value">{selectedUnitType.cost.iron * recruitAmount}</span>
                    <span className="cost-available">/ {iron}</span>
                  </div>
                )}
                {selectedUnitType.cost.mana > 0 && (
                  <div className="cost-item">
                    <span className="cost-icon">✨</span>
                    <span className="cost-label">마나:</span>
                    <span className="cost-value">{selectedUnitType.cost.mana * recruitAmount}</span>
                    <span className="cost-available">/ {gameState.mana}</span>
                  </div>
                )}
              </div>
              
              <div className="recruit-upkeep">
                <h4>유지 비용:</h4>
                <div className="upkeep-item">
                  <span className="upkeep-icon">💰</span>
                  <span className="upkeep-label">턴당 금화:</span>
                  <span className="upkeep-value">{selectedUnitType.upkeep * recruitAmount}</span>
                </div>
              </div>
              
              <div className="recruit-actions">
                <button 
                  className="action-button confirm"
                  onClick={handleRecruitUnit}
                >
                  모집
                </button>
                <button 
                  className="action-button cancel"
                  onClick={() => setShowRecruitModal(false)}
                >
                  취소
                </button>
              </div>
            </>
          ) : (
            <div className="no-unit-selected">
              <p>모집할 유닛을 선택해주세요.</p>
              <div className="unit-selection">
                {unitTypes.map(unit => {
                  const recruitCheck = canRecruitUnit(unit, 1);
                  
                  return (
                    <button 
                      key={unit.id}
                      className={`unit-select-button ${!recruitCheck.canRecruit ? "disabled" : ""}`}
                      onClick={() => recruitCheck.canRecruit && setSelectedUnit(unit.id)}
                      disabled={!recruitCheck.canRecruit}
                    >
                      <span className="unit-icon">{unit.icon}</span>
                      <span className="unit-name">{unit.name}</span>
                    </button>
                  );
                })}
              </div>
              <button 
                className="action-button cancel"
                onClick={() => setShowRecruitModal(false)}
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // 이동 모달 렌더링
  const renderMoveModal = () => {
    if (!showMoveModal || !armyToMove) return null;
    
    // 이동 가능한 영토 목록 (발견된 영토만)
    const availableTerritories = territories.filter(t => 
      discoveredTerritories.includes(t.id) && t.id !== armyToMove.location
    );
    
    return (
      <div className="move-modal">
        <div className="move-modal-content">
          <h3>군대 이동</h3>
          
          <div className="selected-army">
            <h4>{armyToMove.name}</h4>
            <div className="army-info">
              <div className="army-location">
                <span className="info-label">현재 위치:</span>
                <span className="info-value">
                  {territories.find(t => t.id === armyToMove.location)?.name || armyToMove.location}
                </span>
              </div>
              <div className="army-units-count">
                <span className="info-label">병력:</span>
                <span className="info-value">
                  {Object.values(armyToMove.units).reduce((sum, count) => sum + count, 0)}
                </span>
              </div>
            </div>
          </div>
          
          <div className="destination-selection">
            <h4>목적지 선택:</h4>
            {availableTerritories.length > 0 ? (
              <div className="territories-list">
                {availableTerritories.map(territory => (
                  <div 
                    key={territory.id}
                    className={`territory-item ${selectedDestination === territory.id ? "selected" : ""}`}
                    onClick={() => setSelectedDestination(territory.id)}
                  >
                    <div className="territory-name">{territory.name}</div>
                    <div className="territory-type">{getTerrainName(territory.type)}</div>
                    {territory.controlledBy && (
                      <div className="territory-control">
                        소유: {territory.controlledBy === "player" ? "플레이어" : getFactionName(territory.controlledBy)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-territories">
                <p>이동 가능한 영토가 없습니다.</p>
              </div>
            )}
          </div>
          
          <div className="move-actions">
            <button 
              className="action-button confirm"
              onClick={handleMoveArmy}
              disabled={!selectedDestination}
            >
              이동
            </button>
            <button 
              className="action-button cancel"
              onClick={() => {
                setShowMoveModal(false);
                setArmyToMove(null);
                setSelectedDestination(null);
              }}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="military-command">
      <div className="military-header-main">
        <h2>군사 지휘부</h2>
        <div className="diplomatic-overview">
          <h4>외교 관계</h4>
          <div className="faction-relations">
            <div className="faction-relation-item">
              <span className="faction-name">동방 제국</span>
              <div 
                className="relation-indicator" 
                style={{ backgroundColor: getRelationColor(faction_east_relation) }}
              ></div>
            </div>
            <div className="faction-relation-item">
              <span className="faction-name">서방 연합</span>
              <div 
                className="relation-indicator" 
                style={{ backgroundColor: getRelationColor(faction_west_relation) }}
              ></div>
            </div>
            <div className="faction-relation-item">
              <span className="faction-name">남부 왕국</span>
              <div 
                className="relation-indicator" 
                style={{ backgroundColor: getRelationColor(faction_south_relation) }}
              ></div>
            </div>
            <div className="faction-relation-item">
              <span className="faction-name">북방 부족</span>
              <div 
                className="relation-indicator" 
                style={{ backgroundColor: getRelationColor(faction_north_relation) }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="military-tabs">
        <button 
          className={`tab-button ${activeTab === "units" ? "active" : ""}`}
          onClick={() => setActiveTab("units")}
        >
          유닛
        </button>
        <button 
          className={`tab-button ${activeTab === "armies" ? "active" : ""}`}
          onClick={() => setActiveTab("armies")}
        >
          군대
        </button>
        <button 
          className={`tab-button ${activeTab === "battles" ? "active" : ""}`}
          onClick={() => setActiveTab("battles")}
        >
          전투
        </button>
      </div>
      
      <div className="military-content">
        {activeTab === "units" && renderUnitsTab()}
        {activeTab === "armies" && renderArmiesTab()}
        {activeTab === "battles" && renderBattlesTab()}
      </div>
      
      {renderRecruitModal()}
      {renderMoveModal()}
    </div>
  );
};

export default MilitaryCommand;