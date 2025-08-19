import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, setDoc, getDocs } from 'firebase/firestore';
import './App.css';

import LoginScreen from './components/LoginScreen';
import CharacterScreen from './components/CharacterScreen';
import GameScreen from './components/GameScreen';

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
    LEVELUP: `A surge of power flows through {{characterName}}! They have reached Level {{newLevel}}! Describe this moment. Their stats have increased: Strength +{{strIncrease}}, Dexterity +{{dexIncrease}}, Intelligence +{{intIncrease}}, Vitality +{{vitIncrease}}.`
};

function App() {
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
                return <GameScreen 
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
                        />;
            default:
                return null;
        }
    };

    return (
        <div className="App">
            <h1>텍스트 와우 (Project TWOW)</h1>
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
