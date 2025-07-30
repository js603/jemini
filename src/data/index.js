/**
 * @file index.js
 * 게임 데이터의 진입점입니다.
 * 모든 게임 데이터를 내보냅니다.
 */

import advisorPersonas from './advisorPersonas';
import initialMapData from './mapData';
import techTree from './techTree';

// 모든 게임 데이터 내보내기
export {
  advisorPersonas,
  initialMapData,
  techTree
};

// 기본 내보내기로 모든 게임 데이터를 포함하는 객체 제공
export default {
  advisorPersonas,
  initialMapData,
  techTree
};