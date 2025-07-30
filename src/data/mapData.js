/**
 * 초기 지도 데이터 정의: 게임 시작 시의 지도 상태입니다.
 * 각 영토는 ID, 이름, 소유자, 군대 수, 수도 여부, 좌표, 이웃 영토 목록을 가집니다.
 */
const initialMapData = {
  territories: {
    'T1': { id: 'T1', name: '에라시아 수도', owner: '에라시아', army: 100, isCapital: true, x: 100, y: 150, neighbors: ['T2', 'T4'] },
    'T2': { id: 'T2', name: '서부 해안', owner: '에라시아', army: 0, isCapital: false, x: 50, y: 100, neighbors: ['T1', 'T3'] },
    'T3': { id: 'T3', name: '북부 산맥', owner: null, army: 10, isCapital: false, x: 150, y: 50, neighbors: ['T2', 'T5'] },
    'T4': { id: 'T4', name: '중앙 평원', owner: null, army: 10, isCapital: false, x: 200, y: 150, neighbors: ['T1', 'T5', 'T6'] },
    'T5': { id: 'T5', name: '브라카다 수도', owner: '브라카다', army: 80, isCapital: true, x: 250, y: 100, neighbors: ['T3', 'T4'] },
    'T6': { id: 'T6', name: '아블리 수도', owner: '아블리', army: 150, isCapital: true, x: 250, y: 250, neighbors: ['T4'] },
  }
};

export default initialMapData;