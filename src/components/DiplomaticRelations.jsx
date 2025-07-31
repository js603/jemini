import React, { useState } from "react";
import { useGameStore } from "../store/gameSlice";
import "../styles/DiplomaticRelations.css";

// DiplomaticRelations.jsx - 대형 SLG를 위한 외교 관계 관리 컴포넌트
const DiplomaticRelations = () => {
  const gameState = useGameStore();
  const { 
    factions, 
    updateFactionRelation,
    faction_east_relation,
    faction_west_relation,
    faction_south_relation,
    faction_north_relation,
    diplomatic_influence,
    gold
  } = gameState;
  
  const [selectedFaction, setSelectedFaction] = useState(null);
  const [diplomaticAction, setDiplomaticAction] = useState(null);
  const [actionCost, setActionCost] = useState(0);
  const [actionEffect, setActionEffect] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  // 외교 관계 데이터
  const diplomaticRelations = [
    { 
      id: "east", 
      name: "동방 제국", 
      relation: faction_east_relation,
      description: "고대부터 이어져 온 강력한 제국으로, 문화와 기술이 발달했습니다.",
      traits: ["문화적", "기술적", "전통적"],
      relationStatus: getRelationStatus(faction_east_relation),
      color: "#e74c3c",
      icon: "🏯",
      resources: ["비단", "도자기", "향신료"],
      army: "중장갑 보병, 궁수",
      actions: getDiplomaticActions("east", faction_east_relation)
    },
    { 
      id: "west", 
      name: "서방 연합", 
      relation: faction_west_relation,
      description: "여러 도시 국가의 연합체로, 무역과 해상 활동이 활발합니다.",
      traits: ["상업적", "외교적", "개방적"],
      relationStatus: getRelationStatus(faction_west_relation),
      color: "#3498db",
      icon: "⚓",
      resources: ["금", "향료", "유리"],
      army: "경기병, 해군",
      actions: getDiplomaticActions("west", faction_west_relation)
    },
    { 
      id: "south", 
      name: "남부 왕국", 
      relation: faction_south_relation,
      description: "비옥한 토지를 가진 농업 중심 왕국으로, 풍부한 식량 자원을 보유하고 있습니다.",
      traits: ["농업적", "평화적", "종교적"],
      relationStatus: getRelationStatus(faction_south_relation),
      color: "#2ecc71",
      icon: "🌾",
      resources: ["식량", "목재", "약초"],
      army: "민병대, 코끼리 기병",
      actions: getDiplomaticActions("south", faction_south_relation)
    },
    { 
      id: "north", 
      name: "북방 부족", 
      relation: faction_north_relation,
      description: "험준한 산맥과 추운 기후에 적응한 전사 부족으로, 강인한 군사력을 가지고 있습니다.",
      traits: ["전투적", "독립적", "신비적"],
      relationStatus: getRelationStatus(faction_north_relation),
      color: "#9b59b6",
      icon: "❄️",
      resources: ["철", "모피", "마법 수정"],
      army: "야만 전사, 거인 기수",
      actions: getDiplomaticActions("north", faction_north_relation)
    }
  ];
  
  // 관계 상태 가져오기
  function getRelationStatus(relationValue) {
    if (relationValue >= 75) return { name: "동맹", color: "#27ae60", icon: "🤝" };
    if (relationValue >= 50) return { name: "우호", color: "#2ecc71", icon: "😊" };
    if (relationValue >= 25) return { name: "중립적 우호", color: "#f1c40f", icon: "🙂" };
    if (relationValue >= 0) return { name: "중립", color: "#95a5a6", icon: "😐" };
    if (relationValue >= -25) return { name: "중립적 적대", color: "#e67e22", icon: "🙁" };
    if (relationValue >= -50) return { name: "적대", color: "#e74c3c", icon: "😠" };
    if (relationValue >= -75) return { name: "전쟁", color: "#c0392b", icon: "⚔️" };
    return { name: "불구대천", color: "#7f0000", icon: "💀" };
  }
  
  // 외교 행동 가져오기
  function getDiplomaticActions(factionId, relationValue) {
    const baseActions = [
      { 
        id: "gift", 
        name: "선물 보내기", 
        description: "금화를 선물하여 관계를 개선합니다.",
        cost: { type: "gold", value: 100 },
        effect: { type: "relation", value: 5 },
        minRelation: -100,
        maxRelation: 90
      },
      { 
        id: "trade", 
        name: "무역 협정", 
        description: "무역 협정을 체결하여 상호 이익을 추구합니다.",
        cost: { type: "gold", value: 50 },
        effect: { type: "relation", value: 10 },
        minRelation: 0,
        maxRelation: 100
      },
      { 
        id: "embassy", 
        name: "대사관 설립", 
        description: "대사관을 설립하여 외교 관계를 강화합니다.",
        cost: { type: "gold", value: 200 },
        effect: { type: "relation", value: 15 },
        minRelation: 25,
        maxRelation: 100
      }
    ];
    
    // 관계에 따른 추가 행동
    if (relationValue >= 50) {
      baseActions.push({ 
        id: "alliance", 
        name: "동맹 체결", 
        description: "공식적인 동맹을 체결하여 군사적, 경제적 협력을 강화합니다.",
        cost: { type: "gold", value: 300 },
        effect: { type: "relation", value: 25 },
        minRelation: 50,
        maxRelation: 100
      });
    }
    
    if (relationValue >= 75) {
      baseActions.push({ 
        id: "military_pact", 
        name: "군사 협약", 
        description: "군사 협약을 체결하여 상호 방위를 약속합니다.",
        cost: { type: "gold", value: 500 },
        effect: { type: "relation", value: 15 },
        minRelation: 75,
        maxRelation: 100
      });
    }
    
    if (relationValue <= 0) {
      baseActions.push({ 
        id: "threaten", 
        name: "위협하기", 
        description: "군사력을 과시하여 상대방을 위협합니다.",
        cost: { type: "diplomatic_influence", value: 20 },
        effect: { type: "relation", value: -15 },
        minRelation: -100,
        maxRelation: 0
      });
    }
    
    if (relationValue <= -25) {
      baseActions.push({ 
        id: "embargo", 
        name: "통상 금지", 
        description: "모든 무역을 중단하고 경제적 압박을 가합니다.",
        cost: { type: "diplomatic_influence", value: 30 },
        effect: { type: "relation", value: -20 },
        minRelation: -100,
        maxRelation: -25
      });
    }
    
    if (relationValue <= -50) {
      baseActions.push({ 
        id: "declare_war", 
        name: "전쟁 선포", 
        description: "공식적으로 전쟁을 선포합니다.",
        cost: { type: "diplomatic_influence", value: 50 },
        effect: { type: "relation", value: -50 },
        minRelation: -100,
        maxRelation: -50
      });
    }
    
    return baseActions;
  }
  
  // 외교 행동 선택 핸들러
  const handleActionSelect = (faction, action) => {
    setSelectedFaction(faction);
    setDiplomaticAction(action);
    setActionCost(action.cost.value);
    setActionEffect(action.effect.value);
    setShowConfirmation(true);
  };
  
  // 외교 행동 확인 핸들러
  const handleConfirmAction = () => {
    if (!selectedFaction || !diplomaticAction) return;
    
    // 자원 충분한지 확인
    if (diplomaticAction.cost.type === "gold" && gold < diplomaticAction.cost.value) {
      alert("금화가 부족합니다!");
      return;
    }
    
    if (diplomaticAction.cost.type === "diplomatic_influence" && diplomatic_influence < diplomaticAction.cost.value) {
      alert("외교 영향력이 부족합니다!");
      return;
    }
    
    // 외교 관계 업데이트
    updateFactionRelation(selectedFaction.id, diplomaticAction.effect.value);
    
    // 자원 소비
    if (diplomaticAction.cost.type === "gold") {
      useGameStore.setState(state => ({
        gold: state.gold - diplomaticAction.cost.value
      }));
    } else if (diplomaticAction.cost.type === "diplomatic_influence") {
      useGameStore.setState(state => ({
        diplomatic_influence: state.diplomatic_influence - diplomaticAction.cost.value
      }));
    }
    
    // 행동 결과 기록
    useGameStore.setState(state => ({
      history: [
        ...state.history,
        {
          event: "외교 행동",
          action: diplomaticAction.name,
          faction: selectedFaction.name,
          effect: diplomaticAction.effect.value,
          turn: state.turn
        }
      ]
    }));
    
    // 상태 초기화
    setShowConfirmation(false);
    setSelectedFaction(null);
    setDiplomaticAction(null);
  };
  
  // 외교 행동 취소 핸들러
  const handleCancelAction = () => {
    setShowConfirmation(false);
    setSelectedFaction(null);
    setDiplomaticAction(null);
  };
  
  // 관계 상태 바 렌더링
  const renderRelationBar = (relation) => {
    const percentage = ((relation + 100) / 200) * 100; // -100 ~ 100 범위를 0 ~ 100% 로 변환
    
    let barColor;
    if (relation >= 75) barColor = "#27ae60";
    else if (relation >= 50) barColor = "#2ecc71";
    else if (relation >= 25) barColor = "#f1c40f";
    else if (relation >= 0) barColor = "#95a5a6";
    else if (relation >= -25) barColor = "#e67e22";
    else if (relation >= -50) barColor = "#e74c3c";
    else if (relation >= -75) barColor = "#c0392b";
    else barColor = "#7f0000";
    
    return (
      <div className="relation-bar-container">
        <div className="relation-bar-marker" style={{ left: "50%" }}></div>
        <div 
          className="relation-bar" 
          style={{ 
            width: `${percentage}%`,
            backgroundColor: barColor
          }}
        ></div>
        <div className="relation-value">{relation}</div>
      </div>
    );
  };
  
  // 확인 모달 렌더링
  const renderConfirmationModal = () => {
    if (!showConfirmation || !selectedFaction || !diplomaticAction) return null;
    
    return (
      <div className="diplomatic-modal">
        <div className="diplomatic-modal-content">
          <h3>외교 행동 확인</h3>
          <p>
            <strong>{selectedFaction.name}</strong>에게 <strong>{diplomaticAction.name}</strong> 행동을 실행하시겠습니까?
          </p>
          <div className="diplomatic-modal-details">
            <div className="modal-detail">
              <span className="detail-label">비용:</span>
              <span className="detail-value">
                {diplomaticAction.cost.type === "gold" ? "금화" : "외교 영향력"} {diplomaticAction.cost.value}
              </span>
            </div>
            <div className="modal-detail">
              <span className="detail-label">효과:</span>
              <span className="detail-value">
                관계 {diplomaticAction.effect.value > 0 ? "+" : ""}{diplomaticAction.effect.value}
              </span>
            </div>
            <div className="modal-detail">
              <span className="detail-label">현재 관계:</span>
              <span className="detail-value">{selectedFaction.relation}</span>
            </div>
            <div className="modal-detail">
              <span className="detail-label">예상 관계:</span>
              <span className="detail-value">{selectedFaction.relation + diplomaticAction.effect.value}</span>
            </div>
          </div>
          <div className="diplomatic-modal-actions">
            <button 
              className="modal-button confirm"
              onClick={handleConfirmAction}
            >
              확인
            </button>
            <button 
              className="modal-button cancel"
              onClick={handleCancelAction}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="diplomatic-relations">
      <div className="diplomatic-header">
        <h2>외교 관계</h2>
        <div className="diplomatic-stats">
          <div className="diplomatic-stat">
            <span className="stat-icon">🌐</span>
            <span className="stat-label">외교 영향력:</span>
            <span className="stat-value">{diplomatic_influence}</span>
          </div>
          <div className="diplomatic-stat">
            <span className="stat-icon">💰</span>
            <span className="stat-label">금화:</span>
            <span className="stat-value">{gold}</span>
          </div>
        </div>
      </div>
      
      <div className="factions-container">
        {diplomaticRelations.map(faction => (
          <div 
            key={faction.id} 
            className="faction-card"
            style={{ borderColor: faction.color }}
          >
            <div className="faction-header" style={{ backgroundColor: faction.color }}>
              <div className="faction-icon">{faction.icon}</div>
              <h3 className="faction-name">{faction.name}</h3>
              <div className="faction-status">
                <span className="status-icon">{faction.relationStatus.icon}</span>
                <span className="status-name">{faction.relationStatus.name}</span>
              </div>
            </div>
            
            <div className="faction-relation">
              {renderRelationBar(faction.relation)}
            </div>
            
            <div className="faction-info">
              <p className="faction-description">{faction.description}</p>
              
              <div className="faction-traits">
                {faction.traits.map((trait, index) => (
                  <span key={index} className="faction-trait">{trait}</span>
                ))}
              </div>
              
              <div className="faction-resources">
                <h4>주요 자원:</h4>
                <div className="resources-list">
                  {faction.resources.map((resource, index) => (
                    <span key={index} className="resource-item">{resource}</span>
                  ))}
                </div>
              </div>
              
              <div className="faction-army">
                <h4>군사력:</h4>
                <p>{faction.army}</p>
              </div>
            </div>
            
            <div className="faction-actions">
              <h4>외교 행동:</h4>
              <div className="actions-list">
                {faction.actions.map(action => {
                  // 관계 범위 체크
                  const isAvailable = 
                    faction.relation >= action.minRelation && 
                    faction.relation <= action.maxRelation;
                  
                  // 자원 충분한지 체크
                  const hasResources = 
                    action.cost.type === "gold" 
                      ? gold >= action.cost.value 
                      : diplomatic_influence >= action.cost.value;
                  
                  return (
                    <button 
                      key={action.id}
                      className={`action-button ${!isAvailable || !hasResources ? "disabled" : ""}`}
                      onClick={() => isAvailable && hasResources && handleActionSelect(faction, action)}
                      disabled={!isAvailable || !hasResources}
                      title={
                        !isAvailable 
                          ? `관계 수준이 적절하지 않습니다 (${action.minRelation} ~ ${action.maxRelation})` 
                          : !hasResources 
                            ? `자원이 부족합니다 (${action.cost.type === "gold" ? "금화" : "외교 영향력"} ${action.cost.value} 필요)` 
                            : action.description
                      }
                    >
                      <span className="action-name">{action.name}</span>
                      <span className="action-cost">
                        {action.cost.type === "gold" ? "💰" : "🌐"} {action.cost.value}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {renderConfirmationModal()}
    </div>
  );
};

export default DiplomaticRelations;