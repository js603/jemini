# 프로젝트 구조 재조직화 계획

## 현재 구조 분석

현재 프로젝트 구조는 다음과 같은 문제점이 있습니다:

1. Firebase 구성이 여러 파일에 중복되어 있음 (App.jsx, services/firebase.js, services/firebase/config.js)
2. 컴포넌트 구조가 일관성이 없음 (일부는 최상위 components 디렉토리에, 일부는 하위 디렉토리에 있음)
3. 게임 관련 컴포넌트가 여러 위치에 분산되어 있음 (components/game, components/gameRoom 등)

## 새로운 구조 계획

### 디렉토리 구조

```
src/
├── components/
│   ├── common/             # 공통 UI 컴포넌트
│   ├── game/               # 게임 관련 컴포넌트
│   │   ├── advisors/       # 보좌관 관련 컴포넌트
│   │   ├── dashboard/      # 대시보드 관련 컴포넌트
│   │   ├── diplomacy/      # 외교 관련 컴포넌트
│   │   ├── events/         # 이벤트 관련 컴포넌트
│   │   ├── map/            # 지도 관련 컴포넌트
│   │   ├── technology/     # 기술 관련 컴포넌트
│   │   └── turns/          # 턴 관련 컴포넌트
│   ├── gameRoom/           # 게임룸 관련 컴포넌트
│   │   ├── index.jsx       # GameRoom 컴포넌트
│   │   ├── LoadingState.jsx
│   │   ├── ErrorState.jsx
│   │   ├── GameOverState.jsx
│   │   └── WaitingRoomState.jsx
│   └── lobby/              # 로비 관련 컴포넌트
│       └── index.jsx       # Lobby 컴포넌트
├── data/                   # 게임 데이터
│   ├── advisorPersonas.js
│   ├── mapData.js
│   ├── techTree.js
│   └── index.js
├── hooks/                  # 커스텀 훅
│   ├── useGameState.js
│   ├── useNotifications.js
│   ├── useResponsive.js
│   └── index.js
├── services/               # 서비스
│   ├── ai/                 # AI 서비스
│   │   ├── llmService.js
│   │   └── index.js
│   ├── firebase/           # Firebase 서비스
│   │   ├── config.js       # Firebase 구성
│   │   ├── auth.js         # 인증 관련 함수
│   │   ├── firestore.js    # Firestore 관련 함수
│   │   └── index.js
│   └── index.js
├── utils/                  # 유틸리티 함수
│   ├── commandExecution.js
│   ├── commandHandlers.js
│   ├── gameLogic.js
│   └── index.js
├── styles/                 # 스타일
│   └── animations.css
├── App.jsx                 # 최상위 컴포넌트
└── index.js                # 진입점
```

## 구현 계획

### 1. Firebase 구성 정리

1. `services/firebase/config.js`를 단일 진실 소스(single source of truth)로 사용
2. `services/firebase/auth.js` 파일 생성하여 인증 관련 함수 이동
3. `services/firebase/firestore.js` 파일 생성하여 Firestore 관련 함수 이동
4. `services/firebase/index.js` 업데이트하여 모든 Firebase 관련 함수 내보내기
5. `App.jsx`에서 하드코딩된 Firebase 구성 제거

### 2. 컴포넌트 구조 정리

1. `GameRoom.jsx`를 `components/gameRoom/index.jsx`로 이동
2. `Lobby.jsx`를 `components/lobby/index.jsx`로 이동
3. 게임 관련 컴포넌트를 적절한 하위 디렉토리로 이동
   - `AdvisorView.jsx` → `components/game/advisors/AdvisorView.jsx`
   - `Dashboard.jsx` → `components/game/dashboard/Dashboard.jsx`
   - `DiplomacyView.jsx` → `components/game/diplomacy/DiplomacyView.jsx`
   - `EventLog.jsx` → `components/game/events/EventLog.jsx`
   - `MapView.jsx` → `components/game/map/MapView.jsx`
   - `TechnologyView.jsx` → `components/game/technology/TechnologyView.jsx`
   - `TurnControls.jsx` → `components/game/turns/TurnControls.jsx`

### 3. 훅 및 유틸리티 정리

1. `hooks/index.js` 파일 생성하여 모든 훅 내보내기
2. `utils/index.js` 파일 생성하여 모든 유틸리티 함수 내보내기

### 4. 임포트 경로 업데이트

1. 모든 파일의 임포트 경로를 새로운 구조에 맞게 업데이트
2. 상대 경로 대신 절대 경로 사용 고려 (예: `import Button from 'components/common/Button'`)

## 구현 순서

1. Firebase 서비스 정리
2. 컴포넌트 구조 정리
3. 훅 및 유틸리티 정리
4. App.jsx 리팩토링
5. 임포트 경로 업데이트
6. 테스트 및 검증