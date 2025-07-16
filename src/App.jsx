import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    query,
    onSnapshot,
    serverTimestamp,
    addDoc,
    getDocs,
    deleteDoc,
    runTransaction,
    orderBy,
    limit,
    arrayUnion,
    writeBatch,
    where,
} from 'firebase/firestore';
// ====================================================================
// Firebase configuration information - 수정 금지
const defaultFirebaseConfig = {
    apiKey: 'AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8',
    authDomain: 'text-adventure-game-cb731.firebaseapp.com',
    projectId: 'text-adventure-game-cb731',
    storageBucket: 'text-adventure-game-cb731.appspot.com',
    messagingSenderId: '1092941614820',
    appId: '1:1092941614820:web:5545f36014b73c268026f1',
    measurementId: 'G-FNGF42T1FP',
};
// 수정금지
const firebaseConfig = defaultFirebaseConfig;
// ====================================================================

// Firestore 경로 유틸 (World Instancing 적용)
const getWorldMetaRef = (db, worldId) => doc(db, 'worlds', worldId);
const getMainScenarioRef = (db, worldId) => doc(db, 'worlds', worldId, 'public', 'data', 'mainScenario', 'main');
const getPrivatePlayerStateRef = (db, worldId, userId) => doc(db, 'worlds', worldId, 'users', userId, 'playerState', 'state');
const getMajorEventsRef = (db, worldId) => collection(db, 'worlds', worldId, 'public', 'data', 'majorEvents');
const getPersonalStoryLogRef = (db, worldId, userId) => collection(db, 'worlds', worldId, 'users', userId, 'personalStoryLog');
const getNpcRef = (db, worldId, npcId) => doc(db, 'worlds', worldId, 'public', 'data', 'npcs', npcId);
const getActiveTurningPointRef = (db, worldId) => doc(db, 'worlds', worldId, 'public', 'data', 'turningPoints', 'active');
const getWorldviewRef = (db, worldId) => doc(db, 'worlds', worldId, 'public', 'data', 'worldview', 'main');
const getThemePacksRef = (db, worldId) => doc(db, 'worlds', worldId, 'public', 'data', 'themePacks', 'main');
const getEventsCollectionRef = (db, worldId) => collection(db, 'worlds', worldId, 'events');
const getProcessorLeaseRef = (db, worldId) => doc(db, 'worlds', worldId, 'system', 'processor');
const getActiveUsersCollectionRef = (db, worldId) => collection(db, 'worlds', worldId, 'public', 'data', 'activeUsers');
const getChatMessagesCollectionRef = (db, worldId) => collection(db, 'worlds', worldId, 'public', 'data', 'chatMessages');

// 상태 초기화 유틸
const getDefaultGameState = () => ({ publicLog: [], subtleClues: [], lastUpdate: null });
const getDefaultPrivatePlayerState = () => ({
    stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10, health: 100 },
    inventory: [],
    initialMotivation: '',
    reputation: {},
    activeQuests: [],
    companions: [],
    knownClues: [],
    activeMemories: [],
    characterCreated: false,
    profession: '',
    choices: [],
    choicesTimestamp: null,
    groups: [],
    npcRelations: {},
    knownEventIds: [],
    currentLocation: null,
    status: 'alive',
    interruption: null,
});

const summarizeLogs = (logs, maxLength, isPersonal) => {
    let summary = '';
    const logsToProcess = isPersonal ? [...logs].reverse() : logs;

    for (const log of logsToProcess) {
        const entryText = isPersonal ?
            `[선택: ${log.action}] -> ${log.story}` :
            `[${log.actor?.displayName ?? '누군가'}] ${log.log}`;
        if (summary.length + entryText.length + 1 > maxLength) break;
        summary += entryText + '\n';
    }
    return summary.trim() || (isPersonal ? '아직 여정을 시작하지 않음' : '최근에 주변에서 별다른 일은 없었음');
};

const buildCharacterCreationPrompt = (professionName, motivation, startingLocation) => {
    return `### 페르소나 (Persona)
당신은 한 개인의 운명이 시작되는 순간을 연출하는 '운명의 서기'입니다.
### 플레이어 정보
- **직업**: ${professionName}
- **핵심 동기**: ${motivation}
- **시작 위치**: ${startingLocation}
### 지시사항
1. 위 플레이어 정보를 바탕으로, 플레이어가 자신의 캐릭터에 즉시 몰입할 수 있는 짧고 강렬한 1인칭 또는 2인칭 프롤로그 장면을 작성해주십시오. 이 내용은 반드시 'personalStory' 필드에 포함되어야 합니다.
2. 이 프롤로그 장면에 이어지는 3가지의 논리적인 행동 선택지를 'choices' 필드에 제공해주십시오.
3. 플레이어의 초기 상태를 설정하기 위해, 'privateStateUpdates' 필드에 'initialMotivation', 'currentLocation', 그리고 'status' 필드를 'alive'로 포함해주십시오.
### JSON 출력 구조 (이 구조를 반드시 따르세요)
{"personalStory": "플레이어를 위한 고유한 프롤로그 장면 서사.","choices": ["프롤로그 장면에 이어서 할 수 있는 첫 번째 행동","두 번째 행동","세 번째 행동"],"privateStateUpdates": {"initialMotivation": "${motivation}","currentLocation": "${startingLocation}", "status": "alive"}}`;
};

const buildFixJsonPrompt = (malformedJsonString) => {
    return `### 페르소나 (Persona)
당신은 데이터 형식을 완벽하게 이해하는 '데이터 구조 전문가'입니다.
### 임무 (Task)
당신의 임무는 망가진 JSON 문자열을 완벽하게 유효한 JSON 배열 형식으로 복구하는 것입니다.
### 문제의 데이터 (Malformed Data)
아래 데이터는 원래 JSON 배열이어야 하지만, 어떠한 이유로 형식이 깨져 있습니다.
\`\`\`
${malformedJsonString}
\`\`\`
### 지시사항 (Instructions)
1. 위 '문제의 데이터'를 분석하여 올바른 JSON 배열 형식으로 수정해주십시오.
2. 불필요한 설명, 사과, 변명 등은 모두 제거하고, 오직 완벽하게 복구된 JSON 배열만을 출력해야 합니다.
3. 최종 결과는 반드시 \`[ ... ]\` 로 시작하고 끝나야 합니다.`;
};

const generateWorldCreationPrompt = (theme) => {
    const professionsString = JSON.stringify(theme.professions, null, 2);
    return `당신은 천재적인 스토리 작가이자 '세계 창조자'입니다. 지금부터 플레이어들이 모험할 새로운 세계의 핵심 설정을 만들어야 합니다.
전통적인 판타지나 SF에 얽매이지 말고, 영화, 애니메이션, 소설, 신화 등 모든 장르를 아우르는 독창적이고 매력적인 세계관을 창조하십시오.
애니메이션 스타일, 열혈 스포츠, 사이버펑크, 무협, 스팀펑크, 코스믹 호러, 포스트 아포칼립스, 느와르 등 어떤 것이든 좋습니다.
아래 JSON 구조와 예시를 '참고'하여, 완전히 새롭고 창의적인 세계관을 생성해주십시오. 예시와 똑같이 만들지 마십시오.
### JSON 출력 구조 (이 구조를 반드시 따르세요)
{"title": "세계관의 이름 (예: '${theme.title}')","genre": "세계관의 장르 (예: '${theme.genre}')","atmosphere": "세계의 전체적인 분위기를 묘사하는 2~3 문장의 글","background_story": "플레이어가 모험을 시작하기 직전까지의 간략한 배경 역사 또는 이야기의 시작점","startingLocation": "플레이어가 처음 눈을 뜨게 될 시작 장소의 이름 (예: '${theme.location}')","professions": ${professionsString},"startingChoices": ["주변을 둘러보며 현재 상황을 파악한다.","가장 가까운 사람에게 말을 걸어본다.","조용히 마음을 가다듬는다."]}`;
};

