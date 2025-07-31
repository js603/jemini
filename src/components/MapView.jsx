import React, { useState, useEffect, useRef } from "react";
import { useGameStore } from "../store/gameSlice";
import mapData from "../data/map.json";
import "../styles/MapView.css";

// MapView.jsx - 대형 SLG를 위한 확장된 맵 시각화 컴포넌트
const MapView = () => {
  const { 
    territories, 
    discoveredTerritories, 
    selectedTerritory, 
    setSelectedTerritory,
    factions
  } = useGameStore();
  
  const [mapSize, setMapSize] = useState({ width: 1000, height: 800 });
  const [hoveredTerritory, setHoveredTerritory] = useState(null);
  const [showResourceInfo, setShowResourceInfo] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [showMinimap, setShowMinimap] = useState(true);
  const [territoryFilter, setTerritoryFilter] = useState("all"); // all, player, neutral, faction
  const [resourceFilter, setResourceFilter] = useState("none"); // none, food, gold, wood, stone, iron, mana
  
  const mapContainerRef = useRef(null);
  
  // 맵 크기 조정 (반응형)
  useEffect(() => {
    const handleResize = () => {
      const container = mapContainerRef.current;
      if (container) {
        const width = container.clientWidth;
        const height = width * 0.8; // 5:4 비율 유지
        setMapSize({ width, height });
      }
    };
    
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  
  // 영토 클릭 핸들러
  const handleTerritoryClick = (territory) => {
    // 발견되지 않은 영토는 선택할 수 없음
    if (!discoveredTerritories.includes(territory.id)) return;
    
    setSelectedTerritory(territory.id);
    setShowResourceInfo(true);
  };
  
  // 영토 호버 핸들러
  const handleTerritoryHover = (territory) => {
    setHoveredTerritory(territory);
  };
  
  // 맵 드래그 시작 핸들러
  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStart({ 
      x: e.clientX - mapOffset.x, 
      y: e.clientY - mapOffset.y 
    });
  };
  
  // 맵 드래그 중 핸들러
  const handleDragMove = (e) => {
    if (!isDragging) return;
    
    setMapOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };
  
  // 맵 드래그 종료 핸들러
  const handleDragEnd = () => {
    setIsDragging(false);
  };
  
  // 줌 레벨 변경 핸들러
  const handleZoom = (delta) => {
    setZoomLevel(prevZoom => {
      const newZoom = Math.max(0.5, Math.min(2, prevZoom + delta * 0.1));
      return newZoom;
    });
  };
  
  // 마우스 휠 이벤트 핸들러
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    handleZoom(delta);
  };
  
  // 영토 색상 결정 함수
  const getTerritoryColor = (territory) => {
    // 발견되지 않은 영토
    if (!discoveredTerritories.includes(territory.id)) {
      return "#333333";
    }
    
    // 선택된 영토
    if (selectedTerritory === territory.id) {
      return "#FFD700"; // 금색
    }
    
    // 호버된 영토
    if (hoveredTerritory && hoveredTerritory.id === territory.id) {
      return "#AADDFF";
    }
    
    // 자원 필터링 모드일 때
    if (resourceFilter !== "none") {
      const resourceValue = territory.resources[resourceFilter] || 0;
      // 자원 양에 따른 색상 강도 결정
      const intensity = Math.min(255, Math.max(50, Math.floor(resourceValue * 5)));
      
      switch (resourceFilter) {
        case "food":
          return `rgb(0, ${intensity}, 0)`; // 녹색 (식량)
        case "gold":
          return `rgb(${intensity}, ${intensity}, 0)`; // 노란색 (금)
        case "wood":
          return `rgb(${intensity/2}, ${intensity/3}, 0)`; // 갈색 (목재)
        case "stone":
          return `rgb(${intensity}, ${intensity}, ${intensity})`; // 회색 (돌)
        case "iron":
          return `rgb(${intensity/2}, ${intensity/2}, ${intensity})`; // 청회색 (철)
        case "mana":
          return `rgb(${intensity/2}, 0, ${intensity})`; // 보라색 (마나)
        default:
          break;
      }
    }
    
    // 소유권에 따른 색상
    if (territoryFilter !== "all") {
      if (territoryFilter === "player" && territory.controlledBy !== "player") {
        return "#777777"; // 플레이어 필터 시 다른 영토는 회색으로 흐리게 표시
      } else if (territoryFilter === "neutral" && territory.controlledBy !== "neutral") {
        return "#777777"; // 중립 필터 시 다른 영토는 회색으로 흐리게 표시
      } else if (territoryFilter === "faction" && !territory.controlledBy.includes("faction_")) {
        return "#777777"; // 세력 필터 시 다른 영토는 회색으로 흐리게 표시
      }
    }
    
    const faction = factions.find(f => f.id === territory.controlledBy);
    if (faction) {
      return faction.color;
    }
    
    // 기본 색상 (중립 영토)
    if (territory.controlledBy === "neutral") {
      return "#AAAAAA";
    }
    
    // 미발견 영토
    if (territory.controlledBy === "undiscovered") {
      return "#333333";
    }
    
    // 플레이어 영토
    if (territory.controlledBy === "player") {
      return "#4a90e2"; // 파란색
    }
    
    return "#CCCCCC"; // 기본 회색
  };
  
  // 영토 테두리 색상 결정 함수
  const getTerritoryBorderColor = (territory) => {
    // 선택된 영토
    if (selectedTerritory === territory.id) {
      return "#FF9900"; // 주황색 테두리
    }
    
    // 호버된 영토
    if (hoveredTerritory && hoveredTerritory.id === territory.id) {
      return "#FFFFFF"; // 흰색 테두리
    }
    
    // 기본 테두리 색상
    return "#000000";
  };
  
  // 영토 정보 표시 컴포넌트
  const TerritoryInfo = ({ territory }) => {
    if (!territory || !discoveredTerritories.includes(territory.id)) return null;
    
    return (
      <div className="territory-info">
        <h3>{territory.name}</h3>
        <p>{territory.description}</p>
        <div className="territory-resources">
          <h4>자원:</h4>
          <ul>
            {Object.entries(territory.resources).map(([resource, amount]) => (
              amount > 0 && (
                <li key={resource} className={`resource-item ${resource}`}>
                  <span className="resource-icon">{getResourceIcon(resource)}</span>
                  <span className="resource-name">{getResourceName(resource)}:</span> 
                  <span className="resource-amount">{amount}</span>
                </li>
              )
            ))}
          </ul>
        </div>
        {territory.specialFeatures && territory.specialFeatures.length > 0 && (
          <div className="territory-features">
            <h4>특수 지형:</h4>
            <ul>
              {territory.specialFeatures.map(feature => (
                <li key={feature} className="feature-item">
                  {getFeatureName(feature)}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="territory-status">
          <p>
            <strong>지형:</strong> {getTerrainName(territory.type)}
          </p>
          <p>
            <strong>방어 보너스:</strong> {territory.defenseBonus}
          </p>
          <p>
            <strong>개발 수준:</strong> {territory.developmentLevel}
          </p>
          <p>
            <strong>소유:</strong> {getControllerName(territory.controlledBy)}
          </p>
        </div>
      </div>
    );
  };
  
  // 자원 아이콘 가져오기
  const getResourceIcon = (resource) => {
    switch (resource) {
      case "food": return "🌾";
      case "gold": return "💰";
      case "wood": return "🌲";
      case "stone": return "🪨";
      case "iron": return "⚒️";
      case "mana": return "✨";
      default: return "📦";
    }
  };
  
  // 자원 이름 가져오기
  const getResourceName = (resource) => {
    switch (resource) {
      case "food": return "식량";
      case "gold": return "금화";
      case "wood": return "목재";
      case "stone": return "석재";
      case "iron": return "철광석";
      case "mana": return "마력";
      default: return resource;
    }
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
  
  // 특수 지형 이름 가져오기
  const getFeatureName = (feature) => {
    switch (feature) {
      case "capital": return "수도";
      case "tradingHub": return "교역 중심지";
      case "miningComplex": return "광산 단지";
      case "ancientGrove": return "고대 숲";
      case "harbor": return "항구";
      case "fertileLands": return "비옥한 토지";
      case "ancientRuins": return "고대 유적";
      case "magicCrystals": return "마법 수정";
      case "borderFortress": return "국경 요새";
      case "abandonedMines": return "버려진 광산";
      case "tradingPort": return "무역항";
      case "tradingMarket": return "시장";
      case "mysticalBog": return "신비한 늪";
      case "watchTower": return "감시탑";
      case "fishingVillage": return "어촌";
      case "luxuryGoods": return "사치품 생산지";
      case "deepMines": return "심층 광산";
      case "frozenMagic": return "얼어붙은 마법";
      case "volcanicForge": return "화산 대장간";
      case "medicinalPlants": return "약용 식물";
      case "hiddenVillage": return "숨겨진 마을";
      case "oasis": return "오아시스";
      case "lighthouse": return "등대";
      case "huntingGrounds": return "사냥터";
      case "vineyards": return "포도원";
      default: return feature;
    }
  };
  
  // 소유자 이름 가져오기
  const getControllerName = (controller) => {
    switch (controller) {
      case "player": return "플레이어";
      case "neutral": return "중립";
      case "undiscovered": return "미발견";
      case "faction_east": return "동방 제국";
      case "faction_west": return "서방 연합";
      case "faction_south": return "남부 왕국";
      case "faction_north": return "북방 부족";
      default: return controller;
    }
  };
  
  // 영토 렌더링 함수
  const renderTerritories = () => {
    return mapData.map(territory => {
      const { id, position, name, type } = territory;
      const isDiscovered = discoveredTerritories.includes(id);
      
      // 영토 위치 계산 (맵 크기에 맞게 조정)
      const x = (position.x / 50) * mapSize.width * zoomLevel + mapOffset.x;
      const y = (position.y / 50) * mapSize.height * zoomLevel + mapOffset.y;
      
      // 영토 크기 (맵 크기에 맞게 조정)
      const size = Math.min(mapSize.width, mapSize.height) / 30 * zoomLevel;
      
      // 지형에 따른 모양 결정
      let shape;
      switch (type) {
        case "mountains":
          // 산맥은 삼각형으로 표현
          shape = (
            <polygon 
              points={`${x},${y-size} ${x+size},${y+size} ${x-size},${y+size}`}
              fill={getTerritoryColor(territory)}
              stroke={getTerritoryBorderColor(territory)}
              strokeWidth={selectedTerritory === id ? 3 : 1}
            />
          );
          break;
        case "forest":
          // 숲은 원형으로 표현
          shape = (
            <circle 
              cx={x} 
              cy={y} 
              r={size}
              fill={getTerritoryColor(territory)}
              stroke={getTerritoryBorderColor(territory)}
              strokeWidth={selectedTerritory === id ? 3 : 1}
            />
          );
          break;
        case "coast":
        case "island":
          // 해안과 섬은 물결 모양으로 표현
          shape = (
            <path 
              d={`M${x-size},${y} C${x-size/2},${y-size/2} ${x+size/2},${y-size/2} ${x+size},${y} C${x+size/2},${y+size/2} ${x-size/2},${y+size/2} ${x-size},${y}`}
              fill={getTerritoryColor(territory)}
              stroke={getTerritoryBorderColor(territory)}
              strokeWidth={selectedTerritory === id ? 3 : 1}
            />
          );
          break;
        case "swamp":
          // 습지는 불규칙한 모양으로 표현
          shape = (
            <path 
              d={`M${x-size},${y-size/2} L${x-size/2},${y-size} L${x+size/2},${y-size} L${x+size},${y-size/2} L${x+size/2},${y+size/2} L${x},${y+size} L${x-size/2},${y+size/2} Z`}
              fill={getTerritoryColor(territory)}
              stroke={getTerritoryBorderColor(territory)}
              strokeWidth={selectedTerritory === id ? 3 : 1}
            />
          );
          break;
        default:
          // 기본 육각형 모양
          shape = (
            <polygon 
              points={`${x},${y-size} ${x+size*0.866},${y-size*0.5} ${x+size*0.866},${y+size*0.5} ${x},${y+size} ${x-size*0.866},${y+size*0.5} ${x-size*0.866},${y-size*0.5}`}
              fill={getTerritoryColor(territory)}
              stroke={getTerritoryBorderColor(territory)}
              strokeWidth={selectedTerritory === id ? 3 : 1}
            />
          );
      }
      
      return (
        <g 
          key={id}
          onClick={() => handleTerritoryClick(territory)}
          onMouseEnter={() => handleTerritoryHover(territory)}
          onMouseLeave={() => setHoveredTerritory(null)}
          className={`territory ${isDiscovered ? "discovered" : "undiscovered"} ${selectedTerritory === id ? "selected" : ""}`}
        >
          {shape}
          
          {isDiscovered && (
            <text 
              x={x} 
              y={y} 
              textAnchor="middle" 
              fill="#FFFFFF" 
              fontSize={12 * zoomLevel}
              className="territory-name"
              style={{ textShadow: "1px 1px 2px black" }}
            >
              {name}
            </text>
          )}
          
          {/* 도시 표시 */}
          {isDiscovered && territory.cities && territory.cities.length > 0 && (
            <g className="city-markers">
              {territory.cities.map((cityId, index) => (
                <circle 
                  key={cityId}
                  cx={x + (index - territory.cities.length/2 + 0.5) * size * 0.4} 
                  cy={y + size * 0.6} 
                  r={size/5} 
                  fill="#FFFFFF" 
                  stroke="#000000" 
                  strokeWidth="1"
                  className="city-marker"
                />
              ))}
            </g>
          )}
          
          {/* 특수 지형 아이콘 */}
          {isDiscovered && territory.specialFeatures && territory.specialFeatures.length > 0 && (
            <text 
              x={x} 
              y={y - size * 0.7} 
              textAnchor="middle" 
              fontSize={14 * zoomLevel}
              className="special-feature-icon"
            >
              {getSpecialFeatureIcon(territory.specialFeatures[0])}
            </text>
          )}
        </g>
      );
    });
  };
  
  // 특수 지형 아이콘 가져오기
  const getSpecialFeatureIcon = (feature) => {
    switch (feature) {
      case "capital": return "👑";
      case "tradingHub": return "🏪";
      case "miningComplex": return "⛏️";
      case "ancientGrove": return "🌳";
      case "harbor": return "⚓";
      case "fertileLands": return "🌾";
      case "ancientRuins": return "🏛️";
      case "magicCrystals": return "💎";
      case "borderFortress": return "🏰";
      case "abandonedMines": return "🕳️";
      case "tradingPort": return "🚢";
      case "tradingMarket": return "🛒";
      case "mysticalBog": return "🌫️";
      case "watchTower": return "🗼";
      case "fishingVillage": return "🐟";
      case "luxuryGoods": return "👑";
      case "deepMines": return "⛏️";
      case "frozenMagic": return "❄️";
      case "volcanicForge": return "🌋";
      case "medicinalPlants": return "🌿";
      case "hiddenVillage": return "🏡";
      case "oasis": return "🌴";
      case "lighthouse": return "🏮";
      case "huntingGrounds": return "🏹";
      case "vineyards": return "🍇";
      default: return "⭐";
    }
  };
  
  // 영토 간 연결선 렌더링 함수
  const renderConnections = () => {
    const connections = [];
    
    mapData.forEach(territory => {
      const { id, position, neighbors } = territory;
      
      // 발견된 영토만 연결선 표시
      if (!discoveredTerritories.includes(id)) return;
      
      const x1 = (position.x / 50) * mapSize.width * zoomLevel + mapOffset.x;
      const y1 = (position.y / 50) * mapSize.height * zoomLevel + mapOffset.y;
      
      neighbors.forEach(neighborId => {
        // 이미 처리한 연결은 건너뜀 (중복 방지)
        if (id > neighborId) return;
        
        const neighbor = mapData.find(t => t.id === neighborId);
        if (!neighbor) return;
        
        // 발견된 이웃 영토만 연결선 표시
        if (!discoveredTerritories.includes(neighborId)) return;
        
        const x2 = (neighbor.position.x / 50) * mapSize.width * zoomLevel + mapOffset.x;
        const y2 = (neighbor.position.y / 50) * mapSize.height * zoomLevel + mapOffset.y;
        
        connections.push(
          <line 
            key={`${id}-${neighborId}`}
            x1={x1} 
            y1={y1} 
            x2={x2} 
            y2={y2}
            stroke="#666666"
            strokeWidth="1"
            strokeDasharray="5,5"
            className="territory-connection"
          />
        );
      });
    });
    
    return connections;
  };
  
  // 그리드 렌더링 함수
  const renderGrid = () => {
    if (!showGrid) return null;
    
    const gridLines = [];
    const gridSize = 50; // 그리드 셀 수
    const cellWidth = mapSize.width * zoomLevel / gridSize;
    const cellHeight = mapSize.height * zoomLevel / gridSize;
    
    // 수직선
    for (let i = 0; i <= gridSize; i++) {
      const x = i * cellWidth + mapOffset.x;
      gridLines.push(
        <line 
          key={`v-${i}`}
          x1={x} 
          y1={mapOffset.y} 
          x2={x} 
          y2={mapSize.height * zoomLevel + mapOffset.y}
          stroke="#444444"
          strokeWidth="0.5"
          strokeDasharray="2,2"
        />
      );
    }
    
    // 수평선
    for (let i = 0; i <= gridSize; i++) {
      const y = i * cellHeight + mapOffset.y;
      gridLines.push(
        <line 
          key={`h-${i}`}
          x1={mapOffset.x} 
          y1={y} 
          x2={mapSize.width * zoomLevel + mapOffset.x} 
          y2={y}
          stroke="#444444"
          strokeWidth="0.5"
          strokeDasharray="2,2"
        />
      );
    }
    
    return gridLines;
  };
  
  // 미니맵 렌더링 함수
  const renderMinimap = () => {
    if (!showMinimap) return null;
    
    const minimapSize = 200;
    const scale = minimapSize / Math.max(mapSize.width, mapSize.height);
    
    // 현재 뷰포트 계산
    const viewportWidth = mapSize.width / zoomLevel;
    const viewportHeight = mapSize.height / zoomLevel;
    const viewportX = -mapOffset.x / zoomLevel;
    const viewportY = -mapOffset.y / zoomLevel;
    
    // 미니맵에서의 뷰포트 위치 및 크기
    const minimapViewportX = viewportX * scale;
    const minimapViewportY = viewportY * scale;
    const minimapViewportWidth = viewportWidth * scale;
    const minimapViewportHeight = viewportHeight * scale;
    
    return (
      <div className="minimap-container">
        <svg width={minimapSize} height={minimapSize} className="minimap">
          <rect 
            x={0} 
            y={0} 
            width={minimapSize} 
            height={minimapSize}
            fill="#1a2639"
          />
          
          {mapData.map(territory => {
            const { id, position } = territory;
            const x = (position.x / 50) * minimapSize;
            const y = (position.y / 50) * minimapSize;
            const size = 4;
            
            return (
              <rect 
                key={id}
                x={x - size/2} 
                y={y - size/2} 
                width={size} 
                height={size}
                fill={discoveredTerritories.includes(id) ? getTerritoryColor(territory) : "#333"}
                onClick={() => {
                  // 미니맵에서 영토 클릭 시 해당 위치로 이동
                  if (discoveredTerritories.includes(id)) {
                    const centerX = (position.x / 50) * mapSize.width * zoomLevel - mapSize.width / 2;
                    const centerY = (position.y / 50) * mapSize.height * zoomLevel - mapSize.height / 2;
                    setMapOffset({ x: -centerX, y: -centerY });
                  }
                }}
              />
            );
          })}
          
          {/* 현재 보이는 영역 표시 */}
          <rect 
            x={minimapViewportX} 
            y={minimapViewportY} 
            width={minimapViewportWidth} 
            height={minimapViewportHeight}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1"
          />
        </svg>
      </div>
    );
  };
  
  // 필터 컨트롤 렌더링 함수
  const renderFilterControls = () => {
    return (
      <div className="map-filters">
        <div className="filter-group">
          <label>영토 필터:</label>
          <select 
            value={territoryFilter} 
            onChange={(e) => setTerritoryFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">모든 영토</option>
            <option value="player">플레이어 영토</option>
            <option value="neutral">중립 영토</option>
            <option value="faction">세력 영토</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>자원 필터:</label>
          <select 
            value={resourceFilter} 
            onChange={(e) => setResourceFilter(e.target.value)}
            className="filter-select"
          >
            <option value="none">필터 없음</option>
            <option value="food">식량</option>
            <option value="gold">금화</option>
            <option value="wood">목재</option>
            <option value="stone">석재</option>
            <option value="iron">철광석</option>
            <option value="mana">마력</option>
          </select>
        </div>
      </div>
    );
  };
  
  return (
    <div className="enhanced-map-view">
      <div 
        ref={mapContainerRef}
        className="map-container"
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onWheel={handleWheel}
      >
        <svg width={mapSize.width} height={mapSize.height} className="map">
          {/* 배경 */}
          <rect 
            x={0} 
            y={0} 
            width={mapSize.width} 
            height={mapSize.height} 
            fill="#1a2639" 
            className="map-background"
          />
          
          {/* 그리드 */}
          {renderGrid()}
          
          {/* 영토 간 연결선 */}
          {renderConnections()}
          
          {/* 영토 */}
          {renderTerritories()}
        </svg>
        
        {/* 미니맵 */}
        {renderMinimap()}
        
        {/* 영토 정보 패널 */}
        {selectedTerritory && showResourceInfo && (
          <TerritoryInfo 
            territory={mapData.find(t => t.id === selectedTerritory)} 
          />
        )}
        
        {/* 줌 컨트롤 */}
        <div className="zoom-controls">
          <button onClick={() => handleZoom(1)} className="zoom-button">+</button>
          <div className="zoom-level">{Math.round(zoomLevel * 100)}%</div>
          <button onClick={() => handleZoom(-1)} className="zoom-button">-</button>
        </div>
      </div>
      
      <div className="map-controls">
        {renderFilterControls()}
        
        <div className="control-buttons">
          <button onClick={() => setShowResourceInfo(!showResourceInfo)} className="control-button">
            {showResourceInfo ? "정보 숨기기" : "정보 보기"}
          </button>
          <button onClick={() => setSelectedTerritory(null)} className="control-button">
            선택 해제
          </button>
          <button onClick={() => setShowGrid(!showGrid)} className="control-button">
            {showGrid ? "그리드 숨기기" : "그리드 표시"}
          </button>
          <button onClick={() => setShowMinimap(!showMinimap)} className="control-button">
            {showMinimap ? "미니맵 숨기기" : "미니맵 표시"}
          </button>
          <button onClick={() => {
            setZoomLevel(1);
            setMapOffset({ x: 0, y: 0 });
          }} className="control-button">
            맵 초기화
          </button>
        </div>
      </div>
    </div>
  );
};

export default MapView;