import { create } from "zustand";
import { persist } from "zustand/middleware";
import events from "../data/eventsTree.json";
import policiesData from "../data/policies.json";
import advisorsData from "../data/advisors.json";
import citiesData from "../data/cities.json";
import mapData from "../data/map.json";
import factionsData from "../data/factions.json";
import technologiesData from "../data/technologies.json";

// 초기 상태
const initialState = {
    // 기본 자원
    turn: 1,
    population: 1000,
    gold: 500,
    food: 300,
    army: 100,
    trust: 50,
    dissatisfaction: 10,

    // 추가 자원
    wood: 100,
    stone: 100,
    iron: 50,
    mana: 30,
    labor: 200,
    research_points: 50,
    magical_essence: 0,
    arcane_crystal: 0,
    elixir: 0,
    enchanted_material: 0,
    medicine: 0,
    luxury_goods: 0,
    artwork: 0,
    pottery: 0,

    // 게임 상태
    activePolicies: [],
    currentEventId: "start",
    advisors: advisorsData,
    cities: citiesData,
    history: [],
    gameOver: false,
    result: null,
    researchedTechnologies: [],
    
    // 군사 시스템
    armies: [
        {
            id: "army_1",
            name: "중앙군",
            location: "region_1",
            units: {
                infantry: 50,
                archer: 30,
                cavalry: 20
            },
            commander: "장군 이순신",
            morale: 85,
            experience: 20,
            status: "대기 중"
        },
        {
            id: "army_2",
            name: "북방 수비대",
            location: "region_2",
            units: {
                infantry: 30,
                archer: 20
            },
            commander: "장군 김유신",
            morale: 70,
            experience: 10,
            status: "방어 중"
        },
        {
            id: "army_3",
            name: "동부 원정군",
            location: "region_3",
            units: {
                infantry: 40,
                archer: 25,
                cavalry: 15,
                knight: 5
            },
            commander: "장군 강감찬",
            morale: 90,
            experience: 30,
            status: "행군 중"
        }
    ],
    
    // 전투 시스템
    battles: [
        {
            id: "battle_1",
            name: "북부 산맥 전투",
            location: "region_2",
            attacker: "army_1",
            defender: "faction_north",
            status: "진행 중",
            duration: 3,
            casualties: {
                friendly: { infantry: 10, archer: 5 },
                enemy: { infantry: 15, archer: 8 }
            },
            winChance: 65
        },
        {
            id: "battle_2",
            name: "동부 숲 방어전",
            location: "region_3",
            attacker: "faction_east",
            defender: "army_3",
            status: "승리",
            duration: 5,
            casualties: {
                friendly: { infantry: 5, archer: 3 },
                enemy: { infantry: 20, archer: 15, cavalry: 10 }
            },
            winChance: 100
        }
    ],
    
    // 위협 시스템
    threats: [
        {
            faction: "faction_north",
            level: "높음",
            description: "북방 부족이 국경 지역에 군대를 집결시키고 있습니다.",
            armySize: "대규모",
            timeToAttack: "2턴 이내"
        },
        {
            faction: "faction_east",
            level: "중간",
            description: "동방 제국이 국경 지역에서 군사 훈련을 실시하고 있습니다.",
            armySize: "중간 규모",
            timeToAttack: "4턴 이내"
        }
    ],

    // 정치적 지표
    politicalPressure: 0,
    loyalty: 50,
    diplomatic_influence: 20,
    cultural_influence: 10,
    military_readiness: 30,

    // 맵 및 영토 시스템
    territories: mapData,
    discoveredTerritories: ["region_1", "region_2", "region_3", "region_4", "region_5"],
    selectedTerritory: null,
    
    // 외교 시스템
    factions: factionsData,
    faction_east_relation: 0,
    faction_west_relation: 0,
    faction_south_relation: 0,
    faction_north_relation: -20,
    
    // 전투 및 방어 시스템
    military_technology: 0,
    naval_defense: 0,
    military_defense: 0,
    magical_attack: 0,
    magical_defense: 0,
    magical_corruption: 0
};

