/**
 * 기술 트리 정의: 게임 내 연구 가능한 기술들의 정보입니다.
 * 각 기술은 이름, 설명, 기본 비용, 레벨당 효과, 최대 레벨을 가집니다.
 */
const techTree = {
  agriculture: { 
    name: '농업', 
    description: '매 턴 영토당 자원 생산량 +15%', 
    baseCost: 500,
    effectPerLevel: 0.15, // 레벨당 15% 생산량 증가
    maxLevel: 5
  },
  engineering: { 
    name: '공학', 
    description: '군사 유닛 훈련 비용 -15%, 전투 시 공격력 +10%', 
    baseCost: 700,
    discountPerLevel: 0.15, // 레벨당 15% 비용 감소
    combatBonusPerLevel: 0.10, // 레벨당 10% 전투력 증가
    maxLevel: 5
  },
  espionage: { 
    name: '첩보', 
    description: '적국 안정도 감소 효과 +3, 상대방 정보 획득 확률 증가', 
    baseCost: 600,
    stabilityEffectPerLevel: 3, // 레벨당 3 안정도 감소 효과
    infoChancePerLevel: 0.15, // 레벨당 15% 정보 획득 확률 증가
    maxLevel: 5
  },
  diplomacy: { 
    name: '외교', 
    description: '조약 체결 시 안정도 +5, 외교 제안 수락 확률 증가', 
    baseCost: 550,
    stabilityBonusPerLevel: 5, // 레벨당 5 안정도 증가
    acceptanceChancePerLevel: 0.10, // 레벨당 10% 수락 확률 증가
    maxLevel: 5
  },
};

export default techTree;