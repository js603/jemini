/**
 * @file index.js
 * 커스텀 훅의 진입점입니다.
 * 모든 커스텀 훅을 내보냅니다.
 */

import { useResponsive } from './useResponsive';
import { useGameState } from './useGameState';
import { useNotifications } from './useNotifications';

// 모든 훅 내보내기
export {
  useResponsive,
  useGameState,
  useNotifications
};

// 기본 내보내기로 모든 훅을 포함하는 객체 제공
export default {
  useResponsive,
  useGameState,
  useNotifications
};