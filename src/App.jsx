import React, { useState, useEffect, useMemo, useRef } from 'react';

// ========== LLM 설정 ==========
const GEMINI_API_KEY = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
const GEMINI_MODEL = "gemini-1.5-flash-latest";

// ========== 로컬 저장소 헬퍼 ==========
const LS_KEY = "a_dark_room_v1";
const loadGame = () => { try { const saved = localStorage.getItem(LS_KEY); return saved ? JSON.parse(saved) : null; } catch { return null; } };
const saveGame = (state) => localStorage.setItem(LS_KEY, JSON.stringify(state));
const clearGame = () => localStorage.removeItem(LS_KEY);

// ========== 초기 게임 상태 ==========
const getInitialState = () => ({
    version: 18,
    log: [{ id: Date.now(), text: "어두운 방." }],
    resources: { wood: 0, fur: 0, leather: 0, meat: 0, cured_meat: 0, iron_ore: 0, iron_bar: 0, alien_alloy: 0, gold: 0, waterskin: 0, water: 0 },
    equipment: { spear: 0, armor: 0, iron_sword: 0, iron_armor: 0, compass: 0 },
    flags: { fire_lit: false, room_warm: false, stranger_arrived: false, path_unlocked: false, map_unlocked: false, game_over: false, path_decision_pending: false, path_chosen: null },
    buildings: { hut: 0, trap: 0, tannery: 0, workshop: 0, smokehouse: 0, forge: 0, lookout_tower: 0, barracks: 0, outpost: 0, embassy: 0, trading_post: 0 },
    population: { villagers: 0, max: 0, jobs: { woodcutter: 0, trapper: 0, cook: 0, blacksmith: 0, soldier: 0 } },
    military: { attack: 0, defense: 0 },
    diplomacy: { kingdoms: {}, relations: {} },
    trade: { routes: [] },
    events: { current: null, last_event_time: 0 },
    exploration: { isExploring: false, currentEvent: null, isLoading: false },
    worldMap: { isOnMap: false, playerPos: { x: 20, y: 20 }, size: 40, grid: null, event: null },
    spaceship: { isFound: false, location: null, hull: 0, engine: 0, stasis_chamber: 0 },
    lastTick: Date.now(),
});

// ========== 게임 상수 ==========
const TICK_INTERVAL = 1000;
const EVENT_COOLDOWN = 3 * 60 * 1000; // 3분
const HUT_COST = { wood: 10 };
const TRAP_COST = { wood: 25 };
const TANNERY_COST = { wood: 40, fur: 5 };
const WORKSHOP_COST = { wood: 60, leather: 10 };
const SMOKEHOUSE_COST = { wood: 80, leather: 20 };
const FORGE_COST = { wood: 100, leather: 25 };
const LOOKOUT_TOWER_COST = { wood: 150, iron_bar: 10 };
const BARRACKS_COST = { wood: 100, iron_bar: 20 };
const EMBASSY_COST = { wood: 200, iron_bar: 50 };
const TRADING_POST_COST = { wood: 150, iron_bar: 30 };
const OUTPOST_COST = { wood: 50, iron_bar: 5 };
const WATERSKIN_COST = { leather: 5 };
const COMPASS_COST = { iron_bar: 5 };
const SPEAR_COST = { wood: 20, leather: 5 };
const ARMOR_COST = { leather: 25 };
const IRON_SWORD_COST = { iron_bar: 5, wood: 10 };
const IRON_ARMOR_COST = { iron_bar: 10, leather: 5 };
const SPACESHIP_HULL_COST = { iron_bar: 50, alien_alloy: 5 };
const SPACESHIP_ENGINE_COST = { iron_bar: 30, alien_alloy: 10 };
const SPACESHIP_STASIS_COST = { leather: 50, alien_alloy: 15 };

// ========== 헬퍼 함수 ==========
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

// ========== 맵 생성 함수 ==========
const generateMap = (size, path) => {
    const grid = Array(size).fill(null).map(() => Array(size).fill(null));
    const center = Math.floor(size / 2);
    let kingdoms = {};
    let relations = {};

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dist = Math.sqrt(Math.pow(x - center, 2) + Math.pow(y - center, 2));
            let terrain = 'plains';
            if (dist > size * 0.45) terrain = 'mountains';
            else if (dist > size * 0.3) terrain = 'forest';
            let tile = { terrain, discovered: false, isVillage: false, hasOutpost: false, hasSpaceship: false, enemy: null, kingdom: null };
            if (path === 'kingdom' && Math.random() < 0.1 && dist > 3 && dist < size * 0.4) {
                const power = 5 + Math.floor(dist * 2);
                tile.enemy = { type: 'camp', power: power, loot: { wood: power * 5, fur: power * 2, iron_ore: Math.floor(power / 5), gold: power } };
            }
            if (Math.random() < 0.05 && dist > 8) tile.terrain = 'ruins';
            grid[y][x] = tile;
        }
    }

    if (path === 'kingdom') {
        const kingdomNames = ["Aethelgard", "Ironhold", "Veridia", "Solara"];
        for (let i = 0; i < 2; i++) {
            let x, y, dist;
            do {
                x = Math.floor(Math.random() * size);
                y = Math.floor(Math.random() * size);
                dist = Math.sqrt(Math.pow(x - center, 2) + Math.pow(y - center, 2));
            } while (dist < 10 || dist > size * 0.4 || grid[y][x].enemy);
            const id = `k${i+1}`;
            grid[y][x] = { terrain: 'capital', discovered: false, isVillage: false, hasOutpost: false, hasSpaceship: false, enemy: null, kingdom: { id, name: kingdomNames[i] } };
            kingdoms[id] = { id, name: kingdomNames[i], capital: {x, y}, military: 50 + Math.floor(Math.random() * 50), status: 'active' };
            relations[id] = { relation: 0, status: 'neutral', contact: false };
        }
    }

    grid[center][center] = { terrain: 'plains', discovered: true, isVillage: true, hasOutpost: false, hasSpaceship: false, enemy: null, kingdom: null };
    return { grid, kingdoms, relations };
};

