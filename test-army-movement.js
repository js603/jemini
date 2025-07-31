// 군대 이동 기능 테스트 스크립트
// 이 스크립트는 콘솔에서 실행하여 군대 이동 기능이 올바르게 작동하는지 확인합니다.

// 게임 스토어 가져오기
import { useGameStore } from "./src/store/gameSlice";

// 테스트 함수
const testArmyMovement = () => {
  // 게임 스토어 초기화
  const gameStore = useGameStore.getState();
  
  // 테스트 전 상태 출력
  console.log("===== 테스트 시작 =====");
  console.log("초기 군대 상태:");
  console.log(gameStore.armies);
  
  // 테스트할 군대와 목적지 선택
  const armyId = "army_1"; // 중앙군
  const destinationId = "region_5"; // 이동할 목적지
  
  // 이동 전 위치 저장
  const armyBeforeMove = gameStore.armies.find(a => a.id === armyId);
  const locationBeforeMove = armyBeforeMove ? armyBeforeMove.location : null;
  
  console.log(`군대 ID: ${armyId}, 이름: ${armyBeforeMove ? armyBeforeMove.name : "찾을 수 없음"}`);
  console.log(`현재 위치: ${locationBeforeMove}`);
  console.log(`목적지: ${destinationId}`);
  
  // 군대 이동 실행
  const moveResult = gameStore.moveArmy(armyId, destinationId);
  console.log(`이동 결과: ${moveResult ? "성공" : "실패"}`);
  
  // 이동 후 상태 확인
  const updatedGameStore = useGameStore.getState();
  const armyAfterMove = updatedGameStore.armies.find(a => a.id === armyId);
  const locationAfterMove = armyAfterMove ? armyAfterMove.location : null;
  
  console.log("\n이동 후 군대 상태:");
  console.log(armyAfterMove);
  console.log(`새 위치: ${locationAfterMove}`);
  
  // 히스토리 로그 확인
  const lastHistoryEntry = updatedGameStore.history[updatedGameStore.history.length - 1];
  console.log("\n히스토리 로그 마지막 항목:");
  console.log(lastHistoryEntry);
  
  // 테스트 결과 확인
  const testPassed = moveResult && 
                     locationAfterMove === destinationId && 
                     armyAfterMove.status === "이동 완료" &&
                     lastHistoryEntry.event === "군대 이동";
  
  console.log(`\n테스트 결과: ${testPassed ? "통과" : "실패"}`);
  console.log("===== 테스트 종료 =====");
  
  return testPassed;
};

// 테스트 실행
testArmyMovement();