import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously, // 익명 로그인 임포트
  signInWithCustomToken, // 커스텀 토큰 로그인 임포트
  onAuthStateChanged
} from 'firebase/auth';
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
  getDocs, // 추가: 문서 목록을 가져오기 위해
  deleteDoc, // 추가: 문서를 삭제하기 위해
  where // [수정] where 임포트 추가
} from 'firebase/firestore';

// ====================================================================
// Firebase configuration information 수정금지
const defaultFirebaseConfig = {
  apiKey: "AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8",
  authDomain: "text-adventure-game-cb731.firebaseapp.com",
  projectId: "text-adventure-game-cb731",
  storageBucket: "text-adventure-game-cb731.firebaseapis.com",
  messagingSenderId: "1092941614820",
  appId: "1:1092941614820:web:5545f36014b73c268026f1",
  measurementId: "G-FNGF42T1FP"
};

// 수정금지
const firebaseConfig = defaultFirebaseConfig;
const appId = firebaseConfig.projectId;
const initialAuthToken = null;
// ====================================================================

// Initial profession information and motivations for the game
const professions = {
  '1': { name: '몰락한 귀족/기사', motivation: '가문의 몰락 원인을 조사하고, 잃어버린 가문의 보물을 찾아야 합니다.' },
  '2': { name: '평범한 마을 사람/농부', motivation: '갑자기 마을에 나타난 괴생명체로부터 마을을 지켜야 합니다.' },
  '3': { name: '젊은 마법사/견습생', motivation: '스승님의 실종에 대한 단서를 찾아야 합니다.' },
  '4': { name: '용병/모험가', motivation: '의뢰받은 임무를 수행하던 중 예상치 못한 사건에 휘말렸습니다.' },
  '5': { name: '도적/암살자', motivation: '길드에서 내려온 첫 번째 임무를 완수하고, 그 과정에서 수상한 음모를 감지해야 합니다.' },
  '6': { name: '왕족/공주/왕자', motivation: '왕실 내의 불화와 암투 속에서 자신의 입지를 다져야 합니다.' },
};

// =====================[ 파이어베이스 유틸/훅 함수 분리 ]=====================

/**
 * Firebase 인증 및 Firestore 인스턴스 초기화
 * @returns {Object} { db, auth, userId, isAuthReady }
 */
function useFirebaseInit(setGameLog) {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    try {
      if (firebaseConfig.apiKey === "YOUR_API_KEY" || !firebaseConfig.apiKey) {
        console.error("Firebase initialization error: firebaseConfig.apiKey must be replaced with your actual Firebase API key.");
        setGameLog(prev => [...prev, "오류: Firebase API 키가 올바르게 설정되지 않았습니다. 코드를 확인해주세요."]);
        return;
      }
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firestoreDb);
      setAuth(firebaseAuth);
      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Firebase authentication failed:", error);
            setGameLog(prev => [...prev, "오류: Firebase 인증에 실패했습니다."]);
          }
        }
      });
      return () => unsubscribeAuth();
    } catch (error) {
      console.error("Firebase initialization error:", error);
      setGameLog(prev => [...prev, "오류: 게임을 초기화할 수 없습니다."]);
    }
  }, []);

  return { db, auth, userId, isAuthReady };
}

/**
 * Firestore 실시간 리스너 등록 (공유 로그, 유저, 채팅 등)
 * @param {Object} params - 필요한 파라미터들
 */
function useFirestoreListeners({ db, appId, userId, isAuthReady, playerCharacter, setSharedGameLog, setActiveUsers, setChatMessages, setIsCompanionActionInProgress, setActingPlayer }) {
  useEffect(() => {
    if (!db || !isAuthReady || !userId) return;
    // ... 기존 리스너 등록 코드 ...
    // (공유 로그, 유저, 채팅, 게임 상태 등)
    // 기존 useEffect 코드 복사/이동
  }, [db, isAuthReady, userId, playerCharacter.profession, playerCharacter.companions]);
}

