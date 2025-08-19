import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';

function CharacterScreen({ 
    db, 
    currentUser, 
    setCurrentUser, 
    setUser, 
    setGameState, 
    setLoading, 
    setMessage, 
    loading, 
    message, 
    allClasses, 
    allRegions, 
    allItems, 
    setCurrentCharData, 
    setCurrentLocation, 
    addGameLog, 
    callGeminiAPI, 
    PROMPTS 
}) {
    const [characters, setCharacters] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newCharName, setNewCharName] = useState('');
    const [selectedClass, setSelectedClass] = useState('');

    useEffect(() => {
        const loadCharacters = async () => {
            if (!currentUser || !db) return;

            try {
                setLoading(true);
                const userRef = doc(db, 'users', currentUser.username);
                const userDoc = await getDoc(userRef);

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.characters && userData.characters.length > 0) {
                        const charDataPromises = userData.characters.map(charId => getDoc(doc(db, 'characters', charId)));
                        const charDocs = await Promise.all(charDataPromises);
                        setCharacters(charDocs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() })));
                    }
                }
                setLoading(false);
            } catch (error) {
                console.error('캐릭터 로드 오류:', error);
                setMessage('캐릭터 로드 오류: ' + error.message);
                setLoading(false);
            }
        };
        loadCharacters();
    }, [currentUser, db, setLoading, setMessage]);

    const handleCreateCharacter = async () => {
        if (!newCharName || !selectedClass) {
            setMessage('캐릭터 이름과 직업을 모두 선택해주세요.');
            return;
        }

        try {
            setLoading(true);
            const classData = allClasses.find(c => c.id === selectedClass);
            if (!classData) {
                setMessage('선택한 직업 정보를 찾을 수 없습니다.');
                setLoading(false);
                return;
            }

            const charId = `${currentUser.username}_${newCharName}_${Date.now()}`;
            const characterData = {
                id: charId,
                name: newCharName,
                class: selectedClass,
                level: 1,
                exp: 0,
                expToNextLevel: 100,
                stats: { ...classData.baseStats },
                hp: classData.baseStats.vitality * 10,
                maxHp: classData.baseStats.vitality * 10,
                mp: classData.baseStats.intelligence * 5,
                maxMp: classData.baseStats.intelligence * 5,
                gold: 100,
                inventory: [],
                equipment: {},
                skills: [...classData.startingSkills],
                location: 'starter_village',
                quests: [],
                activeQuests: [],
                completedQuests: [],
                createdAt: new Date(),
                lastPlayed: new Date()
            };

            if (classData.startingEquipment && classData.startingEquipment.length > 0) {
                for (const itemId of classData.startingEquipment) {
                    const itemData = allItems.find(i => i.id === itemId);
                    if (itemData) {
                        characterData.inventory.push({
                            id: itemId,
                            name: itemData.name,
                            type: itemData.type,
                            quantity: 1,
                            stackable: itemData.stackable || false,
                            maxStack: itemData.maxStack || 1
                        });
                        if (itemData.type === 'equipment' && itemData.slot) {
                            characterData.equipment[itemData.slot] = itemId;
                        }
                    }
                }
            }

            await setDoc(doc(db, 'characters', charId), characterData);

            const userRef = doc(db, 'users', currentUser.username);
            const userData = (await getDoc(userRef)).data();
            const updatedCharacters = [...(userData.characters || []), charId];

            await setDoc(userRef, { ...userData, characters: updatedCharacters });

            setCurrentUser({ ...currentUser, characters: updatedCharacters });
            setCharacters(prev => [...prev, characterData]);
            setIsCreating(false);
            setNewCharName('');
            setSelectedClass('');
            setMessage(`'${newCharName}' 캐릭터가 생성되었습니다!`);
        } catch (error) {
            console.error('캐릭터 생성 오류:', error);
            setMessage('캐릭터 생성 오류: ' + error.message);
        }

        setLoading(false);
    };

    const selectCharacter = async (character) => {
        try {
            setLoading(true);
            const charRef = doc(db, 'characters', character.id);
            await setDoc(charRef, { ...character, lastPlayed: new Date() }, { merge: true });

            setCurrentCharData(character);

            const locationDoc = await getDoc(doc(db, 'regions', character.location));
            if (locationDoc.exists()) {
                const locData = locationDoc.data();
                setCurrentLocation(locData);
                const prompt = PROMPTS.EXPLORATION.REGION
                    .replace('{{characterName}}', character.name)
                    .replace('{{characterLevel}}', character.level)
                    .replace('{{characterClass}}', allClasses.find(c => c.id === character.class)?.name || character.class)
                    .replace('{{regionName}}', locData.name)
                    .replace('{{regionDescription}}', locData.description);
                const description = await callGeminiAPI(prompt);
                addGameLog(`[위치] ${description}`);
            } else {
                addGameLog('[위치] 알 수 없는 지역에 도착했습니다.');
            }

            setGameState('game');
            setLoading(false);
        } catch (error) {
            console.error('캐릭터 선택 오류:', error);
            setMessage('캐릭터 선택 오류: ' + error.message);
            setLoading(false);
        }
    };

    return (
        <div className="character-screen">
            <h2>캐릭터 선택</h2>
            {loading && <p>로딩 중...</p>}
            {message && <p className="status-message">{message}</p>}

            {!isCreating ? (
                <>
                    <div className="character-list">
                        {characters.length === 0 ? (
                            <p>생성된 캐릭터가 없습니다.</p>
                        ) : (
                            characters.map(char => (
                                <div key={char.id} className="character-item" onClick={() => selectCharacter(char)}>
                                    <h3>{char.name} ({allClasses.find(c => c.id === char.class)?.name || char.class})</h3>
                                    <p>레벨: {char.level}</p>
                                    <p>마지막 플레이: {char.lastPlayed.toDate ? new Date(char.lastPlayed.toDate()).toLocaleString() : new Date(char.lastPlayed).toLocaleString()}</p>
                                </div>
                            ))
                        )}
                    </div>
                    <button onClick={() => setIsCreating(true)} disabled={loading}>
                        새 캐릭터 생성
                    </button>
                    <button onClick={() => { setCurrentUser(null); setUser(null); setGameState('login'); }} disabled={loading}>
                        로그아웃
                    </button>
                </>
            ) : (
                <div className="create-character-form">
                    <h3>새 캐릭터 생성</h3>
                    <div className="form-group">
                        <label htmlFor="newCharName">캐릭터 이름:</label>
                        <input
                            type="text"
                            id="newCharName"
                            value={newCharName}
                            onChange={(e) => setNewCharName(e.target.value)}
                            disabled={loading}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="selectedClass">직업 선택:</label>
                        <select
                            id="selectedClass"
                            value={selectedClass}
                            onChange={(e) => setSelectedClass(e.target.value)}
                            disabled={loading}
                        >
                            <option value="">-- 직업을 선택하세요 --</option>
                            {allClasses.map(cls => (
                                <option key={cls.id} value={cls.id}>{cls.name}</option>
                            ))}
                        </select>
                    </div>
                    <button onClick={handleCreateCharacter} disabled={loading}>
                        {loading ? '생성 중...' : '생성 완료'}
                    </button>
                    <button onClick={() => setIsCreating(false)} disabled={loading}>
                        취소
                    </button>
                </div>
            )}
        </div>
    );
}

export default CharacterScreen;
