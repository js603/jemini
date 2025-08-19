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
            const monsterDamage = Math.floor(Math.random() * 3) + (monster.attack || 1);
            const equipment = currentCharData.equipment || {};
            const armorSlot = equipment.chest;
            const armorItem = armorSlot ? allItems.find(i => i.id === armorSlot) : null;
            const defense = (armorItem && armorItem.stats) ? armorItem.stats.defense || 0 : 0;
            const reducedDamage = Math.max(1, monsterDamage - Math.floor(defense / 2));

            const updatedChar = { ...currentCharData, hp: Math.max(0, currentCharData.hp - reducedDamage) };
            setCurrentCharData(updatedChar);
            await setDoc(doc(db, 'characters', updatedChar.id), updatedChar);

            const counterPrompt = PROMPTS.COMBAT.MONSTER_ATTACK
                .replace('{{monsterName}}', monster.name)
                .replace('{{characterName}}', currentCharData.name)
                .replace('{{damage}}', String(reducedDamage));
            const counterDescription = await callGroqAPI(counterPrompt);
            addGameLog(`[반격] ${counterDescription}`);

            if (updatedChar.hp <= 0) {
                await handleBattleDefeat();
            } else {
                setPopupContent(prev => ({ ...prev, monster: { ...prev.monster, currentHp: monster.currentHp } }));
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
                                         </div>
                                     </>
                                 )}
                                 {battleState !== 'active' && <button onClick={() => setPopupContent(null)}>닫기</button>}
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