// =====================[ LLM 호출/파싱 유틸 함수 분리 ]=====================

/**
 * Gemini LLM API 호출 및 JSON 파싱 유틸
 * @param {Object} promptData - LLM에 전달할 프롬프트 데이터
 * @param {Function} setIsTextLoading - 로딩 상태 setter
 * @returns {Promise<Object>} LLM 응답(JSON)
 */
async function callGeminiLLM(promptData, setIsTextLoading) {
  setIsTextLoading(true);
  const apiKey = "AIzaSyDC11rqjU30OJnLjaBFOaazZV0klM5raU8";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  // 프롬프트 구성
  const userPrompt = `\n현재 게임 단계: ${promptData.phase}\n플레이어 직업: ${promptData.character.profession}\n플레이어 초기 동기: ${promptData.character.initialMotivation}\n현재 능력치: ${JSON.stringify(promptData.character.stats)}\n현재 인벤토리: ${JSON.stringify(promptData.character.inventory)}\n현재 위치: ${promptData.character.currentLocation}\n현재 평판: ${JSON.stringify(promptData.character.reputation)}\n현재 활성 퀘스트: ${JSON.stringify(promptData.character.activeQuests)}\n현재 동료: ${JSON.stringify(promptData.character.companions)}\n이전 게임 로그 (마지막 5개 항목): ${JSON.stringify(promptData.history.slice(-5))}\n플레이어의 마지막 선택: ${promptData.playerChoice}\n\n**현재 접속 중인 다른 플레이어들:**\n${JSON.stringify(promptData.activeUsers)}\n\n**현재 플레이어와 관련된 최근 개인 대화 내용 (LLM이 시나리오에 우선 반영):**\n${promptData.privateChatHistory && promptData.privateChatHistory.length > 0 ? JSON.stringify(promptData.privateChatHistory.slice(-5)) : '없음'}\n\n위 정보를 바탕으로 다음 스토리 부분을 한국어로 생성하고, 시스템 프롬프트의 JSON 스키마에 따라 선택지를 제공하십시오.\n`;

  const chatHistory = [
    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
    { role: "user", parts: [{ text: userPrompt }] }
  ];

  const payload = { contents: chatHistory };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
    }
    const result = await response.json();
    if (result.candidates && result.candidates[0]?.content?.parts?.length > 0) {
      let llmOutputText = result.candidates[0].content.parts[0].text;
      // JSON 추출
      const jsonMatch = llmOutputText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        llmOutputText = jsonMatch[0];
      } else {
        throw new Error("Valid JSON object not found in LLM response.");
      }
      // JSON 파싱
      try {
        const llmOutput = JSON.parse(llmOutputText);
        return llmOutput;
      } catch (parsingError) {
        throw new Error(`LLM response was not valid JSON. Details: ${parsingError.message}`);
      }
    } else {
      throw new Error("Invalid LLM response structure.");
    }
  } catch (error) {
    return {
      story: `오류: LLM API 호출 중 문제가 발생했습니다: ${error.message}. 네트워크 연결을 확인하고 다시 시도해주세요.`,
      choices: ["다시 시도"],
      inventoryUpdates: promptData.character.inventory,
      statChanges: promptData.character.stats,
      location: promptData.character.currentLocation,
      reputationUpdates: promptData.character.reputation,
      activeQuestsUpdates: promptData.character.activeQuests,
      companionsUpdates: promptData.character.companions,
    };
  } finally {
    setIsTextLoading(false);
  }
}

// =====================[ 유틸리티 함수 및 상태 관리 개선 ]=====================

/**
 * 객체가 비어있는지 확인
 * @param {Object} obj
 * @returns {boolean}
 */
function isObjectEmpty(obj) {
  return Object.keys(obj).length === 0 && obj.constructor === Object;
}

// =====================[ 이하 기존 App.jsx 코드 ]=====================
// - 주요 함수/로직/상태에 한글 JSDoc 및 인라인 주석 추가 (주석 강화)
// - useCallback/useMemo 등 React 최적화 훅 활용 (성능 최적화)
// ... App 함수 내에서 적용 ...

