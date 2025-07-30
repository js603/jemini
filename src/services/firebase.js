/**
 * Firebase 서비스: Firebase 초기화 및 인증 함수를 제공합니다.
 * 연결 재시도 및 오류 처리 메커니즘이 포함되어 있습니다.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  getDoc,
  arrayUnion,
  writeBatch,
  increment,
  enableIndexedDbPersistence
} from 'firebase/firestore';

// 로컬 캐싱 및 상태 관리를 위한 변수들
let isFirebaseInitialized = false;
let firebaseApp = null;
let firestoreDb = null;
let firebaseAuth = null;
let connectionStatus = 'disconnected'; // 'connected', 'disconnected', 'connecting', 'error'
let lastError = null;
let retryCount = 0;
const MAX_RETRY_COUNT = 5;
const RETRY_DELAY_MS = 3000; // 3초 후 재시도

/**
 * Firebase 프로젝트 구성 정보
 * 주의: 실제 프로덕션 환경에서는 이 정보를 환경 변수로 관리하는 것이 좋습니다.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8',
  authDomain: 'text-adventure-game-cb731.firebaseapp.com',
  projectId: 'text-adventure-game-cb731',
  storageBucket: 'text-adventure-game-cb731.appspot.com',
  messagingSenderId: '1092941614820',
  appId: '1:1092941614820:web:5545f36014b73c268026f1',
  measurementId: 'G-FNGF42T1FP',
};

/**
 * Firebase 연결 상태를 가져옵니다.
 * @returns {Object} 연결 상태 정보
 */
export const getConnectionStatus = () => {
  return {
    status: connectionStatus,
    error: lastError,
    retryCount,
    isInitialized: isFirebaseInitialized
  };
};

/**
 * Firebase 앱 인스턴스를 초기화합니다.
 * 연결 실패 시 자동으로 재시도합니다.
 * @returns {Object} Firebase 앱, 인증, DB 인스턴스를 포함한 객체
 */
export const initializeFirebase = () => {
  if (isFirebaseInitialized && firebaseApp && firestoreDb && firebaseAuth) {
    return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb };
  }

  try {
    connectionStatus = 'connecting';
    console.log('Firebase 초기화 시도 중...');
    
    // Firebase 앱 초기화
    firebaseApp = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp);
    firestoreDb = getFirestore(firebaseApp);
    
    // 오프라인 지원을 위한 IndexedDB 지속성 활성화
    enableIndexedDbPersistence(firestoreDb)
      .then(() => {
        console.log('오프라인 지속성이 활성화되었습니다.');
      })
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('여러 탭이 열려 있어 오프라인 지속성을 활성화할 수 없습니다.');
        } else if (err.code === 'unimplemented') {
          console.warn('현재 브라우저는 오프라인 지속성을 지원하지 않습니다.');
        }
      });
    
    isFirebaseInitialized = true;
    connectionStatus = 'connected';
    retryCount = 0;
    lastError = null;
    console.log('Firebase 초기화 성공');
    
    return { app: firebaseApp, auth: firebaseAuth, db: firestoreDb };
  } catch (error) {
    connectionStatus = 'error';
    lastError = error;
    console.error('Firebase 초기화 실패:', error);
    
    // 최대 재시도 횟수에 도달하지 않았다면 재시도
    if (retryCount < MAX_RETRY_COUNT) {
      retryCount++;
      console.log(`${retryCount}번째 재시도 예정 (${RETRY_DELAY_MS}ms 후)...`);
      
      setTimeout(() => {
        initializeFirebase();
      }, RETRY_DELAY_MS);
    }
    
    // 빈 객체 반환 (오류 처리를 위해)
    return { app: null, auth: null, db: null, error };
  }
};

/**
 * Firebase 인증 인스턴스를 가져옵니다.
 * @param {Object} app - Firebase 앱 인스턴스
 * @returns {Object} Firebase 인증 인스턴스
 */
export const getFirebaseAuth = (app) => {
  if (!app) {
    console.warn('유효한 Firebase 앱 인스턴스가 필요합니다.');
    return null;
  }
  return getAuth(app);
};

/**
 * Firebase Firestore 인스턴스를 가져옵니다.
 * @param {Object} app - Firebase 앱 인스턴스
 * @returns {Object} Firebase Firestore 인스턴스
 */
export const getFirebaseFirestore = (app) => {
  if (!app) {
    console.warn('유효한 Firebase 앱 인스턴스가 필요합니다.');
    return null;
  }
  return getFirestore(app);
};

/**
 * 익명 로그인을 수행합니다.
 * 실패 시 자동으로 재시도합니다.
 * @param {Object} auth - Firebase 인증 인스턴스
 * @returns {Promise<Object>} 로그인 결과
 */
export const signInAnonymouslyWithFirebase = async (auth) => {
  if (!auth) {
    console.warn('유효한 Firebase 인증 인스턴스가 필요합니다.');
    return Promise.reject(new Error('유효한 Firebase 인증 인스턴스가 필요합니다.'));
  }
  
  let attempts = 0;
  const maxAttempts = 3;
  
  const attemptSignIn = async () => {
    try {
      attempts++;
      return await signInAnonymously(auth);
    } catch (error) {
      console.error(`익명 로그인 실패 (시도 ${attempts}/${maxAttempts}):`, error);
      
      if (attempts < maxAttempts) {
        console.log(`${attempts}번째 로그인 재시도 중...`);
        // 지수 백오프 (1초, 2초, 4초...)
        const delay = Math.pow(2, attempts - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptSignIn();
      }
      
      throw error;
    }
  };
  
  return attemptSignIn();
};

/**
 * 인증 상태 변경을 감지하는 리스너를 설정합니다.
 * @param {Object} auth - Firebase 인증 인스턴스
 * @param {Function} callback - 인증 상태 변경 시 호출될 콜백 함수
 * @returns {Function} 리스너 해제 함수
 */
export const onAuthStateChangedListener = (auth, callback) => {
  if (!auth) {
    console.warn('유효한 Firebase 인증 인스턴스가 필요합니다.');
    return () => {}; // 더미 언서브스크라이브 함수
  }
  return onAuthStateChanged(auth, callback);
};

// Firestore 함수들을 재내보내기
export {
  doc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  getDoc,
  arrayUnion,
  writeBatch,
  increment
};

export default {
  initializeFirebase,
  getFirebaseAuth,
  getFirebaseFirestore,
  signInAnonymouslyWithFirebase,
  onAuthStateChangedListener,
  firebaseConfig
};