// ========== 메인 앱 컴포넌트 ==========
export default function App() {
    const [gameState, setGameState] = useState(loadGame() || getInitialState());
    const [isInitialized, setIsInitialized] = useState(false);

    useEffect(() => { if (isInitialized && !gameState.flags.game_over) saveGame(gameState); }, [gameState, isInitialized]);

    useEffect(() => {
        if (gameState.flags.game_over) return;
        const gameLoop = setInterval(() => {
            setGameState(prevState => {
                if (prevState.exploration.isExploring || prevState.worldMap.isOnMap || prevState.flags.path_decision_pending || prevState.events.current) return prevState;
                const now = Date.now();
                const delta = (now - prevState.lastTick) / 1000;
                let newState = deepClone(prevState);
                newState.lastTick = now;
                let newLog = [];
                if (newState.flags.fire_lit) {
                    if (newState.resources.wood > 0) {
                        newState.resources.wood = Math.max(0, newState.resources.wood - (0.5 * delta));
                        if (!newState.flags.room_warm) { newState.flags.room_warm = true; newLog.push({ id: now, text: "방이 따뜻해졌다." }); }
                    } else {
                        newState.flags.fire_lit = false; newState.flags.room_warm = false; newLog.push({ id: now, text: "불이 꺼졌다." });
                    }
                }
                if (newState.flags.room_warm && !newState.flags.stranger_arrived) { newState.flags.stranger_arrived = true; newLog.push({ id: now + 1, text: "한 낯선 사람이 불빛을 보고 다가왔다." }); }
                const { jobs, villagers } = newState.population;
                if (jobs.woodcutter > 0) newState.resources.wood += jobs.woodcutter * 0.5 * delta;
                const activeTrappers = Math.min(jobs.trapper, newState.buildings.trap);
                if (activeTrappers > 0) { newState.resources.fur += activeTrappers * 0.1 * delta; newState.resources.meat += activeTrappers * 0.2 * delta; }
                const activeCooks = Math.min(jobs.cook, newState.buildings.smokehouse);
                if (activeCooks > 0) {
                    const meatToSmoke = Math.min(newState.resources.meat, activeCooks * 0.5 * delta);
                    const woodForSmoke = Math.min(newState.resources.wood, activeCooks * 0.1 * delta);
                    if (meatToSmoke > 0 && woodForSmoke > 0) { newState.resources.meat -= meatToSmoke; newState.resources.wood -= woodForSmoke; newState.resources.cured_meat += meatToSmoke; }
                }
                const activeBlacksmiths = Math.min(jobs.blacksmith, newState.buildings.forge);
                if (activeBlacksmiths > 0) {
                    const oreToSmelt = Math.min(newState.resources.iron_ore, activeBlacksmiths * 0.1 * delta);
                    const woodForFuel = Math.min(newState.resources.wood, activeBlacksmiths * 0.2 * delta);
                    if (oreToSmelt > 0 && woodForFuel > 0) { newState.resources.iron_ore -= oreToSmelt; newState.resources.wood -= woodForFuel; newState.resources.iron_bar += oreToSmelt * 0.5; }
                }
                if (newState.buildings.outpost > 0) { newState.resources.wood += newState.buildings.outpost * 0.1 * delta; newState.resources.fur += newState.buildings.outpost * 0.05 * delta; }
                if (newState.trade.routes.length > 0) { newState.resources.gold += newState.trade.routes.length * 0.5 * delta; }
                if (villagers > 0) {
                    let foodConsumed = (villagers) * 0.1 * delta;
                    let curedMeatEaten = Math.min(newState.resources.cured_meat, foodConsumed);
                    newState.resources.cured_meat -= curedMeatEaten;
                    foodConsumed -= curedMeatEaten;
                    if (foodConsumed > 0) { let meatEaten = Math.min(newState.resources.meat, foodConsumed); newState.resources.meat -= meatEaten; foodConsumed -= meatEaten; }
                    if (foodConsumed > 0 && (newState.resources.cured_meat + newState.resources.meat) < 1) { newLog.push({ id: now, text: "마을 주민들이 굶주리고 있다." }); }
                }
                if (villagers < newState.population.max && newState.resources.cured_meat > villagers * 2) { if (Math.random() < 0.01 * delta) { newState.population.villagers++; newLog.push({ id: now, text: "낯선 사람이 마을에 합류했다." }); } }
                const { soldier } = newState.population.jobs;
                const { spear, armor, iron_sword, iron_armor } = newState.equipment;
                newState.military.attack = (soldier * 1) + (spear * 1) + (iron_sword * 5);
                newState.military.defense = (armor * 1) + (iron_armor * 5);

                if (newState.flags.path_chosen === 'kingdom' && now - (newState.events.last_event_time || 0) > EVENT_COOLDOWN && Object.values(newState.diplomacy.kingdoms).some(k => k.status === 'active')) {
                    (async () => {
                        const event = await generateWorldEvent(newState);
                        setGameState(s => ({...s, events: { current: event, last_event_time: now } }));
                    })();
                }

                if (newLog.length > 0) { newState.log = [...newState.log, ...newLog].slice(-100); }
                return newState;
            });
        }, TICK_INTERVAL);
        if (!isInitialized) setIsInitialized(true);
        return () => clearInterval(gameLoop);
    }, [isInitialized, gameState.exploration.isExploring, gameState.worldMap.isOnMap, gameState.flags.game_over, gameState.flags.path_decision_pending, gameState.events.current]);

    const handleAction = async (action) => {
        if (gameState.flags.game_over) return;
        if (action.type.startsWith('EXPLORE')) { await handleExplorationAction(action); return; }
        if (action.type.startsWith('MAP')) { await handleMapAction(action); return; }
        if (action.type.startsWith('SPACESHIP')) { await handleSpaceshipAction(action); return; }
        if (action.type.startsWith('DIPLOMACY')) { await handleDiplomacyAction(action); return; }
        if (action.type.startsWith('EVENT')) { await handleWorldEventAction(action); return; }

        setGameState(prevState => {
            let newState = deepClone(prevState);
            let newLog = [];
            switch (action.type) {
                case 'LIGHT_FIRE': newState.flags.fire_lit = true; newLog.push({ id: Date.now(), text: "불을 지폈다." }); break;
                case 'STOKE_FIRE': newState.resources.wood += 1; newLog.push({ id: Date.now(), text: `땔감을 1개 넣었다.` }); break;
                case 'BUILD_HUT':
                    if (newState.resources.wood >= HUT_COST.wood) { newState.resources.wood -= HUT_COST.wood; newState.buildings.hut += 1; newState.population.max += 4; if (newState.population.villagers === 0) { newState.population.villagers += 1; newLog.push({ id: Date.now(), text: "첫 번째 주민이 합류했다." }); } newLog.push({ id: Date.now(), text: "오두막을 지었다." });
                    } else { newLog.push({ id: Date.now(), text: "나무가 부족하다." }); } break;
                case 'BUILD_TRAP':
                    if (newState.resources.wood >= TRAP_COST.wood) { newState.resources.wood -= TRAP_COST.wood; newState.buildings.trap += 1; newLog.push({ id: Date.now(), text: "덫을 놓았다." });
                    } else { newLog.push({ id: Date.now(), text: "나무가 부족하다." }); } break;
                case 'BUILD_TANNERY':
                    if (newState.resources.wood >= TANNERY_COST.wood && newState.resources.fur >= TANNERY_COST.fur) { newState.resources.wood -= TANNERY_COST.wood; newState.resources.fur -= TANNERY_COST.fur; newState.buildings.tannery += 1; newLog.push({ id: Date.now(), text: "무두질 작업장을 지었다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'BUILD_WORKSHOP':
                    if (newState.resources.wood >= WORKSHOP_COST.wood && newState.resources.leather >= WORKSHOP_COST.leather) { newState.resources.wood -= WORKSHOP_COST.wood; newState.resources.leather -= WORKSHOP_COST.leather; newState.buildings.workshop += 1; newLog.push({ id: Date.now(), text: "작업장을 지었다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'BUILD_SMOKEHOUSE':
                    if (newState.resources.wood >= SMOKEHOUSE_COST.wood && newState.resources.leather >= SMOKEHOUSE_COST.leather) { newState.resources.wood -= SMOKEHOUSE_COST.wood; newState.resources.leather -= SMOKEHOUSE_COST.leather; newState.buildings.smokehouse += 1; newLog.push({ id: Date.now(), text: "훈제실을 지었다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'BUILD_FORGE':
                    if (newState.resources.wood >= FORGE_COST.wood && newState.resources.leather >= FORGE_COST.leather) { newState.resources.wood -= FORGE_COST.wood; newState.resources.leather -= FORGE_COST.leather; newState.buildings.forge += 1; newLog.push({ id: Date.now(), text: "대장간을 지었다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'BUILD_LOOKOUT_TOWER':
                    if (newState.resources.wood >= LOOKOUT_TOWER_COST.wood && newState.resources.iron_bar >= LOOKOUT_TOWER_COST.iron_bar) {
                        newState.resources.wood -= LOOKOUT_TOWER_COST.wood; newState.resources.iron_bar -= LOOKOUT_TOWER_COST.iron_bar; newState.buildings.lookout_tower += 1;
                        if (!newState.flags.path_chosen) { newState.flags.path_decision_pending = true; newLog.push({ id: Date.now(), text: "관측탑 꼭대기에서, 세상의 윤곽이 드러난다. 이제... 무엇을 할 것인가?" }); }
                        else { newLog.push({ id: Date.now(), text: "관측탑을 지었다." }); }
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'BUILD_BARRACKS':
                    if (newState.resources.wood >= BARRACKS_COST.wood && newState.resources.iron_bar >= BARRACKS_COST.iron_bar) { newState.resources.wood -= BARRACKS_COST.wood; newState.resources.iron_bar -= BARRACKS_COST.iron_bar; newState.buildings.barracks += 1; newLog.push({ id: Date.now(), text: "훈련장을 지었다. 이제 군인을 양성할 수 있다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'BUILD_EMBASSY':
                    if (newState.resources.wood >= EMBASSY_COST.wood && newState.resources.iron_bar >= EMBASSY_COST.iron_bar) { newState.resources.wood -= EMBASSY_COST.wood; newState.resources.iron_bar -= EMBASSY_COST.iron_bar; newState.buildings.embassy += 1; newLog.push({ id: Date.now(), text: "대사관을 지었다. 이제 다른 왕국과 교류할 수 있다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'BUILD_TRADING_POST':
                    if (newState.resources.wood >= TRADING_POST_COST.wood && newState.resources.iron_bar >= TRADING_POST_COST.iron_bar) { newState.resources.wood -= TRADING_POST_COST.wood; newState.resources.iron_bar -= TRADING_POST_COST.iron_bar; newState.buildings.trading_post += 1; newLog.push({ id: Date.now(), text: "교역소를 지었다. 이제 교역로를 개설할 수 있다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'CHOOSE_PATH':
                    newState.flags.path_decision_pending = false;
                    newState.flags.path_chosen = action.payload.path;
                    if (action.payload.path === 'stars') { newLog.push({ id: Date.now(), text: "우리의 운명은 저 별들 사이에 있다. 이곳을 떠나야 한다." }); }
                    else { 
                        newLog.push({ id: Date.now(), text: "이 땅은 우리의 것이다. 잿더미에서 왕국을 일으켜 세우리라." }); 
                        const { grid, kingdoms, relations } = generateMap(newState.worldMap.size, 'kingdom');
                        newState.worldMap.grid = grid;
                        newState.diplomacy.kingdoms = kingdoms;
                        newState.diplomacy.relations = relations;
                        newState.flags.map_unlocked = true;
                    }
                    break;
                case 'TAN_HIDE':
                    if (newState.resources.fur >= 1) { newState.resources.fur -= 1; newState.resources.leather += 1; newLog.push({ id: Date.now(), text: "가죽을 무두질했다." });
                    } else { newLog.push({ id: Date.now(), text: "가죽이 부족하다." }); } break;
                case 'CRAFT_WATERSKIN':
                    if (newState.resources.leather >= WATERSKIN_COST.leather) { newState.resources.leather -= WATERSKIN_COST.leather; newState.resources.waterskin += 1; newLog.push({ id: Date.now(), text: "물통을 만들었다." }); if (!newState.flags.path_unlocked) { newState.flags.path_unlocked = true; newLog.push({ id: Date.now() + 1, text: "마을 밖으로 향하는 길이 보인다." }); } 
                    } else { newLog.push({ id: Date.now(), text: "가공된 가죽이 부족하다." }); } break;
                case 'CRAFT_COMPASS':
                    if (newState.resources.iron_bar >= COMPASS_COST.iron_bar) { newState.resources.iron_bar -= COMPASS_COST.iron_bar; newState.equipment.compass += 1; if (!newState.flags.map_unlocked) { newState.flags.map_unlocked = true; newState.worldMap.grid = generateMap(newState.worldMap.size, 'stars'); newLog.push({ id: Date.now(), text: "나침반을 만들었다. 이제 세계를 탐험할 수 있다." }); }
                    } else { newLog.push({ id: Date.now(), text: "철 주괴가 부족하다." }); } break;
                case 'CRAFT_SPEAR':
                    if (newState.resources.wood >= SPEAR_COST.wood && newState.resources.leather >= SPEAR_COST.leather) { newState.resources.wood -= SPEAR_COST.wood; newState.resources.leather -= SPEAR_COST.leather; newState.equipment.spear += 1; newLog.push({ id: Date.now(), text: "나무 창을 만들었다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'CRAFT_ARMOR':
                    if (newState.resources.leather >= ARMOR_COST.leather) { newState.resources.leather -= ARMOR_COST.leather; newState.equipment.armor += 1; newLog.push({ id: Date.now(), text: "가죽 갑옷을 만들었다." });
                    } else { newLog.push({ id: Date.now(), text: "가공된 가죽이 부족하다." }); } break;
                case 'CRAFT_IRON_SWORD':
                    if (newState.resources.iron_bar >= IRON_SWORD_COST.iron_bar && newState.resources.wood >= IRON_SWORD_COST.wood) { newState.resources.iron_bar -= IRON_SWORD_COST.iron_bar; newState.resources.wood -= IRON_SWORD_COST.wood; newState.equipment.iron_sword += 1; newLog.push({ id: Date.now(), text: "철검을 만들었다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'CRAFT_IRON_ARMOR':
                    if (newState.resources.iron_bar >= IRON_ARMOR_COST.iron_bar && newState.resources.leather >= IRON_ARMOR_COST.leather) { newState.resources.iron_bar -= IRON_ARMOR_COST.iron_bar; newState.resources.leather -= IRON_ARMOR_COST.leather; newState.equipment.iron_armor += 1; newLog.push({ id: Date.now(), text: "철 갑옷을 만들었다." });
                    } else { newLog.push({ id: Date.now(), text: "자원이 부족하다." }); } break;
                case 'ASSIGN_JOB':
                    // eslint-disable-next-line no-case-declarations
                    const { job } = action.payload; if (sum(newState.population.jobs) < newState.population.villagers) { newState.population.jobs[job]++; } else { newLog.push({ id: Date.now(), text: "일할 수 있는 마을 주민이 없다." }); } break;
                case 'UNASSIGN_JOB':
                    // eslint-disable-next-line no-case-declarations
                    const { job: jobToUnassign } = action.payload; if (newState.population.jobs[jobToUnassign] > 0) { newState.population.jobs[jobToUnassign]--; } break;
                default: break;
            }
            if (newLog.length > 0) { newState.log = [...newState.log, ...newLog].slice(-100); }
            return newState;
        });
    };

    const handleExplorationAction = async (action) => {
        if (action.type === 'START_EXPLORING') {
            setGameState(prev => ({ ...prev, resources: { ...prev.resources, water: prev.resources.waterskin * 10 }, log: [...prev.log, { id: Date.now(), text: "먼지투성이 길로 나섰다." }], exploration: { ...prev.exploration, isExploring: true, isLoading: true }, }));
            try {
                const event = await generateExplorationEvent(gameState, "path");
                setGameState(prev => ({ ...prev, exploration: { ...prev.exploration, isLoading: false, currentEvent: event } }));
            } catch (error) { console.error(error); setGameState(prev => ({ ...prev, log: [...prev.log, { id: Date.now(), text: "길이 막혀있다." }], exploration: { ...prev.exploration, isLoading: false, isExploring: false } })); }
            return;
        }
        if (action.type === 'EXPLORE_CHOICE') {
            const choice = action.payload;
            let newState = deepClone(gameState);
            newState.log.push({ id: Date.now(), text: choice.outcome });
            if (choice.resources) { for (const [key, value] of Object.entries(choice.resources)) { if (newState.resources[key] !== undefined) newState.resources[key] = Math.max(0, newState.resources[key] + value); else if (newState.equipment[key] !== undefined) newState.equipment[key] = Math.max(0, newState.equipment[key] + value); } }
            newState.resources.water -= 1;
            if (newState.resources.water <= 0) { newState.log.push({ id: Date.now() + 1, text: "물이 다 떨어져 마을로 돌아왔다." }); newState.exploration.isExploring = false; newState.exploration.currentEvent = null; setGameState(newState); return; }
            newState.exploration.isLoading = true; newState.exploration.currentEvent = null;
            setGameState(newState);
            try {
                const nextEvent = await generateExplorationEvent(newState, "path");
                setGameState(prev => ({ ...prev, exploration: { ...prev.exploration, isLoading: false, currentEvent: nextEvent } }));
            } catch (error) { console.error(error); setGameState(prev => ({ ...prev, log: [...prev.log, { id: Date.now(), text: "길이 막혀있다." }], exploration: { ...prev.exploration, isLoading: false, isExploring: false } })); }
        }
    };

    const handleMapAction = async (action) => {
        if (action.type === 'MAP_ENTER') { setGameState(prev => ({ ...prev, worldMap: { ...prev.worldMap, isOnMap: true, event: null }, resources: { ...prev.resources, water: prev.resources.waterskin * 10 } })); return; }
        if (action.type === 'MAP_LEAVE') { setGameState(prev => ({ ...prev, worldMap: { ...prev.worldMap, isOnMap: false, event: null } })); return; }
        if (action.type === 'MAP_MOVE') {
            const { dx, dy } = action.payload;
            let newState = deepClone(gameState);
            const { x, y } = newState.worldMap.playerPos;
            const newX = x + dx; const newY = y + dy;
            if (newX >= 0 && newX < newState.worldMap.size && newY >= 0 && newY < newState.worldMap.size) {
                newState.resources.water -= 1;
                if (newState.resources.water <= 0) { newState.log.push({ id: Date.now(), text: "물이 다 떨어져 마을로 강제 귀환했다." }); newState.worldMap.isOnMap = false; setGameState(newState); return; }
                newState.worldMap.playerPos = { x: newX, y: newY };
                newState.worldMap.grid[newY][newX].discovered = true;
                newState.worldMap.event = null;
            }
            setGameState(newState);
            return;
        }
        if (action.type === 'MAP_SEARCH') {
            let newState = deepClone(gameState);
            const { x, y } = newState.worldMap.playerPos;
            const tile = newState.worldMap.grid[y][x];
            newState.worldMap.event = { isLoading: true };
            setGameState(newState);
            try {
                const event = await generateExplorationEvent(gameState, tile.terrain);
                if (event.discovery === 'spaceship' && !gameState.spaceship.isFound && gameState.flags.path_chosen === 'stars') {
                    setGameState(prev => {
                        const finalState = deepClone(prev);
                        finalState.log.push({ id: Date.now(), text: "폐허 속에서... 거대한 무언가를 발견했다." });
                        finalState.spaceship.isFound = true; finalState.spaceship.location = { x, y }; finalState.worldMap.grid[y][x].hasSpaceship = true; finalState.worldMap.event = null;
                        return finalState;
                    });
                } else {
                    setGameState(prev => ({ ...prev, worldMap: { ...prev.worldMap, event: { ...event, isLoading: false } } }));
                }
            } catch (error) { console.error(error); setGameState(prev => ({ ...prev, log: [...prev.log, { id: Date.now(), text: "아무것도 찾지 못했다." }], worldMap: { ...prev.worldMap, event: null } })); }
            return;
        }
        if (action.type === 'MAP_SEARCH_CHOICE') {
            const choice = action.payload;
            setGameState(prev => {
                const newState = deepClone(prev);
                newState.log.push({ id: Date.now(), text: choice.outcome });
                if (choice.resources) { for (const [key, value] of Object.entries(choice.resources)) { if (newState.resources[key] !== undefined) newState.resources[key] = Math.max(0, newState.resources[key] + value); } }
                newState.worldMap.event = null;
                return newState;
            });
        }
        if (action.type === 'MAP_ATTACK') {
            let newState = deepClone(gameState);
            const { x, y } = newState.worldMap.playerPos;
            const tile = newState.worldMap.grid[y][x];
            const enemy = tile.enemy;
            if (!enemy) return;
            const playerPower = newState.military.attack * (0.8 + Math.random() * 0.4);
            const enemyPower = enemy.power * (0.8 + Math.random() * 0.4);
            if (playerPower > enemyPower) {
                newState.log.push({ id: Date.now(), text: `적 주둔지를 정복했다! 전리품을 획득했다.` });
                for (const [res, amount] of Object.entries(enemy.loot)) { newState.resources[res] = (newState.resources[res] || 0) + amount; }
                newState.worldMap.grid[y][x].enemy = null;
            } else {
                const soldiersLost = Math.ceil(newState.population.jobs.soldier * 0.3);
                newState.population.jobs.soldier = Math.max(0, newState.population.jobs.soldier - soldiersLost);
                newState.log.push({ id: Date.now(), text: `전투에서 패배했다... 병사 ${soldiersLost}명을 잃고 후퇴했다.` });
            }
            setGameState(newState);
        }
        if (action.type === 'MAP_BUILD_OUTPOST') {
            let newState = deepClone(gameState);
            const { x, y } = newState.worldMap.playerPos;
            if (newState.resources.wood >= OUTPOST_COST.wood && newState.resources.iron_bar >= OUTPOST_COST.iron_bar) {
                newState.resources.wood -= OUTPOST_COST.wood;
                newState.resources.iron_bar -= OUTPOST_COST.iron_bar;
                newState.worldMap.grid[y][x].hasOutpost = true;
                newState.buildings.outpost++;
                newState.log.push({ id: Date.now(), text: `이 땅에 전초기지를 건설했다.` });
            } else {
                newState.log.push({ id: Date.now(), text: "전초기지를 건설할 자원이 부족하다." });
            }
            setGameState(newState);
        }
    };

    const handleDiplomacyAction = async (action) => {
        const { kingdomId } = action.payload;
        if (action.type === 'DIPLOMACY_SEND_ENVOY') {
            setGameState(prev => {
                const newState = deepClone(prev);
                newState.diplomacy.relations[kingdomId].contact = true;
                newState.log.push({ id: Date.now(), text: `${newState.diplomacy.kingdoms[kingdomId].name}에 사절단을 보냈다. 그들은 우리의 존재를 인지했다.` });
                return newState;
            });
        }
        if (action.type === 'DIPLOMACY_ESTABLISH_TRADE') {
            setGameState(prev => {
                const newState = deepClone(prev);
                if (newState.diplomacy.relations[kingdomId].relation >= 10) { // 우호적일 때만
                    newState.trade.routes.push(kingdomId);
                    newState.log.push({ id: Date.now(), text: `${newState.diplomacy.kingdoms[kingdomId].name}와 교역로를 개설했다.` });
                } else {
                    newState.log.push({ id: Date.now(), text: `그들은 아직 우리를 신뢰하지 않는다.` });
                }
                return newState;
            });
        }
        if (action.type === 'DIPLOMACY_DECLARE_WAR') {
            setGameState(prev => {
                const newState = deepClone(prev);
                newState.diplomacy.relations[kingdomId].status = 'war';
                newState.log.push({ id: Date.now(), text: `${newState.diplomacy.kingdoms[kingdomId].name}에 전쟁을 선포했다!` });
                return newState;
            });
        }
    };

    const handleSpaceshipAction = async (action) => {
        if (action.type === 'SPACESHIP_REPAIR') {
            const { part, cost } = action.payload;
            setGameState(prev => {
                const newState = deepClone(prev);
                let hasResources = true;
                for (const [resource, amount] of Object.entries(cost)) { if (newState.resources[resource] < amount) { hasResources = false; break; } }
                if (hasResources) {
                    for (const [resource, amount] of Object.entries(cost)) { newState.resources[resource] -= amount; }
                    newState.spaceship[part] = Math.min(100, newState.spaceship[part] + 25);
                    newState.log.push({ id: Date.now(), text: `우주선 ${part} 부품을 수리했다.` });
                } else { newState.log.push({ id: Date.now(), text: "수리에 필요한 자원이 부족하다." }); }
                return newState;
            });
        }
        if (action.type === 'SPACESHIP_LAUNCH') { setGameState(prev => ({ ...prev, flags: { ...prev.flags, game_over: true } })); }
    };

    const handleWorldEventAction = async (action) => {
        const { choice } = action.payload;
        let newState = deepClone(gameState);
        newState.log.push({ id: Date.now(), text: choice.outcome });

        if (choice.effects) {
            for (const [key, value] of Object.entries(choice.effects)) {
                if (key.startsWith('military.')) {
                    const subkey = key.split('.')[1];
                    newState.military[subkey] = Math.max(0, newState.military[subkey] + value);
                } else if (newState.resources[key] !== undefined) {
                    newState.resources[key] = Math.max(0, newState.resources[key] + value);
                }
            }
        }

        if (choice.victory) {
            newState.flags.game_over = true;
        }

        newState.events.current = null;
        setGameState(newState);
    };

    const resetGame = () => { if (window.confirm("정말 모든 진행 상황을 초기화할까요?")) { clearGame(); window.location.reload(); } };

    if (gameState.flags.game_over) { return <EndScreen gameState={gameState} onReset={resetGame} />; }
    if (gameState.flags.path_decision_pending) { return <PathDecisionView onAction={handleAction} />; }
    if (gameState.events.current) { return <WorldEventView event={gameState.events.current} onAction={handleWorldEventAction} />; }

    return (
        <div style={styles.container}>
            <div style={styles.header}><h1 style={styles.title}>A Dark Room</h1><button onClick={resetGame} style={styles.button}>초기화</button></div>
            <div style={styles.main}>
                {gameState.worldMap.isOnMap ? (
                    <WorldMapView gameState={gameState} onAction={handleAction} />
                ) : (
                    <>
                        <div style={styles.logContainer}><Log log={gameState.log} /></div>
                        {gameState.exploration.isExploring ? (
                            <ExplorationView exploration={gameState.exploration} onAction={handleAction} />
                        ) : (
                            <>
                                <div style={styles.actionsContainer}>
                                    <VillageActions gameState={gameState} onAction={handleAction} />
                                    <VillagerManagement gameState={gameState} onAction={handleAction} />
                                </div>
                                {gameState.flags.path_unlocked && (
                                    <div style={styles.outsideContainer}><OutsideActions gameState={gameState} onAction={handleAction} /></div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
            <div style={styles.sidebar}><Resources gameState={gameState} /><Buildings buildings={gameState.buildings} /><Kingdoms gameState={gameState} /></div>
        </div>
    );
}

// ========== LLM 관련 함수 ==========
async function generateExplorationEvent(gameState, context) {
    const prompt = `You are a game master for a dark, minimalist text-based adventure game. Your tone is mysterious and sparse. The player is exploring. Context: ${context}. Player state: Resources: ${JSON.stringify(gameState.resources)}, Equipment: ${JSON.stringify(gameState.equipment)}. **Your task:** Create a JSON object for a brief event. It must have: 1. A "description" (max 2 sentences). 2. An array of 2-3 "choices". Each choice must have: - "text": Action text. - "outcome": Result text. - "resources": A JSON object showing resource/equipment changes. Use only existing types: wood, fur, leather, meat, cured_meat, iron_ore, iron_bar, alien_alloy, gold, waterskin, water, spear, armor, iron_sword, iron_armor. Empty {} means no change. 3. Optionally, a "discovery" field. If the context is "ruins" and the player has chosen the "stars" path and hasn't found the spaceship yet, you can add "discovery": "spaceship". **Rules:** - Be creative, maintain the tone. - Create events that yield rare resources like "iron_ore", "alien_alloy", or "gold" in appropriate contexts (mountains, ruins). - Create dangerous events where better equipment is beneficial. The outcome should reflect this. - Respond with ONLY the valid JSON object. **Example:** {"description": "A rusted metal door is set into a hillside.","choices": [{"text": "Force it open.","outcome": "With a groan, the door gives way. You find a cache of old world metal.","resources": {"iron_ore": 5}},{"text": "Leave it.","outcome": "You leave the strange door untouched.","resources": {}}]}`;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) throw new Error(`LLM API request failed: ${response.status}`);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    try {
        const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1] : text;
        return JSON.parse(jsonString);
    } catch (e) { console.error("Failed to parse LLM response:", text); throw new Error("LLM response is not valid JSON."); }
}

async function generateWorldEvent(gameState) {
    const prompt = `You are a game master for a dark, minimalist text-based strategy game. The player chose to build a kingdom. Generate a major world event. The player's kingdom state: Resources: ${JSON.stringify(gameState.resources)}, Military: ${JSON.stringify(gameState.military)}, Buildings: ${JSON.stringify(gameState.buildings)}, Population: ${gameState.population.villagers}, Relations: ${JSON.stringify(gameState.diplomacy.relations)}. **Your task:** Create a JSON object for a single, impactful event. It must have: 1. "title": A title for the event. 2. "description": A narrative description of the event (2-3 sentences). 3. An array of 2-3 "choices". Each choice must have: - "text": The action the player can take. - "outcome": A short sentence describing the immediate result. - "effects": A JSON object showing the consequences (e.g., {"gold": -100, "military.attack": 10, "population.villagers": -50}). Use only existing state keys. - "victory": (Optional) boolean, true if this choice leads to winning the game. **Rules:** - Create a challenging event appropriate for the player's current power. Types can be invasions, internal strife (rebellion), or diplomatic crises. - Maintain a serious, slightly grim tone. - If all other kingdoms are defeated, you can generate a final "The End of an Era" event, where victory is possible. - Respond with ONLY the valid JSON object. **Example:** {"title": "The Great Horde","description": "A massive horde of barbarians descends from the northern mountains. Their scouts are at your borders. They demand tribute or they will burn everything to the ground.","choices": [{"text": "Pay the tribute.","outcome": "You pay the hefty price. The horde moves on, for now.","effects": {"gold": -500}},{"text": "To war!","outcome": "Your soldiers prepare for the fight of their lives.","effects": {}}]}`;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
    if (!response.ok) throw new Error(`LLM API request failed: ${response.status}`);
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    try {
        const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/);
        const jsonString = jsonMatch ? jsonMatch[1] : text;
        return JSON.parse(jsonString);
    } catch (e) { console.error("Failed to parse LLM response:", text); throw new Error("LLM response is not valid JSON."); }
}

// ========== UI 하위 컴포넌트 ==========
function WorldEventView({ event, onAction }) {
    return (
        <div style={styles.decisionScreen}>
            <h2>{event.title}</h2>
            <p>{event.description}</p>
            <div style={styles.decisionButtons}>
                {event.choices.map((choice, i) => (
                    <button key={i} style={styles.button} onClick={() => onAction({ type: 'EVENT_CHOICE', payload: { choice } })}>{choice.text}</button>
                ))}
            </div>
        </div>
    );
}

function EndScreen({ gameState, onReset }) {
    const messages = gameState.flags.path_chosen === 'stars' ? 
        ["엔진이 희미하게 빛나기 시작한다.", "선체가 조용히 떨리며, 먼지가 쏟아져 내린다.", "마을 주민들이 하나둘씩 동면 장치로 들어간다.", "마지막으로 당신이 오르자, 해치가 닫힌다.", "창밖으로, 당신이 일군 작은 마을이 점점 멀어진다.", "어둠 속에서, 당신은 집으로 향한다.", "the end"]
        : ["마지막 적의 깃발이 흙먼지 속으로 쓰러진다.", "대륙은 침묵에 휩싸인다. 오직 당신의 왕국만이 우뚝 서 있다.", "백성들이 당신의 이름을 연호한다. 황제시여!", "당신은 피와 철로 이 땅의 역사를 새로 썼다.", "이제, 당신의 시대가 시작된다.", "the emperor" ];
    
    const [index, setIndex] = useState(0);
    useEffect(() => { if (index < messages.length - 1) { const timer = setTimeout(() => setIndex(i => i + 1), 2500); return () => clearTimeout(timer); } }, [index, messages.length]);
    return (
        <div style={styles.endScreen}>
            <p>{messages[index]}</p>
            {index === messages.length - 1 && (<button style={styles.button} onClick={onReset}>다시 시작</button>)}
        </div>
    );
}

function Log({ log }) {
    const logEndRef = useRef(null);
    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log]);
    return <div style={styles.log}>{log.map(entry => <p key={entry.id} style={styles.logEntry}>{entry.text}</p>)}<div ref={logEndRef} /></div>;
}

function VillageActions({ gameState, onAction }) {
    const { flags, resources, buildings, population, equipment } = gameState;
    const canBuildLookout = !flags.path_chosen && buildings.lookout_tower < 1;
    return (
        <div style={styles.actionsSection}>
            <h3 style={styles.actionsTitle}>마을</h3>
            {!flags.fire_lit && <button style={styles.button} onClick={() => onAction({ type: 'LIGHT_FIRE' })}>불 지피기</button>}
            {flags.fire_lit && <button style={styles.button} onClick={() => onAction({ type: 'STOKE_FIRE' })}>땔감 넣기</button>}
            {flags.stranger_arrived && buildings.hut < 10 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_HUT' })} disabled={resources.wood < HUT_COST.wood}>오두막 (나무 {HUT_COST.wood})</button>}
            {population.villagers > 0 && buildings.trap < 10 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_TRAP' })} disabled={resources.wood < TRAP_COST.wood}>덫 (나무 {TRAP_COST.wood})</button>}
            {buildings.trap > 0 && buildings.tannery < 1 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_TANNERY' })} disabled={!(resources.wood >= TANNERY_COST.wood && resources.fur >= TANNERY_COST.fur)}>무두질 작업장 (자원 필요)</button>}
            {buildings.tannery > 0 && <button style={styles.button} onClick={() => onAction({ type: 'TAN_HIDE' })} disabled={resources.fur < 1}>가죽 무두질 (가죽 1)</button>}
            {buildings.tannery > 0 && buildings.workshop < 1 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_WORKSHOP' })} disabled={!(resources.wood >= WORKSHOP_COST.wood && resources.leather >= WORKSHOP_COST.leather)}>작업장 (자원 필요)</button>}
            {buildings.workshop > 0 && buildings.smokehouse < 1 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_SMOKEHOUSE' })} disabled={!(resources.wood >= SMOKEHOUSE_COST.wood && resources.leather >= SMOKEHOUSE_COST.leather)}>훈제실 (자원 필요)</button>}
            {buildings.workshop > 0 && buildings.forge < 1 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_FORGE' })} disabled={!(resources.wood >= FORGE_COST.wood && resources.leather >= FORGE_COST.leather)}>대장간 (자원 필요)</button>}
            {buildings.forge > 0 && canBuildLookout && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_LOOKOUT_TOWER' })} disabled={!(resources.wood >= LOOKOUT_TOWER_COST.wood && resources.iron_bar >= LOOKOUT_TOWER_COST.iron_bar)}>관측탑 (자원 필요)</button>}
            {flags.path_chosen === 'kingdom' && buildings.barracks < 1 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_BARRACKS' })} disabled={!(resources.wood >= BARRACKS_COST.wood && resources.iron_bar >= BARRACKS_COST.iron_bar)}>훈련장 (자원 필요)</button>}
            {flags.path_chosen === 'kingdom' && buildings.embassy < 1 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_EMBASSY' })} disabled={!(resources.wood >= EMBASSY_COST.wood && resources.iron_bar >= EMBASSY_COST.iron_bar)}>대사관 (자원 필요)</button>}
            {flags.path_chosen === 'kingdom' && buildings.trading_post < 1 && <button style={styles.button} onClick={() => onAction({ type: 'BUILD_TRADING_POST' })} disabled={!(resources.wood >= TRADING_POST_COST.wood && resources.iron_bar >= TRADING_POST_COST.iron_bar)}>교역소 (자원 필요)</button>}
            {buildings.workshop > 0 && resources.waterskin < 1 && <button style={styles.button} onClick={() => onAction({ type: 'CRAFT_WATERSKIN' })} disabled={resources.leather < WATERSKIN_COST.leather}>물통 (가죽 {WATERSKIN_COST.leather})</button>}
            {flags.path_chosen === 'stars' && buildings.workshop > 0 && equipment.compass < 1 && <button style={styles.button} onClick={() => onAction({ type: 'CRAFT_COMPASS' })} disabled={resources.iron_bar < COMPASS_COST.iron_bar}>나침반 (철 {COMPASS_COST.iron_bar})</button>}
            {buildings.workshop > 0 && equipment.spear < population.villagers && <button style={styles.button} onClick={() => onAction({ type: 'CRAFT_SPEAR' })} disabled={!(resources.wood >= SPEAR_COST.wood && resources.leather >= SPEAR_COST.leather)}>나무 창 (자원 필요)</button>}
            {buildings.workshop > 0 && equipment.armor < population.villagers && <button style={styles.button} onClick={() => onAction({ type: 'CRAFT_ARMOR' })} disabled={resources.leather < ARMOR_COST.leather}>가죽 갑옷 (가죽 {ARMOR_COST.leather})</button>}
            {buildings.forge > 0 && equipment.iron_sword < population.villagers && <button style={styles.button} onClick={() => onAction({ type: 'CRAFT_IRON_SWORD' })} disabled={!(resources.iron_bar >= IRON_SWORD_COST.iron_bar && resources.wood >= IRON_SWORD_COST.wood)}>철검 (자원 필요)</button>}
            {buildings.forge > 0 && equipment.iron_armor < population.villagers && <button style={styles.button} onClick={() => onAction({ type: 'CRAFT_IRON_ARMOR' })} disabled={!(resources.iron_bar >= IRON_ARMOR_COST.iron_bar && resources.leather >= IRON_ARMOR_COST.leather)}>철 갑옷 (자원 필요)</button>}
        </div>
    );
}

function VillagerManagement({ gameState, onAction }) {
    const { population, buildings, flags } = gameState;
    if (population.villagers === 0) return null;
    const unassigned = population.villagers - sum(population.jobs);
    const jobTypes = [ { key: 'woodcutter', name: '벌목꾼' }, { key: 'trapper', name: '사냥꾼' }, { key: 'cook', name: '요리사' }, { key: 'blacksmith', name: '대장장이' } ];
    if (flags.path_chosen === 'kingdom') jobTypes.push({ key: 'soldier', name: '군인' });
    return (
        <div style={styles.actionsSection}>
            <h3 style={styles.actionsTitle}>마을 주민 관리</h3>
            <p>미지정 주민: {unassigned}</p>
            {jobTypes.map(({ key, name }) => {
                const total = population.jobs[key];
                let activity = "";
                if (key === 'trapper') activity = `(덫: ${buildings.trap}개)`;
                if (key === 'cook') activity = `(훈제실: ${buildings.smokehouse}개)`;
                if (key === 'blacksmith') activity = `(대장간: ${buildings.forge}개)`;
                if (key === 'soldier') activity = `(훈련장: ${buildings.barracks}개)`;
                return (
                    <div key={key} style={styles.jobRow}>
                        <span>{name}: {total} {activity}</span>
                        <div>
                            <button style={styles.jobButton} onClick={() => onAction({ type: 'ASSIGN_JOB', payload: { job: key } })} disabled={unassigned <= 0}>+</button>
                            <button style={styles.jobButton} onClick={() => onAction({ type: 'UNASSIGN_JOB', payload: { job: key } })} disabled={total <= 0}>-</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function OutsideActions({ gameState, onAction }) {
    return (
        <div style={styles.actionsSection}>
            <h3 style={styles.actionsTitle}>바깥</h3>
            {gameState.flags.map_unlocked ? (
                <button style={styles.button} onClick={() => onAction({ type: 'MAP_ENTER' })} disabled={gameState.resources.waterskin < 1}>월드맵</button>
            ) : (
                gameState.flags.path_unlocked && <button style={styles.button} onClick={() => onAction({ type: 'START_EXPLORING' })} disabled={gameState.resources.waterskin < 1 || gameState.exploration.isLoading}>먼지투성이 길</button>
            )}
        </div>
    );
}

function ExplorationView({ exploration, onAction }) {
    if (exploration.isLoading) return <p>길을 살피는 중...</p>;
    if (!exploration.currentEvent) return <p>무엇을 할까?</p>;
    const { description, choices } = exploration.currentEvent;
    return (
        <div style={styles.actionsSection}>
            <p>{description}</p>
            <div>{choices.map((choice, index) => <button key={index} style={styles.button} onClick={() => onAction({ type: 'EXPLORE_CHOICE', payload: choice })}>{choice.text}</button>)}</div>
        </div>
    );
}

function WorldMapView({ gameState, onAction }) {
    const { worldMap } = gameState;
    const { grid, playerPos, size, event } = worldMap;
    const currentTile = grid[playerPos.y][playerPos.x];
    const TILE_REPR = { plains: '.', forest: 'F', mountains: 'M', ruins: 'R', capital: 'K' };
    const handleChoice = (choice) => { onAction({ type: 'MAP_SEARCH_CHOICE', payload: choice }); };
    return (
        <div>
            <h2 style={styles.actionsTitle}>월드맵</h2>
            <pre style={styles.mapGrid}>
                {grid.map((row, y) => {
                    let line = "";
                    for (let x = 0; x < size; x++) {
                        if (playerPos.x === x && playerPos.y === y) line += '@ ';
                        else if (grid[y][x].hasSpaceship) line += 'S ';
                        else if (grid[y][x].hasOutpost) line += 'O ';
                        else if (grid[y][x].isVillage) line += 'V ';
                        else if (grid[y][x].enemy) line += '$ ';
                        else if (grid[y][x].kingdom) line += 'K ';
                        else if (grid[y][x].discovered) line += `${TILE_REPR[grid[y][x].terrain] || '?'} `;
                        else line += '  ';
                    }
                    return <div key={y}>{line}</div>;
                })}
            </pre>
            <div style={styles.mapControls}>
                <button style={styles.button} onClick={() => onAction({ type: 'MAP_MOVE', payload: { dx: 0, dy: -1 } })}>북</button>
                <div>
                    <button style={styles.button} onClick={() => onAction({ type: 'MAP_MOVE', payload: { dx: -1, dy: 0 } })}>서</button>
                    <button style={styles.button} onClick={() => onAction({ type: 'MAP_LEAVE' })}>마을로</button>
                    <button style={styles.button} onClick={() => onAction({ type: 'MAP_MOVE', payload: { dx: 1, dy: 0 } })}>동</button>
                </div>
                <button style={styles.button} onClick={() => onAction({ type: 'MAP_MOVE', payload: { dx: 0, dy: 1 } })}>남</button>
            </div>
            <div style={styles.tileInteraction}>
                <p>현재 위치: {currentTile.terrain}</p>
                {currentTile.hasSpaceship ? (
                    <SpaceshipInterface gameState={gameState} onAction={onAction} />
                ) : currentTile.enemy ? (
                    <div><p>적대적 주둔지가 있다. (전투력: {currentTile.enemy.power})</p><button style={styles.button} onClick={() => onAction({ type: 'MAP_ATTACK' })}>공격</button></div>
                ) : currentTile.kingdom ? (
                    <KingdomInterface gameState={gameState} onAction={onAction} tile={currentTile} />
                ) : currentTile.isVillage ? (
                    <p>당신의 마을이다.</p>
                ) : currentTile.hasOutpost ? (
                    <p>당신의 전초기지다.</p>
                ) : event && event.isLoading ? (
                    <p>탐색 중...</p>
                ) : event ? (
                    <div><p>{event.description}</p>{event.choices.map((choice, i) => <button key={i} style={styles.button} onClick={() => handleChoice(choice)}>{choice.text}</button>)}</div>
                ) : (
                    <button style={styles.button} onClick={() => onAction({ type: 'MAP_SEARCH' })}>탐색</button>
                )}
                {!currentTile.enemy && !currentTile.isVillage && !currentTile.hasOutpost && gameState.flags.path_chosen === 'kingdom' && (
                    <button style={styles.button} onClick={() => onAction({ type: 'MAP_BUILD_OUTPOST' })}>전초기지 건설</button>
                )}
            </div>
        </div>
    );
}

function KingdomInterface({ gameState, onAction, tile }) {
    const kingdomId = tile.kingdom.id;
    const kingdom = gameState.diplomacy.kingdoms[kingdomId];
    const relation = gameState.diplomacy.relations[kingdomId];
    const isAtWar = relation.status === 'war';
    const hasTradeRoute = gameState.trade.routes.includes(kingdomId);

    return (
        <div>
            <h3 style={styles.actionsTitle}>{kingdom.name} (군사력: {kingdom.military})</h3>
            {relation.contact ? (
                <p>관계: {relation.status} ({relation.relation})</p>
            ) : (
                <p>미지의 왕국. 그들의 의도는 아직 알 수 없다.</p>
            )}
            {gameState.buildings.embassy > 0 && !relation.contact && (
                <button style={styles.button} onClick={() => onAction({ type: 'DIPLOMACY_SEND_ENVOY', payload: { kingdomId } })}>사절단 파견</button>
            )}
            {relation.contact && !isAtWar && (
                <>
                    {gameState.buildings.trading_post > 0 && !hasTradeRoute && <button style={styles.button} onClick={() => onAction({ type: 'DIPLOMACY_ESTABLISH_TRADE', payload: { kingdomId } })}>교역로 개설</button>}
                    <button style={styles.button} onClick={() => onAction({ type: 'DIPLOMACY_DECLARE_WAR', payload: { kingdomId } })}>전쟁 선포</button>
                </>
            )}
            {isAtWar && <p>이 왕국과 전쟁 중이다.</p>}
        </div>
    );
}

function SpaceshipInterface({ gameState, onAction }) {
    const { spaceship, resources } = gameState;
    const canLaunch = spaceship.hull >= 100 && spaceship.engine >= 100 && spaceship.stasis_chamber >= 100;
    const repairActions = [
        { part: 'hull', name: '선체', cost: SPACESHIP_HULL_COST, progress: spaceship.hull },
        { part: 'engine', name: '엔진', cost: SPACESHIP_ENGINE_COST, progress: spaceship.engine },
        { part: 'stasis_chamber', name: '동면 장치', cost: SPACESHIP_STASIS_COST, progress: spaceship.stasis_chamber },
    ];
    return (
        <div>
            <h3 style={styles.actionsTitle}>추락한 우주선</h3>
            <p>거대한 선체가 하늘을 찌를 듯 서 있다. 수리하면, 집으로 돌아갈 수 있을지도 모른다.</p>
            {canLaunch ? (
                <button style={styles.launchButton} onClick={() => onAction({ type: 'SPACESHIP_LAUNCH' })}>발사</button>
            ) : (
                repairActions.map(({ part, name, cost, progress }) => {
                    const canAfford = Object.entries(cost).every(([res, amount]) => resources[res] >= amount);
                    return (
                        <div key={part} style={styles.repairItem}>
                            <span>{name} 수리: {progress}%</span>
                            <button style={styles.button} onClick={() => onAction({ type: 'SPACESHIP_REPAIR', payload: { part, cost } })} disabled={progress >= 100 || !canAfford}>수리 ({Object.entries(cost).map(([r, a]) => `${r.replace('_', ' ')} ${a}`).join(', ')})</button>
                        </div>
                    );
                })
            )}
        </div>
    );
}

function PathDecisionView({ onAction }) {
    return (
        <div style={styles.decisionScreen}>
            <h2>운명의 갈림길</h2>
            <p>관측탑 꼭대기에서, 당신은 세상의 윤곽과 마주한다. 하나는 별을 향하고, 다른 하나는 땅에 굳건히 발을 딛는다.</p>
            <div style={styles.decisionButtons}>
                <button style={styles.button} onClick={() => onAction({ type: 'CHOOSE_PATH', payload: { path: 'stars' } })}>별의 길</button>
                <button style={styles.button} onClick={() => onAction({ type: 'CHOOSE_PATH', payload: { path: 'kingdom' } })}>왕국의 길</button>
            </div>
        </div>
    );
}

function Resources({ gameState }) {
    const { resources, population, exploration, equipment, worldMap, military } = gameState;
    const waterAmount = exploration.isExploring || worldMap.isOnMap ? resources.water : resources.waterskin * 10;
    return (
        <div>
            <h3 style={styles.sidebarTitle}>자원</h3>
            <p>나무: {Math.floor(resources.wood)} | 가죽: {Math.floor(resources.fur)}</p>
            <p>가공된 가죽: {Math.floor(resources.leather)}</p>
            <p>고기: {Math.floor(resources.meat)} | 훈제 고기: {Math.floor(resources.cured_meat)}</p>
            <p>철광석: {Math.floor(resources.iron_ore)} | 철 주괴: {Math.floor(resources.iron_bar)}</p>
            <p>외계 합금: {Math.floor(resources.alien_alloy)} | 금: {Math.floor(resources.gold)}</p>
            <p>물: {Math.floor(waterAmount)} / {resources.waterskin * 10}</p>
            <br />
            <h3 style={styles.sidebarTitle}>장비</h3>
            <p>창: {equipment.spear} | 철검: {equipment.iron_sword}</p>
            <p>갑옷: {equipment.armor} | 철 갑옷: {equipment.iron_armor}</p>
            <p>나침반: {equipment.compass > 0 ? "있음" : "없음"}</p>
            <br />
            <h3 style={styles.sidebarTitle}>인구</h3>
            <p>마을 주민: {population.villagers} / {population.max}</p>
            {gameState.flags.path_chosen === 'kingdom' && <div><br /><h3 style={styles.sidebarTitle}>군사력</h3><p>공격력: {military.attack}</p><p>방어력: {military.defense}</p></div>}
        </div>
    );
}

function Buildings({ buildings }) {
    const buildingEntries = Object.entries(buildings).filter(([, count]) => count > 0);
    if (buildingEntries.length === 0) return null;
    return (
        <div><br /><h3 style={styles.sidebarTitle}>건물</h3>{buildingEntries.map(([name, count]) => <p key={name}>{name.replace('_',' ')}: {count}</p>)}</div>
    );
}

function Kingdoms({ gameState }) {
    if (gameState.flags.path_chosen !== 'kingdom') return null;
    const { kingdoms, relations } = gameState.diplomacy;
    if (Object.keys(kingdoms).length === 0) return null;
    return (
        <div><br /><h3 style={styles.sidebarTitle}>왕국들</h3>
        {Object.values(kingdoms).map(k => {
            const r = relations[k.id];
            return <p key={k.id}>{k.name}: {r.contact ? r.status : "미접촉"}</p>;
        })}
        </div>
    );
}

// ========== 스타일 ==========
const styles = {
    container: { fontFamily: '"Courier New", Courier, monospace', backgroundColor: '#1a1a1a', color: '#f0f0f0', minHeight: '100vh', display: 'grid', gridTemplateAreas: `"header header" "main sidebar"`, gridTemplateColumns: '3fr 1fr', gridTemplateRows: 'auto 1fr', gap: '1rem', padding: '1rem' },
    header: { gridArea: 'header', borderBottom: '1px solid #444', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    title: { margin: 0 },
    main: { gridArea: 'main', display: 'flex', flexDirection: 'column', gap: '1rem' },
    sidebar: { gridArea: 'sidebar', borderLeft: '1px solid #444', paddingLeft: '1rem' },
    sidebarTitle: { marginTop: 0, marginBottom: '0.5rem' },
    logContainer: { flexGrow: 1, border: '1px solid #444', padding: '0.5rem 1rem', overflowY: 'auto', height: '50vh' },
    log: { display: 'flex', flexDirection: 'column' },
    logEntry: { margin: '0.2rem 0', animation: 'fadeIn 0.5s ease-in-out' },
    actionsContainer: { border: '1px solid #444', padding: '1rem' },
    outsideContainer: { border: '1px solid #444', padding: '1rem' },
    actionsSection: { paddingTop: '0.5rem' },
    actionsTitle: { marginTop: 0, marginBottom: '1rem', borderBottom: '1px solid #444', paddingBottom: '0.5rem' },
    button: { fontFamily: 'inherit', backgroundColor: '#333', color: '#f0f0f0', border: '1px solid #555', padding: '0.5rem 1rem', cursor: 'pointer', minWidth: '120px', margin: '0.2rem' },
    jobRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' },
    jobButton: { padding: '0.2rem 0.5rem', marginLeft: '0.5rem', fontFamily: 'inherit', backgroundColor: '#444', color: '#f0f0f0', border: '1px solid #666' },
    mapGrid: { lineHeight: '1.2', fontSize: '14px', border: '1px solid #444', padding: '0.5rem', overflow: 'auto', textAlign: 'center' },
    mapControls: { textAlign: 'center', marginTop: '1rem' },
    tileInteraction: { marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #444' },
    repairItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', border: '1px solid #333', padding: '0.5rem' },
    launchButton: { width: '100%', padding: '1rem', fontSize: '1.2rem', backgroundColor: '#2b4e2b', color: '#9f9', border: '1px solid #4a7e4a' },
    endScreen: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#1a1a1a', color: '#f0f0f0', fontFamily: '"Courier New", Courier, monospace', fontSize: '1.5rem', textAlign: 'center' },
    decisionScreen: { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#1a1a1a', color: '#f0f0f0', fontFamily: '"Courier New", Courier, monospace', textAlign: 'center', padding: '2rem' },
    decisionButtons: { marginTop: '2rem' }
};

const styleSheet = document.createElement("style");
styleSheet.type = "text/css";
styleSheet.innerText = ` @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } button:disabled { background-color: #222; color: #888; cursor: not-allowed; } `;
document.head.appendChild(styleSheet);
