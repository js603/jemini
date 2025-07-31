# Jemini 프로젝트 개선 구현 계획

이 문서는 Jemini 프로젝트의 코드 중복 및 파일 분할 문제를 해결하기 위한 구체적인 구현 계획을 제공합니다. 각 단계에는 필요한 파일 작업과 코드 수정 사항이 포함되어 있습니다.

## 1. 중복 컴포넌트 통합

### 1.1. MapView와 EnhancedMapView 통합

#### 작업 단계:

1. `MapView.jsx` 파일 삭제
2. `EnhancedMapView.jsx`의 이름을 `MapView.jsx`로 변경
3. `App.jsx`에서 import 경로 업데이트:
   ```javascript
   // 변경 전
   import EnhancedMapView from "./components/EnhancedMapView";
   
   // 변경 후
   import MapView from "./components/MapView";
   ```
4. `App.jsx`에서 컴포넌트 사용 업데이트:
   ```javascript
   // 변경 전
   {showMap && <EnhancedMapView />}
   
   // 변경 후
   {showMap && <MapView />}
   ```
5. `MapView.css` 파일 삭제 (필요한 스타일은 이미 `EnhancedMapView.css`에 포함됨)
6. `EnhancedMapView.css`의 이름을 `MapView.css`로 변경
7. 새로운 `MapView.jsx`에서 CSS import 경로 업데이트:
   ```javascript
   // 변경 전
   import "../styles/EnhancedMapView.css";
   
   // 변경 후
   import "../styles/MapView.css";
   ```

#### 이점:
- 코드 중복 제거
- 유지보수 간소화
- 일관된 맵 시각화 제공

### 1.2. ResourceDashboard와 EnhancedResourceDashboard 통합

#### 작업 단계:

1. `ResourceDashboard.jsx` 파일 삭제
2. `EnhancedResourceDashboard.jsx`의 이름을 `ResourceDashboard.jsx`로 변경
3. `App.jsx`에서 import 경로 업데이트:
   ```javascript
   // 변경 전
   import EnhancedResourceDashboard from "./components/EnhancedResourceDashboard";
   
   // 변경 후
   import ResourceDashboard from "./components/ResourceDashboard";
   ```
4. `App.jsx`에서 컴포넌트 사용 업데이트:
   ```javascript
   // 변경 전
   {showDashboard && <EnhancedResourceDashboard />}
   
   // 변경 후
   {showDashboard && <ResourceDashboard />}
   ```
5. `ResourceDashboard.css` 파일 삭제 (필요한 스타일은 이미 `EnhancedResourceDashboard.css`에 포함됨)
6. `EnhancedResourceDashboard.css`의 이름을 `ResourceDashboard.css`로 변경
7. 새로운 `ResourceDashboard.jsx`에서 CSS import 경로 업데이트:
   ```javascript
   // 변경 전
   import "../styles/EnhancedResourceDashboard.css";
   
   // 변경 후
   import "../styles/ResourceDashboard.css";
   ```

#### 이점:
- 코드 중복 제거
- 유지보수 간소화
- 일관된 자원 대시보드 제공

## 2. 중복 데이터 파일 통합

### 2.1. map.json과 expanded_map.json 통합

#### 작업 단계:

1. `map.json` 파일 삭제
2. `expanded_map.json`의 이름을 `map.json`으로 변경
3. `gameSlice.js`에서 import 경로는 이미 `map.json`을 가리키므로 변경할 필요가 없음
4. 새로운 `MapView.jsx`에서 import 경로 업데이트:
   ```javascript
   // 변경 전
   import expandedMapData from "../data/expanded_map.json";
   
   // 변경 후
   import mapData from "../data/map.json";
   ```
5. 새로운 `MapView.jsx`에서 변수 이름 업데이트:
   ```javascript
   // 변경 전 (여러 위치에서)
   expandedMapData.map(territory => { /* ... */ })
   
   // 변경 후
   mapData.map(territory => { /* ... */ })
   ```

#### 이점:
- 데이터 중복 제거
- 일관된 맵 데이터 사용
- 상태 관리와 UI 컴포넌트 간의 일관성 유지

## 3. 불필요한 파일 제거

### 3.1. 빈 index.js 파일 제거

#### 작업 단계:

1. `src/store/index.js` 파일 삭제

#### 이점:
- 불필요한 파일 제거
- 프로젝트 구조 간소화

## 4. 상태 관리 일관성 유지

### 4.1. gameSlice.js 업데이트

#### 작업 단계:

1. `gameSlice.js`에서 맵 데이터 사용 부분 확인 (이미 `map.json`을 사용하고 있으므로 파일 이름 변경 후에는 수정이 필요하지 않음)
2. 필요한 경우 맵 데이터 처리 로직 업데이트:
   ```javascript
   // 예: 위치 좌표 처리 로직이 다른 경우
   // 변경 전 (map.json 기준)
   const x = (position.x / 15) * mapSize.width;
   const y = (position.y / 15) * mapSize.height;
   
   // 변경 후 (expanded_map.json 기준)
   const x = (position.x / 50) * mapSize.width;
   const y = (position.y / 50) * mapSize.height;
   ```

#### 이점:
- 상태 관리와 UI 컴포넌트 간의 일관성 유지
- 데이터 처리 오류 방지

## 구현 순서

위의 작업을 다음 순서로 진행하는 것이 좋습니다:

1. 먼저 데이터 파일 통합 (map.json과 expanded_map.json)
2. 컴포넌트 통합 (MapView와 EnhancedMapView, ResourceDashboard와 EnhancedResourceDashboard)
3. 불필요한 파일 제거 (빈 index.js)
4. 상태 관리 일관성 확인 및 업데이트

이 순서로 진행하면 의존성 문제를 최소화하고 각 단계에서 발생할 수 있는 오류를 쉽게 식별하고 해결할 수 있습니다.

## 테스트 계획

각 변경 사항을 구현한 후에는 다음 테스트를 수행해야 합니다:

1. 애플리케이션이 오류 없이 시작되는지 확인
2. 맵 뷰가 올바르게 렌더링되는지 확인
3. 자원 대시보드가 올바르게 렌더링되는지 확인
4. 맵 상호작용 기능이 정상적으로 작동하는지 확인 (영토 선택, 호버, 줌, 패닝 등)
5. 자원 대시보드 상호작용 기능이 정상적으로 작동하는지 확인 (탭 전환, 자원 선택 등)
6. 게임 상태가 올바르게 유지되는지 확인

이러한 테스트를 통해 변경 사항이 애플리케이션의 기능에 부정적인 영향을 미치지 않는지 확인할 수 있습니다.