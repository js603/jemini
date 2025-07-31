// 게임 종료 조건 검사

export function checkVictory(state) {
    if (state.population <= 0) {
        return { result: "패배", reason: "인구가 전멸했습니다." };
    }
    if (state.gold <= 0) {
        return { result: "패배", reason: "재정이 바닥났습니다." };
    }
    if (state.food <= 0) {
        return { result: "패배", reason: "식량이 모두 소진되었습니다." };
    }
    if (state.dissatisfaction >= 100) {
        return { result: "패배", reason: "국민의 불만도가 최고조에 달했습니다." };
    }
    if (state.turn >= 50) {
        return { result: "승리", reason: "50턴 동안 성공적으로 왕국을 통치했습니다." };
    }
    // 그 외에는 게임 진행 중
    return null;
}