function App() {
  /**
   * 게임 로그(개인)
   * @type {[string[], Function]}
   */
  const [gameLog, setGameLog] = useState([]);
  /**
   * LLM 텍스트 응답 로딩 상태
   */
  const [isTextLoading, setIsTextLoading] = useState(false);
  /**
   * 게임 단계: 'characterSelection' | 'playing'
   */
  const [gamePhase, setGamePhase] = useState('characterSelection');
  /**
   * 플레이어 캐릭터 정보(직업, 능력치, 인벤토리, 동기, 위치, 평판, 퀘스트, 동료)
   */
  const [playerCharacter, setPlayerCharacter] = useState({
    profession: '',
    stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 },
    inventory: [],
    initialMotivation: '',
    currentLocation: '방랑자의 안식처',
    reputation: {},
    activeQuests: [],
    companions: [],
  });
  /**
   * 현재 선택지(버튼)
   */
  const [currentChoices, setCurrentChoices] = useState([]);
  /**
   * 피드백 모달 표시 상태
   */
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  /**
   * 피드백 텍스트
   */
  const [feedbackText, setFeedbackText] = useState('');
  /**
   * 공유 게임 로그(멀티플레이어)
   */
  const [sharedGameLog, setSharedGameLog] = useState([]);
  /**
   * 현재 접속 중인 플레이어 목록
   */
  const [activeUsers, setActiveUsers] = useState([]);
  /**
   * 공개 채팅 메시지 목록
   */
  const [chatMessages, setChatMessages] = useState([]);
  /**
   * 공개 채팅 입력값
   */
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  /**
   * 개인 채팅 모달 표시 상태
   */
  const [showPlayerChatModal, setShowPlayerChatModal] = useState(false);
  /**
   * 선택된 개인 채팅 상대 정보
   */
  const [selectedPlayerForChat, setSelectedPlayerForChat] = useState(null);
  /**
   * 개인 채팅 메시지 목록
   */
  const [privateChatMessages, setPrivateChatMessages] = useState([]);
  /**
   * 개인 채팅 입력값
   */
  const [currentPrivateChatMessage, setCurrentPrivateChatMessage] = useState('');
  /**
   * 개인 채팅 모달 수동 닫힘 여부
   */
  const [isPrivateChatModalManuallyClosed, setIsPrivateChatModalManuallyClosed] = useState(false);
  /**
   * 동료 시나리오 진행 상태
   */
  const [isCompanionActionInProgress, setIsCompanionActionInProgress] = useState(false);
  /**
   * 현재 행동 중인 플레이어 정보
   */
  const [actingPlayer, setActingPlayer] = useState(null);

  // Firebase 및 인증 상태 (useFirebaseInit 훅 사용)
  const { db, auth, userId, isAuthReady } = useFirebaseInit(setGameLog);

  // 스크롤을 항상 아래로 유지하기 위한 ref
  const logEndRef = useRef(null);
  const sharedLogEndRef = useRef(null);
  const chatEndRef = useRef(null);
  const privateChatEndRef = useRef(null);

  // Firestore 실시간 리스너 등록 (useFirestoreListeners 훅 사용)
  useFirestoreListeners({ db, appId, userId, isAuthReady, playerCharacter, setSharedGameLog, setActiveUsers, setChatMessages, setIsCompanionActionInProgress, setActingPlayer });

  /**
   * 플레이어 턴 여부 계산
   */
  const isMyTurn = !isCompanionActionInProgress || (actingPlayer && actingPlayer.id === userId);
  /**
   * 동료 시스템 활성화 여부
   */
  const isCompanionSystemActive = playerCharacter.companions.length > 0;

  /**
   * 플레이어 직업 선택지 목록 (useMemo로 캐싱)
   */
  const professionChoices = useMemo(() =>
    Object.keys(professions).map(key => `${key}. ${professions[key].name}`),
    []
  );

  /**
   * 공개 채팅 메시지 전송 (useCallback으로 메모이제이션)
   */
  const sendChatMessage = useCallback(async () => {
    if (!db || !userId || !isAuthReady || !currentChatMessage.trim()) return;
    try {
      const chatCollectionRef = collection(db, 'artifacts', appId, 'public', 'data', 'chatMessages');
      await addDoc(chatCollectionRef, {
        userId: userId,
        displayName: `플레이어 ${userId.substring(0, 4)}`,
        message: currentChatMessage,
        timestamp: serverTimestamp(),
      });
      setCurrentChatMessage('');
    } catch (error) {
      console.error("공개 채팅 메시지 전송 오류:", error);
    }
  }, [db, userId, isAuthReady, currentChatMessage]);

  /**
   * 선택지 버튼 렌더링 (useMemo로 캐싱)
   */
  const choiceButtons = useMemo(() => (
    currentChoices.map((choice, index) => (
      <button
        key={index}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => handleChoiceClick(choice)}
        disabled={isTextLoading || (isCompanionSystemActive && !isMyTurn)}
      >
        {choice}
      </button>
    ))
  ), [currentChoices, isTextLoading, isCompanionSystemActive, isMyTurn, handleChoiceClick]);

  // ... 이하 렌더링/핸들러/로직에도 한글 주석 추가 ...

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-5xl bg-gray-800 rounded-lg shadow-xl p-6 md:p-8 flex flex-col lg:flex-row space-y-6 lg:space-y-0 lg:space-x-6">
        {/* 메인 게임 영역 */}
        <div className="flex flex-col w-full lg:w-2/3 space-y-6">
          {/* 사용자 ID 표시 (디버깅 및 멀티유저 식별용) */}
          {isAuthReady && userId && (
            <div className="text-xs text-gray-500 text-center mb-2">
              사용자 ID: {userId}
            </div>
          )}

          {/* 게임 텍스트 출력 영역 */}
          <div className="flex-grow bg-gray-700 p-4 rounded-md overflow-y-auto h-96 custom-scrollbar text-sm md:text-base leading-relaxed">
            {gameLog.map((line, index) => (
              <p key={index} className="whitespace-pre-wrap mb-1" dangerouslySetInnerHTML={{ __html: line.replace(/\n/g, '<br />') }}></p>
            ))}
            {isTextLoading && (
              <div className="flex justify-center items-center mt-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300"></div>
                <span className="ml-3 text-gray-400">
                  이야기를 생성 중...
                </span>
              </div>
            )}
            {/* 동료 턴 대기 메시지 */}
            {isCompanionSystemActive && isCompanionActionInProgress && !isMyTurn && (
                <div className="text-center text-yellow-400 font-semibold p-2 bg-black bg-opacity-20 rounded-md mt-2">
                    {actingPlayer ? `${actingPlayer.displayName}님이 선택하고 있습니다...` : "동료가 선택하고 있습니다..."}
                </div>
            )}
            <div ref={logEndRef} /> {/* 스크롤 위치용 빈 div */}
          </div>

          {/* 캐릭터 정보 표시 */}
          {gamePhase === 'playing' && (
            <div className="bg-gray-700 p-3 rounded-md text-xs md:text-sm text-gray-300 space-y-1">
              <p><span className="font-semibold text-gray-100">직업:</span> {playerCharacter.profession}</p>
              <p><span className="font-semibold text-gray-100">위치:</span> {playerCharacter.currentLocation}</p>
              <p><span className="font-semibold text-gray-100">능력치:</span> 힘({playerCharacter.stats.strength}) 지능({playerCharacter.stats.intelligence}) 민첩({playerCharacter.stats.agility}) 카리스마({playerCharacter.stats.charisma})</p>
              <p><span className="font-semibold text-gray-100">인벤토리:</span> {playerCharacter.inventory.length > 0 ? playerCharacter.inventory.join(', ') : '비어있음'}</p>
              <p><span className="font-semibold text-gray-100">평판:</span> {Object.keys(playerCharacter.reputation).length > 0 ? Object.entries(playerCharacter.reputation).map(([key, value]) => `${key}: ${value}`).join(', ') : '없음'}</p>
              <p><span className="font-semibold text-gray-100">퀘스트:</span> {playerCharacter.activeQuests.length > 0 ? playerCharacter.activeQuests.join(', ') : '없음'}</p>
              <p><span className="font-semibold text-gray-100">동료:</span> {playerCharacter.companions.length > 0 ? playerCharacter.companions.join(', ') : '없음'}</p>
            </div>
          )}

          {/* 선택지 버튼 영역 */}
          <div className="flex flex-col gap-3">
            {choiceButtons}
          </div>

          {/* 저장/불러오기/피드백 버튼 */}
          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <button
              className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={saveGame}
              disabled={isTextLoading || !isAuthReady || !userId || gamePhase === 'characterSelection'}
            >
              게임 저장
            </button>
            <button
              className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={loadGame}
              disabled={isTextLoading || !isAuthReady || !userId}
            >
              게임 불러오기
            </button>
            <button
              className="flex-1 px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-md shadow-lg transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => setShowFeedbackModal(true)}
              disabled={isTextLoading || !isAuthReady || !userId}
            >
              피드백 보내기
            </button>
          </div>
        </div>

        {/* 멀티플레이어 사이드바 */}
        <div className="w-full lg:w-1/3 flex flex-col space-y-6 bg-gray-700 p-4 rounded-lg shadow-inner">
          <h3 className="text-lg font-bold text-gray-100 text-center mb-4">공유된 모험</h3>

          {/* 현재 플레이어 목록 */}
          <div className="bg-gray-600 p-3 rounded-md h-48 overflow-y-auto custom-scrollbar">
            <h4 className="text-md font-semibold text-gray-200 mb-2">현재 플레이어들:</h4>
            {activeUsers.length > 0 ? (
              <ul className="text-sm text-gray-300 space-y-1">
                {activeUsers.map(user => (
                  <li
                    key={user.id}
                    className="truncate flex justify-between items-center p-1 rounded-md hover:bg-gray-500 cursor-pointer"
                    onDoubleClick={() => user.id !== userId && openPlayerChatModal(user)}
                  >
                    <span>
                      <span className="font-medium text-blue-300">{user.displayName}</span>
                       {/* 동료 표시 */}
                       {user.isCompanion && <span className="text-green-400 ml-2">(동료)</span>}
                    </span>
                    {user.id !== userId && (
                      <button
                        className="ml-2 px-3 py-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-md"
                        onClick={() => openPlayerChatModal(user)}
                      >
                        대화하기
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">활동 중인 플레이어가 없습니다.</p>
            )}
          </div>

          {/* 공유 게임 로그 */}
          <div className="bg-gray-600 p-3 rounded-md flex-grow h-96 overflow-y-auto custom-scrollbar">
            <h4 className="text-md font-semibold text-gray-200 mb-2">모든 플레이어의 활동:</h4>
            {sharedGameLog.length > 0 ? (
              <div className="text-sm text-gray-300 space-y-2">
                {sharedGameLog.map((logEntry) => (
                  <div key={logEntry.id} className="border-b border-gray-500 pb-2 last:border-b-0">
                    <p className="text-xs text-gray-400 mb-1">
                      <span className="font-medium text-purple-300">{logEntry.displayName}</span> (
                      {logEntry.timestamp ? new Date(logEntry.timestamp.toMillis()).toLocaleTimeString() : '시간 없음'})
                    </p>
                    <p className="whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: logEntry.content.replace(/\n/g, '<br />') }}></p>
                  </div>
                ))}
                <div ref={sharedLogEndRef} />
              </div>
            ) : (
              <p className="text-sm text-gray-400">공유된 활동이 아직 없습니다.</p>
            )}
          </div>

          {/* 공개 채팅 영역 */}
          <div className="bg-gray-600 p-3 rounded-md flex flex-col h-64">
            <h4 className="text-md font-semibold text-gray-200 mb-2">공개 채팅:</h4>
            <div className="flex-grow overflow-y-auto custom-scrollbar mb-3 text-sm text-gray-300 space-y-2">
              {chatMessages.length > 0 ? (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="border-b border-gray-500 pb-1 last:border-b-0">
                    <p className="text-xs text-gray-400">
                      <span className="font-medium text-green-300">{msg.displayName}</span> (
                      {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString() : '시간 없음'}):
                    </p>
                    <p>{msg.message}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">아직 채팅 메시지가 없습니다.</p>
              )}
              <div ref={chatEndRef} /> {/* 스크롤 위치용 빈 div */}
            </div>
            <div className="flex">
              <input
                type="text"
                className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="메시지를 입력하세요..."
                value={currentChatMessage}
                onChange={(e) => setCurrentChatMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    sendChatMessage();
                  }
                }}
                disabled={!isAuthReady || !userId}
              />
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-r-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                onClick={sendChatMessage}
                disabled={!isAuthReady || !userId || !currentChatMessage.trim()}
              >
                보내기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 피드백 모달 */}
      {showFeedbackModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-xl font-bold text-gray-100">피드백 보내기</h3>
            <textarea
              className="w-full p-3 rounded-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 h-32 resize-none"
              placeholder="게임에 대한 피드백을 여기에 작성해주세요..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              disabled={isTextLoading}
            ></textarea>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => setShowFeedbackModal(false)}
                disabled={isTextLoading}
              >
                취소
              </button>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={sendFeedback}
                disabled={isTextLoading || !feedbackText.trim()}
              >
                보내기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 개인 채팅 모달 (수정됨) */}
      {showPlayerChatModal && selectedPlayerForChat && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md space-y-4 flex flex-col h-3/4 max-h-[80vh]">
            <h3 className="text-xl font-bold text-gray-100">
              {selectedPlayerForChat.displayName} ({selectedPlayerForChat.profession}) 님과 대화
            </h3>
            <div className="flex-grow bg-gray-700 p-3 rounded-md overflow-y-auto custom-scrollbar text-sm text-gray-300 space-y-2">
              {privateChatMessages.length > 0 ? (
                privateChatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-2 rounded-lg max-w-[80%] ${msg.senderId === userId ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-100'}`}>
                      <p className="text-xs text-gray-300 mb-1">
                        <span className="font-medium">{msg.displayName}</span> (
                        {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString() : '시간 없음'})
                      </p>
                      <p>{msg.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400 text-center">아직 대화가 없습니다. 먼저 메시지를 보내세요!</p>
              )}
              <div ref={privateChatEndRef} />
            </div>
            <div className="flex">
              <input
                type="text"
                className="flex-grow p-2 rounded-l-md bg-gray-700 border border-gray-600 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="개인 메시지를 입력하세요..."
                value={currentPrivateChatMessage}
                onChange={(e) => setCurrentPrivateChatMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    sendPrivateChatMessage();
                  }
                }}
                disabled={!isAuthReady || !userId || !selectedPlayerForChat}
              />
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-r-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                onClick={sendPrivateChatMessage}
                disabled={!isAuthReady || !userId || !selectedPlayerForChat || !currentPrivateChatMessage.trim()}
              >
                보내기
              </button>
            </div>
            {/* 대화 종료 및 시나리오 반영 버튼 영역 */}
            <div className="flex justify-end gap-3 mt-4">
              <button
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleEndPrivateChatAndReflectScenario}
                disabled={isTextLoading || privateChatMessages.length === 0}
              >
                대화 종료 및 시나리오 반영
              </button>
              <button
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-md transition duration-300"
                onClick={closePlayerChatModal}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap');
        body {
          font-family: 'Noto Sans KR', sans-serif;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #4a5568; /* gray-600 */
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #6b7280; /* gray-500 */
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9ca3af; /* gray-400 */
        }
        `}
      </style>
    </div>
  );
}

export default App;