/**
 * @file config.js
 * Firebase 프로젝트의 구성 정보와 초기화 함수를 제공합니다.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase 프로젝트의 구성 정보
// 주의: 실제 프로덕션 환경에서는 환경 변수를 사용하는 것이 좋습니다.
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
 * Firebase 앱을 초기화하고 필요한 서비스 인스턴스를 반환합니다.
 * @returns {Object} Firebase 서비스 인스턴스 객체 (app, auth, db)
 */
export const initializeFirebase = () => {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  
  return { app, auth, db };
};

/**
 * 익명 사용자로 로그인합니다.
 * @param {Object} auth - Firebase Auth 인스턴스
 * @returns {Promise} 로그인 결과 Promise
 */
export const signInAnonymousUser = (auth) => {
  return signInAnonymously(auth)
    .catch(error => console.error("익명 로그인 실패:", error));
};

/**
 * 사용자 인증 상태 변경을 감지하는 리스너를 설정합니다.
 * @param {Object} auth - Firebase Auth 인스턴스
 * @param {Function} callback - 인증 상태 변경 시 호출될 콜백 함수
 * @returns {Function} 리스너 해제 함수
 */
export const setupAuthListener = (auth, callback) => {
  return onAuthStateChanged(auth, callback);
};

export default firebaseConfig;