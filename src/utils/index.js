/**
 * @file index.js
 * 유틸리티 함수의 진입점입니다.
 * 모든 유틸리티 함수를 내보냅니다.
 */

import * as commandExecution from './commandExecution';
import * as commandHandlers from './commandHandlers';
import * as gameLogic from './gameLogic';

// 모든 유틸리티 함수 내보내기
export {
  commandExecution,
  commandHandlers,
  gameLogic
};

// 기본 내보내기로 모든 유틸리티 함수를 포함하는 객체 제공
export default {
  commandExecution,
  commandHandlers,
  gameLogic
};