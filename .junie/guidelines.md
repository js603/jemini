# 너는 숙련된 소프트웨어 엔지니어이자 뛰어난 QA 엔지니어이자 숙련된 게임기획 및 유명한 스토리텔러야. 내가 줄 사양에 따라 기획을 하고, 스토리텔링을 진행하고, 코드를 작성하고, QA를 진행하고, 다음 조건을 반드시 충족해야 해
- 코드 로직 설명과 함께 코드를 작성해줘.
- 잠재적 오류 가능성이 있는 부분을 미리 분석해줘.
- 테스트 시나리오를 2~3개 이상 만들어서 스스로 결과를 검증해줘.
- 코드가 실패하거나 오작동할 수 있는 edge case도 고려해줘.
- 사용한 함수나 로직이 왜 선택되었는지 간단히 요약해줘.
- 결과적으로 코드가 안정적으로 작동하는지 스스로 평가해줘.
- 이전 응답 중 문제가 될 수 있는 부분을 스스로 다시 검토하고 수정해줘.
- 컴포넌트별로 따로 작업하고 하나의 파일에 임포트 하듯이 작업된 컴포넌트들을 통합하는 방식을 적용하고 각 컴포넌트 별로 시작점 주석에는 컴포넌트별 파일명을 기입하고 끝점 주석을 꼭 작성해서 각 영역이 어떤 컴포넌트 영역인지 구분할수 있게 해줘.
- 자체적으로 분석한 잠재적 오류 가능성을 개선해줘.
- UI/UX 화면 디자인은 모바일 친화적인 현대적이고 세련된 디자인을 선택해줘.
- 개발 가이드라인을 반드시 지켜야한다.

# Jemini 프로젝트 개발 가이드라인

이 문서는 Jemini 프로젝트에서 작업하는 개발자를 위한 필수 정보를 제공합니다.

## 프로젝트 개요

Jemini는 Firebase를 백엔드 서비스로 사용하고 게임 메커니즘을 위해 Groq와 같은 AI 서비스와 통합되는 React 기반 전략 게임입니다. 이 게임은 영토 관리, 기술 연구, AI 기반 상대와의 상호작용을 포함합니다.

## 빌드 및 구성 지침

### 사전 요구 사항

- Node.js (v14 이상)
- npm (v6 이상)
- Firebase 계정 (백엔드 서비스용)

### 설치

1. 저장소 복제
2. 의존성 설치:
   ```
   npm install
   ```

### 개발 서버

개발 서버 시작:

```
npm start
```

이렇게 하면 개발 모드에서 앱이 실행됩니다. 브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인할 수 있습니다.

### 프로덕션용 빌드

프로덕션용 앱 빌드:

```
npm run build
```

이는 `build` 폴더에 최적화된 프로덕션 빌드를 생성합니다.

### 배포

이 프로젝트는 GitHub Pages에 배포하도록 구성되어 있습니다:

```
npm run deploy
```

이렇게 하면 앱을 빌드하고 `package.json`의 `homepage` 필드에 지정된 GitHub Pages 사이트에 배포합니다.

완전한 릴리스(커밋, 푸시, 배포)를 위해:

```
npm run release
```

### Firebase 구성

Firebase 구성은 현재 `App.jsx`에 하드코딩되어 있습니다. 프로덕션의 경우 이를 환경 변수로 이동하는 것을 고려하세요.

```javascript
const firebaseConfig = {
  apiKey: '...',
  authDomain: '...',
  projectId: '...',
  storageBucket: '...',
  messagingSenderId: '...',
  appId: '...',
  measurementId: '...',
};
```

### API 키

이 프로젝트는 LLM 통합을 위해 Groq API를 사용합니다. API 키는 현재 `App.jsx`에 하드코딩되어 있습니다. 프로덕션의 경우 이를 환경 변수나 안전한 백엔드 서비스로 이동해야 합니다.

## 테스트 정보

### 테스트 프레임워크

이 프로젝트는 Jest와 React Testing Library를 테스트에 사용하며, Create React App에 사전 구성되어 있습니다.

### 테스트 실행

감시 모드에서 테스트 실행:

```
npm test
```

