# Firebase 및 Groq 통합 구현 문서

이 문서는 Jemini 프로젝트에 Firebase 백엔드 서비스와 Groq AI 서비스를 통합하는 과정을 설명합니다.

## 구현된 기능

1. **Firebase 구성 및 초기화**
   - Firebase 앱 초기화
   - Firebase 인증 (익명 로그인)
   - Firestore 데이터베이스 연결
   - Firebase Analytics 설정

2. **Groq AI 서비스 통합**
   - Groq API 구성
   - AI 어드바이저 기능 구현

3. **게임 데이터 관리**
   - 게임 데이터 저장 기능
   - 게임 데이터 로드 기능
   - 자동 저장 기능 (5분 간격)

4. **환경 변수 처리**
   - 환경 변수를 통한 API 키 관리
   - 샘플 .env 파일 제공
   - .gitignore 업데이트로 보안 강화

## 파일 변경 사항

### App.jsx

1. **Firebase 및 Groq 관련 임포트 추가**
   ```javascript
   import { initializeApp } from "firebase/app";
   import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
   import { getFirestore, collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, query, where, orderBy, limit } from "firebase/firestore";
   import { getAnalytics } from "firebase/analytics";
   ```

2. **서비스 컨텍스트 생성**
   ```javascript
   export const ServiceContext = createContext(null);
   ```

3. **Firebase 및 Groq 구성 (환경 변수 사용)**
   ```javascript
   // Firebase 구성 - 환경 변수 사용
   const firebaseConfig = {
       apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "default-key",
       // 기타 구성...
   };

   // Groq API 구성 - 환경 변수 사용
   const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY || "default-key";
   const GROQ_API_URL = process.env.REACT_APP_GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";
   ```

4. **Firebase 초기화**
   ```javascript
   const app = initializeApp(firebaseConfig);
   const auth = getAuth(app);
   const db = getFirestore(app);
   const analytics = getAnalytics(app);
   ```

5. **인증 및 데이터 관리 기능**
   - 익명 로그인 처리
   - 게임 데이터 저장 및 로드 함수
   - 주기적 자동 저장 기능

6. **AI 어드바이저 기능**
   ```javascript
   const getAIAdvice = async (situation) => {
       // Groq API를 사용한 AI 조언 요청 구현
   };
   ```

7. **서비스 컨텍스트 제공자 추가**
   ```javascript
   <ServiceContext.Provider value={serviceValue}>
       {/* 앱 컴포넌트 */}
   </ServiceContext.Provider>
   ```

### .env.sample

환경 변수 설정을 위한 샘플 파일 생성:
```
# Firebase 구성
REACT_APP_FIREBASE_API_KEY=your-api-key
# 기타 환경 변수...

# Groq API 구성
REACT_APP_GROQ_API_KEY=your-groq-api-key
REACT_APP_GROQ_API_URL=https://api.groq.com/openai/v1/chat/completions
```

### .gitignore

보안을 위해 .gitignore 파일 업데이트:
```
node_modules/

# 환경 변수
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# 빌드 파일
/build
/dist

# 로그 파일
npm-debug.log*
yarn-debug.log*
yarn-error.log*
```

## 사용 방법

### Firebase 설정

1. Firebase 콘솔(https://console.firebase.google.com/)에서 새 프로젝트 생성
2. 웹 앱 추가 및 구성 정보 획득
3. .env.sample 파일을 .env로 복사하고 실제 Firebase 구성 정보 입력
4. Firebase 콘솔에서 익명 인증 활성화
5. Firestore 데이터베이스 생성 및 규칙 설정

### Groq API 설정

1. Groq 웹사이트(https://console.groq.com/)에서 계정 생성
2. API 키 생성
3. .env 파일에 Groq API 키 입력

### 컴포넌트에서 서비스 사용

```javascript
import React, { useContext } from 'react';
import { ServiceContext } from '../App';

function MyComponent() {
    const { getAIAdvice, aiResponse, aiLoading } = useContext(ServiceContext);
    
    const handleAskAdvice = () => {
        getAIAdvice("현재 왕국의 상황을 분석해주세요.");
    };
    
    return (
        <div>
            <button onClick={handleAskAdvice}>조언 요청</button>
            {aiLoading ? <p>조언을 구하는 중...</p> : <p>{aiResponse}</p>}
        </div>
    );
}
```

## 주의 사항

1. 실제 API 키는 절대 GitHub에 커밋하지 마세요.
2. 프로덕션 환경에서는 Firebase 보안 규칙을 적절히 설정하세요.
3. Groq API 호출 횟수에는 제한이 있으므로 필요한 경우에만 호출하세요.
4. 환경 변수는 빌드 시점에 포함되므로, 변경 시 애플리케이션을 다시 빌드해야 합니다.