export const useGameStore = create(
    persist(
        (set, get) => ({
            ...initialState,

            // 정책 토글 (on/off)
            togglePolicy: (policyId) => {
                const { activePolicies } = get();
                let newPolicies = [...activePolicies];
                if (activePolicies.includes(policyId)) {
                    newPolicies = newPolicies.filter((id) => id !== policyId);
                } else {
                    newPolicies.push(policyId);
                }
                set({ activePolicies: newPolicies });
            },

            // 이벤트 처리 및 다음 이벤트 이동
            goToNextEvent: (choiceText) => {
                const state = get();
                const currentEvent = events.find((e) => e.id === state.currentEventId);
                if (!currentEvent) return;

                // 선택지에서 선택 텍스트와 매칭되는 옵션 찾기
                const selectedOption = currentEvent.options.find(
                    (opt) => opt.text === choiceText
                );
                if (!selectedOption) return;

                // 효과 적용
                const effects = selectedOption.effects || {};
                set((state) => ({
                    population: Math.max(0, state.population + (effects.population || 0)),
                    gold: Math.max(0, state.gold + (effects.gold || 0)),
                    food: Math.max(0, state.food + (effects.food || 0)),
                    army: Math.max(0, state.army + (effects.army || 0)),
                    trust: Math.min(100, Math.max(0, state.trust + (effects.trust || 0))),
                    dissatisfaction: Math.min(
                        100,
                        Math.max(0, state.dissatisfaction + (effects.dissatisfaction || 0))
                    ),
                    politicalPressure: Math.min(
                        100,
                        Math.max(0, state.politicalPressure + (effects.politicalPressure || 0))
                    ),
                    loyalty: Math.min(100, Math.max(0, state.loyalty + (effects.loyalty || 0))),
                    turn: state.turn + 1,
                    currentEventId: selectedOption.nextEventId || null,
                    history: [
                        ...state.history,
                        {
                            event: currentEvent.title,
                            choice: choiceText,
                            effects,
                            turn: state.turn,
                        },
                    ],
                }));

                // 정책 효과 매 턴마다 자동 반영
                get().applyPolicyEffects();

                // 도시 자원 생산, 군사 변화 등 반영
                get().updateCities();
            },

            applyPolicyEffects: () => {
                const { activePolicies } = get();
                let goldChange = 0;
                let foodChange = 0;
                let trustChange = 0;
                let dissatisfactionChange = 0;

                activePolicies.forEach((policyId) => {
                    const pol = policiesData.find((p) => p.id === policyId);
                    if (!pol) return;
                    goldChange += pol.effects.gold || 0;
                    foodChange += pol.effects.food || 0;
                    trustChange += pol.effects.trust || 0;
                    dissatisfactionChange += pol.effects.dissatisfaction || 0;
                });

                set((state) => ({
                    gold: Math.max(0, state.gold + goldChange),
                    food: Math.max(0, state.food + foodChange),
                    trust: Math.min(100, Math.max(0, state.trust + trustChange)),
                    dissatisfaction: Math.min(
                        100,
                        Math.max(0, state.dissatisfaction + dissatisfactionChange)
                    ),
                }));
            },

            updateCities: () => {
                const { cities } = get();
                let resourceTotals = {
                    food: 0,
                    army: 0,
                    population: 0,
                    wood: 0,
                    stone: 0,
                    iron: 0,
                    mana: 0,
                    labor: 0
                };

                cities.forEach((city) => {
                    resourceTotals.food += city.foodProduction;
                    resourceTotals.army += city.armyStationed;
                    resourceTotals.population += Math.floor(city.population * 0.01); // 인구 1% 증가
                    resourceTotals.wood += city.wood;
                    resourceTotals.stone += city.stone;
                    resourceTotals.iron += city.iron;
                    resourceTotals.mana += city.mana;
                    resourceTotals.labor += city.labor;
                });

                set((state) => ({
                    food: Math.max(0, state.food + resourceTotals.food),
                    army: state.army + resourceTotals.army,
                    population: state.population + resourceTotals.population,
                    wood: state.wood + resourceTotals.wood,
                    stone: state.stone + resourceTotals.stone,
                    iron: state.iron + resourceTotals.iron,
                    mana: state.mana + resourceTotals.mana,
                    labor: state.labor + resourceTotals.labor
                }));
            },

            setGameOver: (gameOver) => set({ gameOver }),
            setResult: (result) => set({ result }),
            
            // 맵 및 영토 관리 함수
            setSelectedTerritory: (territoryId) => set({ selectedTerritory: territoryId }),
            
            discoverTerritory: (territoryId) => {
                const { discoveredTerritories } = get();
                if (!discoveredTerritories.includes(territoryId)) {
                    set({ 
                        discoveredTerritories: [...discoveredTerritories, territoryId],
                        history: [
                            ...get().history,
                            {
                                event: "영토 발견",
                                territory: mapData.find(t => t.id === territoryId)?.name || territoryId,
                                turn: get().turn
                            }
                        ]
                    });
                }
            },
            
            updateTerritoryControl: (territoryId, newController) => {
                const { territories } = get();
                const updatedTerritories = territories.map(territory => 
                    territory.id === territoryId 
                        ? { ...territory, controlledBy: newController } 
                        : territory
                );
                
                set({ 
                    territories: updatedTerritories,
                    history: [
                        ...get().history,
                        {
                            event: "영토 통제권 변경",
                            territory: territories.find(t => t.id === territoryId)?.name || territoryId,
                            newController,
                            turn: get().turn
                        }
                    ]
                });
            },
            
            // 외교 관계 관리 함수
            updateFactionRelation: (factionId, amount) => {
                const relationKey = `faction_${factionId}_relation`;
                const currentRelation = get()[relationKey] || 0;
                const newRelation = Math.max(-100, Math.min(100, currentRelation + amount));
                
                set({ 
                    [relationKey]: newRelation,
                    history: [
                        ...get().history,
                        {
                            event: "외교 관계 변화",
                            faction: factionId,
                            change: amount,
                            newValue: newRelation,
                            turn: get().turn
                        }
                    ]
                });
                
                // 관계 상태에 따른 효과 적용
                if (newRelation >= 50 && currentRelation < 50) {
                    // 동맹 체결
                    set({
                        diplomatic_influence: get().diplomatic_influence + 10,
                        history: [
                            ...get().history,
                            {
                                event: "동맹 체결",
                                faction: factionId,
                                turn: get().turn
                            }
                        ]
                    });
                } else if (newRelation <= -50 && currentRelation > -50) {
                    // 전쟁 선포
                    set({
                        military_readiness: get().military_readiness - 10,
                        history: [
                            ...get().history,
                            {
                                event: "전쟁 선포",
                                faction: factionId,
                                turn: get().turn
                            }
                        ]
                    });
                }
            },
            
            // 자원 생산 및 소비 함수
            produceResources: () => {
                const { territories, discoveredTerritories, cities } = get();
                const controlledTerritories = territories.filter(
                    t => t.controlledBy === "player" && discoveredTerritories.includes(t.id)
                );
                
                // 영토 기반 자원 생산
                let resourceProduction = {
                    food: 0, gold: 0, wood: 0, stone: 0, iron: 0, mana: 0
                };
                
                controlledTerritories.forEach(territory => {
                    Object.entries(territory.resources).forEach(([resource, amount]) => {
                        resourceProduction[resource] = (resourceProduction[resource] || 0) + amount;
                    });
                });
                
                // 도시 기반 자원 생산 (기존 updateCities 함수와 통합)
                let cityResources = {
                    food: 0, army: 0, population: 0, wood: 0, stone: 0, iron: 0, mana: 0, labor: 0
                };
                
                cities.forEach(city => {
                    cityResources.food += city.foodProduction;
                    cityResources.army += city.armyStationed;
                    cityResources.population += Math.floor(city.population * 0.01);
                    cityResources.wood += city.wood;
                    cityResources.stone += city.stone;
                    cityResources.iron += city.iron;
                    cityResources.mana += city.mana;
                    cityResources.labor += city.labor;
                });
                
                // 정책 효과 적용 (기존 applyPolicyEffects 함수와 통합)
                const { activePolicies } = get();
                let policyEffects = {
                    gold: 0, food: 0, trust: 0, dissatisfaction: 0
                };
                
                activePolicies.forEach(policyId => {
                    const pol = policiesData.find(p => p.id === policyId);
                    if (!pol) return;
                    policyEffects.gold += pol.effects.gold || 0;
                    policyEffects.food += pol.effects.food || 0;
                    policyEffects.trust += pol.effects.trust || 0;
                    policyEffects.dissatisfaction += pol.effects.dissatisfaction || 0;
                });
                
                // 연구 포인트 생산
                const researchProduction = Math.floor(get().cultural_influence * 0.5);
                
                // 모든 자원 업데이트
                set(state => ({
                    food: Math.max(0, state.food + resourceProduction.food + cityResources.food + policyEffects.food),
                    gold: Math.max(0, state.gold + resourceProduction.gold + policyEffects.gold),
                    wood: Math.max(0, state.wood + resourceProduction.wood + cityResources.wood),
                    stone: Math.max(0, state.stone + resourceProduction.stone + cityResources.stone),
                    iron: Math.max(0, state.iron + resourceProduction.iron + cityResources.iron),
                    mana: Math.max(0, state.mana + resourceProduction.mana + cityResources.mana),
                    labor: Math.max(0, state.labor + cityResources.labor),
                    army: state.army + cityResources.army,
                    population: state.population + cityResources.population,
                    trust: Math.min(100, Math.max(0, state.trust + policyEffects.trust)),
                    dissatisfaction: Math.min(100, Math.max(0, state.dissatisfaction + policyEffects.dissatisfaction)),
                    research_points: state.research_points + researchProduction
                }));
            },
            
            // 기술 연구 함수
            researchTechnology: (techId) => {
                const state = get();
                const { research_points, researchedTechnologies, mana } = state;
                const technology = technologiesData.find(t => t.id === techId);
                
                if (!technology) return false;
                
                // 이미 연구된 기술인지 확인
                if (researchedTechnologies.includes(techId)) return false;
                
                // 연구 포인트가 충분한지 확인
                if (research_points < technology.cost.research_points) return false;
                
                // 마나가 필요한 경우 확인
                if (technology.cost.mana && mana < technology.cost.mana) return false;
                
                // 선행 기술 확인
                if (technology.prerequisites && technology.prerequisites.length > 0) {
                    const missingPrereqs = technology.prerequisites.filter(
                        prereq => !researchedTechnologies.includes(prereq)
                    );
                    
                    if (missingPrereqs.length > 0) return false;
                }
                
                // 연구 포인트 소비 및 기술 효과 적용
                set(state => {
                    // 기본 업데이트 객체
                    const updates = {
                        research_points: state.research_points - technology.cost.research_points,
                        researchedTechnologies: [...state.researchedTechnologies, techId],
                        history: [
                            ...state.history,
                            {
                                event: "기술 연구 완료",
                                technology: technology.name,
                                turn: state.turn
                            }
                        ]
                    };
                    
                    // 마나 비용 차감
                    if (technology.cost.mana) {
                        updates.mana = state.mana - technology.cost.mana;
                    }
                    
                    // 기술 효과 적용
                    if (technology.effects) {
                        Object.entries(technology.effects).forEach(([key, value]) => {
                            // 기존 값이 있는 경우에만 업데이트
                            if (state[key] !== undefined) {
                                updates[key] = state[key] + value;
                            }
                        });
                    }
                    
                    // 군사 기술 특별 처리
                    if (technology.category === "military") {
                        updates.military_technology = (state.military_technology || 0) + 1;
                    }
                    
                    return updates;
                });
                
                return true;
            },

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
            },

            resetGame: () => set(initialState),
        }),
        {
            name: "slg-game-storage",
            getStorage: () => localStorage,
        }
    )
);