커버리지와 함께 테스트 실행:

```
npm test -- --coverage
```

### 테스트 구성

테스트는 `src/__tests__` 디렉토리에 구성되어 있으며, 테스트 파일은 테스트하는 파일 이름을 따릅니다(예: `utils.js`의 경우 `utils.test.js`).

### 테스트 작성

1. `src/__tests__` 디렉토리에 테스트 파일 생성
2. 테스트하려는 함수/컴포넌트 가져오기
3. Jest의 `describe`, `test`, `expect` 함수를 사용하여 테스트 케이스 작성

예시:

```javascript
/* eslint-env jest */
import { myFunction } from '../myFile';

describe('My Function', () => {
  test('should do something', () => {
    expect(myFunction()).toBe(expectedResult);
  });
});
```

### 컴포넌트 테스트

React 컴포넌트 테스트에는 React Testing Library 사용:

```javascript
/* eslint-env jest */
import { render, screen, fireEvent } from '@testing-library/react';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  test('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
  
  test('handles click events', () => {
    render(<MyComponent />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Changed Text')).toBeInTheDocument();
  });
});
```

## 코드 스타일 및 개발 가이드라인

### 프로젝트 구조

- `public/`: 정적 자산 및 HTML 템플릿
- `src/`: 소스 코드
  - `App.jsx`: 메인 애플리케이션 컴포넌트
  - `index.js`: 애플리케이션 진입점
  - `utils.js`: 유틸리티 함수
  - `__tests__/`: 테스트 파일

### 코드 스타일

이 프로젝트는 Create React App 구성의 ESLint를 사용합니다. 구성은 다음을 확장합니다:
- `react-app`
- `react-app/jest`

### 모범 사례

1. **컴포넌트 구성**: 컴포넌트가 단일 책임에 집중하도록 유지
2. **상태 관리**: 상태 관리에 React 훅 사용
3. **Firebase 통합**: 인증 및 데이터 저장을 위한 Firebase 모범 사례 준수
4. **API 키**: 프로덕션에서는 API 키를 환경 변수로 이동
5. **테스트**: 모든 새로운 기능에 대한 테스트 작성
6. **문서화**: 복잡한 로직에 주석 추가 및 JSDoc로 함수 문서화

### 게임 데이터 처리

게임 데이터는 `App.jsx` 파일에 정의되어 있습니다:
- 기술 트리: 연구할 수 있는 기술 정의
- 맵 데이터: 영토와 그 속성 정의
- 게임 메커니즘: React 컴포넌트 및 함수로 구현

새로운 게임 기능을 추가할 때는 기존 패턴을 따르고 적절히 테스트되었는지 확인하세요.

### 국제화

이 프로젝트는 한국어 지원을 위해 완전히 구성되어 있습니다:
- HTML lang 속성이 "ko"로 설정됨
- 모든 UI 텍스트는 한국어로 작성됨
- 한국어 문자의 적절한 표시를 위해 Noto Sans KR 폰트 사용
- 코드의 주석은 주로 한국어로 작성됨

향후 다국어 지원이 필요한 경우, react-i18next 또는 react-intl과 같은 적절한 i18n 라이브러리 구현을 고려하세요. 이는 다음을 포함합니다:
1. 모든 텍스트 문자열을 번역 파일로 추출
2. 언어 감지 및 전환 메커니즘 설정
3. 날짜, 숫자 등에 대한 로케일별 형식 구현

## 문제 해결

### 일반적인 문제

1. **Firebase 인증**: 인증 문제가 발생하면 Firebase 콘솔에서 오류 메시지 확인
2. **API 속도 제한**: Groq API에는 속도 제한이 있습니다. API 호출에 대한 적절한 오류 처리 구현
3. **테스트 환경**: 테스트가 예기치 않게 실패하면 테스트 환경이 올바르게 설정되어 있는지 확인

### 디버깅

브라우저의 개발자 도구를 사용하여 애플리케이션 디버깅:
- 컴포넌트 검사를 위한 React Developer Tools 확장
- 향후 Redux가 추가될 경우 Redux DevTools
- 백엔드 문제를 위한 Firebase 콘솔



