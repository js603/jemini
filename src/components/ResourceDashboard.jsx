import React, { useState } from "react";
import { useGameStore } from "../store/gameSlice";
import "../styles/ResourceDashboard.css";

// ResourceDashboard.jsx - 대형 SLG를 위한 확장된 자원 관리 대시보드
const ResourceDashboard = () => {
  const gameState = useGameStore();
  const [activeTab, setActiveTab] = useState("basic"); // basic, advanced, production, allocation
  const [showTrends, setShowTrends] = useState(false);
  const [selectedResource, setSelectedResource] = useState(null);
  
  // 기본 자원 목록
  const basicResources = [
    { id: "population", name: "인구", icon: "👥", value: gameState.population, trend: "+10/턴", color: "#3498db" },
    { id: "gold", name: "금화", icon: "💰", value: gameState.gold, trend: "+25/턴", color: "#f1c40f" },
    { id: "food", name: "식량", icon: "🌾", value: gameState.food, trend: "+15/턴", color: "#2ecc71" },
    { id: "army", name: "군사력", icon: "⚔️", value: gameState.army, trend: "+5/턴", color: "#e74c3c" },
  ];
  
  // 고급 자원 목록
  const advancedResources = [
    { id: "wood", name: "목재", icon: "🌲", value: gameState.wood, trend: "+8/턴", color: "#795548" },
    { id: "stone", name: "석재", icon: "🪨", value: gameState.stone, trend: "+6/턴", color: "#607d8b" },
    { id: "iron", name: "철광석", icon: "⚒️", value: gameState.iron, trend: "+4/턴", color: "#9e9e9e" },
    { id: "mana", name: "마력", icon: "✨", value: gameState.mana, trend: "+3/턴", color: "#9c27b0" },
  ];
  
  // 특수 자원 목록
  const specialResources = [
    { id: "research_points", name: "연구 포인트", icon: "📚", value: gameState.research_points, trend: "+2/턴", color: "#3f51b5" },
    { id: "magical_essence", name: "마법 정수", icon: "🔮", value: gameState.magical_essence, trend: "+1/턴", color: "#673ab7" },
    { id: "arcane_crystal", name: "비전 수정", icon: "💎", value: gameState.arcane_crystal, trend: "+0.5/턴", color: "#9c27b0" },
    { id: "elixir", name: "엘릭서", icon: "🧪", value: gameState.elixir, trend: "+0.5/턴", color: "#e91e63" },
  ];
  
  // 사회적 자원 목록
  const socialResources = [
    { id: "trust", name: "신뢰도", icon: "🤝", value: gameState.trust, trend: "+1/턴", color: "#4caf50", max: 100 },
    { id: "dissatisfaction", name: "불만도", icon: "😠", value: gameState.dissatisfaction, trend: "-0.5/턴", color: "#f44336", max: 100 },
    { id: "loyalty", name: "충성도", icon: "👑", value: gameState.loyalty, trend: "+0.5/턴", color: "#ffc107", max: 100 },
    { id: "diplomatic_influence", name: "외교 영향력", icon: "🌐", value: gameState.diplomatic_influence, trend: "+1/턴", color: "#2196f3" },
  ];
  
  // 자원 생산 정보
  const resourceProduction = [
    { resource: "food", sources: [
      { name: "농장", amount: 20, icon: "🌾" },
      { name: "어촌", amount: 10, icon: "🐟" },
      { name: "목축지", amount: 15, icon: "🐄" },
      { name: "사냥터", amount: 5, icon: "🏹" },
    ]},
    { resource: "gold", sources: [
      { name: "광산", amount: 15, icon: "⛏️" },
      { name: "시장", amount: 20, icon: "🛒" },
      { name: "무역항", amount: 25, icon: "🚢" },
      { name: "세금", amount: 10, icon: "📜" },
    ]},
    { resource: "wood", sources: [
      { name: "숲", amount: 25, icon: "🌲" },
      { name: "벌목장", amount: 15, icon: "🪓" },
    ]},
    { resource: "stone", sources: [
      { name: "채석장", amount: 20, icon: "🪨" },
      { name: "산맥", amount: 10, icon: "⛰️" },
    ]},
  ];
  
  // 자원 소비 정보
  const resourceConsumption = [
    { resource: "food", consumers: [
      { name: "인구", amount: -15, icon: "👥" },
      { name: "군대", amount: -10, icon: "⚔️" },
    ]},
    { resource: "gold", consumers: [
      { name: "유지비", amount: -10, icon: "🏛️" },
      { name: "군비", amount: -15, icon: "🛡️" },
      { name: "연구", amount: -5, icon: "📚" },
    ]},
    { resource: "wood", consumers: [
      { name: "건설", amount: -10, icon: "🏗️" },
      { name: "무기 제작", amount: -5, icon: "🏹" },
    ]},
    { resource: "stone", consumers: [
      { name: "건설", amount: -15, icon: "🏗️" },
      { name: "방어 시설", amount: -5, icon: "🏰" },
    ]},
  ];
  
  // 자원 할당 정보
  const resourceAllocation = {
    categories: [
      { id: "military", name: "군사", icon: "⚔️", allocation: 30 },
      { id: "economy", name: "경제", icon: "💰", allocation: 25 },
      { id: "research", name: "연구", icon: "📚", allocation: 20 },
      { id: "culture", name: "문화", icon: "🎭", allocation: 15 },
      { id: "diplomacy", name: "외교", icon: "🤝", allocation: 10 },
    ],
    effects: {
      military: [
        { name: "군사력 증가", value: "+5/턴" },
        { name: "방어력 증가", value: "+3/턴" },
        { name: "식량 소비 증가", value: "-3/턴" },
      ],
      economy: [
        { name: "금화 증가", value: "+10/턴" },
        { name: "자원 생산 증가", value: "+5%" },
        { name: "인구 증가", value: "+2/턴" },
      ],
      research: [
        { name: "연구 포인트 증가", value: "+3/턴" },
        { name: "기술 연구 속도", value: "+5%" },
        { name: "마력 증가", value: "+1/턴" },
      ],
      culture: [
        { name: "신뢰도 증가", value: "+2/턴" },
        { name: "불만도 감소", value: "-1/턴" },
        { name: "문화 영향력 증가", value: "+3/턴" },
      ],
      diplomacy: [
        { name: "외교 영향력 증가", value: "+2/턴" },
        { name: "무역 수입 증가", value: "+5/턴" },
        { name: "동맹 관계 개선", value: "+1/턴" },
      ],
    }
  };
  
  // 자원 탭 렌더링
  const renderResourceTab = () => {
    switch (activeTab) {
      case "basic":
        return renderResourceList([...basicResources, ...socialResources]);
      case "advanced":
        return renderResourceList([...advancedResources, ...specialResources]);
      case "production":
        return renderProductionTab();
      case "allocation":
        return renderAllocationTab();
      default:
        return null;
    }
  };
  
  // 자원 목록 렌더링
  const renderResourceList = (resources) => {
    return (
      <div className="resource-grid">
        {resources.map(resource => (
          <div 
            key={resource.id} 
            className={`resource-card ${selectedResource === resource.id ? "selected" : ""}`}
            onClick={() => setSelectedResource(resource.id === selectedResource ? null : resource.id)}
            style={{ borderColor: resource.color }}
          >
            <div className="resource-icon" style={{ backgroundColor: resource.color }}>
              {resource.icon}
            </div>
            <div className="resource-info">
              <h3>{resource.name}</h3>
              <div className="resource-value">
                {resource.max ? 
                  <div className="resource-bar-container">
                    <div 
                      className="resource-bar" 
                      style={{ 
                        width: `${(resource.value / resource.max) * 100}%`,
                        backgroundColor: resource.color
                      }}
                    ></div>
                    <span>{resource.value} / {resource.max}</span>
                  </div> :
                  <span>{resource.value}</span>
                }
              </div>
              {showTrends && (
                <div className="resource-trend">
                  {resource.trend}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  // 생산 탭 렌더링
  const renderProductionTab = () => {
    return (
      <div className="production-container">
        <div className="production-column">
          <h3>자원 생산</h3>
          {resourceProduction.map(item => (
            <div key={item.resource} className="production-section">
              <h4>{getResourceName(item.resource)} 생산</h4>
              <ul className="production-list">
                {item.sources.map((source, index) => (
                  <li key={index} className="production-item">
                    <span className="source-icon">{source.icon}</span>
                    <span className="source-name">{source.name}</span>
                    <span className="source-amount">+{source.amount}</span>
                  </li>
                ))}
              </ul>
              <div className="production-total">
                총 생산량: +{item.sources.reduce((sum, source) => sum + source.amount, 0)}
              </div>
            </div>
          ))}
        </div>
        
        <div className="production-column">
          <h3>자원 소비</h3>
          {resourceConsumption.map(item => (
            <div key={item.resource} className="consumption-section">
              <h4>{getResourceName(item.resource)} 소비</h4>
              <ul className="consumption-list">
                {item.consumers.map((consumer, index) => (
                  <li key={index} className="consumption-item">
                    <span className="consumer-icon">{consumer.icon}</span>
                    <span className="consumer-name">{consumer.name}</span>
                    <span className="consumer-amount">{consumer.amount}</span>
                  </li>
                ))}
              </ul>
              <div className="consumption-total">
                총 소비량: {item.consumers.reduce((sum, consumer) => sum + consumer.amount, 0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  
  // 할당 탭 렌더링
  const renderAllocationTab = () => {
    return (
      <div className="allocation-container">
        <div className="allocation-sliders">
          <h3>자원 할당</h3>
          <p className="allocation-description">
            국가 자원을 다양한 분야에 할당하여 각 분야의 발전을 촉진할 수 있습니다.
            총 할당량은 100%를 초과할 수 없습니다.
          </p>
          
          <div className="allocation-total">
            총 할당량: {resourceAllocation.categories.reduce((sum, cat) => sum + cat.allocation, 0)}%
          </div>
          
          {resourceAllocation.categories.map(category => (
            <div key={category.id} className="allocation-slider-container">
              <div className="allocation-category">
                <span className="category-icon">{category.icon}</span>
                <span className="category-name">{category.name}</span>
                <span className="category-value">{category.allocation}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={category.allocation} 
                className="allocation-slider"
                style={{ 
                  background: `linear-gradient(to right, #4caf50 0%, #4caf50 ${category.allocation}%, #e0e0e0 ${category.allocation}%, #e0e0e0 100%)` 
                }}
                readOnly
              />
              <div className="allocation-effects">
                {resourceAllocation.effects[category.id].map((effect, index) => (
                  <div key={index} className="allocation-effect">
                    <span className="effect-name">{effect.name}:</span>
                    <span className="effect-value">{effect.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        
        <div className="allocation-chart">
          <h3>자원 분배 차트</h3>
          <div className="pie-chart-container">
            <div className="pie-chart">
              {resourceAllocation.categories.map((category, index) => {
                const previousTotal = resourceAllocation.categories
                  .slice(0, index)
                  .reduce((sum, cat) => sum + cat.allocation, 0);
                
                return (
                  <div 
                    key={category.id}
                    className="pie-slice"
                    style={{
                      backgroundColor: getCategoryColor(category.id),
                      transform: `rotate(${previousTotal * 3.6}deg)`,
                      clipPath: `polygon(50% 50%, 50% 0%, ${category.allocation > 50 ? "0% 0%, 0% 100%, 100% 100%, 100% 0%," : ""} ${50 + 50 * Math.cos((previousTotal + category.allocation) * 0.0628)}% ${50 + 50 * Math.sin((previousTotal + category.allocation) * 0.0628)}%)`
                    }}
                  ></div>
                );
              })}
              <div className="pie-center"></div>
            </div>
            
            <div className="pie-legend">
              {resourceAllocation.categories.map(category => (
                <div key={category.id} className="legend-item">
                  <div 
                    className="legend-color" 
                    style={{ backgroundColor: getCategoryColor(category.id) }}
                  ></div>
                  <div className="legend-name">{category.name} ({category.allocation}%)</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  // 자원 이름 가져오기
  const getResourceName = (resourceId) => {
    const allResources = [...basicResources, ...advancedResources, ...specialResources, ...socialResources];
    const resource = allResources.find(r => r.id === resourceId);
    return resource ? resource.name : resourceId;
  };
  
  // 카테고리 색상 가져오기
  const getCategoryColor = (categoryId) => {
    switch (categoryId) {
      case "military": return "#e74c3c";
      case "economy": return "#f1c40f";
      case "research": return "#3498db";
      case "culture": return "#9b59b6";
      case "diplomacy": return "#2ecc71";
      default: return "#95a5a6";
    }
  };
  
  // 자원 세부 정보 렌더링
  const renderResourceDetail = () => {
    if (!selectedResource) return null;
    
    const allResources = [...basicResources, ...advancedResources, ...specialResources, ...socialResources];
    const resource = allResources.find(r => r.id === selectedResource);
    
    if (!resource) return null;
    
    // 생산 정보 찾기
    const production = resourceProduction.find(p => p.resource === selectedResource);
    
    // 소비 정보 찾기
    const consumption = resourceConsumption.find(c => c.resource === selectedResource);
    
    return (
      <div className="resource-detail-panel">
        <h3 style={{ color: resource.color }}>
          <span className="detail-icon">{resource.icon}</span>
          {resource.name} 세부 정보
        </h3>
        
        <div className="detail-current">
          <div className="detail-value">현재 보유량: {resource.value}</div>
          <div className="detail-trend">변화량: {resource.trend}</div>
        </div>
        
        {production && (
          <div className="detail-production">
            <h4>생산 소스</h4>
            <ul>
              {production.sources.map((source, index) => (
                <li key={index}>
                  <span className="source-icon">{source.icon}</span>
                  <span className="source-name">{source.name}</span>
                  <span className="source-amount">+{source.amount}</span>
                </li>
              ))}
            </ul>
            <div className="detail-total">
              총 생산량: +{production.sources.reduce((sum, source) => sum + source.amount, 0)}
            </div>
          </div>
        )}
        
        {consumption && (
          <div className="detail-consumption">
            <h4>소비 소스</h4>
            <ul>
              {consumption.consumers.map((consumer, index) => (
                <li key={index}>
                  <span className="consumer-icon">{consumer.icon}</span>
                  <span className="consumer-name">{consumer.name}</span>
                  <span className="consumer-amount">{consumer.amount}</span>
                </li>
              ))}
            </ul>
            <div className="detail-total">
              총 소비량: {consumption.consumers.reduce((sum, consumer) => sum + consumer.amount, 0)}
            </div>
          </div>
        )}
        
        <div className="detail-net">
          <h4>순 변화량</h4>
          <div className="net-value">
            {production && consumption ? 
              production.sources.reduce((sum, source) => sum + source.amount, 0) + 
              consumption.consumers.reduce((sum, consumer) => sum + consumer.amount, 0) :
              resource.trend
            }
          </div>
        </div>
        
        <button 
          className="detail-close" 
          onClick={() => setSelectedResource(null)}
        >
          닫기
        </button>
      </div>
    );
  };
  
  return (
    <div className="enhanced-resource-dashboard">
      <div className="dashboard-header">
        <h2>자원 관리 대시보드</h2>
        <div className="dashboard-controls">
          <button 
            className={`trend-toggle ${showTrends ? "active" : ""}`}
            onClick={() => setShowTrends(!showTrends)}
          >
            {showTrends ? "추세 숨기기" : "추세 보기"}
          </button>
        </div>
      </div>
      
      <div className="dashboard-tabs">
        <button 
          className={`tab-button ${activeTab === "basic" ? "active" : ""}`}
          onClick={() => setActiveTab("basic")}
        >
          기본 자원
        </button>
        <button 
          className={`tab-button ${activeTab === "advanced" ? "active" : ""}`}
          onClick={() => setActiveTab("advanced")}
        >
          고급 자원
        </button>
        <button 
          className={`tab-button ${activeTab === "production" ? "active" : ""}`}
          onClick={() => setActiveTab("production")}
        >
          생산 & 소비
        </button>
        <button 
          className={`tab-button ${activeTab === "allocation" ? "active" : ""}`}
          onClick={() => setActiveTab("allocation")}
        >
          자원 할당
        </button>
      </div>
      
      <div className="dashboard-content">
        {renderResourceTab()}
      </div>
      
      {selectedResource && renderResourceDetail()}
    </div>
  );
};

export default ResourceDashboard;