function App() {
    const [worldId, setWorldId] = useState(null);
    const [gameState, setGameState] = useState(getDefaultGameState());
    const [personalStoryLog, setPersonalStoryLog] = useState([]);
    const [privatePlayerState, setPrivatePlayerState] = useState(null);
    const [isTextLoading, setIsTextLoading] = useState(false);
    const [activeUsers, setActiveUsers] = useState([]);
    const [chatMessages, setChatMessages] = useState([]);
    const [currentChatMessage, setCurrentChatMessage] = useState('');
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const logEndRef = useRef(null);
    const chatEndRef = useRef(null);
    const [nickname, setNickname] = useState(() => localStorage.getItem('nickname') || '');
    const [showNicknameModal, setShowNicknameModal] = useState(!localStorage.getItem('nickname'));
    const [nicknameInput, setNicknameInput] = useState('');
    const [accordion, setAccordion] = useState({ gameLog: true, chat: true, users: true, playerInfo: true, chronicle: true, turningPoint: true });
    const [showResetModal, setShowResetModal] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [llmError, setLlmError] = useState(null);
    const [llmRetryEvent, setLlmRetryEvent] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [allMajorEvents, setAllMajorEvents] = useState([]);
    const [knownMajorEvents, setKnownMajorEvents] = useState([]);
    const [activeTurningPoint, setActiveTurningPoint] = useState(null);
    const [worldview, setWorldview] = useState(null);
    const [worlds, setWorlds] = useState([]);
    const [isCreatingWorld, setIsCreatingWorld] = useState(false);
    const [newWorldName, setNewWorldName] = useState('');
    const [isProcessor, setIsProcessor] = useState(false);
    const [showInterruptionModal, setShowInterruptionModal] = useState(false);

    const masterPromptForThemeGeneration = `
# 페르소나 (Persona)
당신은 상상력이 풍부한 TRPG 게임 시나리오 작가이자, 다양한 세계관을 기획하는 콘텐츠 전략가입니다.
# 임무 (Task)
당신의 임무는 아래의 'JSON 스키마'와 '좋은 예시'를 참고하여, 플레이어들에게 다채로운 경험을 제공할 수 있는 새로운 '테마 팩'을 10개 생성하는 것입니다.
# JSON 스키마 (JSON Schema) - 각 테마 팩은 반드시 이 구조를 따라야 합니다.
{ "name": "테마의 이름 (예: 판타지, 스포츠)", "title": "세계관의 제목", "genre": "세계관의 구체적인 장르", "location": "시작 장소", "professions": [ { "name": "역할 1의 이름", "motivation": "역할 1의 동기" }, { "name": "역할 2의 이름", "motivation": "역할 2의 동기" }, { "name": "역할 3의 이름", "motivation": "역할 3의 동기" }, { "name": "역할 4의 이름", "motivation": "역할 4의 동기" } ] }
# 좋은 예시 (Good Examples) - 이런 스타일과 품질로 생성해주세요.
[ { "name": "판타지", "title": "고대 용의 마지막 눈물", "genre": "에픽 판타지 어드벤처", "location": "세상 끝에 있는 잊혀진 신전", "professions": [{ "name": "그림자 속 암살자", "motivation": "왕국을 배신한 옛 스승에게 복수하기 위해 어둠 속에서 힘을 길렀습니다." }] }, { "name": "사이버펑크/SF", "title": "네온 비가 내리는 2242년", "genre": "사이버펑크 느와르", "location": "거대 기업의 그림자 아래 있는 뒷골목", "professions": [{ "name": "기억을 거래하는 정보상", "motivation": "도시의 모든 비밀을 알고 있지만, 정작 자신의 과거는 돈을 주고 사야만 합니다." }] } ]
# 절대적 지시사항 (Absolute Instructions) - 가장 중요합니다!
1. **오직 JSON 배열만 출력:** 당신의 응답은 다른 어떤 텍스트도 포함해서는 안 됩니다. 오직 하나의 완벽한 JSON 배열 \`[ ... ]\` 형식이어야 합니다.
2. **어떠한 설명도 금지:** "알겠습니다", "생성해 드립니다", "다음은 결과입니다" 와 같은 서두나, \`\`\`json 같은 마크다운 태그를 절대 포함하지 마십시오.
3. **시작과 끝:** 당신의 응답은 반드시 \`[\` 문자로 시작해서 \`]\` 문자로 끝나야 합니다. 그 외의 모든 것은 금지됩니다.
4. **규칙 준수:** 이 규칙을 어길 경우, 시스템 전체에 치명적인 오류가 발생합니다. 반드시, 반드시 규칙을 지켜주십시오.
`;

    const combinedFeed = useMemo(() => {
        const chatFeed = (chatMessages || []).map((msg) => ({ ...msg, type: 'chat', date: msg.timestamp?.toDate() || new Date() }));
        const publicLogFeed = (gameState.publicLog || []).map((log, index) => ({ ...log, id: `${log.timestamp?.toString()}-${index}` || `${Date.now()}-${index}`, type: 'system', date: log.timestamp instanceof Date ? log.timestamp : new Date() }));
        return [...chatFeed, ...publicLogFeed].sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [chatMessages, gameState.publicLog]);

    const handleNicknameSubmit = () => {
        if (nicknameInput.trim()) {
            const finalNickname = nicknameInput.trim();
            setNickname(finalNickname);
            localStorage.setItem('nickname', finalNickname);
            setShowNicknameModal(false);
            if (userId && db && worldId) {
                setDoc(doc(getActiveUsersCollectionRef(db, worldId), userId), { nickname: finalNickname }, { merge: true });
            }
        }
    };

    const getDisplayName = useCallback(
        (uid) => {
            if (uid === userId) return nickname || `플레이어 ${String(uid || '').substring(0, 4)}`;
            const user = activeUsers.find((u) => u.id === uid);
            return user?.nickname || `플레이어 ${String(uid || '').substring(0, 4)}`;
        },
        [activeUsers, userId, nickname]
    );

    const deleteCurrentWorld = async () => {
        if (!db || !worldId) return;
        setIsResetting(true);
        console.log(`월드 삭제 시작: ${worldId}`);

        try {
            const worldRef = getWorldMetaRef(db, worldId);
            const usersCollectionRef = collection(worldRef, 'users');
            const usersSnapshot = await getDocs(usersCollectionRef);

            if (!usersSnapshot.empty) {
                console.log(`${usersSnapshot.size}명의 플레이어 하위 데이터 삭제 중...`);
                const userDeletionPromises = usersSnapshot.docs.map(async (userDoc) => {
                    const userId = userDoc.id;
                    const personalStoryLogRef = collection(userDoc.ref, 'personalStoryLog');
                    const personalStoryLogSnapshot = await getDocs(personalStoryLogRef);
                    if (!personalStoryLogSnapshot.empty) {
                        const batch = writeBatch(db);
                        personalStoryLogSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log(`- ${userId}의 personalStoryLog 삭제 완료`);
                    }

                    const playerStateRef = collection(userDoc.ref, 'playerState');
                    const playerStateSnapshot = await getDocs(playerStateRef);
                    if (!playerStateSnapshot.empty) {
                        const batch = writeBatch(db);
                        playerStateSnapshot.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log(`- ${userId}의 playerState 삭제 완료`);
                    }
                });
                await Promise.all(userDeletionPromises);
            }

            console.log("플레이어 문서 및 공용 컬렉션 삭제 중...");
            const collectionsToDelete = [
                'users', 'events', 'system',
                'public/data/activeUsers', 'public/data/chatMessages',
                'public/data/majorEvents', 'public/data/npcs', 'public/data/turningPoints'
            ];

            const collectionDeletionPromises = collectionsToDelete.map(async (path) => {
                const collRef = collection(db, 'worlds', worldId, ...path.split('/'));
                const snapshot = await getDocs(collRef);
                if (!snapshot.empty) {
                    const batch = writeBatch(db);
                    snapshot.docs.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                    console.log(`- 컬렉션 '${path}' 삭제 완료`);
                }
            });
            await Promise.all(collectionDeletionPromises);

            console.log("월드 루트 문서 삭제 중...");
            const finalBatch = writeBatch(db);
            finalBatch.delete(getThemePacksRef(db, worldId));
            finalBatch.delete(getWorldviewRef(db, worldId));
            finalBatch.delete(getMainScenarioRef(db, worldId));
            finalBatch.delete(worldRef);
            await finalBatch.commit();
            console.log("월드 삭제 완료!");
            setWorldId(null);

        } catch (e) {
            console.error('월드 데이터 삭제 중 오류 발생:', e);
            setLlmError('월드 삭제에 실패했습니다. 콘솔 로그를 확인해주세요.');
        } finally {
            setIsResetting(false);
            setShowResetModal(false);
        }
    };

    const callGeminiTextLLM = useCallback(
        async (userPrompt, systemPromptToUse) => {
            setIsTextLoading(true);
            const mainApiKey = 'AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8';
            const backupApiKey = 'AIzaSyAhscNjW8GmwKPuKzQ47blCY_bDanR-B84';
            const getApiUrl = (apiKey) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
            const payload = {
                contents: [
                    { role: 'user', parts: [{ text: systemPromptToUse }] },
                    { role: 'model', parts: [{ text: '{"response_format": "json"}' }] },
                    { role: 'user', parts: [{ text: userPrompt }] }
                ],
                generationConfig: {
                    responseMimeType: "application/json",
                }
            };
            const tryGeminiCall = async (apiKey) => fetch(getApiUrl(apiKey), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            try {
                let response = await tryGeminiCall(mainApiKey);
                if (!response.ok) response = await tryGeminiCall(backupApiKey);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                const result = await response.json();
                const llmOutputText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

                const jsonMatch = llmOutputText.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
                if (jsonMatch && jsonMatch[0]) {
                    try {
                        return JSON.parse(jsonMatch[0]);
                    } catch (e) {
                        console.warn('JSON 파싱 실패, 원본 텍스트를 반환하여 재시도 로직에서 처리합니다.', e);
                        return llmOutputText;
                    }
                }

                console.warn('LLM 응답에서 유효한 JSON 객체나 배열을 찾지 못했습니다.');
                return llmOutputText;

            } catch (error) {
                console.error('LLM API 호출 중 치명적 오류 발생:', error);
                setLlmError(error.message || 'LLM 호출에 실패했습니다.');
                return null;
            } finally {
                setIsTextLoading(false);
            }
        },
        [setLlmError]
    );

    const buildSystemPrompt = useCallback(
        (worldviewData) =>
            `### 페르소나 (Persona)
당신은 이 세계의 '수호자'이자 '사관(史官)'이며, 플레이어들에게는 '게임 마스터(GM)'로 알려져 있습니다. 당신의 임무는 단순한 이야기 생성을 넘어, 일관된 역사와 살아 숨 쉬는 세계관을 구축하는 것입니다. 모든 묘사와 사건은 이 세계의 정해진 분위기와 역사적 사실 위에서 피어나는 한 편의 서사시여야 합니다.
${worldviewData ? `### 세계관 설정: [${worldviewData.genre}] ${worldviewData.title}\n${worldviewData.atmosphere}\n배경: ${worldviewData.background_story}` : `### 세계관 설정: 기본 판타지`}

### 중요 규칙
- **단서(Clue) 생성 규칙:** 'personalStory' 내용 중에 플레이어가 기억해야 할 중요한 정보(인물, 장소, 물건, 사건, 비밀 등)가 있다면, 해당 부분을 반드시 \`<clue>\` 태그로 감싸주십시오. 예: "당신은 낡은 책상 위에서 <clue>피로 얼룩진 양피지 지도</clue>를 발견했습니다." 이 규칙은 매우 중요합니다.
- 모든 플레이어는 'status' 필드를 가집니다. 만약 플레이어가 행동의 결과로 사망(death)하거나, 행동 불능(incapacitated) 상태가 되면 status를 'dead'로 설정하십시오.
- 'dead' 상태가 된 플레이어의 'choices'는 반드시 그의 마지막을 나타내는 단 하나의 선택지(예: '나의 이야기는 여기서 끝났다.')여야 합니다.
- ❗️ **대상(Target)이 있는 경우 \`targetPersonalStory\`는 필수입니다.** 만약 행동의 대상이 된 다른 플레이어가 있다면, \`targetPersonalStory\` 필드는 **절대** null이 될 수 없습니다. 대상에게 아무런 영향이 없더라도 '당신은 [Actor]의 행동을 목격했지만 별다른 영향을 받지 않았습니다.'와 같이 반드시 그 상황을 묘사하는 서사를 생성해야 합니다.

### JSON 출력 구조 (반드시 이 구조를 따르십시오)
{
  "publicLogEntry": "주변의 다른 플레이어나 NPC가 명백히 인지할 수 있는 '공개적인 사건'이라면, 3인칭 시점의 객관적인 기록을 한 문장으로 작성. 그렇지 않으면 null.",
  "personalStory": "행동을 한 플레이어(Actor)의 관점에서 진행되는 1인칭 또는 2인칭 서사. 중요한 정보는 <clue>태그</clue>로 감싸야 합니다.",
  "choices": ["'personalStory'의 결과에 따라 행동 유발자(Actor)가 할 수 있는 논리적인 다음 행동들."],
  "privateStateUpdates": { 
    "status": "행동 유발자(Actor)의 생존 상태. 'alive' 또는 'dead'. 필수 필드.",
    "...": "그 외 'stats', 'inventory', 'currentLocation' 등 변경이 필요한 다른 모든 상태 필드"
  },
 
  "targetPersonalStory": "만약 행동의 '대상'(Target)이 된 다른 플레이어가 있다면, 그 대상의 관점에서 겪는 일을 2인칭 서사('당신은...')로 작성. 대상에게 특별한 일이 없다면 '당신은 그 행동을 목격했지만 아무런 영향을 받지 않았다.' 와 같이 반드시 서술해야 합니다. 대상이 없다면 null.",
  "choicesForTarget": ["'targetPersonalStory'가 존재한다면, 그 대상(Target)을 위한 새로운 선택지. 대상이 사망했다면, 그의 마지막을 나타내는 단 하나의 선택지를 제공해야 합니다. 없다면 null."],
  "targetStateUpdates": {
    "status": "대상의 생존 상태. 'alive' 또는 'dead'. 대상이 있을 경우 필수 필드.",
    "...": "그 외 대상의 변경이 필요한 모든 상태 필드. 없다면 null."
  },

  "majorEvent": {"summary": "만약 이 사건이 후대에 '역사'로 기록될 만한 중대한 전환점이라면, 사관의 어조로 요약. 그렇지 않으면 null.","location": "사건이 발생한 장소 이름. majorEvent가 있을 경우 필수."},
  "npcMemoryUpdate": {"npcName": "상호작용 한 NPC의 이름","newMemory": "NPC의 기억에 추가될 새로운 로그"},
  "turningPointUpdate": {"objectiveId": "플레이어의 행동이 기여한 목표의 ID","progressIncrement": 10}
}`,
        []
    );

    const buildLlmPrompt = useCallback(
        async (eventData, actorState, targetState, worldState, conflictContext = null) => {
            if (conflictContext) {
                return `[상황 충돌 발생!] - 내가 하려던 행동: "${conflictContext.originalChoice}" - 하지만 그 직전에 벌어진 실제 사건: "${conflictContext.interveningEvent}" [지시] 위 상황을 바탕으로, 나의 행동이 실패하고 실제 사건을 목격하는 장면을 1인칭 또는 2인칭 시점에서 극적으로 묘사해주십시오. 이 묘사는 반드시 'personalStory' 필드에 포함되어야 합니다. 그리고 현재 바뀐 상황에 맞는 새로운 'choices'를 반드시 제공해주십시오. JSON 형식으로만 응답해야 합니다. 아래는 반드시 지켜야 할 JSON 출력 형식입니다: {"personalStory": "플레이어가 겪는 충돌 상황에 대한 1인칭 또는 2인칭 묘사","choices": ["바뀐 상황에 맞는 새로운 선택지 1", "새로운 선택지 2"]}`;
            }

            if (eventData.payload.isCreationAction) {
                const { choice, motivation } = eventData.payload;
                const startingLocation = worldState.worldview.startingLocation || '알 수 없는 장소';
                return buildCharacterCreationPrompt(choice, motivation, startingLocation);
            }

            const { choice } = eventData.payload;
            const actorDisplayName = getDisplayName(eventData.userId);
            const personalLogSummary = summarizeLogs(worldState.personalLog.map(doc => doc.data()), 1000, true);
            const publicLogSummary = summarizeLogs(worldState.publicLog, 500, false);
            const actorKnownEvents = worldState.allMajorEvents.filter((doc) => (actorState.knownEventIds || []).includes(doc.id)).map((doc) => `- ${doc.data().summary}`).join('\n') || '아직 기록된 역사가 없음';

            let targetSection = '';
            if (targetState) {
                const targetDisplayName = getDisplayName(eventData.payload.targetUserId);
                targetSection = `\n[이번 행동의 대상 (Target)]
- 이름: ${targetDisplayName}
- 현재 상태: ${JSON.stringify(targetState)}
- 지시: 이 대상이 겪게 될 일을 "targetPersonalStory" 필드에 2인칭 시점으로 묘사하고, 그를 위한 새로운 선택지를 "choicesForTarget"에, 상태 변화를 "targetStateUpdates"에 제공해주십시오.`
            }

            const userPrompt = `${targetSection}\n\n[세계의 연대기 (World Chronicle)]\n${actorKnownEvents}\n\n[주변의 최근 사건 요약 (Recent Public Events Summary)]\n${publicLogSummary}\n\n[행동 유발자 (Actor)]
- 이름: ${actorDisplayName}
- 개인 여정록 요약: \n${personalLogSummary}
- 현재 상태: ${JSON.stringify(actorState)}

[행동 (Action)]
- 위 모든 상황 속에서, 행동 유발자(${actorDisplayName})가 다음 행동을 선택했습니다.
- "${choice}"
- 이 선택으로 인해 행동 유발자(Actor)와 대상(Target)에게 어떤 일이 벌어지는지, 지정된 JSON 구조에 맞춰 장면을 연출해주십시오.`;
            return userPrompt;
        },
        [getDisplayName]
    );

    const turningPointCreationPrompt = `당신은 역사의 흐름을 읽는 '운명' 그 자체입니다. 최근 세상에서 벌어진 다음 사건들을 보고, 이 흐름이 하나의 거대한 '전환점(Turning Point)'으로 수렴될 수 있는지 판단하십시오. 현재 활성화된 전환점은 없습니다. 만약 중대한 갈등의 씨앗이나, 거대한 위협, 혹은 새로운 시대의 서막이 보인다면, 그에 맞는 전환점을 아래 JSON 형식으로 생성해주십시오. 아직 시기가 아니라면 'create' 값을 false로 설정하십시오. ### 최근 사건들 {event_summary} ### JSON 출력 구조 {"create": true,"turningPoint": {"title": "전환점의 제목 (예: '수도에 창궐한 역병')","description": "전환점에 대한 흥미로운 설명","status": "active","objectives": [{ "id": "objective_1", "description": "첫 번째 목표 (예: 역병의 근원 찾기)", "progress": 0, "goal": 100 },{ "id": "objective_2", "description": "두 번째 목표 (예: 치료제 개발 지원)", "progress": 0, "goal": 100 }]}}`;

    const checkAndCreateTurningPoint = useCallback(async () => {
        if (!db || !worldId) return;
        const activeTpDoc = await getDoc(getActiveTurningPointRef(db, worldId));
        if (activeTpDoc.exists()) return;

        const publicLog = (await getDoc(getMainScenarioRef(db, worldId))).data()?.publicLog || [];
        const majorEvents = (await getDocs(getMajorEventsRef(db, worldId))).docs.map((d) => d.data());

        const publicLogSummary = publicLog.slice(-20).map((e) => e.log).join('\n');
        const majorEventsSummary = majorEvents.slice(-10).map((e) => e.summary).join('\n');
        if (majorEventsSummary.length < 10) return;

        const eventSummary = `[최근 공개 사건들]\n${publicLogSummary}\n\n[최근 주요 역사]\n${majorEventsSummary}`;
        const prompt = turningPointCreationPrompt.replace('{event_summary}', eventSummary);
        const llmResponse = await callGeminiTextLLM(prompt, buildSystemPrompt(worldview));

        if (llmResponse && llmResponse.create && llmResponse.turningPoint) {
            await setDoc(getActiveTurningPointRef(db, worldId), { ...llmResponse.turningPoint, startTimestamp: serverTimestamp() });
        }
    }, [db, worldId, callGeminiTextLLM, buildSystemPrompt, worldview]);

    // ====================================================================
    // ❗️ [수정됨] @닉네임 형식으로 명확하게 대상을 지정하도록 로직 수정
    // ====================================================================
    const findTargetInText = (text, users, actorId) => {
        const mentionRegex = /@(\S+)/;
        const match = text.match(mentionRegex);

        if (!match) return null; // @멘션이 없으면 null 반환

        const mentionedNickname = match[1];

        for (const user of users) {
            // 자신의 닉네임과 @멘션된 닉네임이 같고, 자기 자신이 아닌 경우
            if (user.id !== actorId && user.nickname === mentionedNickname) {
                return {
                    targetUserId: user.id,
                    targetDisplayName: user.nickname,
                };
            }
        }

        return null; // 일치하는 사용자를 찾지 못한 경우
    };
    // ====================================================================

    const processEvent = useCallback(
        async (eventId, eventData) => {
            if (!db || !worldId) return;
            const eventRef = doc(db, 'worlds', worldId, 'events', eventId);
            await setDoc(eventRef, { status: 'processing' }, { merge: true });

            try {
                const worldviewDoc = await getDoc(getWorldviewRef(db, worldId));
                if (!worldviewDoc.exists()) throw new Error("Worldview not found!");
                const systemPromptToUse = buildSystemPrompt(worldviewDoc.data());

                if (eventData.type === 'PLAYER_ACTION') {
                    const eventUserId = eventData.userId;

                    if (eventData.payload.isCreationAction) {
                        const userPromptText = await buildLlmPrompt(eventData, null, null, { worldview: worldviewDoc.data() });
                        const llmResponse = await callGeminiTextLLM(userPromptText, systemPromptToUse);
                        if (!llmResponse || typeof llmResponse !== 'object') throw new Error('캐릭터 생성 LLM 응답 오류');
                        await setDoc(getPrivatePlayerStateRef(db, worldId, eventUserId), {
                            ...getDefaultPrivatePlayerState(), ...llmResponse.privateStateUpdates, characterCreated: true, profession: eventData.payload.choice, choices: llmResponse.choices || [], choicesTimestamp: serverTimestamp(),
                        }, { merge: true });
                        await addDoc(getPersonalStoryLogRef(db, worldId, eventUserId), {
                            action: `[직업 선택: ${eventData.payload.choice}]`, story: llmResponse.personalStory || '운명의 길이 열렸다.', timestamp: serverTimestamp()
                        });
                    } else {
                        await runTransaction(db, async (transaction) => {
                            const actorStateRef = getPrivatePlayerStateRef(db, worldId, eventUserId);
                            const mainScenarioRef = getMainScenarioRef(db, worldId);

                            const actorStateDoc = await transaction.get(actorStateRef);
                            const mainScenarioDoc = await transaction.get(mainScenarioRef);

                            if (!actorStateDoc.exists()) throw new Error("Actor state not found!");

                            const currentActorState = actorStateDoc.data();
                            const currentScenario = mainScenarioDoc.exists() ? mainScenarioDoc.data() : getDefaultGameState();

                            const eventTimestamp = eventData.payload.choicesTimestamp?.toMillis();
                            const scenarioTimestamp = currentScenario.lastUpdate?.toMillis();
                            if (eventTimestamp && scenarioTimestamp && eventTimestamp < scenarioTimestamp) {
                                const conflictLog = (currentScenario.publicLog || []).find((log) => log.timestamp.toMillis() > eventTimestamp);
                                const interveningEvent = conflictLog ? `[${conflictLog.actor.displayName}] ${conflictLog.log}` : '알 수 없는 사건';
                                const conflictPrompt = await buildLlmPrompt(null, null, null, null, { originalChoice: eventData.payload.choice, interveningEvent });
                                const llmResponse = await callGeminiTextLLM(conflictPrompt, systemPromptToUse);
                                const newLogRef = doc(getPersonalStoryLogRef(db, worldId, eventUserId));
                                transaction.set(newLogRef, { action: '나의 선택이 현실과 충돌함', story: llmResponse.personalStory, timestamp: serverTimestamp() });
                                transaction.update(actorStateRef, { choices: llmResponse.choices || [], choicesTimestamp: currentScenario.lastUpdate });
                                return;
                            }

                            let targetState = null;
                            if (eventData.payload.targetUserId) {
                                const targetStateDoc = await transaction.get(getPrivatePlayerStateRef(db, worldId, eventData.payload.targetUserId));
                                if (targetStateDoc.exists()) {
                                    targetState = targetStateDoc.data();
                                }
                            }

                            const allMajorEventsSnap = await getDocs(getMajorEventsRef(db, worldId));
                            const activeUsersSnap = await getDocs(getActiveUsersCollectionRef(db, worldId));
                            const personalLogSnap = await getDocs(query(getPersonalStoryLogRef(db, worldId, eventUserId), orderBy('timestamp', 'desc'), limit(10)));
                            const worldState = { publicLog: currentScenario.publicLog, allMajorEvents: allMajorEventsSnap.docs, activeUsers: activeUsersSnap.docs.map((d) => ({ id: d.id, ...d.data() })), personalLog: personalLogSnap.docs };
                            const userPromptText = await buildLlmPrompt(eventData, currentActorState, targetState, worldState);
                            const llmResponse = await callGeminiTextLLM(userPromptText, systemPromptToUse);
                            if (!llmResponse || typeof llmResponse !== 'object') throw new Error('LLM 응답 오류');

                            const newTimestamp = serverTimestamp();
                            let currentPublicLog = currentScenario.publicLog || [];
                            if (eventData.payload.isDeclarative) { currentPublicLog.push({ actor: { id: eventUserId, displayName: getDisplayName(eventUserId) }, log: `❗ ${eventData.payload.choice}`, isDeclaration: true, timestamp: new Date(Date.now() - 1) }); }
                            if (llmResponse.publicLogEntry) { currentPublicLog.push({ actor: { id: eventUserId, displayName: getDisplayName(eventUserId) }, log: llmResponse.publicLogEntry, timestamp: new Date() }); }
                            transaction.set(mainScenarioRef, { publicLog: currentPublicLog, lastUpdate: newTimestamp }, { merge: true });
                            const newPersonalLogRef = doc(getPersonalStoryLogRef(db, worldId, eventUserId));
                            transaction.set(newPersonalLogRef, { action: eventData.payload.choice, story: llmResponse.personalStory || '특별한 일은 일어나지 않았다.', timestamp: newTimestamp });
                            const actorUpdates = { choices: llmResponse.choices || [], choicesTimestamp: newTimestamp, ...llmResponse.privateStateUpdates, };
                            transaction.set(actorStateRef, actorUpdates, { merge: true });
                            if (eventData.payload.targetUserId && llmResponse.targetPersonalStory) {
                                const targetId = eventData.payload.targetUserId;
                                const targetStateRef = getPrivatePlayerStateRef(db, worldId, targetId);
                                const newTargetLogRef = doc(getPersonalStoryLogRef(db, worldId, targetId));
                                transaction.set(newTargetLogRef, {
                                    action: `[${getDisplayName(eventUserId)}의 행동에 휘말림]`, story: llmResponse.targetPersonalStory, timestamp: newTimestamp,
                                });
                                const interruptionData = {
                                    story: `[${getDisplayName(eventUserId)}의 행동] ${llmResponse.targetPersonalStory}`,
                                    choices: llmResponse.choicesForTarget || ['상황을 파악한다.'],
                                };
                                const targetUpdates = {
                                    choicesTimestamp: newTimestamp,
                                    ...llmResponse.targetStateUpdates,
                                    interruption: interruptionData
                                };
                                transaction.set(targetStateRef, targetUpdates, { merge: true });
                            }
                        });
                    }
                } else if (eventData.type === 'CHAT_MESSAGE') {
                    const { message, userId: chatUserId } = eventData.payload;
                    const isAction = message.startsWith('!');
                    await addDoc(getChatMessagesCollectionRef(db, worldId), { userId: chatUserId, displayName: getDisplayName(chatUserId), message: isAction ? `${message.substring(1).trim()}` : message, isAction, timestamp: serverTimestamp() });
                    if (isAction) {
                        const actionText = message.substring(1).trim();
                        const allUsersSnap = await getDocs(getActiveUsersCollectionRef(db, worldId));
                        const allUsers = allUsersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
                        const targetInfo = findTargetInText(actionText, allUsers, chatUserId);
                        const newActionEvent = {
                            type: 'PLAYER_ACTION', userId: chatUserId, payload: { choice: actionText, isDeclarative: true, targetUserId: targetInfo?.targetUserId || null, targetDisplayName: targetInfo?.targetDisplayName || null }, timestamp: serverTimestamp(), status: 'pending',
                        };
                        await addDoc(getEventsCollectionRef(db, worldId), newActionEvent);
                    }
                }
                await setDoc(eventRef, { status: 'processed' }, { merge: true });
            } catch (error) {
                console.error(`이벤트 처리 실패 (ID: ${eventId}):`, error);
                setLlmError(`이벤트 처리 중 오류 발생: ${error.message}`);
                setLlmRetryEvent({ id: eventId, data: eventData });
                await setDoc(eventRef, { status: 'failed', error: error.message }, { merge: true });
            }
        },
        [db, worldId, callGeminiTextLLM, getDisplayName, buildSystemPrompt]
    );

    useEffect(() => {
        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);
        setDb(firestoreDb); setAuth(firebaseAuth);
        const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
            if (user) { setUserId(user.uid); setIsAuthReady(true); } else { await signInAnonymously(firebaseAuth); }
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        if (worldId) {
            localStorage.setItem('worldId', worldId);
        } else {
            localStorage.removeItem('worldId');
        }
    }, [worldId]);

    useEffect(() => {
        if (!db || !isAuthReady) return;
        setIsLoading(true);
        const q = query(collection(db, 'worlds'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            setWorlds(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsLoading(false);
        }, (err) => { console.error(err); setIsLoading(false); });
        return () => unsub();
    }, [db, isAuthReady]);

    useEffect(() => {
        if (!worldId || !db || !userId) return;
        setIsLoading(true);
        const unsubs = [
            onSnapshot(getWorldviewRef(db, worldId), (s) => setWorldview(s.exists() ? s.data() : null)),
            onSnapshot(getPrivatePlayerStateRef(db, worldId, userId), (s) => {
                if (s.exists()) {
                    const data = s.data();
                    setPrivatePlayerState(data);
                    if (data.interruption) {
                        setShowInterruptionModal(true);
                    }
                }
                else { setPrivatePlayerState(getDefaultPrivatePlayerState()); }
            }),
            onSnapshot(query(getPersonalStoryLogRef(db, worldId, userId), orderBy('timestamp', 'desc'), limit(50)), (s) => setPersonalStoryLog(s.docs.map(d => ({ id: d.id, ...d.data() })).reverse())),
            onSnapshot(getMainScenarioRef(db, worldId), (s) => setGameState(s.exists() ? s.data() : getDefaultGameState())),
            onSnapshot(query(getChatMessagesCollectionRef(db, worldId), orderBy('timestamp')), (s) => setChatMessages(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(query(getActiveUsersCollectionRef(db, worldId)), (s) => setActiveUsers(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(query(getMajorEventsRef(db, worldId), orderBy('timestamp')), (s) => setAllMajorEvents(s.docs.map(d => ({ id: d.id, ...d.data() })))),
            onSnapshot(getActiveTurningPointRef(db, worldId), (s) => setActiveTurningPoint(s.exists() ? { id: s.id, ...s.data() } : null)),
        ];
        const initPlayer = async () => {
            const playerDoc = await getDoc(getPrivatePlayerStateRef(db, worldId, userId));
            if (!playerDoc.exists()) {
                await setDoc(getPrivatePlayerStateRef(db, worldId, userId), getDefaultPrivatePlayerState());
            }
            setIsLoading(false);
        };
        initPlayer();
        return () => unsubs.forEach(unsub => unsub());
    }, [worldId, db, userId]);

    useEffect(() => {
        if (!worldId || !db || !userId) return;
        const leaseRef = getProcessorLeaseRef(db, worldId);
        const leaseDuration = 30000;
        const tryAcquireLease = async () => {
            try {
                await runTransaction(db, async (t) => {
                    const leaseDoc = await t.get(leaseRef);
                    if (!leaseDoc.exists() || leaseDoc.data().timestamp.toMillis() < Date.now() - leaseDuration) {
                        t.set(leaseRef, { owner: userId, timestamp: serverTimestamp() });
                        setIsProcessor(true);
                    }
                });
            } catch (e) { /* Lease acquisition failed */ }
        };
        tryAcquireLease();
        const intervalId = setInterval(async () => {
            const leaseDoc = await getDoc(leaseRef);
            if (leaseDoc.exists() && leaseDoc.data().owner === userId) {
                await setDoc(leaseRef, { owner: userId, timestamp: serverTimestamp() }, { merge: true });
                setIsProcessor(true);
            } else {
                setIsProcessor(false);
                tryAcquireLease();
            }
        }, leaseDuration / 2);
        return () => clearInterval(intervalId);
    }, [worldId, db, userId]);

    useEffect(() => {
        if (!isProcessor || !worldId || !db) return;
        const q = query(getEventsCollectionRef(db, worldId), where('status', '==', 'pending'), orderBy('timestamp'), limit(1));
        const unsub = onSnapshot(q, (s) => { if (!s.empty) processEvent(s.docs[0].id, s.docs[0].data()); });
        return () => unsub();
    }, [isProcessor, worldId, db, processEvent]);

    useEffect(() => {
        if (!db || !userId || !nickname || !privatePlayerState || !worldId) return;
        const userDocRef = doc(getActiveUsersCollectionRef(db, worldId), userId);
        setDoc(userDocRef, { lastActive: serverTimestamp(), nickname: nickname || `플레이어 ${userId.substring(0, 4)}`, profession: privatePlayerState.profession }, { merge: true });
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') setDoc(userDocRef, { lastActive: serverTimestamp() }, { merge: true });
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [db, userId, nickname, privatePlayerState?.profession, worldId]);

    useEffect(() => {
        if (accordion.gameLog && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [personalStoryLog, accordion.gameLog]);

    useEffect(() => {
        if (accordion.chat && chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [combinedFeed, accordion.chat]);

    useEffect(() => {
        if (!privatePlayerState || !db || !userId || allMajorEvents.length === 0 || !worldId) return;
        const currentKnownIds = privatePlayerState.knownEventIds || [];
        const newDiscoveredEvents = allMajorEvents.filter((event) => event?.location === privatePlayerState.currentLocation && !currentKnownIds.includes(event.id)).map((event) => event.id);
        if (newDiscoveredEvents.length > 0) setDoc(getPrivatePlayerStateRef(db, worldId, userId), { knownEventIds: arrayUnion(...newDiscoveredEvents) }, { merge: true });
    }, [privatePlayerState?.currentLocation, allMajorEvents, privatePlayerState?.knownEventIds, worldId, db, userId]);

    useEffect(() => {
        if (!privatePlayerState) return;
        setKnownMajorEvents(allMajorEvents.filter((event) => (privatePlayerState.knownEventIds || []).includes(event?.id)));
    }, [privatePlayerState?.knownEventIds, allMajorEvents]);

    useEffect(() => {
        // privatePlayerState의 choicesTimestamp가 바뀌면(즉, 내 선택이 처리되어 Firestore에 반영되면)
        // isTextLoading을 무조건 false로 해제한다.
        setIsTextLoading(false);
    }, [privatePlayerState?.choicesTimestamp, privatePlayerState?.choices, personalStoryLog]);

    const sendChatMessage = async () => {
        if (!db || !userId || !isAuthReady || !currentChatMessage.trim() || !worldId || privatePlayerState?.status === 'dead') return;
        const messageText = currentChatMessage.trim();
        const eventPayload = { type: 'CHAT_MESSAGE', payload: { message: messageText, userId: userId }, timestamp: serverTimestamp(), status: 'pending' };
        setCurrentChatMessage('');
        await addDoc(getEventsCollectionRef(db, worldId), eventPayload);
    };

    const handleCreateWorld = async () => {
        if (!newWorldName.trim() || !db) return;
        setIsCreatingWorld(true);
        setLlmError(null);
        try {
            let generatedPacks = null;
            let lastRawOutput = '';
            const maxRetries = 3;

            for (let i = 0; i < maxRetries; i++) {
                console.log(`테마 팩 생성 시도 ${i + 1}/${maxRetries}...`);
                const promptToUse = (i === 0) ?
                    masterPromptForThemeGeneration :
                    buildFixJsonPrompt(lastRawOutput);
                const response = await callGeminiTextLLM(promptToUse, (i === 0) ? masterPromptForThemeGeneration : buildFixJsonPrompt(''));
                if (response && Array.isArray(response) && response.length > 0) {
                    generatedPacks = response;
                    console.log('테마 팩 생성 성공!');
                    break;
                } else {
                    lastRawOutput = typeof response === 'string' ? response : JSON.stringify(response);
                    console.warn(`시도 ${i + 1} 실패: LLM이 유효한 배열을 반환하지 않았습니다. 출력물:`, lastRawOutput);
                }
            }

            if (!generatedPacks) {
                throw new Error('테마 팩 생성에 최종적으로 실패했습니다. LLM이 유효한 데이터를 반환하지 않습니다.');
            }

            const randomTheme = generatedPacks[Math.floor(Math.random() * generatedPacks.length)];
            const llmResponse = await callGeminiTextLLM(generateWorldCreationPrompt(randomTheme), generateWorldCreationPrompt(randomTheme));
            if (!llmResponse || typeof llmResponse !== 'object' || Array.isArray(llmResponse)) {
                throw new Error('세계관 생성에 실패했습니다.');
            }

            const newWorldRef = doc(collection(db, 'worlds'));
            const batch = writeBatch(db);
            batch.set(newWorldRef, { name: newWorldName, createdAt: serverTimestamp() });
            batch.set(getThemePacksRef(db, newWorldRef.id), { packs: generatedPacks });
            batch.set(getWorldviewRef(db, newWorldRef.id), llmResponse);
            batch.set(getMainScenarioRef(db, newWorldRef.id), getDefaultGameState());
            await batch.commit();

            setNewWorldName('');
            setWorldId(newWorldRef.id);
        } catch (e) {
            console.error('월드 생성 오류:', e);
            setLlmError(e.message || '월드 생성 중 알 수 없는 오류가 발생했습니다.');
        } finally {
            setIsCreatingWorld(false);
        }
    };

    const handleChoiceClick = async (choice, motivation = null) => {
        if (isTextLoading || !privatePlayerState || privatePlayerState.status === 'dead' || !worldId || !userId) return;
        setIsTextLoading(true);

        const isCreation = !privatePlayerState.characterCreated;

        const event = {
            type: 'PLAYER_ACTION',
            userId: userId,
            payload: {
                choice,
                choicesTimestamp: privatePlayerState.choicesTimestamp || null,
                isCreationAction: isCreation,
                motivation: motivation,
            },
            timestamp: serverTimestamp(),
            status: 'pending',
        };
        try {
            await addDoc(getEventsCollectionRef(db, worldId), event);
        } catch (e) {
            console.error('이벤트 제출 실패:', e);
            setLlmError('선택을 제출하는 데 실패했습니다.');
            setIsTextLoading(false);
        }
    };

    const handleInterruptionAcknowledge = async () => {
        if (!db || !userId || !worldId || !privatePlayerState?.interruption) return;
        const newChoices = privatePlayerState.interruption.choices;
        await setDoc(getPrivatePlayerStateRef(db, worldId, userId), {
            interruption: null,
            choices: newChoices,
            choicesTimestamp: serverTimestamp()
        }, { merge: true });
        setShowInterruptionModal(false);
    };

    const toggleAccordion = (key) => setAccordion((prev) => ({ ...prev, [key]: !prev[key] }));

    const handleClueClick = async (clue) => {
        if (!db || !userId || !worldId || !clue || isTextLoading) return;

        const currentKnownClues = privatePlayerState?.knownClues || [];
        if (currentKnownClues.includes(clue)) {
            console.log("이미 알고 있는 단서입니다:", clue);
            return;
        }

        console.log("새로운 단서 발견:", clue);
        const privateStateRef = getPrivatePlayerStateRef(db, worldId, userId);
        await setDoc(privateStateRef, {
            knownClues: arrayUnion(clue)
        }, { merge: true });
    };

    const toggleActiveMemory = async (clue, activate) => {
        if (!db || !userId || !worldId) return;
        const privateStateRef = getPrivatePlayerStateRef(db, worldId, userId);
        let currentMemories = privatePlayerState.activeMemories || [];
        if (activate) {
            if (!currentMemories.includes(clue)) currentMemories = [...currentMemories, clue];
        } else {
            currentMemories = currentMemories.filter((memory) => memory !== clue);
        }
        await setDoc(privateStateRef, { activeMemories: currentMemories }, { merge: true });
    };

    const LlmErrorModal = () => (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4 text-center">
                <h3 className="text-xl font-bold text-red-400">오류가 발생했습니다</h3>
                <p className="text-gray-200">{llmError}</p>
                <div className="flex justify-center gap-4">
                    {llmRetryEvent && isProcessor && (
                        <button
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md"
                            onClick={async () => {
                                setLlmError(null);
                                if (llmRetryEvent) processEvent(llmRetryEvent.id, llmRetryEvent.data);
                            }}
                        >
                            재시도
                        </button>
                    )}
                    <button
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 font-bold rounded-md"
                        onClick={() => {
                            setLlmError(null);
                            setLlmRetryEvent(null);
                        }}
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );

    const InterruptionModal = () => {
        if (!showInterruptionModal || !privatePlayerState?.interruption) return null;
        return (
            <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50">
                <div className="bg-gray-800 border border-yellow-500 rounded-lg shadow-xl p-6 w-full max-w-lg space-y-4 text-center animate-pulse-once">
                    <h3 className="text-2xl font-bold text-yellow-300">! 상황 개입 !</h3>
                    <div className="bg-gray-900 p-4 rounded-md">
                        <p className="text-gray-200 whitespace-pre-wrap text-lg leading-relaxed">
                            {privatePlayerState.interruption.story}
                        </p>
                    </div>
                    <p className="text-sm text-gray-400">당신의 선택지가 변경되었습니다.</p>
                    <button
                        className="w-full px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-md transition duration-300"
                        onClick={handleInterruptionAcknowledge}
                    >
                        상황 확인 및 계속
                    </button>
                </div>
                <style>{`.animate-pulse-once { animation: pulse 1s cubic-bezier(0.4, 0, 0.6, 1); }`}</style>
            </div>
        );
    };

    if (showNicknameModal) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
                    <h3 className="text-xl font-bold text-gray-100">닉네임을 입력하세요</h3>
                    <input
                        className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
                        placeholder="닉네임"
                        value={nicknameInput}
                        onChange={(e) => setNicknameInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleNicknameSubmit();
                        }}
                        autoFocus
                    />
                    <button className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50" onClick={handleNicknameSubmit} disabled={!nicknameInput.trim()}>
                        시작하기
                    </button>
                </div>
            </div>
        );
    }

    if (!worldId) {
        return (
            <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center p-4 pt-10">
                <h1 className="text-4xl font-bold mb-8 text-yellow-300">텍스트 어드벤처 로비</h1>
                {isLoading ? (
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-300"></div>
                ) : (
                    <div className="w-full max-w-4xl flex flex-col lg:flex-row gap-8">
                        <div className="lg:w-1/3 bg-gray-800 p-6 rounded-lg shadow-xl">
                            <h2 className="text-2xl font-semibold mb-4 border-b border-gray-600 pb-2">새로운 세계 창조하기</h2>
                            <input type="text" placeholder="새 월드의 이름" value={newWorldName} onChange={(e) => setNewWorldName(e.target.value)} className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg mb-4" />
                            <button onClick={handleCreateWorld} disabled={isCreatingWorld || !newWorldName.trim()} className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-wait">
                                {isCreatingWorld ? '생성 중...' : '창조하기'}
                            </button>
                            {llmError && <p className="text-red-400 text-sm mt-2">{llmError}</p>}
                        </div>
                        <div className="lg:w-2/3 bg-gray-800 p-6 rounded-lg shadow-xl">
                            <h2 className="text-2xl font-semibold mb-4 border-b border-gray-600 pb-2">기존 세계에 참가하기</h2>
                            <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                                {worlds.length > 0 ? (
                                    worlds.map((w) => (
                                        <div key={w.id} className="bg-gray-700 p-4 rounded-md flex justify-between items-center">
                                            <div>
                                                <h3 className="text-xl font-bold text-blue-300">{w.name}</h3>
                                                <p className="text-xs text-gray-400">생성일: {w.createdAt?.toDate().toLocaleDateString()}</p>
                                            </div>
                                            <button onClick={() => setWorldId(w.id)} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md transition">
                                                참가
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-400">아직 생성된 월드가 없습니다. 새로운 세계를 창조해보세요!</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                <style>{`.custom-scrollbar::-webkit-scrollbar { width: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: #2d3748; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #4a5568; }`}</style>
            </div>
        );
    }

    if (isLoading || !privatePlayerState) {
        return (
            <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-300"></div>
                <span className="ml-4 text-xl">월드 데이터를 불러오는 중...</span>
            </div>
        );
    }

    const renderGameLog = () => {
        const parseStoryWithClues = (storyText) => {
            if (!storyText || typeof storyText !== 'string') return storyText;

            const parts = storyText.split(/<\/?clue>/g);
            return parts.map((part, index) => {
                if (index % 2 === 1) { // 홀수 인덱스는 <clue> 태그 안의 내용
                    const isKnown = (privatePlayerState?.knownClues || []).includes(part);
                    return (
                        <span
                            key={index}
                            className={`font-semibold cursor-pointer underline decoration-dotted transition-colors duration-300 ${isKnown ? 'text-purple-400' : 'text-cyan-400 hover:text-cyan-300'}`}
                            onClick={() => handleClueClick(part)}
                            title={isKnown ? "이미 알고 있는 단서입니다." : "클릭하여 단서로 수집"}
                        >
                            {part}
                        </span>
                    );
                }
                return <span key={index} dangerouslySetInnerHTML={{ __html: part.replace(/\n/g, '<br />') }} />;
            });
        };

        return (
            <div className="mb-2">
                <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('gameLog')}>
                    <h2 className="text-lg font-bold text-gray-100">나의 여정록</h2>
                    <div className="text-xl">{accordion.gameLog ? '▼' : '▲'}</div>
                </div>
                {accordion.gameLog && (
                    <>
                        <div className="flex-grow bg-gray-700 p-4 rounded-md overflow-y-auto h-96 custom-scrollbar text-sm md:text-base leading-relaxed" style={{ maxHeight: '24rem' }}>
                            {privatePlayerState && !privatePlayerState.characterCreated && (
                                <div className="mb-4 p-2 rounded bg-gray-900/50 text-center">
                                    <p className="text-yellow-300 font-semibold italic text-lg">모험의 서막</p>
                                    <p className="whitespace-pre-wrap mt-1">당신은 어떤 운명을 선택하시겠습니까?</p>
                                </div>
                            )}
                            {(personalStoryLog || []).map((event, index) => (
                                <div key={event.id || index} className="mb-4 p-2 rounded bg-gray-900/50">
                                    {event?.action && <p className="text-yellow-300 font-semibold italic text-sm"> {event.action.startsWith('[') ? `${event.action}` : `나의 선택: ${event.action}`} </p>}
                                    <p className="whitespace-pre-wrap mt-1">
                                        {parseStoryWithClues(event?.story)}
                                    </p>
                                </div>
                            ))}
                            {isTextLoading && (
                                <div className="flex justify-center items-center mt-4">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
                                    <span className="ml-3 text-gray-400">세상의 흐름을 읽는 중...</span>
                                </div>
                            )}
                            <div ref={logEndRef} />
                        </div>
                    </>
                )}
            </div>
        );
    };

    const ChoicesDisplay = () => {
        const areChoicesStale = useMemo(() => {
            const pTs = privatePlayerState?.choicesTimestamp?.toMillis();
            const gTs = gameState.lastUpdate?.toMillis();
            return pTs && gTs && pTs < gTs;
        }, [privatePlayerState?.choicesTimestamp, gameState.lastUpdate]);

        if (privatePlayerState?.status === 'dead') {
            return (
                <div className="flex flex-col gap-3">
                    <div className="p-4 text-center bg-red-900/70 border border-red-600 rounded-md text-red-300 text-lg font-bold">
                        ☠️ 당신의 여정은 끝났습니다.
                    </div>
                    {(privatePlayerState.choices || []).map((choice, index) => (
                        <button key={index} className="px-6 py-3 font-bold rounded-md shadow-lg bg-gray-800 text-gray-500 cursor-not-allowed" disabled>
                            {choice}
                        </button>
                    ))}
                </div>
            );
        }

        if (privatePlayerState && !privatePlayerState.characterCreated) {
            return (
                <div className="flex flex-col gap-3">
                    {(worldview?.professions || []).map((profession, index) => (
                        <button key={index} onClick={() => handleChoiceClick(profession.name, profession.motivation)} disabled={isTextLoading} className="px-6 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 disabled:cursor-wait text-left">
                            <p className="text-lg text-blue-300">{profession.name}</p>
                            <p className="text-sm font-normal text-gray-300 mt-1">{profession.motivation}</p>
                        </button>
                    ))}
                </div>
            );
        }

        return (
            <div className="flex flex-col gap-3">
                {areChoicesStale && (
                    <div className="p-2 text-center bg-yellow-900/50 border border-yellow-600 rounded-md text-yellow-300 text-sm">
                        상황이 변경되었습니다! 선택이 실패할 수 있습니다.
                    </div>
                )}
                {(privatePlayerState?.choices || []).map((choice, index) => {
                    if (!choice) return null;
                    return (
                        <button
                            key={`${choice}-${index}`}
                            className={`px-6 py-3 font-bold rounded-md shadow-lg transition duration-300 disabled:opacity-50 bg-blue-600 hover:bg-blue-700 text-white`}
                            onClick={() => handleChoiceClick(choice)}
                            disabled={isTextLoading}
                        >
                            {choice}
                        </button>
                    );
                })}
            </div>
        );
    };

    const renderSidebar = () => {
        const isPlayerDead = privatePlayerState?.status === 'dead';
        return (
            <div className="w-full lg:w-1/3 flex flex-col space-y-6 bg-gray-700 p-4 rounded-lg shadow-inner">
                {worldview && (
                    <div className="mb-2">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-md font-semibold text-gray-200">
                                현재 세계관 <span className="text-xs font-normal text-yellow-300">{isProcessor ? '[프로세서]' : ''}</span>
                            </h4>
                            <div className="flex gap-2">
                                <button className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded-md" onClick={() => setWorldId(null)}>
                                    로비로
                                </button>
                                <button className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md" onClick={() => setShowResetModal(true)}>
                                    월드 삭제
                                </button>
                            </div>
                        </div>
                        <div className="bg-gray-900/50 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-2">
                            <p className="font-bold text-yellow-200">
                                {worldview.title} <span className="text-gray-400 font-normal">({worldview.genre})</span>
                            </p>
                            <p className="text-xs italic text-gray-400">{worldview.atmosphere}</p>
                        </div>
                    </div>
                )}
                {activeTurningPoint && (
                    <div className="mb-2">
                        <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('turningPoint')}>
                            <h4 className="text-md font-semibold text-yellow-300">주요 분기점</h4>
                            <div className="text-xl">{accordion.turningPoint ? '▼' : '▲'}</div>
                        </div>
                        {accordion.turningPoint && (
                            <div className="bg-gray-900/50 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-2">
                                <p className="font-bold text-yellow-200">{activeTurningPoint.title}</p>
                                <p className="text-xs italic text-gray-400">{activeTurningPoint.description}</p>
                                {(activeTurningPoint.objectives || []).map((obj) => (
                                    <div key={obj.id}>
                                        <p className="text-xs font-semibold">
                                            {obj.description} ({obj.progress || 0} / {obj.goal})
                                        </p>
                                        <div className="w-full bg-gray-600 rounded-full h-2.5">
                                            <div className="bg-yellow-500 h-2.5 rounded-full" style={{ width: `${((obj.progress || 0) / obj.goal) * 100}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {privatePlayerState && (
                    <div className="mb-2">
                        <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('playerInfo')}>
                            <h4 className="text-md font-semibold text-gray-200">내 정보</h4>
                            <div className="text-xl">{accordion.playerInfo ? '▼' : '▲'}</div>
                        </div>
                        {accordion.playerInfo && (
                            <div className="bg-gray-600 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-2 h-96 overflow-y-auto custom-scrollbar">
                                <p>
                                    <span className="font-semibold text-blue-300">이름:</span> {getDisplayName(userId)}
                                    {isPlayerDead && <span className="text-red-400 font-bold"> (사망)</span>}
                                </p>
                                <p>
                                    <span className="font-semibold text-blue-300">직업:</span> {privatePlayerState.profession || '미정'}
                                </p>
                                <p>
                                    <span className="font-semibold text-blue-300">위치:</span> {privatePlayerState.currentLocation || '알 수 없는 곳'}
                                </p>
                                <p>
                                    <span className="font-semibold text-blue-300">능력치:</span> 힘({privatePlayerState.stats?.strength ?? 10}) 지능({privatePlayerState.stats?.intelligence ?? 10}) 민첩({privatePlayerState.stats?.agility ?? 10}) 카리스마(
                                    {privatePlayerState.stats?.charisma ?? 10})
                                </p>
                                <p>
                                    <span className="font-semibold text-blue-300">인벤토리:</span> {(privatePlayerState.inventory || []).join(', ') || '비어있음'}
                                </p>
                                <div>
                                    <span className="font-semibold text-yellow-300">활성 기억:</span>
                                    {(privatePlayerState.activeMemories || []).length > 0 ? (
                                        <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                                            {(privatePlayerState.activeMemories || []).map((memory, i) => (
                                                <li key={`mem-${i}`} className="text-xs flex justify-between items-center">
                                                    <span>{memory}</span> <button onClick={() => toggleActiveMemory(memory, false)} className="text-red-400 hover:text-red-300 ml-2 text-lg">×</button>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-gray-400 ml-2">기억할 단서를 활성화하세요.</p>
                                    )}
                                </div>
                                <div>
                                    <span className="font-semibold text-purple-300">알려진 단서:</span>
                                    {(privatePlayerState.knownClues || []).length > 0 ? (
                                        <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                                            {(privatePlayerState.knownClues || []).map((clue, i) => {
                                                const isActivated = (privatePlayerState.activeMemories || []).includes(clue);
                                                return (
                                                    <li key={`clue-${i}`} className="text-xs flex justify-between items-center">
                                                        <span>{clue}</span>
                                                        {!isActivated && (
                                                            <button onClick={() => toggleActiveMemory(clue, true)} className="text-green-400 hover:text-green-300 ml-2 text-lg">
                                                                ↑
                                                            </button>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-gray-400 ml-2">아직 발견한 단서가 없습니다.</p>
                                    )}
                                </div>
                                <div>
                                    <span className="font-semibold text-indigo-300">NPC 관계:</span>
                                    <ul className="list-disc list-inside ml-2 space-y-1 mt-1">
                                        {Object.entries(privatePlayerState.npcRelations || {}).length > 0 ? (
                                            Object.entries(privatePlayerState.npcRelations).map(([name, value]) => (
                                                <li key={name} className="text-xs">{`${name}: ${value}`}</li>
                                            ))
                                        ) : (
                                            <li>알려진 관계 없음</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                <div className="mb-2">
                    <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('chronicle')}>
                        <h4 className="text-md font-semibold text-gray-200">세계의 연대기</h4>
                        <div className="text-xl">{accordion.chronicle ? '▼' : '▲'}</div>
                    </div>
                    {accordion.chronicle && (
                        <div className="bg-gray-600 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1 h-32 overflow-y-auto custom-scrollbar">
                            {(knownMajorEvents || []).length > 0 ? (
                                <ul className="list-disc list-inside">
                                    {(knownMajorEvents || []).map((event) => (
                                        <li key={event?.id}>{event?.summary ?? '기록이 손상되었습니다.'}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p>아직 발견한 주요 사건이 없습니다. 세상을 탐험해 보세요.</p>
                            )}
                        </div>
                    )}
                </div>
                <div className="mb-2">
                    <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('users')}>
                        <h4 className="text-md font-semibold text-gray-200">현재 플레이어들</h4>
                        <div className="text-xl">{accordion.users ? '▼' : '▲'}</div>
                    </div>
                    {accordion.users && (
                        <div className="bg-gray-600 p-3 rounded-md h-32 overflow-y-auto custom-scrollbar">
                            {(activeUsers || []).length > 0 ? (
                                <ul className="text-sm text-gray-300 space-y-1">
                                    {(activeUsers || []).map((user) => (
                                        <li key={user.id} className="truncate p-1 rounded-md">
                                            <span className="font-medium text-green-300">{getDisplayName(user.id)}</span>
                                            <span className="text-gray-400 text-xs"> ({user.profession || '모험가'})</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-gray-400">활동 중인 플레이어가 없습니다.</p>
                            )}
                        </div>
                    )}
                </div>
                <div className="mb-2">
                    <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => toggleAccordion('chat')}>
                        <h4 className="text-md font-semibold text-gray-200">세상의 소식</h4>
                        <div className="text-xl">{accordion.chat ? '▼' : '▲'}</div>
                    </div>
                    {accordion.chat && (
                        <div className="bg-gray-600 p-3 rounded-md flex flex-col h-96">
                            <div className="flex-grow overflow-y-auto custom-scrollbar mb-3 text-sm space-y-2">
                                {combinedFeed.map((item, index) => {
                                    if (item.type === 'chat') {
                                        const isMyMessage = item.userId === userId;
                                        const time = item.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                        return (
                                            <div key={item.id || index} className={`flex flex-col ${isMyMessage ? 'items-end' : 'items-start'}`}>
                                                <div className={`text-xs text-gray-400 px-1 ${isMyMessage ? 'text-right' : 'text-left'}`}>{getDisplayName(item.userId)}</div>
                                                <div className="flex items-end gap-2">
                                                    {isMyMessage && <span className="text-xs text-gray-500">{time}</span>}
                                                    <div className={`max-w-xs rounded-lg px-3 py-2 ${isMyMessage ? 'bg-blue-800' : 'bg-gray-700'} ${item.isAction ? 'italic font-semibold border border-yellow-500 text-yellow-300' : ''}`}>
                                                        <p className="whitespace-pre-wrap break-words">{item.isAction ? `! ${item.message}` : item.message}</p>
                                                    </div>
                                                    {!isMyMessage && <span className="text-xs text-gray-500">{time}</span>}
                                                </div>
                                            </div>
                                        );
                                    }
                                    if (item.type === 'system') {
                                        return (
                                            <div key={item.id || index} className="text-center my-2">
                                                <p className={`text-xs px-2 py-1 rounded-md inline-block ${item.isDeclaration ? 'text-yellow-300 bg-red-900/50 font-bold' : 'text-yellow-400 italic bg-black/20'}`}>
                                                    {item.log.includes('❗') ? `${item.log}` : `[${item.actor?.displayName ?? '누군가'}] ${item.log}`}
                                                </p>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="flex">
                                {/* ==================================================================== */}
                                {/* ❗️ [수정됨] 행동 선언 시 @닉네임으로 대상을 지정하도록 안내 문구 수정 */}
                                {/* ==================================================================== */}
                                <input
                                    type="text"
                                    placeholder={isPlayerDead ? "당신은 더 이상 말할 수 없습니다." : "! 행동 또는 !@대상 행동 선언"}
                                    className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600 text-white placeholder-gray-500 disabled:bg-gray-800 disabled:cursor-not-allowed"
                                    value={currentChatMessage}
                                    onChange={(e) => setCurrentChatMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                                    disabled={!isAuthReady || isPlayerDead}
                                />
                                <button
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 font-bold rounded-r-md disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={sendChatMessage}
                                    disabled={!isAuthReady || !currentChatMessage.trim() || isPlayerDead}
                                >
                                    전송
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
            {llmError && <LlmErrorModal />}
            <InterruptionModal />
            {showResetModal && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
                        <h3 className="text-xl font-bold text-red-400">⚠️ 현재 월드의 모든 데이터를 삭제할까요?</h3>
                        <p className="text-gray-200">이 작업은 되돌릴 수 없습니다. 모든 하위 데이터까지 완전히 삭제됩니다.</p>
                        <div className="flex justify-end gap-3">
                            <button className="px-4 py-2 bg-gray-600 hover:bg-gray-700 font-bold rounded-md" onClick={() => setShowResetModal(false)} disabled={isResetting}>
                                취소
                            </button>
                            <button className="px-4 py-2 bg-red-600 hover:bg-red-700 font-bold rounded-md" onClick={deleteCurrentWorld} disabled={isResetting}>
                                {isResetting ? '삭제 중...' : '완전 삭제'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <div className="w-full max-w-5xl bg-gray-800 rounded-lg shadow-xl p-6 md:p-8 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6">
                <div className="flex flex-col w-full lg:w-2/3 space-y-6">
                    {renderGameLog()}
                    <ChoicesDisplay />
                </div>
                {renderSidebar()}
            </div>
            <style>{` @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap'); body { font-family: 'Noto Sans KR', sans-serif; } .custom-scrollbar::-webkit-scrollbar { width: 8px; } .custom-scrollbar::-webkit-scrollbar-track { background: #4a5568; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #6b7280; border-radius: 10px; } .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; } `}</style>
        </div>
    );
}

export default App;
