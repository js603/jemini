/**
 * @file index.js
 * 서비스 모듈의 진입점입니다.
 * 모든 서비스를 내보냅니다.
 */

import * as firebaseService from './firebase';
import * as aiService from './ai';

// Firebase 서비스 내보내기
export const firebase = firebaseService;

// AI 서비스 내보내기
export const ai = aiService;

// 기본 내보내기로 모든 서비스를 포함하는 객체 제공
export default {
  firebase,
  ai
};