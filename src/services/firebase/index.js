/**
 * @file index.js
 * Firebase 서비스의 진입점입니다.
 * 모든 Firebase 관련 함수와 구성을 내보냅니다.
 */

import { initializeApp } from 'firebase/app';
import firebaseConfig, { initializeFirebase } from './config';
import * as authService from './auth';
import * as firestoreService from './firestore';

// Firebase 구성 내보내기
export { firebaseConfig };

// Firebase 초기화 함수 내보내기
export { initializeFirebase };

// Auth 서비스 함수 내보내기
export const {
  getFirebaseAuth,
  signInAnonymouslyWithFirebase,
  onAuthStateChangedListener
} = authService;

// Firestore 서비스 함수 내보내기
export const {
  getFirebaseFirestore,
  doc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  getDoc,
  arrayUnion,
  writeBatch,
  increment
} = firestoreService;

/**
 * Firebase 앱을 초기화하고 필요한 서비스 인스턴스를 반환합니다.
 * 편의를 위한 함수입니다.
 * @returns {Object} Firebase 서비스 인스턴스 객체 (app, auth, db)
 */
export const initializeFirebaseApp = () => {
  const app = initializeApp(firebaseConfig);
  const auth = authService.getFirebaseAuth(app);
  const db = firestoreService.getFirebaseFirestore(app);
  
  return { app, auth, db };
};

// 기본 내보내기로 모든 서비스를 포함하는 객체 제공
export default {
  firebaseConfig,
  initializeFirebase,
  initializeFirebaseApp,
  ...authService,
  ...firestoreService
};