# Jemini 프로젝트 구조 문서

이 문서는 Jemini 프로젝트의 구조와 각 디렉토리 및 파일의 역할을 설명합니다.

## 디렉토리 구조

```
src/
├── components/               # 모든 React 컴포넌트
│   ├── common/               # 공통 UI 컴포넌트
│   │   ├── Button.jsx        # 버튼 컴포넌트
│   │   ├── Card.jsx          # 카드 컴포넌트
│   │   ├── Container.jsx     # 컨테이너 컴포넌트
│   │   ├── ErrorMessage.jsx  # 오류 메시지 컴포넌트
│   │   ├── LoadingSpinner.jsx # 로딩 스피너 컴포넌트
│   │   ├── ...
│   │   └── index.js          # 공통 컴포넌트 내보내기
│   ├── game/                 # 게임 관련 컴포넌트
│   │   ├── advisors/         # 보좌관 관련 컴포넌트
│   │   ├── dashboard/        # 대시보드 관련 컴포넌트
│   │   ├── diplomacy/        # 외교 관련 컴포넌트
│   │   ├── events/           # 이벤트 관련 컴포넌트
│   │   ├── map/              # 지도 관련 컴포넌트
│   │   ├── technology/       # 기술 관련 컴포넌트
│   │   └── turns/            # 턴 관련 컴포넌트
│   ├── gameRoom/             # 게임룸 관련 컴포넌트
│   │   ├── LoadingState.jsx  # 게임 로딩 상태 컴포넌트
│   │   ├── ErrorState.jsx    # 게임 오류 상태 컴포넌트
│   │   ├── GameOverState.jsx # 게임 종료 상태 컴포넌트
│   │   ├── WaitingRoomState.jsx # 게임 대기 상태 컴포넌트
│   │   └── index.jsx         # 게임룸 메인 컴포넌트
│   └── lobby/                # 로비 관련 컴포넌트
│       └── index.jsx         # 로비 메인 컴포넌트
├── data/                     # 게임 데이터
│   ├── advisorPersonas.js    # 보좌관 데이터
│   ├── mapData.js            # 지도 데이터
│   ├── techTree.js           # 기술 트리 데이터
│   └── index.js              # 데이터 내보내기
├── hooks/                    # 커스텀 훅
│   ├── useGameState.js       # 게임 상태 관리 훅
│   ├── useNotifications.js   # 알림 관리 훅
│   ├── useResponsive.js      # 반응형 디자인 훅
│   └── index.js              # 훅 내보내기
├── services/                 # 서비스
│   ├── ai/                   # AI 서비스
│   │   ├── llmService.js     # LLM 서비스
│   │   └── index.js          # AI 서비스 내보내기
│   ├── firebase/             # Firebase 서비스
│   │   ├── auth.js           # 인증 관련 함수
│   │   ├── config.js         # Firebase 구성
│   │   ├── firestore.js      # Firestore 관련 함수
│   │   └── index.js          # Firebase 서비스 내보내기
│   └── index.js              # 서비스 내보내기
├── utils/                    # 유틸리티 함수
│   ├── commandExecution.js   # 명령 실행 유틸리티
│   ├── commandHandlers.js    # 명령 핸들러 유틸리티
│   ├── gameLogic.js          # 게임 로직 유틸리티
│   └── index.js              # 유틸리티 내보내기
├── styles/                   # 스타일
│   └── animations.css        # 애니메이션 스타일
├── App.jsx                   # 최상위 컴포넌트
└── index.js                  # 진입점
```

## 주요 컴포넌트 및 파일 설명

### App.jsx

애플리케이션의 최상위 컴포넌트입니다. Firebase 초기화, 사용자 인증 및 게임 상태에 따른 화면 전환을 담당합니다.

### components/gameRoom/index.jsx

게임 플레이가 이루어지는 메인 컨테이너입니다. 게임 상태에 따라 다양한 화면을 표시하고, 탭 기반 네비게이션을 제공합니다.

### components/lobby/index.jsx

게임 로비 컴포넌트입니다. 새 게임을 생성하거나 기존 게임에 참여하는 UI를 제공합니다.

### services/firebase/config.js

Firebase 프로젝트의 구성 정보와 초기화 함수를 제공합니다.

### services/firebase/auth.js

Firebase 인증 관련 함수를 제공합니다.

### services/firebase/firestore.js

Firebase Firestore 관련 함수를 제공합니다.

### hooks/useGameState.js

게임 상태를 관리하는 커스텀 훅입니다. 게임 데이터 로딩, 업데이트, 명령 처리 등의 기능을 제공합니다.

### data/

게임에 필요한 데이터(기술 트리, 지도, 보좌관 등)를 정의합니다.

## 임포트 패턴

프로젝트 전체에서 일관된 임포트 패턴을 사용합니다:

1. 서비스 임포트:
   ```javascript
   import { firebase } from './services';
   ```

2. 훅 임포트:
   ```javascript
   import { useGameState, useResponsive } from './hooks';
   ```

3. 유틸리티 임포트:
   ```javascript
   import { gameLogic } from './utils';
   ```

4. 컴포넌트 임포트:
   ```javascript
   import GameRoom from './components/gameRoom';
   import Lobby from './components/lobby';
   ```

## 확장 가이드라인

새로운 기능을 추가할 때는 다음 가이드라인을 따르세요:

1. **컴포넌트 추가**: 관련 기능에 따라 적절한 디렉토리에 컴포넌트를 추가하세요.
   - 공통 UI 컴포넌트는 `components/common/`에 추가
   - 게임 관련 컴포넌트는 `components/game/`의 적절한 하위 디렉토리에 추가

2. **서비스 추가**: 새로운 외부 서비스 통합은 `services/` 디렉토리에 추가하세요.
   - 각 서비스는 자체 디렉토리와 `index.js` 파일을 가져야 함

3. **훅 추가**: 새로운 커스텀 훅은 `hooks/` 디렉토리에 추가하고 `index.js`에서 내보내세요.

4. **유틸리티 추가**: 새로운 유틸리티 함수는 `utils/` 디렉토리에 추가하고 `index.js`에서 내보내세요.

5. **데이터 추가**: 새로운 게임 데이터는 `data/` 디렉토리에 추가하고 `index.js`에서 내보내세요.

## 모범 사례

1. **컴포넌트 구성**: 컴포넌트가 단일 책임에 집중하도록 유지하세요.
2. **상태 관리**: 상태 관리에 React 훅을 사용하세요.
3. **Firebase 통합**: 인증 및 데이터 저장을 위한 Firebase 모범 사례를 준수하세요.
4. **API 키**: 프로덕션에서는 API 키를 환경 변수로 이동하세요.
5. **테스트**: 모든 새로운 기능에 대한 테스트를 작성하세요.
6. **문서화**: 복잡한 로직에 주석을 추가하고 JSDoc으로 함수를 문서화하세요.