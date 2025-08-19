import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, getDocs } from 'firebase/firestore';
import './App.css';

import LoginScreen from './components/LoginScreen';
import CharacterScreen from './components/CharacterScreen';
import GameScreen from './components/GameScreen';
import PlayerChronicle from './components/PlayerChronicle';

function App() {
    // 자유도 높은 LLM 콘텐츠 상태 (반드시 함수 내부에서 선언)
    const [chronicle, setChronicle] = useState('');
    const [npcDialog, setNpcDialog] = useState('');
    const [worldEvent, setWorldEvent] = useState('');
    const [creationResult, setCreationResult] = useState('');
    const [npcInput, setNpcInput] = useState('');
    const [creationInput, setCreationInput] = useState('');
    const [creationType, setCreationType] = useState('auto'); // 'auto', 'item', 'skill', 'companion'
    const [worldEventInput, setWorldEventInput] = useState('');

    // 1. 즉석 서브퀘스트/사건 생성
    const handleInstantQuest = async () => {
        setLoading(true);
        setMessage('즉석 퀘스트 생성 중...');
        try {
            const prompt = `플레이어가 현재 위치에서 경험할 수 있는 흥미로운 서브퀘스트나 사건을 즉석에서 만들어줘. 5~7문장 내러티브와 3가지 선택지를 한국어로 제시해. 선택지는 한 줄 요약으로.`;
            const result = await callGeminiAPI(prompt, false);
            addGameLog('[즉석 퀘스트] ' + result);
            setWorldEvent(result);
        } catch (e) {
            setMessage('즉석 퀘스트 생성 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // 2. NPC 자유 대화
    const handleNpcDialog = async () => {
        if (!npcInput.trim()) return;
        setLoading(true);
        setMessage('NPC와 대화 중...');
        try {
            const prompt = `NPC와의 자유 대화. 플레이어가 "${npcInput}"라고 질문/요청했다. NPC의 성격과 상황에 맞는 자연스러운 답변을 한국어로 3~5문장으로 생성해줘.`;
            const result = await callGeminiAPI(prompt, false);
            setNpcDialog(result);
            addGameLog('[NPC 대화] ' + result);
        } catch (e) {
            setMessage('NPC 대화 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // 3. 플레이어 창작 반영 (자동 반영)
    const handleCreation = async () => {
        if (!creationInput.trim()) return;
        setLoading(true);
        setMessage('창작 반영 중...');
        try {
            let prompt = '';
            if (creationType === 'auto') {
                prompt = `플레이어가 다음과 같은 창작 아이디어를 제안했다: "${creationInput}". 이 아이디어가 아이템, 스킬, 동료(펫) 중 무엇에 해당하는지 type(예: item, skill, companion)으로 분류하고, id(영문 소문자+숫자), name, description, 주요 효과/수치(예: attack, defense, mpCost 등)를 포함한 JSON 오브젝트로 출력해줘. 예시: {"type":"item","id":"flame_sword","name":"불꽃의 검","description":"...","attack":10}`;
            } else if (creationType === 'item') {
                prompt = `플레이어가 다음과 같은 아이템을 제안했다: "${creationInput}". id(영문 소문자+숫자), name, description, 주요 효과/수치(attack, defense 등)를 포함한 JSON 오브젝트로 출력해줘. 예시: {"type":"item","id":"flame_sword","name":"불꽃의 검","description":"...","attack":10}`;
            } else if (creationType === 'skill') {
                prompt = `플레이어가 다음과 같은 스킬을 제안했다: "${creationInput}". id(영문 소문자+숫자), name, description, mpCost, damage, damageType(physical/magic) 등 주요 정보를 포함한 JSON 오브젝트로 출력해줘. 예시: {"type":"skill","id":"ice_blast","name":"얼음 폭발","description":"...","mpCost":8,"damage":{"min":10,"max":18},"damageType":"magic"}`;
            } else if (creationType === 'companion') {
                prompt = `플레이어가 다음과 같은 동료(펫)를 제안했다: "${creationInput}". id(영문 소문자+숫자), name, description, 주요 능력치/효과를 포함한 JSON 오브젝트로 출력해줘. 예시: {"type":"companion","id":"wolf_pet","name":"늑대 펫","description":"...","ability":"적을 물어 피해를 준다"}`;
            }
            const result = await callGeminiAPI(prompt, false);
            // JSON 파싱
            let jsonStr = result;
            // ```json ... ``` 감싸진 경우 추출
            const match = result.match(/```json\s*([\s\S]*?)\s*```/);
            if (match) jsonStr = match[1];
            let obj;
            try {
                obj = JSON.parse(jsonStr);
            } catch (e) {
                setCreationResult('LLM 응답 파싱 실패: ' + result);
                setLoading(false);
                return;
            }
            // Firestore 저장
            let col = '';
            if (obj.type === 'item') col = 'items';
            else if (obj.type === 'skill') col = 'skills';
            else if (obj.type === 'companion') col = 'companions';
            else {
                setCreationResult('지원하지 않는 type: ' + obj.type);
                setLoading(false);
                return;
            }
            await setDoc(doc(db, col, obj.id), obj);
            setCreationResult(`[${obj.type}] ${obj.name}이(가) 게임에 추가되었습니다!`);
            addGameLog(`[창작 반영] [${obj.type}] ${obj.name}이(가) 게임에 추가됨.`);
            // 상태 즉시 반영
            if (col === 'items') {
                setAllItems(prev => [...prev, obj]);
            } else if (col === 'skills') {
                setAllSkills(prev => [...prev, obj]);
            }
            // companions는 별도 상태 필요시 추가
        } catch (e) {
            setMessage('창작 반영 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // 4. 세계 변화/대형 이벤트
    const handleWorldEvent = async () => {
        if (!worldEventInput.trim()) return;
        setLoading(true);
        setMessage('세계 이벤트 생성 중...');
        try {
            const prompt = `플레이어의 행동이나 선택으로 인해 세계관 전체에 영향을 주는 대형 이벤트가 발생했다: "${worldEventInput}". 이로 인한 변화와 파급효과를 한국어로 4~7문장으로 묘사해줘.`;
            const result = await callGeminiAPI(prompt, false);
            setWorldEvent(result);
            addGameLog('[세계 이벤트] ' + result);
        } catch (e) {
            setMessage('세계 이벤트 생성 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    // 5. 플레이어 연대기 자동 생성
    const handleChronicle = async () => {
        setLoading(true);
        setMessage('연대기 생성 중...');
        try {
            const prompt = `플레이어가 최근에 겪은 주요 선택, 전투, 사건을 요약해 연대기(일기) 형태로 5~8문장 내러티브로 정리해줘. 한국어로.`;
            const result = await callGeminiAPI(prompt, false);
            setChronicle(result);
            addGameLog('[연대기] ' + result);
        } catch (e) {
            setMessage('연대기 생성 실패: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

// Firebase and API configurations
const firebaseConfig = {
    apiKey: 'AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8',
    authDomain: 'text-adventure-game-cb731.firebaseapp.com',
    projectId: 'text-adventure-game-cb731',
    storageBucket: 'text-adventure-game-cb731.appspot.com',
    messagingSenderId: '1092941614820',
    appId: '1:1092941614820:web:5545f36014b73c268026f1',
    measurementId: 'G-FNGF42T1FP',
};

const API_KEYS = {
    geminiMainKey: 'AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8',
    geminiSubKey: 'AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84',
    groqKey: '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'
};

const MODELS = {
    geminiMain: 'gemini-2.0-flash-lite',
    geminiBackup: 'gemini-2.5-flash-lite',
    groq: 'llama3-70b-8192'
};

const PROMPTS = {
    SYSTEM: `You are the Game Master for a text-based RPG called "Project TWOW". Your role is to create a vivid, engaging, and dynamic world for the player. All your responses should be in Korean.\n- Be descriptive and immersive. Paint a picture with your words.\n- Be fair and consistent with the game's rules and lore.\n- Adapt to the player's actions and choices.\n- Generate JSON data when specifically asked, otherwise, provide narrative text.\n- Keep the tone consistent with a fantasy RPG.`,
    DB_INIT: {
        CLASSES: `Generate 5 diverse character classes for a fantasy RPG. Provide a name, a brief description, base stats (strength, dexterity, intelligence, vitality), starting skills (provide 2 skill IDs from the skills list), and starting equipment (provide 2 item IDs from the items list). Respond in valid JSON format: [{ "id": "class_id", "name": "...", "description": "...", "baseStats": { "strength": 10, "dexterity": 10, "intelligence": 10, "vitality": 10 }, "startingSkills": ["skill_id_1", "skill_id_2"], "startingEquipment": ["item_id_1", "item_id_2"] }]`,
        SKILLS: `Generate 10 diverse skills for a fantasy RPG, including attacks, buffs, and debuffs. Provide a name, description, damage (if applicable, with min/max), MP cost, and damage type (physical/magic). Respond in valid JSON format: [{ "id": "skill_id", "name": "...", "description": "...", "damage": { "min": 5, "max": 10 }, "mpCost": 5, "damageType": "physical" }]`,
        ITEMS: `Generate 15 diverse items for a fantasy RPG, including weapons, armor, potions, and quest items. Provide a name, description, type (equipment, consumable, quest), slot (for equipment), and stats (if applicable). Respond in valid JSON format: [{ "id": "item_id", "name": "...", "description": "...", "type": "equipment", "slot": "weapon", "stats": { "attack": 5 } }]`,
        REGIONS: `Generate 5 distinct regions for a fantasy RPG world. Include a starter village, a forest, a swamp, a mountain, and a ruined city. Provide a name, description, and a list of monster IDs that can be found there. Respond in valid JSON format: [{ "id": "region_id", "name": "...", "description": "...", "monsters": ["monster_id_1", "monster_id_2"] }]`,
        MONSTERS: `Generate 10 diverse monsters for a fantasy RPG. Provide a name, a description, level, HP, attack power, experience points given, and potential item drops (item IDs). Respond in valid JSON format: [{ "id": "monster_id", "name": "...", "description": "...", "level": 1, "hp": 50, "attack": 5, "exp": 10, "drops": ["item_id_1"] }]`,
        QUESTS: `Generate 5 starter quests. Provide a name, description, objectives (e.g., kill 5 goblins, collect 3 herbs), rewards (EXP, gold, item IDs), and a starting NPC. Respond in valid JSON format: [{ "id": "quest_id", "name": "...", "description": "...", "objectives": { "kill": { "monster_id": "goblin", "count": 5 } }, "rewards": { "exp": 100, "gold": 50, "items": ["item_id_1"] }, "startNpc": "npc_id" }]`,
    },
    COMBAT: {
        ENCOUNTER: `Describe the tense moment as {{characterName}}, the Level {{characterLevel}} {{characterClass}}, encounters a {{monsterName}} (Level {{monsterLevel}}). The monster's description: {{monsterDescription}}. The scene is set for battle.`,
        ATTACK: `Describe how {{characterName}} (Level {{characterLevel}} {{characterClass}}) uses the skill '{{skillName}}' against the {{monsterName}}, dealing {{damage}} damage. Make it dynamic and exciting.`,
        MONSTER_ATTACK: `The {{monsterName}} retaliates! Describe its attack against {{characterName}}, who takes {{damage}} damage.`,
        VICTORY: `The {{monsterName}} has been defeated! Describe the moment of victory for {{characterName}}. They have gained {{expGained}} EXP and {{goldGained}} gold.`,
        DEFEAT: `{{characterName}} has been overwhelmed by the {{monsterName}}. Describe the moment of defeat, the character collapsing, and losing {{goldLost}} gold. The character wakes up later, weakened but alive.`,
    },
    EXPLORATION: {
        REGION: `{{characterName}} (Level {{characterLevel}} {{characterClass}}) arrives at {{regionName}}. Describe the atmosphere, sights, and sounds of this area. Region description: {{regionDescription}}`
    },
    LEVELUP: `A surge of power flows through {{characterName}}! They have reached Level {{newLevel}}! Describe this moment. Their stats have increased: Strength +{{strIncrease}}, Dexterity +{{dexIncrease}}, Intelligence +{{intIncrease}}, Vitality +{{vitIncrease}}.`,
    EVENT: `현재 지역 '{{regionName}}'에서 벌어진 소규모 사건을 간결히 묘사하라. 한국어로 5~7문장. 플레이어가 개입할 수 있는 선택지를 정확히 세 가지로 제시하라:\n1) 전투로 개입\n2) 설득 시도\n3) 몰래 조사\n각 선택지는 한 줄로 요약 설명을 붙여라. JSON 없이 순수 서술과 선택지 목록만 출력하라.`,
    EVENT_RESOLVE: `캐릭터 {{characterName}} (Lv.{{characterLevel}} {{characterClass}})가 "{{choice}}"를 선택했다. 현재 지역: {{regionName}}. 이 선택의 결과를 한국어로 3~6문장으로 묘사하라. 작은 이득(경험, 금전, 정보) 또는 가벼운 리스크를 서사적으로 암시하되, 수치는 직접 제시하지 말아라. 서사는 간결하고 생동감 있게.`,
    NONCOMBAT_ATTEMPT: `캐릭터 {{characterName}} (Lv.{{characterLevel}} {{characterClass}})의 비전투 시도.
- 전술: {{approach}} (설득/은밀/협상 중 하나)
- 의도: "{{intent}}"
- 상대: {{monsterName}}
다음 중 하나의 결론(성공/부분 성공/실패)을 한국어로 3~6문장 간결 서술하라. 수치 수치는 직접 제시하지 말고, 작은 이득(경험/금전/정보) 또는 가벼운 리스크(경미한 체력/정신력 소모)를 서사로 암시하라. 과장 없이 현실적이고 간결하게. JSON 없이 순수 서술만.`
};

    const [initialized, setInitialized] = useState(false);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [gameState, setGameState] = useState('login'); // login, character, game
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [gameLog, setGameLog] = useState([]);
    const logEndRef = useRef(null);

    const [currentCharData, setCurrentCharData] = useState(null);
    const [currentLocation, setCurrentLocation] = useState(null);

    // Game Data States
    const [allSkills, setAllSkills] = useState([]);
    const [allQuests, setAllQuests] = useState([]);
    const [allItems, setAllItems] = useState([]);
    const [allRegions, setAllRegions] = useState([]);
    const [allClasses, setAllClasses] = useState([]);
    const [allMonsters, setAllMonsters] = useState([]);

    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [gameLog]);

    useEffect(() => {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        setDb(firestore);
        checkAndInitializeDatabase(firestore);
    }, []);

    useEffect(() => {
        const loadAllGameData = async () => {
            if (!db || !initialized) return;
            try {
                setLoading(true);
                const skillsSnapshot = await getDocs(collection(db, 'skills'));
                setAllSkills(skillsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                const questsSnapshot = await getDocs(collection(db, 'quests'));
                setAllQuests(questsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                const itemsSnapshot = await getDocs(collection(db, 'items'));
                setAllItems(itemsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                const regionsSnapshot = await getDocs(collection(db, 'regions'));
                setAllRegions(regionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                const classesSnapshot = await getDocs(collection(db, 'classes'));
                setAllClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                const monstersSnapshot = await getDocs(collection(db, 'monsters'));
                setAllMonsters(monstersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

                addGameLog('모든 게임 데이터 로드 완료.');
            } catch (error) {
                console.error('게임 데이터 로드 오류:', error);
                setMessage('게임 데이터 로드 오류: ' + error.message);
            } finally {
                setLoading(false);
            }
        };
        if (initialized) {
            loadAllGameData();
        }
    }, [db, initialized]);

    const addGameLog = (logMessage) => {
        setGameLog(prev => [...prev, { id: Date.now(), message: logMessage, timestamp: new Date() }]);
    };

    const callAPI = async (apiKey, model, prompt, parseJson = false) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: `${PROMPTS.SYSTEM}\n${prompt}` }] }],
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 1024,
                    },
                }),
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }
            const data = await response.json();
            const text = data.candidates[0].content.parts[0].text;
            if (parseJson) {
                const jsonString = text.match(/```json\n([\s\S]*?)\n```/)[1];
                return JSON.parse(jsonString);
            }
            return text;
        } catch (error) {
            console.error(`Error calling model ${model}:`, error);
            throw error;
        }
    };

    const callGeminiAPI = async (prompt, parseJson = false) => {
        try {
            return await callAPI(API_KEYS.geminiMainKey, MODELS.geminiMain, prompt, parseJson);
        } catch (error) {
            console.warn('Main Gemini API failed, trying backup...');
            try {
                return await callAPI(API_KEYS.geminiSubKey, MODELS.geminiBackup, prompt, parseJson);
            } catch (backupError) {
                console.error('Backup Gemini API also failed:', backupError);
                throw backupError;
            }
        }
    };

    const callGroqAPI = async (prompt) => {
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEYS.groqKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [
                        { role: "system", content: `${PROMPTS.SYSTEM}. You must provide only the narrative description, without any introductory phrases like 'Okay, here is the description'.` },
                        { role: "user", content: prompt }
                    ],
                    model: MODELS.groq
                })
            });
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`Groq API Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }
            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('Error calling Groq API:', error);
            // Fallback to Gemini if Groq fails
            console.warn('Groq failed, falling back to Gemini...');
            return await callGeminiAPI(prompt, false);
        }
    };

    const checkAndInitializeDatabase = async (firestore) => {
        setLoading(true);
        setMessage('데이터베이스 확인 및 초기화 중...');
        try {
            const skillsCollection = collection(firestore, 'skills');
            const skillsSnapshot = await getDocs(skillsCollection);
            if (skillsSnapshot.empty) {
                addGameLog('기본 게임 데이터가 없습니다. 데이터베이스 초기화를 시작합니다...');
                await initializeDatabase(firestore);
            } else {
                addGameLog('데이터베이스가 이미 준비되었습니다.');
            }
            setInitialized(true);
            setMessage('초기화 완료!');
        } catch (error) {
            console.error('데이터베이스 확인 오류:', error);
            setMessage('데이터베이스 확인 중 오류 발생: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const initializeDatabase = async (firestore) => {
        try {
            addGameLog('아이템 생성 중...');
            const items = await callGeminiAPI(PROMPTS.DB_INIT.ITEMS, true);
            for (const item of items) {
                await setDoc(doc(firestore, 'items', item.id), item);
            }

            addGameLog('스킬 생성 중...');
            const skills = await callGeminiAPI(PROMPTS.DB_INIT.SKILLS, true);
            for (const skill of skills) {
                await setDoc(doc(firestore, 'skills', skill.id), skill);
            }

            addGameLog('직업 생성 중...');
            const classes = await callGeminiAPI(PROMPTS.DB_INIT.CLASSES, true);
            for (const c of classes) {
                await setDoc(doc(firestore, 'classes', c.id), c);
            }
            
            addGameLog('몬스터 생성 중...');
            const monsters = await callGeminiAPI(PROMPTS.DB_INIT.MONSTERS, true);
            for (const monster of monsters) {
                await setDoc(doc(firestore, 'monsters', monster.id), monster);
            }

            addGameLog('지역 생성 중...');
            const regions = await callGeminiAPI(PROMPTS.DB_INIT.REGIONS, true);
            for (const region of regions) {
                await setDoc(doc(firestore, 'regions', region.id), region);
            }

            addGameLog('퀘스트 생성 중...');
            const quests = await callGeminiAPI(PROMPTS.DB_INIT.QUESTS, true);
            for (const quest of quests) {
                await setDoc(doc(firestore, 'quests', quest.id), quest);
            }

            addGameLog('데이터베이스 초기화 완료!');
        } catch (error) {
            console.error('데이터베이스 초기화 오류:', error);
            setMessage('데이터베이스 초기화 중 심각한 오류 발생: ' + error.message);
        }
    };

    const renderContent = () => {
        switch (gameState) {
            case 'login':
                return <LoginScreen 
                            db={db} 
                            setLoading={setLoading} 
                            setMessage={setMessage} 
                            setUser={setUser} 
                            setGameState={setGameState} 
                            loading={loading} 
                            setCurrentUser={setUser}
                        />;
            case 'character':
                return <CharacterScreen 
                            db={db} 
                            currentUser={user}
                            setCurrentUser={setUser}
                            setUser={setUser}
                            setGameState={setGameState} 
                            setLoading={setLoading} 
                            setMessage={setMessage} 
                            loading={loading} 
                            message={message}
                            allClasses={allClasses}
                            allRegions={allRegions}
                            allItems={allItems}
                            setCurrentCharData={setCurrentCharData}
                            setCurrentLocation={setCurrentLocation}
                            addGameLog={addGameLog}
                            callGeminiAPI={callGeminiAPI}
                            PROMPTS={PROMPTS}
                        />;
            case 'game':
                return (
                    <>
                        <div style={{display:'flex', gap:'24px', alignItems:'flex-start'}}>
                            <div style={{flex:2}}>
                                <GameScreen 
                                    db={db}
                                    currentCharData={currentCharData}
                                    setCurrentCharData={setCurrentCharData}
                                    currentLocation={currentLocation}
                                    setCurrentLocation={setCurrentLocation}
                                    allSkills={allSkills}
                                    allQuests={allQuests}
                                    allItems={allItems}
                                    allRegions={allRegions}
                                    allClasses={allClasses}
                                    allMonsters={allMonsters}
                                    addGameLog={addGameLog}
                                    gameLog={gameLog}
                                    logEndRef={logEndRef}
                                    setGameState={setGameState}
                                    loading={loading}
                                    setLoading={setLoading}
                                    message={message}
                                    setMessage={setMessage}
                                    callGeminiAPI={callGeminiAPI}
                                    callGroqAPI={callGroqAPI}
                                    PROMPTS={PROMPTS}
                                />
                            </div>
                            <div style={{flex:1, minWidth:'320px'}}>
                                <div style={{background:'#f1f3f5', borderRadius:'10px', padding:'16px', marginBottom:'16px'}}>
                                    <h3>LLM 자유도 콘텐츠</h3>
                                    <button onClick={handleInstantQuest} disabled={loading} style={{marginBottom:'8px', width:'100%'}}>즉석 서브퀘스트/사건 생성</button>
                                    <div style={{marginBottom:'8px'}}>
                                        <input type="text" value={npcInput} onChange={e=>setNpcInput(e.target.value)} placeholder="NPC에게 질문/요청" style={{width:'70%'}} />
                                        <button onClick={handleNpcDialog} disabled={loading || !npcInput.trim()} style={{marginLeft:'6px'}}>NPC 대화</button>
                                    </div>
                                    <div style={{marginBottom:'8px'}}>
                                        <select value={creationType} onChange={e=>setCreationType(e.target.value)} style={{marginRight:'6px'}}>
                                            <option value="auto">자동 분류</option>
                                            <option value="item">아이템</option>
                                            <option value="skill">스킬</option>
                                            <option value="companion">동료/펫</option>
                                        </select>
                                        <input type="text" value={creationInput} onChange={e=>setCreationInput(e.target.value)} placeholder="창작 아이디어 제안" style={{width:'55%'}} />
                                        <button onClick={handleCreation} disabled={loading || !creationInput.trim()} style={{marginLeft:'6px'}}>창작 반영</button>
                                    </div>
                                    <div style={{marginBottom:'8px'}}>
                                        <input type="text" value={worldEventInput} onChange={e=>setWorldEventInput(e.target.value)} placeholder="세계 이벤트 제안" style={{width:'70%'}} />
                                        <button onClick={handleWorldEvent} disabled={loading || !worldEventInput.trim()} style={{marginLeft:'6px'}}>세계 변화</button>
                                    </div>
                                    <button onClick={handleChronicle} disabled={loading} style={{marginBottom:'8px', width:'100%'}}>플레이어 연대기 생성</button>
                                </div>
                                {worldEvent && (
                                    <div style={{background:'#fffbe6', border:'1px solid #ffe58f', borderRadius:'8px', padding:'10px', marginBottom:'10px'}}>
                                        <strong>즉석 사건/세계 이벤트:</strong>
                                        <div style={{whiteSpace:'pre-line'}}>{worldEvent}</div>
                                    </div>
                                )}
                                {npcDialog && (
                                    <div style={{background:'#e6f7ff', border:'1px solid #91d5ff', borderRadius:'8px', padding:'10px', marginBottom:'10px'}}>
                                        <strong>NPC 대화:</strong>
                                        <div style={{whiteSpace:'pre-line'}}>{npcDialog}</div>
                                    </div>
                                )}
                                {creationResult && (
                                    <div style={{background:'#f9f0ff', border:'1px solid #d3adf7', borderRadius:'8px', padding:'10px', marginBottom:'10px'}}>
                                        <strong>창작 반영:</strong>
                                        <div style={{whiteSpace:'pre-line'}}>{creationResult}</div>
                                    </div>
                                )}
                                <PlayerChronicle chronicle={chronicle} />
                            </div>
                        </div>
                    </>
                );
            default:
                return null;
        }
    };

    return (
        <div className="App">
            <h1>Project TWOW</h1>
            {!initialized ? (
                <div className="initializing">
                    <p>{message}</p>
                    {loading && <div className="spinner"></div>}
                </div>
            ) : (
                renderContent()
            )}
        </div>
    );
}

export default App;