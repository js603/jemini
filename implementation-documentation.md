# 군대 이동 기능 구현 문서

## 개요

이 문서는 Military Command 구성 요소의 움직임 기능 구현에 대한 설명입니다. 이 기능은 플레이어가 모달 인터페이스를 통해 군대를 선택된 영토로 옮길 수 있게 합니다.

## 구현 내용

### 1. 게임 상태 업데이트 기능 추가

`gameSlice.js` 파일에 `moveArmy` 함수를 추가하여 군대 이동 시 게임 상태를 업데이트하도록 구현했습니다.

```javascript
// 군대 이동 함수
moveArmy: (armyId, destinationId) => {
    const { armies, territories } = get();
    
    // 해당 군대 찾기
    const armyIndex = armies.findIndex(a => a.id === armyId);
    if (armyIndex === -1) return false;
    
    // 목적지 영토 찾기
    const destination = territories.find(t => t.id === destinationId);
    if (!destination) return false;
    
    // 현재 위치 저장
    const currentLocation = armies[armyIndex].location;
    
    // 군대 위치 업데이트
    const updatedArmies = [...armies];
    updatedArmies[armyIndex] = {
        ...updatedArmies[armyIndex],
        location: destinationId,
        status: "이동 완료"
    };
    
    // 상태 업데이트
    set({ 
        armies: updatedArmies,
        history: [
            ...get().history,
            {
                event: "군대 이동",
                army: armies[armyIndex].name,
                from: territories.find(t => t.id === currentLocation)?.name || currentLocation,
                to: destination.name,
                turn: get().turn
            }
        ]
    });
    
    return true;
}
```

이 함수는 다음과 같은 기능을 수행합니다:
- 이동할 군대와 목적지 영토를 확인
- 군대의 위치를 업데이트
- 군대의 상태를 "이동 완료"로 변경
- 히스토리 로그에 이동 기록 추가
- 성공 여부를 반환

### 2. MilitaryCommand 컴포넌트 업데이트

`MilitaryCommand.jsx` 파일의 `handleMoveArmy` 함수를 수정하여 새로 추가한 `moveArmy` 함수를 호출하도록 구현했습니다.

```javascript
// 군대 이동 처리
const handleMoveArmy = () => {
  if (!armyToMove || !selectedDestination) return;
  
  // 게임 상태 업데이트를 위해 moveArmy 함수 호출
  const moveResult = gameState.moveArmy(armyToMove.id, selectedDestination);
  
  if (moveResult) {
    // 이동 성공 시 알림
    alert(`${armyToMove.name}이(가) ${territories.find(t => t.id === selectedDestination)?.name || selectedDestination}(으)로 이동했습니다.`);
  } else {
    // 이동 실패 시 알림
    alert("이동 실패: 군대 또는 목적지를 찾을 수 없습니다.");
  }
  
  // 모달 닫기
  setShowMoveModal(false);
  setArmyToMove(null);
  setSelectedDestination(null);
};
```

이 함수는 다음과 같은 기능을 수행합니다:
- 선택된 군대와 목적지가 있는지 확인
- `moveArmy` 함수를 호출하여 게임 상태 업데이트
- 이동 결과에 따라 적절한 알림 메시지 표시
- 모달 창 닫기 및 상태 초기화

## 테스트

구현된 기능을 테스트하기 위해 `test-army-movement.js` 스크립트를 작성했습니다. 이 스크립트는 다음과 같은 테스트를 수행합니다:

1. 초기 군대 상태 확인
2. 특정 군대를 특정 목적지로 이동
3. 이동 후 군대 위치 및 상태 확인
4. 히스토리 로그 업데이트 확인

테스트 결과가 성공적이면 다음 조건을 모두 만족해야 합니다:
- 이동 함수가 `true`를 반환
- 군대의 위치가 목적지로 변경됨
- 군대의 상태가 "이동 완료"로 변경됨
- 히스토리 로그에 "군대 이동" 이벤트가 추가됨

## 사용 방법

1. 군사 지휘부 화면에서 "군대" 탭 선택
2. 이동하려는 군대의 "이동" 버튼 클릭
3. 모달 창에서 목적지 영토 선택
4. "이동" 버튼 클릭하여 이동 실행

## 주의사항

- 이동은 발견된 영토로만 가능합니다.
- 현재 위치와 동일한 영토로는 이동할 수 없습니다.
- 이동 후 군대의 상태는 "이동 완료"로 변경됩니다.

## 향후 개선 사항

- 이동 거리에 따른 이동 시간 구현
- 이동 중인 군대의 시각적 표시 개선
- 이동 경로 선택 기능 추가
- 이동 시 자원 소모 구현