/**
 * @file firestore.js
 * Firebase Firestore 관련 함수를 제공합니다.
 */

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
  increment
} from 'firebase/firestore';

/**
 * Firebase Firestore 인스턴스를 가져옵니다.
 * @param {Object} app - Firebase 앱 인스턴스
 * @returns {Object} Firebase Firestore 인스턴스
 */
export const getFirebaseFirestore = (app) => {
  return getFirestore(app);
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
};