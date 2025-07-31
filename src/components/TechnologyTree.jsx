import React, { useState, useEffect } from "react";
import { useGameStore } from "../store/gameSlice";
import technologiesData from "../data/technologies.json";
import "../styles/TechnologyTree.css";

// TechnologyTree.jsx - 대형 SLG를 위한 기술 트리 컴포넌트
const TechnologyTree = () => {
  const gameState = useGameStore();
  const { 
    research_points,
    researchTechnology,
    researchedTechnologies,
    mana
  } = gameState;
  
  const [selectedTech, setSelectedTech] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [techTree, setTechTree] = useState({});
  
  // 기술 카테고리
  const categories = [
    { id: "all", name: "모든 기술", icon: "🔍" },
    { id: "economy", name: "경제", icon: "💰" },
    { id: "military", name: "군사", icon: "⚔️" },
    { id: "science", name: "과학", icon: "🔬" },
    { id: "culture", name: "문화", icon: "🎭" },
    { id: "arcane", name: "마법", icon: "✨" }
  ];
  
  // 기술 티어
  const tiers = [1, 2, 3];
  
  // 컴포넌트 마운트 시 기술 트리 구성
  useEffect(() => {
    // 기술 트리 구성
    const tree = {};
    
    // 카테고리별로 기술 분류
    categories.forEach(category => {
      if (category.id === "all") return;
      
      tree[category.id] = {};
      
      // 티어별로 기술 분류
      tiers.forEach(tier => {
        tree[category.id][tier] = technologiesData.filter(
          tech => tech.category === category.id && tech.tier === tier
        );
      });
    });
    
    setTechTree(tree);
  }, []);
  
  // 기술 연구 가능 여부 확인
  const canResearchTech = (tech) => {
    // 이미 연구된 기술인지 확인
    if (researchedTechnologies.includes(tech.id)) {
      return { 
        canResearch: false, 
        reason: "이미 연구된 기술입니다." 
      };
    }
    
    // 선행 기술 확인
    if (tech.prerequisites && tech.prerequisites.length > 0) {
      const missingPrereqs = tech.prerequisites.filter(
        prereq => !researchedTechnologies.includes(prereq)
      );
      
      if (missingPrereqs.length > 0) {
        const missingNames = missingPrereqs.map(prereq => {
          const prereqTech = technologiesData.find(t => t.id === prereq);
          return prereqTech ? prereqTech.name : prereq;
        }).join(", ");
        
        return { 
          canResearch: false, 
          reason: `선행 기술이 필요합니다: ${missingNames}` 
        };
      }
    }
    
    // 연구 포인트 확인
    if (research_points < tech.cost.research_points) {
      return { 
        canResearch: false, 
        reason: `연구 포인트가 부족합니다. (필요: ${tech.cost.research_points}, 보유: ${research_points})` 
      };
    }
    
    // 특수 자원 확인 (마나 등)
    if (tech.cost.mana && mana < tech.cost.mana) {
      return { 
        canResearch: false, 
        reason: `마나가 부족합니다. (필요: ${tech.cost.mana}, 보유: ${mana})` 
      };
    }
    
    return { canResearch: true };
  };
  
  // 기술 연구 처리
  const handleResearchTech = () => {
    if (!selectedTech) return;
    
    const tech = technologiesData.find(t => t.id === selectedTech);
    if (!tech) return;
    
    const researchCheck = canResearchTech(tech);
    if (!researchCheck.canResearch) {
      alert(`연구 불가: ${researchCheck.reason}`);
      return;
    }
    
    // 실제 연구 처리 (게임 상태 업데이트)
    const success = researchTechnology(tech.id);
    
    if (success) {
      // 연구 성공 시 UI 상태 업데이트
      setShowConfirmation(false);
      setSelectedTech(null);
    } else {
      alert("연구 실패: 알 수 없는 오류가 발생했습니다.");
    }
  };
  
  // 기술 선택 취소
  const handleCancelResearch = () => {
    setShowConfirmation(false);
    setSelectedTech(null);
  };
  
  // 기술 선택 처리
  const handleSelectTech = (techId) => {
    const tech = technologiesData.find(t => t.id === techId);
    if (!tech) return;
    
    setSelectedTech(techId);
    
    // 이미 연구된 기술이면 확인 모달 표시하지 않음
    if (researchedTechnologies.includes(techId)) return;
    
    // 연구 가능한 기술이면 확인 모달 표시
    const researchCheck = canResearchTech(tech);
    if (researchCheck.canResearch) {
      setShowConfirmation(true);
    } else {
      // 연구 불가능한 기술이면 알림만 표시
      alert(`연구 불가: ${researchCheck.reason}`);
    }
  };
  
  // 기술 노드 렌더링
  const renderTechNode = (tech) => {
    const isResearched = researchedTechnologies.includes(tech.id);
    const researchCheck = canResearchTech(tech);
    const isResearchable = researchCheck.canResearch;
    const isSelected = selectedTech === tech.id;
    
    // 기술 효과 텍스트 생성
    const effectsText = Object.entries(tech.effects)
      .map(([key, value]) => {
        // 효과 키를 읽기 쉬운 형태로 변환
        const effectName = key.replace(/_/g, " ");
        // 값이 양수면 + 기호 추가
        const effectValue = value > 0 ? `+${value}` : value;
        return `${effectName}: ${effectValue}`;
      })
      .join(", ");
    
    return (
      <div 
        key={tech.id}
        className={`tech-node ${isResearched ? "researched" : ""} ${isResearchable ? "researchable" : ""} ${isSelected ? "selected" : ""}`}
        onClick={() => handleSelectTech(tech.id)}
      >
        <div className="tech-icon">{getCategoryIcon(tech.category)}</div>
        <div className="tech-info">
          <h4 className="tech-name">{tech.name}</h4>
          <div className="tech-cost">
            <span className="cost-icon">📚</span>
            <span className="cost-value">{tech.cost.research_points}</span>
            {tech.cost.mana && (
              <>
                <span className="cost-icon">✨</span>
                <span className="cost-value">{tech.cost.mana}</span>
              </>
            )}
          </div>
        </div>
        <div className="tech-tooltip">
          <h4>{tech.name}</h4>
          <p>{tech.description}</p>
          <div className="tech-effects">
            <strong>효과:</strong> {effectsText}
          </div>
          {tech.prerequisites && tech.prerequisites.length > 0 && (
            <div className="tech-prerequisites">
              <strong>선행 기술:</strong> {tech.prerequisites.map(prereq => {
                const prereqTech = technologiesData.find(t => t.id === prereq);
                return prereqTech ? prereqTech.name : prereq;
              }).join(", ")}
            </div>
          )}
          {tech.unlocksBuildings && tech.unlocksBuildings.length > 0 && (
            <div className="tech-unlocks">
              <strong>건물 해금:</strong> {tech.unlocksBuildings.join(", ")}
            </div>
          )}
          {tech.unlocksUnits && tech.unlocksUnits.length > 0 && (
            <div className="tech-unlocks">
              <strong>유닛 해금:</strong> {tech.unlocksUnits.join(", ")}
            </div>
          )}
          {!isResearched && !isResearchable && (
            <div className="tech-locked-reason">
              {researchCheck.reason}
            </div>
          )}
        </div>
      </div>
    );
  };
  
  // 카테고리 아이콘 가져오기
  const getCategoryIcon = (categoryId) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.icon : "🔍";
  };
  
  // 기술 트리 렌더링
  const renderTechTree = () => {
    if (activeCategory === "all") {
      // 모든 기술 표시
      return (
        <div className="tech-tree-all">
          {categories.map(category => {
            if (category.id === "all") return null;
            
            return (
              <div key={category.id} className="category-section">
                <h3 className="category-title">
                  <span className="category-icon">{category.icon}</span>
                  {category.name}
                </h3>
                <div className="category-techs">
                  {tiers.map(tier => (
                    <div key={`${category.id}-${tier}`} className="tier-section">
                      <div className="tier-label">티어 {tier}</div>
                      <div className="tier-techs">
                        {techTree[category.id] && techTree[category.id][tier] && 
                          techTree[category.id][tier].map(tech => renderTechNode(tech))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    } else {
      // 선택된 카테고리의 기술만 표시
      return (
        <div className="tech-tree-category">
          {tiers.map(tier => (
            <div key={`${activeCategory}-${tier}`} className="tier-section">
              <div className="tier-label">티어 {tier}</div>
              <div className="tier-techs">
                {techTree[activeCategory] && techTree[activeCategory][tier] && 
                  techTree[activeCategory][tier].map(tech => renderTechNode(tech))}
              </div>
            </div>
          ))}
        </div>
      );
    }
  };
  
  // 기술 세부 정보 패널 렌더링
  const renderTechDetails = () => {
    if (!selectedTech) return null;
    
    const tech = technologiesData.find(t => t.id === selectedTech);
    if (!tech) return null;
    
    const isResearched = researchedTechnologies.includes(tech.id);
    const researchCheck = canResearchTech(tech);
    
    return (
      <div className="tech-details-panel">
        <div className="tech-details-header">
          <div className="tech-icon large">{getCategoryIcon(tech.category)}</div>
          <h3>{tech.name}</h3>
          <div className="tech-tier">티어 {tech.tier}</div>
        </div>
        
        <div className="tech-description">
          {tech.description}
        </div>
        
        <div className="tech-effects-list">
          <h4>효과</h4>
          <ul>
            {Object.entries(tech.effects).map(([key, value], index) => {
              // 효과 키를 읽기 쉬운 형태로 변환
              const effectName = key.split("_").map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
              ).join(" ");
              
              // 값이 양수면 + 기호 추가
              const effectValue = value > 0 ? `+${value}` : value;
              
              // 효과 유형에 따라 다른 아이콘 표시
              let effectIcon = "📈";
              if (key.includes("production")) effectIcon = "🏭";
              else if (key.includes("attack")) effectIcon = "⚔️";
              else if (key.includes("defense")) effectIcon = "🛡️";
              else if (key.includes("gold")) effectIcon = "💰";
              else if (key.includes("food")) effectIcon = "🌾";
              else if (key.includes("research")) effectIcon = "📚";
              else if (key.includes("mana")) effectIcon = "✨";
              
              return (
                <li key={index} className="effect-item">
                  <span className="effect-icon">{effectIcon}</span>
                  <span className="effect-name">{effectName}</span>
                  <span className="effect-value">{effectValue}</span>
                </li>
              );
            })}
          </ul>
        </div>
        
        {tech.prerequisites && tech.prerequisites.length > 0 && (
          <div className="tech-prerequisites-list">
            <h4>선행 기술</h4>
            <ul>
              {tech.prerequisites.map(prereq => {
                const prereqTech = technologiesData.find(t => t.id === prereq);
                if (!prereqTech) return null;
                
                const isPrereqResearched = researchedTechnologies.includes(prereq);
                
                return (
                  <li 
                    key={prereq} 
                    className={`prerequisite-item ${isPrereqResearched ? "researched" : "missing"}`}
                    onClick={() => handleSelectTech(prereq)}
                  >
                    <span className="prereq-icon">
                      {isPrereqResearched ? "✅" : "❌"}
                    </span>
                    <span className="prereq-name">{prereqTech.name}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        
        {(tech.unlocksBuildings && tech.unlocksBuildings.length > 0) || 
         (tech.unlocksUnits && tech.unlocksUnits.length > 0) || 
         (tech.unlocksResources && tech.unlocksResources.length > 0) ? (
          <div className="tech-unlocks-list">
            <h4>해금 항목</h4>
            
            {tech.unlocksBuildings && tech.unlocksBuildings.length > 0 && (
              <div className="unlocks-section">
                <h5>건물</h5>
                <ul className="unlocks-items">
                  {tech.unlocksBuildings.map(building => (
                    <li key={building} className="unlock-item">
                      <span className="unlock-icon">🏛️</span>
                      <span className="unlock-name">{building}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {tech.unlocksUnits && tech.unlocksUnits.length > 0 && (
              <div className="unlocks-section">
                <h5>유닛</h5>
                <ul className="unlocks-items">
                  {tech.unlocksUnits.map(unit => (
                    <li key={unit} className="unlock-item">
                      <span className="unlock-icon">⚔️</span>
                      <span className="unlock-name">{unit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {tech.unlocksResources && tech.unlocksResources.length > 0 && (
              <div className="unlocks-section">
                <h5>자원</h5>
                <ul className="unlocks-items">
                  {tech.unlocksResources.map(resource => (
                    <li key={resource} className="unlock-item">
                      <span className="unlock-icon">📦</span>
                      <span className="unlock-name">{resource}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
        
        <div className="tech-status">
          {isResearched ? (
            <div className="researched-status">
              <span className="status-icon">✅</span>
              <span className="status-text">연구 완료</span>
            </div>
          ) : (
            <div className="research-cost">
              <h4>연구 비용</h4>
              <div className="cost-item">
                <span className="cost-icon">📚</span>
                <span className="cost-label">연구 포인트:</span>
                <span className="cost-value">{tech.cost.research_points}</span>
                <span className="cost-available">/ {research_points}</span>
              </div>
              {tech.cost.mana && (
                <div className="cost-item">
                  <span className="cost-icon">✨</span>
                  <span className="cost-label">마나:</span>
                  <span className="cost-value">{tech.cost.mana}</span>
                  <span className="cost-available">/ {gameState.mana || 0}</span>
                </div>
              )}
              
              {!researchCheck.canResearch && (
                <div className="research-locked-reason">
                  {researchCheck.reason}
                </div>
              )}
            </div>
          )}
        </div>
        
        {!isResearched && researchCheck.canResearch && (
          <button 
            className="research-button"
            onClick={() => setShowConfirmation(true)}
          >
            연구 시작
          </button>
        )}
      </div>
    );
  };
  
  // 확인 모달 렌더링
  const renderConfirmationModal = () => {
    if (!showConfirmation || !selectedTech) return null;
    
    const tech = technologiesData.find(t => t.id === selectedTech);
    if (!tech) return null;
    
    return (
      <div className="confirmation-modal">
        <div className="confirmation-content">
          <h3>기술 연구 확인</h3>
          <p>
            <strong>{tech.name}</strong> 기술을 연구하시겠습니까?
          </p>
          <div className="confirmation-cost">
            <div className="cost-item">
              <span className="cost-icon">📚</span>
              <span className="cost-label">연구 포인트:</span>
              <span className="cost-value">{tech.cost.research_points}</span>
              <span className="cost-available">/ {research_points}</span>
            </div>
            {tech.cost.mana && (
              <div className="cost-item">
                <span className="cost-icon">✨</span>
                <span className="cost-label">마나:</span>
                <span className="cost-value">{tech.cost.mana}</span>
                <span className="cost-available">/ {gameState.mana || 0}</span>
              </div>
            )}
          </div>
          <div className="confirmation-actions">
            <button 
              className="confirm-button"
              onClick={handleResearchTech}
            >
              연구
            </button>
            <button 
              className="cancel-button"
              onClick={handleCancelResearch}
            >
              취소
            </button>
          </div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="technology-tree">
      <div className="tech-header">
        <h2>기술 연구</h2>
        <div className="research-points">
          <span className="points-icon">📚</span>
          <span className="points-label">연구 포인트:</span>
          <span className="points-value">{research_points}</span>
        </div>
      </div>
      
      <div className="tech-categories">
        {categories.map(category => (
          <button 
            key={category.id}
            className={`category-button ${activeCategory === category.id ? "active" : ""}`}
            onClick={() => setActiveCategory(category.id)}
          >
            <span className="category-icon">{category.icon}</span>
            <span className="category-name">{category.name}</span>
          </button>
        ))}
      </div>
      
      <div className="tech-content">
        <div className="tech-tree-container">
          {renderTechTree()}
        </div>
        
        <div className="tech-details-container">
          {renderTechDetails()}
        </div>
      </div>
      
      {renderConfirmationModal()}
    </div>
  );
};

export default TechnologyTree;