import React, { useState } from 'react';
import {doc, getDoc, setDoc} from "firebase/firestore";

function GameScreen({ 
    db, 
    currentCharData, 
    setCurrentCharData, 
    currentLocation, 
    setCurrentLocation, 
    allSkills, 
    allItems, 
    allClasses, 
    allMonsters,
    addGameLog, 
    gameLog, 
    logEndRef, 
    setGameState, 
    loading, 
    setLoading, 
    message, 
    setMessage, 
    callGeminiAPI, 
    callGroqAPI, 
    PROMPTS 
}) {
    const [currentMonster, setCurrentMonster] = useState(null);
    const [battleState, setBattleState] = useState(null);
    const [actionCooldown, setActionCooldown] = useState(false);
    const [popupContent, setPopupContent] = useState(null);
    // Non-combat attempt UI/logic state
    const [nonCombatFormOpen, setNonCombatFormOpen] = useState(false);
    const [nonCombatApproach, setNonCombatApproach] = useState('설득');
    const [nonCombatIntent, setNonCombatIntent] = useState('');
    const [nextAttackBonus, setNextAttackBonus] = useState(0);

    // Situation card (environment) and puzzle states
    const [situationCard, setSituationCard] = useState(null);
    const [puzzleAnswer, setPuzzleAnswer] = useState('');
    const [puzzleHintsShown, setPuzzleHintsShown] = useState({ h1: false, h2: false });

    // Preset situation cards with small effects
    const SITUATION_CARDS = [
        {
            id: 'mist',
            name: '짙은 안개',
            description: '시야가 흐려져 양측의 타격이 약간 약해집니다.',
            effects: { playerDamageMod: -1, monsterDamageMod: -1 }
        },
        {
            id: 'windbreak',
            name: '바람막이 바위',
            description: '지형의 이점으로 약간의 방어 이득을 얻습니다.',
            effects: { playerDefenseMod: 1 }
        },
        {
            id: 'toxic',
            name: '독성 안개',
            description: '공기 중 독기가 희미하게 감돌아, 적이 턴마다 약간의 피해를 입습니다.',
            effects: { monsterDot: 1 }
        },
        {
            id: 'tailwind',
            name: '등풍',
            description: '등에서 불어오는 바람이 공격을 조금 돕습니다.',
            effects: { playerDamageMod: 1 }
        }
    ];

    // Simple single riddle
    const RIDDLE = {
        question: '낮에는 길고 밤에는 짧으며, 빛이 사라지면 나도 사라진다. 나는 무엇일까?',
        hints: ['빛과 함께 움직입니다.', '당신의 발 아래서 태어납니다.'],
        answers: ['그림자', '그늘', 'shadow']
    };

    const initiateBattle = async (monsterId = null) => {
        if (battleState === 'active' || !currentCharData || !currentLocation) {
            addGameLog('이미 전투 중이거나 데이터가 부족합니다.');
            return;
        }

        setLoading(true);
        setActionCooldown(true);
        setMessage('');

        try {
            let selectedMonster = null;
            const monsterList = currentLocation && currentLocation.monsters ? currentLocation.monsters : [];

            if (monsterId) {
                selectedMonster = allMonsters.find(m => m.id === monsterId); 
            } else if (monsterList.length > 0) {
                const randomMonsterId = monsterList[Math.floor(Math.random() * monsterList.length)];
                const monsterDoc = await getDoc(doc(db, 'monsters', randomMonsterId));
                if(monsterDoc.exists()) {
                    selectedMonster = {id: monsterDoc.id, ...monsterDoc.data()};
                }
            }

            if (!selectedMonster) {
                addGameLog('사냥할 몬스터를 찾을 수 없습니다.');
                setLoading(false);
                setActionCooldown(false);
                return;
            }

            const monsterHp = selectedMonster.hp || 50;
            setCurrentMonster({
                ...selectedMonster,
                currentHp: monsterHp,
                hp: monsterHp
            });

            const encounterPrompt = PROMPTS.COMBAT.ENCOUNTER
                .replace('{{characterName}}', currentCharData.name)
                .replace('{{characterLevel}}', String(currentCharData.level))
                .replace('{{characterClass}}', allClasses.find(c=>c.id === currentCharData.class)?.name || currentCharData.class)
                .replace('{{monsterName}}', selectedMonster.name || '알 수 없는 몬스터')
                .replace('{{monsterLevel}}', String(selectedMonster.level || 1))
                .replace('{{monsterDescription}}', selectedMonster.description || '');

            const encounterDescription = await callGeminiAPI(encounterPrompt);
            addGameLog(`[전투 시작] ${encounterDescription}`);

            // Roll a situation card
            const card = SITUATION_CARDS[Math.floor(Math.random() * SITUATION_CARDS.length)];
            setSituationCard(card);
            addGameLog(`[상황 카드] ${card.name} - ${card.description}`);

            setBattleState('active');
            setPopupContent({
                type: 'battle',
                title: `${selectedMonster.name || '??'}과(와)의 전투`,
                content: encounterDescription,
                monster: { ...selectedMonster, currentHp: monsterHp, hp: monsterHp }
            });

        } catch (error) {
            console.error('전투 초기화 오류:', error);
            addGameLog('전투를 시작할 수 없습니다: ' + error.message);
            setBattleState(null);
        } finally {
            setLoading(false);
            setActionCooldown(false);
        }
    };

    // New: Dynamic Event trigger and resolution
    const triggerEvent = async () => {
        if (battleState === 'active') {
            addGameLog('전투 중에는 이벤트를 시작할 수 없습니다.');
            return;
        }
        if (!currentLocation) {
            addGameLog('현재 지역 정보가 없어 이벤트를 시작할 수 없습니다.');
            return;
        }
        setLoading(true);
        setActionCooldown(true);
        setMessage('');
        try {
            const eventPrompt = PROMPTS.EVENT
                .replace('{{regionName}}', currentLocation.name || '알 수 없는 지역');
            const text = await callGeminiAPI(eventPrompt);
            setPopupContent({
                type: 'event',
                title: `이벤트 - ${currentLocation.name || '알 수 없는 지역'}`,
                content: text
            });
            addGameLog('[이벤트] 지역에서 사건이 발생했습니다.');
        } catch (e) {
            console.error('이벤트 생성 오류:', e);
            addGameLog('이벤트 생성 중 오류가 발생했습니다: ' + e.message);
        } finally {
            setLoading(false);
            setActionCooldown(false);
        }
    };

    const resolveEventChoice = async (choice) => {
        if (!popupContent || popupContent.type !== 'event') return;
        setLoading(true);
        setActionCooldown(true);
        try {
            const resolvePrompt = PROMPTS.EVENT_RESOLVE
                .replace('{{characterName}}', currentCharData.name)
                .replace('{{characterLevel}}', String(currentCharData.level))
                .replace('{{characterClass}}', allClasses.find(c => c.id === currentCharData.class)?.name || currentCharData.class)
                .replace('{{choice}}', choice)
                .replace('{{regionName}}', currentLocation?.name || '');
            const resultText = await callGeminiAPI(resolvePrompt);
            addGameLog(`[이벤트 결과] ${resultText}`);

            // Small, bounded rewards to avoid balance issues
            let updatedChar = { ...currentCharData };
            const expGain = Math.floor(Math.random() * 6) + 5; // 5~10
            const goldGain = Math.floor(Math.random() * 11) + 5; // 5~15
            updatedChar.exp = (updatedChar.exp || 0) + expGain;
            updatedChar.gold = (updatedChar.gold || 0) + goldGain;
            // Reputation skeleton: locals ±1 based on choice
            const reps = { ...(updatedChar.reputations || {}) };
            const cur = typeof reps.locals === 'number' ? reps.locals : 0;
            if (choice === '전투로 개입' || choice === '설득 시도') {
                reps.locals = cur + 1;
                addGameLog('[평판] 주민들과의 관계 +1');
            } else if (choice === '몰래 조사') {
                reps.locals = cur - 1;
                addGameLog('[평판] 주민들과의 관계 -1');
            }
            updatedChar.reputations = reps;

            let levelUpOccurred = false;
            while (updatedChar.exp >= updatedChar.expToNextLevel) {
                levelUpOccurred = true;
                updatedChar.level += 1;
                updatedChar.exp -= updatedChar.expToNextLevel;
                updatedChar.expToNextLevel = Math.floor(updatedChar.expToNextLevel * 1.5);
                const classData = allClasses.find(c => c.id === updatedChar.class);
                if (classData) {
                    const growth = classData.statGrowth || {};
                    const currentStats = updatedChar.stats || {};
                    updatedChar.stats = {
                        strength: (currentStats.strength || 0) + (growth.strength || 0),
                        dexterity: (currentStats.dexterity || 0) + (growth.dexterity || 0),
                        intelligence: (currentStats.intelligence || 0) + (growth.intelligence || 0),
                        vitality: (currentStats.vitality || 0) + (growth.vitality || 0),
                    };
                    updatedChar.maxHp = Math.floor(updatedChar.stats.vitality * 10);
                    updatedChar.maxMp = Math.floor(updatedChar.stats.intelligence * 5);
                    updatedChar.hp = Math.min(updatedChar.maxHp, updatedChar.hp + Math.floor(updatedChar.maxHp * 0.2));
                    updatedChar.mp = Math.min(updatedChar.maxMp, updatedChar.mp + Math.floor(updatedChar.maxMp * 0.2));
                }
            }

            setCurrentCharData(updatedChar);
            await setDoc(doc(db, 'characters', updatedChar.id), updatedChar);

            addGameLog(`[보상] 경험치 +${expGain}, 골드 +${goldGain}`);

            if (levelUpOccurred) {
                const classData = allClasses.find(c => c.id === updatedChar.class);
                const growth = classData?.statGrowth || {};
                const levelUpPrompt = PROMPTS.LEVELUP
                    .replace('{{characterName}}', updatedChar.name)
                    .replace('{{newLevel}}', String(updatedChar.level))
                    .replace('{{strIncrease}}', String(growth.strength || 0))
                    .replace('{{dexIncrease}}', String(growth.dexterity || 0))
                    .replace('{{intIncrease}}', String(growth.intelligence || 0))
                    .replace('{{vitIncrease}}', String(growth.vitality || 0));
                const levelUpDescription = await callGeminiAPI(levelUpPrompt);
                addGameLog(`[레벨업] ${levelUpDescription}`);
            }

            setPopupContent(null);
        } catch (e) {
            console.error('이벤트 결과 처리 오류:', e);
            addGameLog('이벤트 처리 중 오류가 발생했습니다: ' + e.message);
        } finally {
            setLoading(false);
            setActionCooldown(false);
        }
    };

    // Puzzle feature handlers
    const openPuzzle = () => {
        if (battleState === 'active') {
            addGameLog('전투 중에는 퍼즐을 풀 수 없습니다.');
            return;
        }
        setPuzzleAnswer('');
        setPuzzleHintsShown({ h1: false, h2: false });
        setPopupContent({ type: 'puzzle', title: '수수께끼', content: RIDDLE.question });
        addGameLog('[퍼즐] 수수께끼가 제시되었습니다.');
    };

    const submitPuzzle = async () => {
        if (!currentCharData) return;
        const ans = (puzzleAnswer || '').trim().toLowerCase();
        const isCorrect = RIDDLE.answers.some(a => ans.includes(a.toLowerCase()));
        let updatedChar = { ...currentCharData };
        if (isCorrect) {
            const expGain = Math.floor(Math.random() * 6) + 5; // 5~10
            const goldGain = Math.floor(Math.random() * 6) + 5; // 5~10
            updatedChar.exp = (updatedChar.exp || 0) + expGain;
            updatedChar.gold = (updatedChar.gold || 0) + goldGain;
            addGameLog(`[퍼즐 해결] 정답입니다! 경험치 +${expGain}, 골드 +${goldGain}`);
        } else {
            const hpLoss = Math.max(1, Math.floor((updatedChar.maxHp || 10) * 0.03)); // 3%
            updatedChar.hp = Math.max(1, (updatedChar.hp || 1) - hpLoss);
            addGameLog(`[퍼즐 실패] 오답입니다. 가벼운 피로로 HP -${hpLoss}`);
        }
        // Level-up check
        let levelUpOccurred = false;
        while (updatedChar.exp >= updatedChar.expToNextLevel) {
            levelUpOccurred = true;
            updatedChar.level += 1;
            updatedChar.exp -= updatedChar.expToNextLevel;
            updatedChar.expToNextLevel = Math.floor(updatedChar.expToNextLevel * 1.5);
            const classData = allClasses.find(c => c.id === updatedChar.class);
            if (classData) {
                const growth = classData.statGrowth || {};
                const currentStats = updatedChar.stats || {};
                updatedChar.stats = {
                    strength: (currentStats.strength || 0) + (growth.strength || 0),
                    dexterity: (currentStats.dexterity || 0) + (growth.dexterity || 0),
                    intelligence: (currentStats.intelligence || 0) + (growth.intelligence || 0),
                    vitality: (currentStats.vitality || 0) + (growth.vitality || 0),
                };
                updatedChar.maxHp = Math.floor(updatedChar.stats.vitality * 10);
                updatedChar.maxMp = Math.floor(updatedChar.stats.intelligence * 5);
                updatedChar.hp = Math.min(updatedChar.maxHp, updatedChar.hp + Math.floor(updatedChar.maxHp * 0.2));
                updatedChar.mp = Math.min(updatedChar.maxMp, updatedChar.mp + Math.floor(updatedChar.maxMp * 0.2));
            }
        }
        setCurrentCharData(updatedChar);
        await setDoc(doc(db, 'characters', updatedChar.id), updatedChar);
        if (levelUpOccurred) {
            const classData = allClasses.find(c => c.id === updatedChar.class);
            const growth = classData?.statGrowth || {};
            const levelUpPrompt = PROMPTS.LEVELUP
                .replace('{{characterName}}', updatedChar.name)
                .replace('{{newLevel}}', String(updatedChar.level))
                .replace('{{strIncrease}}', String(growth.strength || 0))
                .replace('{{dexIncrease}}', String(growth.dexterity || 0))
                .replace('{{intIncrease}}', String(growth.intelligence || 0))
                .replace('{{vitIncrease}}', String(growth.vitality || 0));
            const levelUpDescription = await callGeminiAPI(levelUpPrompt);
            addGameLog(`[레벨업] ${levelUpDescription}`);
        }
        setPopupContent(null);
    };

    // Non-combat attempt during battle
    const attemptNonCombat = async () => {
        if (battleState !== 'active' || !currentMonster) {
            addGameLog('비전투 시도는 전투 중에만 가능합니다.');
            return;
        }
        if (!nonCombatIntent || nonCombatIntent.trim().length < 2) {
            setMessage('의도를 2자 이상 입력해주세요.');
            return;
        }
        setLoading(true);
        setActionCooldown(true);
        try {
            const className = allClasses.find(c => c.id === currentCharData.class)?.name || currentCharData.class;
            const prompt = PROMPTS.NONCOMBAT_ATTEMPT
                .replace('{{characterName}}', currentCharData.name)
                .replace('{{characterLevel}}', String(currentCharData.level))
                .replace('{{characterClass}}', className)
                .replace('{{approach}}', nonCombatApproach)
                .replace('{{intent}}', nonCombatIntent.trim())
                .replace('{{monsterName}}', currentMonster.name);

            const narrative = await callGeminiAPI(prompt);
            addGameLog(`[비전투 시도: ${nonCombatApproach}] ${narrative}`);

            // Outcome roll with light stat bias
            const stats = currentCharData.stats || {};
            let successRate = 0.4;
            const partialRate = 0.35;
            const bias = (nonCombatApproach === '설득' || nonCombatApproach === '협상')
                ? ((stats.intelligence || 0) >= 14 ? 0.05 : 0)
                : ((stats.dexterity || 0) >= 14 ? 0.05 : 0);
            successRate = Math.min(0.7, successRate + bias);
            const roll = Math.random();
            const isSuccess = roll < successRate;
            const isPartial = !isSuccess && roll < (successRate + partialRate);

            let updatedChar = { ...currentCharData };
            let levelUpOccurred = false;

            if (isSuccess) {
                const expGain = Math.floor(Math.random() * 5) + 4; // 4~8
                const goldGain = Math.floor(Math.random() * 6) + 3; // 3~8
                updatedChar.exp = (updatedChar.exp || 0) + expGain;
                updatedChar.gold = (updatedChar.gold || 0) + goldGain;
                addGameLog(`[보상] 경험치 +${expGain}, 골드 +${goldGain}`);

                const escape = Math.random() < 0.6;
                if (escape) {
                    addGameLog('[전투 이탈] 교전을 피하는 데 성공했습니다.');
                    setCurrentMonster(null);
                    setBattleState(null);
                    setPopupContent(null);
                    setSituationCard(null);
                } else {
                    const bonus = Math.floor(Math.random() * 3) + 3; // 3~5
                    setNextAttackBonus(bonus);
                    addGameLog(`[전술 이점] 다음 공격 보너스 +${bonus}`);
                }
            } else if (isPartial) {
                if (Math.random() < 0.5) {
                    const expGain = Math.floor(Math.random() * 5) + 3; // 3~7
                    updatedChar.exp = (updatedChar.exp || 0) + expGain;
                    addGameLog(`[보상] 경험치 +${expGain}`);
                } else {
                    const goldGain = Math.floor(Math.random() * 8) + 3; // 3~10
                    updatedChar.gold = (updatedChar.gold || 0) + goldGain;
                    addGameLog(`[보상] 골드 +${goldGain}`);
                }
                const bonus = Math.floor(Math.random() * 3) + 2; // 2~4
                setNextAttackBonus(bonus);
                addGameLog(`[전술 이점] 다음 공격 보너스 +${bonus}`);
            } else {
                const hpLoss = Math.max(1, Math.floor((updatedChar.maxHp || 10) * 0.05));
                const mpLoss = Math.max(0, Math.floor((updatedChar.maxMp || 5) * 0.05));
                updatedChar.hp = Math.max(1, updatedChar.hp - hpLoss);
                updatedChar.mp = Math.max(0, updatedChar.mp - mpLoss);
                addGameLog(`[페널티] HP -${hpLoss}, MP -${mpLoss}`);
            }

            // Reputation skeleton adjustments for non-combat outcomes
            const repsNC = { ...(updatedChar.reputations || {}) };
            const curNC = typeof repsNC.locals === 'number' ? repsNC.locals : 0;
            if (isSuccess && (nonCombatApproach === '설득' || nonCombatApproach === '협상')) {
                repsNC.locals = curNC + 1;
                addGameLog('[평판] 주민들과의 관계 +1');
            } else if (!isSuccess && nonCombatApproach === '은밀') {
                repsNC.locals = curNC - 1;
                addGameLog('[평판] 주민들과의 관계 -1');
            }
            updatedChar.reputations = repsNC;

            while (updatedChar.exp >= updatedChar.expToNextLevel) {
                levelUpOccurred = true;
                updatedChar.level += 1;
                updatedChar.exp -= updatedChar.expToNextLevel;
                updatedChar.expToNextLevel = Math.floor(updatedChar.expToNextLevel * 1.5);
                const classData = allClasses.find(c => c.id === updatedChar.class);
                if (classData) {
                    const growth = classData.statGrowth || {};
                    const currentStats = updatedChar.stats || {};
                    updatedChar.stats = {
                        strength: (currentStats.strength || 0) + (growth.strength || 0),
                        dexterity: (currentStats.dexterity || 0) + (growth.dexterity || 0),
                        intelligence: (currentStats.intelligence || 0) + (growth.intelligence || 0),
                        vitality: (currentStats.vitality || 0) + (growth.vitality || 0),
                    };
                    updatedChar.maxHp = Math.floor(updatedChar.stats.vitality * 10);
                    updatedChar.maxMp = Math.floor(updatedChar.stats.intelligence * 5);
                    updatedChar.hp = Math.min(updatedChar.maxHp, updatedChar.hp + Math.floor(updatedChar.maxHp * 0.2));
                    updatedChar.mp = Math.min(updatedChar.maxMp, updatedChar.mp + Math.floor(updatedChar.maxMp * 0.2));
                }
            }

            setCurrentCharData(updatedChar);
            await setDoc(doc(db, 'characters', updatedChar.id), updatedChar);

            if (levelUpOccurred) {
                const classData = allClasses.find(c => c.id === updatedChar.class);
                const growth = classData?.statGrowth || {};
                const levelUpPrompt = PROMPTS.LEVELUP
                    .replace('{{characterName}}', updatedChar.name)
                    .replace('{{newLevel}}', String(updatedChar.level))
                    .replace('{{strIncrease}}', String(growth.strength || 0))
                    .replace('{{dexIncrease}}', String(growth.dexterity || 0))
                    .replace('{{intIncrease}}', String(growth.intelligence || 0))
                    .replace('{{vitIncrease}}', String(growth.vitality || 0));
                const levelUpDescription = await callGeminiAPI(levelUpPrompt);
                addGameLog(`[레벨업] ${levelUpDescription}`);
            }

        } catch (e) {
            console.error('비전투 시도 처리 오류:', e);
            addGameLog('비전투 시도 처리 중 오류가 발생했습니다: ' + e.message);
        } finally {
            setLoading(false);
            setActionCooldown(false);
            setNonCombatIntent('');
            setNonCombatFormOpen(false);
        }
    };

    const executeBattleAction = async (actionType, skillId = null) => {
        if (!currentMonster || battleState !== 'active' || actionCooldown) return;

        setLoading(true);
        setActionCooldown(true);

        try {
            let playerDamage = 0;
            let actionDescription = '';
            let updatedChar = { ...currentCharData };

            if (actionType === 'skill' && skillId) {
                const skillUsed = allSkills.find(s => s.id === skillId);
                if (!skillUsed) {
                    addGameLog('스킬 정보를 찾을 수 없습니다.');
                    setLoading(false); setActionCooldown(false); return;
                }
                
                const { mpCost = 0, damage: damageRange = { min: 1, max: 2 }, damageType = 'physical', name: skillName } = skillUsed;

                if (updatedChar.mp < mpCost) {
                    addGameLog(`MP가 부족하여 ${skillName}을(를) 사용할 수 없습니다.`);
                    setLoading(false); setActionCooldown(false); return;
                }

                updatedChar.mp = Math.max(0, updatedChar.mp - mpCost);

                const baseDamage = Math.floor(Math.random() * (damageRange.max - damageRange.min + 1)) + damageRange.min;
                let statBonus = 0;
                if (damageType === 'physical') {
                    statBonus = Math.floor(updatedChar.stats.strength / 2);
                } else if (damageType === 'magic') {
                    statBonus = Math.floor(updatedChar.stats.intelligence / 2);
                }
                playerDamage = baseDamage + statBonus;
                // Situation card modifier to player's damage (small)
                if (situationCard && situationCard.effects && typeof situationCard.effects.playerDamageMod === 'number') {
                    playerDamage += situationCard.effects.playerDamageMod;
                }
                if (nextAttackBonus > 0) {
                    playerDamage += nextAttackBonus;
                    addGameLog(`[보너스] 비전투 전술 이점으로 추가 피해 +${nextAttackBonus}`);
                    setNextAttackBonus(0);
                }
                playerDamage = Math.max(1, playerDamage);

                const skillPrompt = PROMPTS.COMBAT.ATTACK
                    .replace('{{characterName}}', updatedChar.name)
                    .replace('{{characterLevel}}', String(updatedChar.level))
                    .replace('{{characterClass}}', allClasses.find(c=>c.id === updatedChar.class)?.name || updatedChar.class)
                    .replace('{{skillName}}', skillName)
                    .replace('{{monsterName}}', currentMonster.name)
                    .replace('{{damage}}', String(playerDamage));
                actionDescription = await callGroqAPI(skillPrompt);

            } else { // Basic Attack
                const baseAttack = Math.floor(updatedChar.stats.strength / 2) + 3;
                playerDamage = Math.floor(Math.random() * 3) + baseAttack;
                // Situation card modifier to player's damage (small)
                if (situationCard && situationCard.effects && typeof situationCard.effects.playerDamageMod === 'number') {
                    playerDamage += situationCard.effects.playerDamageMod;
                }

                if (nextAttackBonus > 0) {
                    playerDamage += nextAttackBonus;
                    addGameLog(`[보너스] 비전투 전술 이점으로 추가 피해 +${nextAttackBonus}`);
                    setNextAttackBonus(0);
                }
                playerDamage = Math.max(1, playerDamage);

                const attackPrompt = PROMPTS.COMBAT.ATTACK
                    .replace('{{characterName}}', updatedChar.name)
                    .replace('{{characterLevel}}', String(updatedChar.level))
                    .replace('{{characterClass}}', allClasses.find(c=>c.id === updatedChar.class)?.name || updatedChar.class)
                    .replace('{{skillName}}', '기본 공격')
                    .replace('{{monsterName}}', currentMonster.name)
                    .replace('{{damage}}', String(playerDamage));
                actionDescription = await callGroqAPI(attackPrompt);
            }

            setCurrentCharData(updatedChar);
            await setDoc(doc(db, 'characters', updatedChar.id), updatedChar);

            const updatedMonster = { ...currentMonster, currentHp: Math.max(0, currentMonster.currentHp - playerDamage) };
            setCurrentMonster(updatedMonster);

            addGameLog(`[공격] ${actionDescription}`);
            setPopupContent(prev => ({ ...prev, monster: updatedMonster }));

            if (updatedMonster.currentHp <= 0) {
                await handleBattleVictory();
            } else {
                setTimeout(() => monsterCounterAttack(updatedMonster), 1500);
            }

        } catch (error) {
            console.error('전투 액션 오류:', error);
            addGameLog('전투 액션 처리 중 오류가 발생했습니다: ' + error.message);
            setActionCooldown(false);
        } finally {
            setLoading(false);
        }
    };

    const monsterCounterAttack = async (monster) => {
        if (battleState !== 'active' || !monster || currentCharData.hp <= 0) return;

        try {
            // Apply DOT to monster at start of its turn if any
            let mon = { ...monster };
            if (situationCard && situationCard.effects && typeof situationCard.effects.monsterDot === 'number') {
                const dot = Math.max(0, situationCard.effects.monsterDot);
                if (dot > 0) {
                    mon.currentHp = Math.max(0, mon.currentHp - dot);
                    setCurrentMonster(mon);
                    setPopupContent(prev => prev ? { ...prev, monster: { ...prev.monster, currentHp: mon.currentHp } } : prev);
                    addGameLog(`[환경 효과] ${situationCard.name}로 인해 적이 ${dot} 피해를 받았습니다.`);
                    if (mon.currentHp <= 0) {
                        await handleBattleVictory();
                        return;
                    }
                }
            }

            // Monster attack with situation modifiers
            let monsterDamage = Math.floor(Math.random() * 3) + (mon.attack || 1);
            if (situationCard && situationCard.effects && typeof situationCard.effects.monsterDamageMod === 'number') {
                monsterDamage += situationCard.effects.monsterDamageMod;
            }

            const equipment = currentCharData.equipment || {};
            const armorSlot = equipment.chest;
            const armorItem = armorSlot ? allItems.find(i => i.id === armorSlot) : null;
            let defense = (armorItem && armorItem.stats) ? armorItem.stats.defense || 0 : 0;
            if (situationCard && situationCard.effects && typeof situationCard.effects.playerDefenseMod === 'number') {
                defense += situationCard.effects.playerDefenseMod;
            }
            const reducedDamage = Math.max(1, monsterDamage - Math.floor(defense / 2));

            const updatedChar = { ...currentCharData, hp: Math.max(0, currentCharData.hp - reducedDamage) };
            setCurrentCharData(updatedChar);
            await setDoc(doc(db, 'characters', updatedChar.id), updatedChar);

            const counterPrompt = PROMPTS.COMBAT.MONSTER_ATTACK
                .replace('{{monsterName}}', mon.name)
                .replace('{{characterName}}', currentCharData.name)
                .replace('{{damage}}', String(reducedDamage));
            const counterDescription = await callGroqAPI(counterPrompt);
            addGameLog(`[반격] ${counterDescription}`);

            if (updatedChar.hp <= 0) {
                await handleBattleDefeat();
            } else {
                setPopupContent(prev => ({ ...prev, monster: { ...prev.monster, currentHp: mon.currentHp } }));
                setActionCooldown(false);
            }

        } catch (error) {
            console.error('몬스터 반격 오류:', error);
            addGameLog('몬스터 반격 처리 중 오류가 발생했습니다: ' + error.message);
            setActionCooldown(false);
        }
    };

    const handleBattleVictory = async () => {
        setBattleState('victory');
        try {
            const expGained = currentMonster.exp || 0;
            const goldGained = Math.floor(Math.random() * ((currentMonster.level || 1) * 10)) + (currentMonster.level || 1) * 5;

            const victoryPrompt = PROMPTS.COMBAT.VICTORY
                .replace('{{characterName}}', currentCharData.name)
                .replace('{{characterLevel}}', String(currentCharData.level))
                .replace('{{characterClass}}', allClasses.find(c=>c.id === currentCharData.class)?.name || currentCharData.class)
                .replace('{{monsterName}}', currentMonster.name)
                .replace('{{expGained}}', String(expGained))
                .replace('{{goldGained}}', String(goldGained));
            const victoryDescription = await callGeminiAPI(victoryPrompt);
            addGameLog(`[승리] ${victoryDescription}`);

            let updatedChar = { ...currentCharData, exp: currentCharData.exp + expGained, gold: currentCharData.gold + goldGained };

            let levelUpOccurred = false;
            while (updatedChar.exp >= updatedChar.expToNextLevel) {
                levelUpOccurred = true;
                updatedChar.level += 1;
                updatedChar.exp -= updatedChar.expToNextLevel;
                updatedChar.expToNextLevel = Math.floor(updatedChar.expToNextLevel * 1.5);

                const classData = allClasses.find(c => c.id === updatedChar.class);
                if (classData) {
                    const growth = classData.statGrowth || {};
                    const currentStats = updatedChar.stats || {};
                    updatedChar.stats = {
                        strength: (currentStats.strength || 0) + (growth.strength || 0),
                        dexterity: (currentStats.dexterity || 0) + (growth.dexterity || 0),
                        intelligence: (currentStats.intelligence || 0) + (growth.intelligence || 0),
                        vitality: (currentStats.vitality || 0) + (growth.vitality || 0),
                    };
                    updatedChar.maxHp = Math.floor(updatedChar.stats.vitality * 10);
                    updatedChar.maxMp = Math.floor(updatedChar.stats.intelligence * 5);
                    updatedChar.hp = updatedChar.maxHp;
                    updatedChar.mp = updatedChar.maxMp;
                }
            }

            if (levelUpOccurred) {
                const classData = allClasses.find(c => c.id === updatedChar.class);
                const growth = classData?.statGrowth || {};
                const levelUpPrompt = PROMPTS.LEVELUP
                    .replace('{{characterName}}', updatedChar.name)
                    .replace('{{newLevel}}', String(updatedChar.level))
                    .replace('{{strIncrease}}', String(growth.strength || 0))
                    .replace('{{dexIncrease}}', String(growth.dexterity || 0))
                    .replace('{{intIncrease}}', String(growth.intelligence || 0))
                    .replace('{{vitIncrease}}', String(growth.vitality || 0));
                const levelUpDescription = await callGeminiAPI(levelUpPrompt);
                addGameLog(`[레벨업] ${levelUpDescription}`);
            }

            setCurrentCharData(updatedChar);
            await setDoc(doc(db, 'characters', updatedChar.id), updatedChar);

            setCurrentMonster(null);
            setBattleState(null);
            setPopupContent(null);
            setSituationCard(null);
            setActionCooldown(false);

        } catch (error) {
            console.error('전투 승리 처리 오류:', error);
            addGameLog('전투 승리 처리 중 오류가 발생했습니다: ' + error.message);
            setBattleState(null);
            setActionCooldown(false);
        }
    };

    const handleBattleDefeat = async () => {
        setBattleState('defeat');
        try {
            const goldLoss = Math.floor(currentCharData.gold * 0.1);
            let updatedChar = { ...currentCharData, hp: 1, gold: Math.max(0, currentCharData.gold - goldLoss) };

            const defeatPrompt = PROMPTS.COMBAT.DEFEAT
                .replace('{{characterName}}', currentCharData.name)
                .replace('{{characterLevel}}', String(currentCharData.level))
                .replace('{{characterClass}}', allClasses.find(c=>c.id === currentCharData.class)?.name || currentCharData.class)
                .replace('{{monsterName}}', currentMonster.name)
                .replace('{{goldLost}}', String(goldLoss));
            const defeatDescription = await callGeminiAPI(defeatPrompt);
            addGameLog(`[패배] ${defeatDescription}`);

            setCurrentCharData(updatedChar);
            await setDoc(doc(db, 'characters', updatedChar.id), updatedChar);

            setCurrentMonster(null);
            setBattleState(null);
            setPopupContent(null);
            setSituationCard(null);
            setActionCooldown(false);

        } catch (error) {
            console.error('전투 패배 처리 오류:', error);
            addGameLog('전투 패배 처리 중 오류가 발생했습니다: ' + error.message);
            setBattleState(null);
            setActionCooldown(false);
        }
    };

    const handleMainAction = async (actionType) => {
        if (!currentCharData || actionCooldown) return;
        
        try {
            switch (actionType) {
                case '탐색':
                case '사냥':
                    await initiateBattle();
                    break;
                case '이벤트':
                    await triggerEvent();
                    break;
                case '퍼즐':
                    openPuzzle();
                    break;
                default:
                    addGameLog(`'${actionType}' 액션은 아직 구현되지 않았습니다.`);
                    break;
            }
        } catch (error) {
            console.error(`${actionType} 액션 오류:`, error);
            addGameLog(`${actionType} 중 오류가 발생했습니다: ` + error.message);
        }
    };

    const renderPopup = () => {
        if (!popupContent) return null;

        const monster = popupContent.monster;

        return (
            <div className="popup-overlay">
                <div className="popup-container">
                    <div className="popup-header">
                        <h3>{popupContent.title || '알림'}</h3>
                        <button onClick={() => setPopupContent(null)}>X</button>
                    </div>
                    <div className="popup-content">
                        {popupContent.type === 'battle' && monster && (
                             <div className="battle-popup">
                                 <p>{popupContent.content}</p>
                                 {situationCard && (
                                     <div style={{background:'#fff3cd', border:'1px solid #ffeeba', padding:'8px', borderRadius:'6px', margin:'8px 0', textAlign:'left'}}>
                                         <strong>[상황 카드]</strong> {situationCard.name} - {situationCard.description}
                                     </div>
                                 )}
                                 {battleState === 'active' && (
                                     <>
                                         <div className="monster-info">
                                             <h4>{monster.name} (Lv.{monster.level})</h4>
                                             <div className="hp-bar"><div className="hp-fill" style={{ width: `${(monster.currentHp / monster.hp) * 100}%` }}></div><span>{monster.currentHp}/{monster.hp} HP</span></div>
                                         </div>
                                         <div className="player-info">
                                             <h4>{currentCharData.name} (Lv.{currentCharData.level})</h4>
                                             <div className="hp-bar"><div className="hp-fill" style={{ width: `${(currentCharData.hp / currentCharData.maxHp) * 100}%` }}></div><span>{currentCharData.hp}/{currentCharData.maxHp} HP</span></div>
                                             <div className="mp-bar"><div className="mp-fill" style={{ width: `${(currentCharData.mp / currentCharData.maxMp) * 100}%` }}></div><span>{currentCharData.mp}/{currentCharData.maxMp} MP</span></div>
                                             {nextAttackBonus > 0 && <p style={{color:'#28a745', marginTop: '6px'}}>다음 공격 보너스: +{nextAttackBonus}</p>}
                                         </div>
                                         <div className="battle-actions">
                                             <button onClick={() => executeBattleAction('attack')} disabled={actionCooldown || loading}>기본 공격</button>
                                             {currentCharData.skills.map(skillId => {
                                                 const skill = allSkills.find(s => s.id === skillId);
                                                 if (!skill) return null;
                                                 const mpCost = skill.mpCost || 0;
                                                 return (
                                                    <button key={skill.id} onClick={() => executeBattleAction('skill', skill.id)} disabled={actionCooldown || loading || currentCharData.mp < mpCost}>
                                                        {skill.name} (MP {mpCost})
                                                    </button>
                                                 );
                                             })}
                                             <button onClick={() => handleBattleDefeat()} disabled={actionCooldown || loading}>도망치기</button>
                                             <button onClick={() => setNonCombatFormOpen(prev => !prev)} disabled={actionCooldown || loading}>
                                                 비전투 시도
                                             </button>
                                             {nonCombatFormOpen && (
                                                 <div style={{background:'#f8f9fa', padding:'10px', borderRadius:'6px', marginTop:'8px'}}>
                                                     <label style={{display:'block', textAlign:'left', marginBottom:'6px'}}>전술</label>
                                                     <select value={nonCombatApproach} onChange={(e)=>setNonCombatApproach(e.target.value)} disabled={actionCooldown || loading} style={{width:'100%', padding:'8px', marginBottom:'8px'}}>
                                                         <option value="설득">설득</option>
                                                         <option value="은밀">은밀</option>
                                                         <option value="협상">협상</option>
                                                     </select>
                                                     <label style={{display:'block', textAlign:'left', marginBottom:'6px'}}>의도</label>
                                                     <input type="text" value={nonCombatIntent} onChange={(e)=>setNonCombatIntent(e.target.value)} placeholder="무엇을 시도하나요?" disabled={actionCooldown || loading} style={{width:'100%', padding:'8px', marginBottom:'8px'}} />
                                                     <button onClick={attemptNonCombat} disabled={actionCooldown || loading || !nonCombatIntent.trim()}>
                                                         시도하기
                                                     </button>
                                                 </div>
                                             )}
                                         </div>
                                     </>
                                 )}
                                 {battleState !== 'active' && <button onClick={() => setPopupContent(null)}>닫기</button>}
                             </div>
                        )}
                        {popupContent.type === 'event' && (
                             <div className="event-popup">
                                 <p>{popupContent.content}</p>
                                 <div className="event-actions">
                                     <button onClick={() => resolveEventChoice('전투로 개입')} disabled={loading || actionCooldown}>전투로 개입</button>
                                     <button onClick={() => resolveEventChoice('설득 시도')} disabled={loading || actionCooldown}>설득 시도</button>
                                     <button onClick={() => resolveEventChoice('몰래 조사')} disabled={loading || actionCooldown}>몰래 조사</button>
                                 </div>
                                 <button onClick={() => setPopupContent(null)} disabled={loading}>닫기</button>
                             </div>
                        )}
                        {popupContent.type === 'puzzle' && (
                             <div className="puzzle-popup">
                                <p style={{marginBottom:'8px'}}>{popupContent.content}</p>
                                <div style={{display:'flex', gap:'8px', marginBottom:'8px'}}>
                                    <button onClick={()=>setPuzzleHintsShown(prev=>({ ...prev, h1: true }))} disabled={puzzleHintsShown.h1}>힌트 1</button>
                                    <button onClick={()=>setPuzzleHintsShown(prev=>({ ...prev, h2: true }))} disabled={puzzleHintsShown.h2}>힌트 2</button>
                                </div>
                                <div style={{textAlign:'left', marginBottom:'8px'}}>
                                    {puzzleHintsShown.h1 && <p>- {RIDDLE.hints[0]}</p>}
                                    {puzzleHintsShown.h2 && <p>- {RIDDLE.hints[1]}</p>}
                                </div>
                                <input type="text" value={puzzleAnswer} onChange={(e)=>setPuzzleAnswer(e.target.value)} placeholder="정답을 입력하세요" style={{width:'100%', padding:'8px', marginBottom:'8px'}} />
                                <div>
                                    <button onClick={submitPuzzle} disabled={!puzzleAnswer.trim() || loading}>제출</button>
                                    <button onClick={()=>setPopupContent(null)} disabled={loading}>닫기</button>
                                </div>
                             </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="game-screen">
            <h2>{currentCharData ? `${currentCharData.name}의 모험` : '모험 시작'}</h2>
            {loading && <p>로딩 중...</p>}
            {message && <p className="status-message">{message}</p>}

            {currentCharData && currentLocation && (
                <div className="game-info">
                    <p>레벨: {currentCharData.level} | 직업: {allClasses.find(c=>c.id === currentCharData.class)?.name || currentCharData.class} | 골드: {currentCharData.gold}</p>
                    <p>HP: {currentCharData.hp}/{currentCharData.maxHp} | MP: {currentCharData.mp}/{currentCharData.maxMp}</p>
                    <p>경험치: {currentCharData.exp}/{currentCharData.expToNextLevel} | 현재 위치: {currentLocation.name}</p>
                    {battleState === 'active' && currentMonster && <p className="battle-status">[전투 중] {currentMonster.name} (HP: {currentMonster.currentHp}/{currentMonster.hp})</p>}
                </div>
            )}

            <div className="game-log">
                {gameLog.map(log => (
                    <p key={log.id} className="log-entry">[{new Date(log.timestamp).toLocaleTimeString()}] {log.message}</p>
                ))}
                <div ref={logEndRef} />
            </div>

            <div className="game-actions">
                {battleState !== 'active' && (
                    <>
                        <button onClick={() => handleMainAction('탐색')} disabled={loading || actionCooldown}>탐색</button>
                        <button onClick={() => handleMainAction('사냥')} disabled={loading || actionCooldown}>사냥</button>
                        <button onClick={() => handleMainAction('이벤트')} disabled={loading || actionCooldown}>이벤트</button>
                        <button onClick={() => handleMainAction('퍼즐')} disabled={loading || actionCooldown}>퍼즐</button>
                    </>
                )}
            </div>

            <button onClick={() => { setCurrentCharData(null); setCurrentLocation(null); setGameState('character'); }} disabled={loading}>
                캐릭터 선택 화면으로
            </button>

            {renderPopup()}
        </div>
    );
}

export default GameScreen;
