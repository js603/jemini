/**
 * @file auth.js
 * Firebase 인증 관련 함수를 제공합니다.
 */

import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

/**
 * Firebase 인증 인스턴스를 가져옵니다.
 * @param {Object} app - Firebase 앱 인스턴스
 * @returns {Object} Firebase 인증 인스턴스
 */
export const getFirebaseAuth = (app) => {
  return getAuth(app);
};

/**
 * 익명 로그인을 수행합니다.
 * @param {Object} auth - Firebase 인증 인스턴스
 * @returns {Promise<Object>} 로그인 결과
 */
export const signInAnonymouslyWithFirebase = (auth) => {
  return signInAnonymously(auth)
    .catch(error => console.error("익명 로그인 실패:", error));
};

/**
 * 인증 상태 변경을 감지하는 리스너를 설정합니다.
 * @param {Object} auth - Firebase 인증 인스턴스
 * @param {Function} callback - 인증 상태 변경 시 호출될 콜백 함수
 * @returns {Function} 리스너 해제 함수
 */
export const onAuthStateChangedListener = (auth, callback) => {
  return onAuthStateChanged(auth, callback);
};

export default {
  getFirebaseAuth,
  signInAnonymouslyWithFirebase,
  onAuthStateChangedListener
};