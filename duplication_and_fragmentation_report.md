# Jemini 프로젝트 코드 중복 및 파일 분할 분석 보고서

## 개요

이 보고서는 Jemini 프로젝트의 코드베이스를 분석하여 중복되거나 불필요하게 분할된 파일을 식별하고, 코드 구조를 개선하기 위한 권장사항을 제공합니다.

## 식별된 문제점

### 1. 컴포넌트 중복

#### 1.1. MapView와 EnhancedMapView

**문제점**: 
- `MapView.jsx`와 `EnhancedMapView.jsx` 두 파일이 매우 유사한 기능을 구현하고 있습니다.
- `EnhancedMapView.jsx`는 `MapView.jsx`의 확장 버전으로, 추가 기능을 포함하고 있습니다.
- 실제 애플리케이션에서는 `EnhancedMapView`만 사용되고 있으며, `MapView`는 사용되지 않습니다.

**중복 기능**:
- 영토 렌더링
- 영토 선택 및 호버 처리
- 영토 정보 표시
- 영토 간 연결선 렌더링
- 미니맵 기능

**EnhancedMapView의 추가 기능**:
- 줌 및 패닝 기능
- 지형에 따른 다양한 영토 모양
- 아이콘과 함께 더 상세한 영토 정보
- 그리드 표시 옵션
- 뷰포트 표시가 있는 고급 미니맵
- 영토 및 자원 필터링
- 특수 지형 아이콘

#### 1.2. ResourceDashboard와 EnhancedResourceDashboard

**문제점**:
- `ResourceDashboard.jsx`와 `EnhancedResourceDashboard.jsx` 두 파일이 매우 유사한 기능을 구현하고 있습니다.
- `EnhancedResourceDashboard.jsx`는 `ResourceDashboard.jsx`의 확장 버전으로, 추가 기능을 포함하고 있습니다.
- 실제 애플리케이션에서는 `EnhancedResourceDashboard`만 사용되고 있으며, `ResourceDashboard`는 사용되지 않습니다.

**중복 기능**:
- 자원 표시 및 시각화
- 탭 기반 자원 카테고리 구분
- 자원 바 및 그리드 렌더링

**EnhancedResourceDashboard의 추가 기능**:
- 추세 표시 기능
- 자원 생산 및 소비 세부 정보
- 자원 할당 시각화 (파이 차트)
- 자원 선택 시 상세 정보 패널
- 추세 표시/숨기기 토글

### 2. 데이터 파일 중복

#### 2.1. map.json과 expanded_map.json

**문제점**:
- `map.json`과 `expanded_map.json` 두 파일이 매우 유사한 데이터를 포함하고 있습니다.
- `expanded_map.json`은 `map.json`의 확장 버전으로, 추가 지역과 더 상세한 데이터를 포함하고 있습니다.
- `MapView.jsx`는 `map.json`을 사용하고, `EnhancedMapView.jsx`는 `expanded_map.json`을 사용합니다.
- 실제 애플리케이션에서는 `EnhancedMapView`만 사용되므로 `map.json`은 사용되지 않습니다.

**중복 데이터**:
- 처음 15개 지역(region_1부터 region_15까지)은 두 파일에서 거의 동일합니다.
- 지역 ID, 이름, 유형, 설명, 자원 등이 중복됩니다.

**expanded_map.json의 추가 데이터**:
- 추가 지역(region_16부터 region_27까지 등)
- 더 상세한 위치 좌표(0-15에서 0-50으로 확장)
- 기존 지역에 대한 추가 이웃 지역
- 추가 지형 유형(포도원, 광산, 빙하, 화산, 정글, 계곡, 사막, 절벽, 초원 등)

### 3. 불필요한 파일

#### 3.1. 빈 index.js 파일

**문제점**:
- `src/store/index.js` 파일이 비어 있습니다.
- 일반적으로 index.js 파일은 모듈을 내보내거나 여러 슬라이스를 결합하는 데 사용되지만, 이 파일은 사용되지 않습니다.
- 컴포넌트에서는 `gameSlice.js`를 직접 가져와 사용합니다.

### 4. 상태 관리 불일치

**문제점**:
- `gameSlice.js`는 `map.json`을 가져와 사용하지만, 실제 애플리케이션에서는 `EnhancedMapView`가 `expanded_map.json`을 사용합니다.
- 이로 인해 상태 관리와 UI 컴포넌트 간에 불일치가 발생할 수 있습니다.

## 권장 개선 사항

### 1. 중복 컴포넌트 통합

#### 1.1. MapView와 EnhancedMapView 통합

- `MapView.jsx` 파일을 제거하고 `EnhancedMapView.jsx`만 유지합니다.
- 필요한 경우 `EnhancedMapView.jsx`의 이름을 `MapView.jsx`로 변경하여 더 간결하게 만듭니다.
- 모든 컴포넌트가 통합된 맵 뷰를 사용하도록 업데이트합니다.

#### 1.2. ResourceDashboard와 EnhancedResourceDashboard 통합

- `ResourceDashboard.jsx` 파일을 제거하고 `EnhancedResourceDashboard.jsx`만 유지합니다.
- 필요한 경우 `EnhancedResourceDashboard.jsx`의 이름을 `ResourceDashboard.jsx`로 변경하여 더 간결하게 만듭니다.
- 모든 컴포넌트가 통합된 자원 대시보드를 사용하도록 업데이트합니다.

### 2. 중복 데이터 파일 통합

#### 2.1. map.json과 expanded_map.json 통합

- `map.json` 파일을 제거하고 `expanded_map.json`만 유지합니다.
- 필요한 경우 `expanded_map.json`의 이름을 `map.json`으로 변경하여 더 간결하게 만듭니다.
- `gameSlice.js`를 업데이트하여 통합된 맵 데이터를 사용하도록 합니다.

### 3. 불필요한 파일 제거

#### 3.1. 빈 index.js 파일 제거 또는 구현

- 빈 `src/store/index.js` 파일을 제거합니다.
- 또는 이 파일을 구현하여 `gameSlice.js`에서 스토어를 내보내도록 합니다.

### 4. 상태 관리 일관성 유지

- `gameSlice.js`를 업데이트하여 통합된 맵 데이터를 사용하도록 합니다.
- 상태 관리와 UI 컴포넌트 간의 일관성을 유지합니다.

## 결론

Jemini 프로젝트의 코드베이스에는 중복되거나 불필요하게 분할된 파일이 여러 개 있습니다. 이러한 문제를 해결하면 코드베이스가 더 간결해지고 유지보수가 용이해질 것입니다. 위에서 제안한 개선 사항을 구현하면 코드 중복을 줄이고 프로젝트 구조를 개선할 수 있습니다.