import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc,
  updateDoc,
  onSnapshot,
  collection,
  addDoc,
  getDoc,
  arrayUnion,
  writeBatch,
  increment
} from 'firebase/firestore';

// START: Firebase and LLM Configuration
// [1-1] Firebase 연동 설정: Firebase 프로젝트의 구성 정보입니다.
const firebaseConfig = {
  apiKey: 'AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8',
  authDomain: 'text-adventure-game-cb731.firebaseapp.com',
  projectId: 'text-adventure-game-cb731',
  storageBucket: 'text-adventure-game-cb731.appspot.com',
  messagingSenderId: '1092941614820',
  appId: '1:1092941614820:web:5545f36014b73c268026f1',
  measurementId: 'G-FNGF42T1FP',
};

// [1-2] LLM API 호출 함수: Groq API를 사용하여 LLM과 통신합니다.
// 시스템 프롬프트에 'JSON'이 포함되어 있는지 여부에 따라 응답 형식을 동적으로 변경합니다.
const callGroqLlmApi = async (prompt, systemPrompt, model = "llama-3.1-405b-reasoning") => {
  // 주의: 실제 프로덕션 환경에서는 API 키를 클라이언트 코드에 노출하면 안 됩니다.
  const GROQ_API_KEY = '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';
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const isJsonRequest = systemPrompt.includes('JSON');
  const payload = {
    model,
    messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 1024,
    ...(isJsonRequest && { response_format: { type: 'json_object' } }),
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.error(`Groq API 호출 실패 (상태: ${response.status})`);
      return { error: `Groq API 호출 실패 (상태: ${response.status})` };
    }
    const result = await response.json();
    const llmOutputText = result.choices?.[0]?.message?.content || '{}';
    if (isJsonRequest) {
      try { return JSON.parse(llmOutputText); }
      catch (parseError) { return { error: "JSON 파싱 실패", content: llmOutputText }; }
    }
    return { content: llmOutputText };
  } catch (error) {
    console.error("Groq API 호출 중 오류:", error);
    return { error: `Groq API 호출 중 오류: ${error.message}` };
  }
};
// END: Firebase and LLM Configuration

// START: Game Data Definitions
// [2-1] 기술 트리 정의: 게임 내 연구 가능한 기술들의 정보입니다.
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

// [2-2] 초기 지도 데이터 정의: 게임 시작 시의 지도 상태입니다.
const initialMapData = {
  territories: {
    'T1': { id: 'T1', name: '에라시아 수도', owner: '에라시아', army: 100, isCapital: true, x: 100, y: 150, neighbors: ['T2', 'T4'] },
    'T2': { id: 'T2', name: '서부 해안', owner: '에라시아', army: 0, isCapital: false, x: 50, y: 100, neighbors: ['T1', 'T3'] },
    'T3': { id: 'T3', name: '북부 산맥', owner: null, army: 10, isCapital: false, x: 150, y: 50, neighbors: ['T2', 'T5'] },
    'T4': { id: 'T4', name: '중앙 평원', owner: null, army: 10, isCapital: false, x: 200, y: 150, neighbors: ['T1', 'T5', 'T6'] },
    'T5': { id: 'T5', name: '브라카다 수도', owner: '브라카다', army: 80, isCapital: true, x: 250, y: 100, neighbors: ['T3', 'T4'] },
    'T6': { id: 'T6', name: '아블리 수도', owner: '아블리', army: 150, isCapital: true, x: 250, y: 250, neighbors: ['T4'] },
  }
};

// [2-3] AI 보좌관 성향 정의: 각 보좌관의 기본 성격과 야망입니다.
const advisorPersonas = {
  '국방': { name: "국방부 장관", persona: "당신은 '매파'이며, 군사적 해결책을 선호합니다.", ambition: '군사력 극대화' },
  '재무': { name: "재무부 장관", persona: "당신은 신중한 '관료'이며, 경제적 안정성을 최우선으로 생각합니다.", ambition: '국고 최대화' },
  '외교': { name: "외교부 장관", persona: "당신은 '비둘기파'이며, 대화와 협상을 선호합니다.", ambition: '모든 국가와 동맹' },
  '정보': { name: "정보부 장관", persona: "당신은 '현실주의자'이며, 첩보와 공작을 선호합니다.", ambition: '정보망 장악' }
};
// END: Game Data Definitions

// START: MapView Component
// [3] MapView 컴포넌트: SVG를 사용한 지도 시각화
function MapView({ mapData, nations }) {
  const getColorForOwner = (owner) => {
    if (!owner) return '#cccccc';
    const colors = { '에라시아': '#ff6b6b', '브라카다': '#4ecdc4', '아블리': '#45b7d1' };
    return colors[owner] || '#cccccc';
  };

  return (
      <div style={{ border: '2px solid #333', borderRadius: '8px', padding: '10px', backgroundColor: '#f0f0f0' }}>
        <h3 style={{ textAlign: 'center', marginBottom: '10px' }}>세계 지도</h3>
        <svg width="350" height="300" style={{ border: '1px solid #999', backgroundColor: '#e8f4f8' }}>
          {/* 연결선 먼저 그리기 (영토 뒤에 표시되도록) */}
          {Object.values(mapData.territories).map(territory =>
              territory.neighbors.map(neighborId => {
                const neighbor = mapData.territories[neighborId];
                if (!neighbor || territory.id > neighborId) return null; // 중복 방지
                return (
                    <line
                        key={`${territory.id}-${neighborId}`}
                        x1={territory.x}
                        y1={territory.y}
                        x2={neighbor.x}
                        y2={neighbor.y}
                        stroke="#666"
                        strokeWidth="1"
                        strokeDasharray="3,3"
                    />
                );
              })
          )}

          {/* 영토 원형 그리기 */}
          {Object.values(mapData.territories).map(territory => (
              <g key={territory.id}>
                <circle
                    cx={territory.x}
                    cy={territory.y}
                    r="25"
                    fill={getColorForOwner(territory.owner)}
                    stroke="#333"
                    strokeWidth="2"
                />
                {territory.isCapital && (
                    <circle
                        cx={territory.x}
                        cy={territory.y}
                        r="30"
                        fill="none"
                        stroke="#ffd700"
                        strokeWidth="3"
                    />
                )}
                <text
                    x={territory.x}
                    y={territory.y - 35}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="bold"
                    fill="#333"
                >
                  {territory.name}
                </text>
                <text
                    x={territory.x}
                    y={territory.y + 5}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#000"
                >
                  {territory.army}
                </text>
              </g>
          ))}
        </svg>

        {/* 범례 */}
        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
          {Object.entries(nations).map(([name, nation]) => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div
                    style={{
                      width: '15px',
                      height: '15px',
                      backgroundColor: getColorForOwner(name),
                      border: '1px solid #333',
                      borderRadius: '50%'
                    }}
                />
                <span style={{ fontSize: '12px' }}>{name}</span>
              </div>
          ))}
        </div>
      </div>
  );
}
// Define PropTypes for MapView component
MapView.propTypes = {
  mapData: PropTypes.shape({
    territories: PropTypes.objectOf(PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      owner: PropTypes.string,
      army: PropTypes.number,
      isCapital: PropTypes.bool,
      x: PropTypes.number,
      y: PropTypes.number,
      neighbors: PropTypes.arrayOf(PropTypes.string)
    }))
  }).isRequired,
  nations: PropTypes.objectOf(PropTypes.object).isRequired
};

// END: MapView Component

// START: TurnControls Component
// [4] TurnControls 컴포넌트: 턴 진행 상태와 제어
function TurnControls({ gameData, currentPlayer, onEndTurn }) {
  const activePlayers = gameData.players.filter(p => p.status === 'playing');
  const readyPlayers = activePlayers.filter(p => p.isTurnReady);

  return (
      <div style={{ border: '2px solid #333', borderRadius: '8px', padding: '15px', marginBottom: '10px', backgroundColor: '#f9f9f9' }}>
        <h3>턴 {gameData.turn} 진행 상황</h3>
        <p>준비 완료: {readyPlayers.length}/{activePlayers.length} 플레이어</p>

        <div style={{ marginBottom: '10px' }}>
          {activePlayers.map(player => (
              <div key={player.uid} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px',
                backgroundColor: player.isTurnReady ? '#c8e6c9' : '#ffcdd2',
                marginBottom: '2px',
                borderRadius: '4px'
              }}>
                <span>{player.name} ({player.nation})</span>
                <span>{player.isTurnReady ? '✓ 준비 완료' : '대기 중...'}</span>
              </div>
          ))}
        </div>

        {currentPlayer && !currentPlayer.isTurnReady && (
            <button
                onClick={onEndTurn}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
            >
              턴 종료
            </button>
        )}
      </div>
  );
}
// Define PropTypes for TurnControls component
TurnControls.propTypes = {
  gameData: PropTypes.shape({
    turn: PropTypes.number.isRequired,
    players: PropTypes.arrayOf(PropTypes.shape({
      status: PropTypes.string,
      isTurnReady: PropTypes.bool
    })).isRequired
  }).isRequired,
  currentPlayer: PropTypes.shape({
    isTurnReady: PropTypes.bool
  }),
  onEndTurn: PropTypes.func.isRequired
};

// END: TurnControls Component

// START: Dashboard Component
// [5] Dashboard 컴포넌트: 국가 현황 표시
function Dashboard({ myNation, gameData }) {
  if (!myNation) return <div>국가를 선택해주세요.</div>;

  const territories = Object.values(gameData.map.territories).filter(t => t.owner === myNation.name);
  const totalArmy = territories.reduce((sum, t) => sum + t.army, 0);

  return (
      <div style={{ border: '2px solid #333', borderRadius: '8px', padding: '15px', marginBottom: '10px', backgroundColor: '#f0f8ff' }}>
        <h3>{myNation.name} 대시보드</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div>
            <strong>자원:</strong> {myNation.resources}
          </div>
          <div>
            <strong>안정도:</strong> {myNation.stability}%
          </div>
          <div>
            <strong>영토:</strong> {territories.length}개
          </div>
          <div>
            <strong>총 군사력:</strong> {totalArmy}
          </div>
        </div>

        <div style={{ marginTop: '10px' }}>
          <h4>보유 영토:</h4>
          {territories.map(territory => (
              <div key={territory.id} style={{
                fontSize: '12px',
                padding: '2px 5px',
                backgroundColor: territory.isCapital ? '#ffd700' : '#e0e0e0',
                margin: '2px 0',
                borderRadius: '3px'
              }}>
                {territory.name} ({territory.army} 군대) {territory.isCapital && '👑'}
              </div>
          ))}
        </div>
      </div>
  );
}
// Define PropTypes for Dashboard component
Dashboard.propTypes = {
  myNation: PropTypes.shape({
    name: PropTypes.string.isRequired,
    resources: PropTypes.number.isRequired,
    stability: PropTypes.number.isRequired
  }).isRequired,
  gameData: PropTypes.shape({
    map: PropTypes.shape({
      territories: PropTypes.objectOf(PropTypes.shape({
        owner: PropTypes.string,
        army: PropTypes.number
      }))
    }).isRequired
  }).isRequired
};

// END: Dashboard Component

// START: AdvisorView Component
// [6] AdvisorView 컴포넌트: AI 보좌관과의 상호작용
function AdvisorView({ db, gameData, myNation, user, onCommand }) {
  const [selectedAdvisor, setSelectedAdvisor] = useState('국방');
  const [userInput, setUserInput] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!myNation) return <div>국가를 선택해주세요.</div>;

  const myAdvisors = gameData.advisors[user.uid] || {};

  const handleSendCommand = async () => {
    if (!userInput.trim()) return;

    setIsLoading(true);
    setResponse('처리 중...');

    // AI 보좌관에게 명령 해석 요청
    const advisor = advisorPersonas[selectedAdvisor];
    const systemPrompt = `${advisor.persona} 당신의 야망은 "${advisor.ambition}"입니다. 
    사용자의 명령을 분석하고 다음 중 하나의 액션으로 변환하세요:
    1. attack: 영토 공격 (from, to 영토명 필요)
    2. build_military: 군사 훈련 (value: 숫자)
    3. research: 기술 연구 (tech_name: agriculture/engineering/espionage)
    4. move_troops: 부대 이동 (from, to 영토명, value: 이동할 병력 수)
    5. invalid: 잘못된 명령
    
    JSON 형식으로 응답: {"action": "액션명", "from": "출발영토", "to": "목표영토", "value": 숫자, "tech_name": "기술명", "explanation": "설명"}`;

    const territories = Object.values(gameData.map.territories)
        .filter(t => t.owner === myNation.name)
        .map(t => t.name);

    const userPrompt = `현재 보유 영토: ${territories.join(', ')}
    현재 자원: ${myNation.resources}
    사용자 명령: "${userInput}"`;

    const aiResponse = await callGroqLlmApi(userPrompt, systemPrompt);

    if (aiResponse.error) {
      setResponse('AI 보좌관과의 연결에 문제가 발생했습니다.');
    } else if (aiResponse.action === 'invalid') {
      setResponse(`${advisor.name}: ${aiResponse.explanation || '이해할 수 없는 명령입니다.'}`);
    } else {
      // 명령 실행
      const result = await onCommand(aiResponse);
      setResponse(`${advisor.name}: ${aiResponse.explanation || '명령을 처리했습니다.'}\n결과: ${result.message}`);
    }

    setIsLoading(false);
    setUserInput('');
  };

  return (
      <div style={{ border: '2px solid #333', borderRadius: '8px', padding: '15px', marginBottom: '10px', backgroundColor: '#fff5f5' }}>
        <h3>AI 보좌관</h3>

        {/* 보좌관 선택 */}
        <div style={{ marginBottom: '10px' }}>
          {Object.keys(advisorPersonas).map(advisorType => {
            const loyalty = myAdvisors[advisorType]?.loyalty || 50;
            return (
                <button
                    key={advisorType}
                    onClick={() => setSelectedAdvisor(advisorType)}
                    style={{
                      margin: '2px',
                      padding: '5px 10px',
                      backgroundColor: selectedAdvisor === advisorType ? '#4CAF50' : '#f0f0f0',
                      color: selectedAdvisor === advisorType ? 'white' : 'black',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                >
                  {advisorType} (충성도: {loyalty})
                </button>
            );
          })}
        </div>

        {/* 선택된 보좌관 정보 */}
        <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
          <strong>{advisorPersonas[selectedAdvisor].name}</strong>
          <br />
          <small style={{ color: '#666' }}>
            {advisorPersonas[selectedAdvisor].persona}
          </small>
        </div>

        {/* 명령 입력 */}
        <div style={{ marginBottom: '10px' }}>
          <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="명령을 입력하세요 (예: 북부 산맥을 공격해, 군대 50명 훈련, 농업 기술 연구)"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                marginBottom: '5px'
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleSendCommand()}
          />
          <button
              onClick={handleSendCommand}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#2196F3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
          >
            {isLoading ? '처리 중...' : '명령 전달'}
          </button>
        </div>

        {/* AI 응답 */}
        {response && (
            <div style={{
              padding: '10px',
              backgroundColor: '#e3f2fd',
              border: '1px solid #bbdefb',
              borderRadius: '4px',
              whiteSpace: 'pre-line',
              fontSize: '14px'
            }}>
              {response}
            </div>
        )}
      </div>
  );
}
// Define PropTypes for AdvisorView component
AdvisorView.propTypes = {
  db: PropTypes.object.isRequired,
  gameData: PropTypes.shape({
    advisors: PropTypes.objectOf(PropTypes.object),
    map: PropTypes.shape({
      territories: PropTypes.objectOf(PropTypes.shape({
        owner: PropTypes.string,
        name: PropTypes.string
      }))
    }).isRequired
  }).isRequired,
  myNation: PropTypes.shape({
    name: PropTypes.string.isRequired,
    resources: PropTypes.number.isRequired
  }),
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired,
  onCommand: PropTypes.func.isRequired
};

// END: AdvisorView Component

// START: DiplomacyView Component
// [7] DiplomacyView 컴포넌트: 외교 시스템
function DiplomacyView({ db, gameData, myNation }) {
  const [selectedTarget, setSelectedTarget] = useState('');
  const [proposalType, setProposalType] = useState('alliance');
  const [proposalText, setProposalText] = useState('');

  if (!myNation) return <div>국가를 선택해주세요.</div>;

  const otherNations = Object.keys(gameData.nations).filter(name =>
      name !== myNation.name && gameData.nations[name].status === 'active'
  );

  const handleSendProposal = async () => {
    if (!selectedTarget || !proposalText.trim()) return;

    const proposal = {
      from: myNation.name,
      to: selectedTarget,
      type: proposalType,
      text: proposalText,
      turn: gameData.turn,
      status: 'pending',
      id: Date.now().toString()
    };

    const gameRef = doc(db, 'games', gameData.id);
    await updateDoc(gameRef, {
      'diplomacy.proposals': arrayUnion(proposal),
      events: arrayUnion({
        turn: gameData.turn,
        type: 'diplomacy',
        content: `${myNation.name}이 ${selectedTarget}에게 ${proposalType === 'alliance' ? '동맹' : '무역'} 제안을 했습니다.`
      })
    });

    setProposalText('');
  };

  const handleRespondToProposal = async (proposal, accept) => {
    const gameRef = doc(db, 'games', gameData.id);
    const updatedProposals = gameData.diplomacy.proposals.map(p =>
        p.id === proposal.id ? { ...p, status: accept ? 'accepted' : 'rejected' } : p
    );

    let updates = {
      'diplomacy.proposals': updatedProposals,
      events: arrayUnion({
        turn: gameData.turn,
        type: 'diplomacy',
        content: `${myNation.name}이 ${proposal.from}의 ${proposal.type === 'alliance' ? '동맹' : '무역'} 제안을 ${accept ? '수락' : '거부'}했습니다.`
      })
    };

    if (accept) {
      const treaty = {
        nations: [proposal.from, proposal.to],
        type: proposal.type,
        turn: gameData.turn,
        id: Date.now().toString()
      };
      updates['diplomacy.treaties'] = arrayUnion(treaty);
      
      // 외교 기술 레벨에 따른 보너스 계산
      const fromNation = gameData.nations[proposal.from];
      const toNation = gameData.nations[proposal.to];
      const fromDiplomacyLevel = fromNation?.technologies?.diplomacy?.level || 0;
      const toDiplomacyLevel = toNation?.technologies?.diplomacy?.level || 0;
      
      // 양국의 외교 기술 레벨 평균에 따른 보너스 계산
      const avgDiplomacyLevel = (fromDiplomacyLevel + toDiplomacyLevel) / 2;
      const baseStabilityBonus = 5;
      const diplomacyBonus = avgDiplomacyLevel > 0 ? 
        Math.floor(avgDiplomacyLevel * techTree.diplomacy.stabilityBonusPerLevel) : 0;
      const totalStabilityBonus = baseStabilityBonus + diplomacyBonus;
      
      // 조약 유형별 추가 효과 적용
      if (proposal.type === 'trade') {
        // 무역 협정은 양국에 자원 보너스 제공
        const tradeBonus = 50 + (avgDiplomacyLevel * 10); // 외교 레벨당 10 자원 추가
        updates[`nations.${proposal.from}.resources`] = increment(tradeBonus);
        updates[`nations.${proposal.to}.resources`] = increment(tradeBonus);
        updates.events = arrayUnion({
          turn: gameData.turn,
          type: 'economy',
          content: `${proposal.from}과(와) ${proposal.to} 사이의 무역 협정으로 양국은 ${tradeBonus} 자원을 얻었습니다. (외교 기술 보너스: +${tradeBonus - 50})`
        });
      } else if (proposal.type === 'non_aggression') {
        // 불가침 조약은 안정도 증가
        updates[`nations.${proposal.from}.stability`] = increment(totalStabilityBonus);
        updates[`nations.${proposal.to}.stability`] = increment(totalStabilityBonus);
        updates.events = arrayUnion({
          turn: gameData.turn,
          type: 'diplomacy',
          content: `${proposal.from}과(와) ${proposal.to} 사이의 불가침 조약으로 양국의 안정도가 ${totalStabilityBonus} 증가했습니다. (외교 기술 보너스: +${diplomacyBonus})`
        });
      } else if (proposal.type === 'alliance') {
        // 동맹은 안정도와 군사력 증가
        updates[`nations.${proposal.from}.stability`] = increment(totalStabilityBonus);
        updates[`nations.${proposal.to}.stability`] = increment(totalStabilityBonus);
        
        // 수도에 소규모 군사력 증가
        const fromCapitalId = Object.values(gameData.map.territories)
          .find(t => t.owner === proposal.from && t.isCapital)?.id;
        const toCapitalId = Object.values(gameData.map.territories)
          .find(t => t.owner === proposal.to && t.isCapital)?.id;
          
        if (fromCapitalId) {
          updates[`map.territories.${fromCapitalId}.army`] = increment(10);
        }
        if (toCapitalId) {
          updates[`map.territories.${toCapitalId}.army`] = increment(10);
        }
        
        updates.events = arrayUnion({
          turn: gameData.turn,
          type: 'diplomacy',
          content: `${proposal.from}과(와) ${proposal.to} 사이의 동맹으로 양국의 안정도가 ${totalStabilityBonus} 증가하고 수도에 10명의 군대가 추가되었습니다.`
        });
      } else if (proposal.type === 'military_access') {
        // 군사 통행권은 작은 안정도 증가와 정보 공유
        updates[`nations.${proposal.from}.stability`] = increment(Math.floor(totalStabilityBonus / 2));
        updates[`nations.${proposal.to}.stability`] = increment(Math.floor(totalStabilityBonus / 2));
        
        updates.events = arrayUnion({
          turn: gameData.turn,
          type: 'diplomacy',
          content: `${proposal.from}과(와) ${proposal.to} 사이의 군사 통행권 협정이 체결되었습니다. 양국은 서로의 영토를 통과할 수 있게 되었습니다.`
        });
      }
    }

    await updateDoc(gameRef, updates);
  };

  const myProposals = gameData.diplomacy.proposals.filter(p => p.to === myNation.name && p.status === 'pending');
  const sentProposals = gameData.diplomacy.proposals.filter(p => p.from === myNation.name);
  const myTreaties = gameData.diplomacy.treaties.filter(t => t.nations.includes(myNation.name));

  return (
      <div style={{ border: '2px solid #333', borderRadius: '8px', padding: '15px', marginBottom: '10px', backgroundColor: '#f0fff0' }}>
        <h3>외교</h3>

        {/* 새 제안 보내기 */}
        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
          <h4>새 제안</h4>
          <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              style={{ width: '100%', marginBottom: '5px', padding: '5px' }}
          >
            <option value="">대상 선택</option>
            {otherNations.map(nation => (
                <option key={nation} value={nation}>{nation}</option>
            ))}
          </select>

          <select
              value={proposalType}
              onChange={(e) => setProposalType(e.target.value)}
              style={{ width: '100%', marginBottom: '5px', padding: '5px' }}
          >
            <option value="alliance">동맹 제안</option>
            <option value="trade">무역 협정</option>
            <option value="non_aggression">불가침 조약</option>
            <option value="military_access">군사 통행권</option>
          </select>

          <textarea
              value={proposalText}
              onChange={(e) => setProposalText(e.target.value)}
              placeholder="제안 내용을 입력하세요..."
              style={{ width: '100%', height: '60px', marginBottom: '5px', padding: '5px' }}
          />

          <button
              onClick={handleSendProposal}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
          >
            제안 보내기
          </button>
        </div>

        {/* 받은 제안 */}
        {myProposals.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <h4>받은 제안</h4>
              {myProposals.map(proposal => (
                  <div key={proposal.id} style={{
                    padding: '10px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    marginBottom: '5px',
                    backgroundColor: '#fff'
                  }}>
                    <strong>{proposal.from}</strong>의 {proposal.type === 'alliance' ? '동맹' : '무역'} 제안
                    <br />
                    <small>{proposal.text}</small>
                    <div style={{ marginTop: '5px' }}>
                      <button
                          onClick={() => handleRespondToProposal(proposal, true)}
                          style={{ marginRight: '5px', padding: '5px 10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px' }}
                      >
                        수락
                      </button>
                      <button
                          onClick={() => handleRespondToProposal(proposal, false)}
                          style={{ padding: '5px 10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px' }}
                      >
                        거부
                      </button>
                    </div>
                  </div>
              ))}
            </div>
        )}

        {/* 체결된 조약 */}
        {myTreaties.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <h4>체결된 조약</h4>
              {myTreaties.map(treaty => (
                  <div key={treaty.id} style={{
                    padding: '8px',
                    backgroundColor: '#e8f5e8',
                    border: '1px solid #4CAF50',
                    borderRadius: '4px',
                    marginBottom: '3px',
                    fontSize: '12px'
                  }}>
                    {treaty.nations.filter(n => n !== myNation.name).join(', ')}와의 {treaty.type === 'alliance' ? '동맹' : '무역협정'}
                  </div>
              ))}
            </div>
        )}

        {/* 보낸 제안들 */}
        {sentProposals.length > 0 && (
            <div>
              <h4>보낸 제안</h4>
              {sentProposals.map(proposal => (
                  <div key={proposal.id} style={{
                    padding: '5px',
                    fontSize: '12px',
                    color: '#666',
                    borderBottom: '1px solid #eee'
                  }}>
                    {proposal.to}에게: {proposal.type === 'alliance' ? '동맹' : '무역'} ({proposal.status})
                  </div>
              ))}
            </div>
        )}
      </div>
  );
}
// Define PropTypes for DiplomacyView component
DiplomacyView.propTypes = {
  db: PropTypes.object.isRequired,
  gameData: PropTypes.shape({
    id: PropTypes.string.isRequired,
    turn: PropTypes.number.isRequired,
    nations: PropTypes.objectOf(PropTypes.shape({
      status: PropTypes.string
    })).isRequired,
    diplomacy: PropTypes.shape({
      proposals: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        status: PropTypes.string,
        from: PropTypes.string,
        to: PropTypes.string,
        type: PropTypes.string
      })),
      treaties: PropTypes.arrayOf(PropTypes.shape({
        nations: PropTypes.arrayOf(PropTypes.string)
      }))
    }).isRequired,
    map: PropTypes.shape({
      territories: PropTypes.objectOf(PropTypes.shape({
        owner: PropTypes.string,
        isCapital: PropTypes.bool
      }))
    }).isRequired
  }).isRequired,
  myNation: PropTypes.shape({
    name: PropTypes.string.isRequired
  })
};

// END: DiplomacyView Component

// START: TechnologyView Component
// [8] TechnologyView 컴포넌트: 기술 트리 표시
function TechnologyView({ myNation }) {
  if (!myNation) return <div>국가를 선택해주세요.</div>;

  return (
      <div style={{ border: '2px solid #333', borderRadius: '8px', padding: '15px', marginBottom: '10px', backgroundColor: '#fff8dc' }}>
        <h3>기술 현황</h3>
        {Object.entries(techTree).map(([key, tech]) => {
          const currentLevel = myNation.technologies[key].level;
          const nextCost = tech.baseCost * (currentLevel + 1);

          return (
              <div key={key} style={{
                marginBottom: '10px',
                padding: '10px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                border: '1px solid #ddd'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                  {tech.name} (레벨 {currentLevel})
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '5px' }}>
                  {tech.description}
                </div>
                <div style={{ fontSize: '11px', color: '#888' }}>
                  다음 레벨 비용: {nextCost} 자원
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '4px',
                  marginTop: '5px'
                }}>
                  <div style={{
                    width: `${Math.min(100, (currentLevel / 5) * 100)}%`,
                    height: '100%',
                    backgroundColor: '#4CAF50',
                    borderRadius: '4px'
                  }} />
                </div>
              </div>
          );
        })}
      </div>
  );
}
// Define PropTypes for TechnologyView component
TechnologyView.propTypes = {
  myNation: PropTypes.shape({
    technologies: PropTypes.objectOf(PropTypes.shape({
      level: PropTypes.number.isRequired
    })).isRequired
  })
};

// END: TechnologyView Component

// START: EventLog Component
// [9] EventLog 컴포넌트: 게임 이벤트 히스토리
function EventLog({ events, user }) {
  const recentEvents = events.slice(-10).reverse(); // 최근 10개 이벤트만 표시

  return (
      <div style={{ border: '2px solid #333', borderRadius: '8px', padding: '15px', backgroundColor: '#f5f5f5' }}>
        <h3>이벤트 로그</h3>
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {recentEvents.map((event, index) => {
            // 비밀 이벤트는 해당 플레이어에게만 표시
            if (event.isPrivate && event.recipient !== user.uid) return null;

            const getEventColor = (type) => {
              const colors = {
                battle: '#ffebee',
                conquest: '#e8f5e8',
                elimination: '#fce4ec',
                diplomacy: '#e3f2fd',
                technology: '#f3e5f5',
                betrayal: '#fff3e0',
                production: '#e0f2f1',
                stability: '#fafafa'
              };
              return colors[type] || '#f9f9f9';
            };

            return (
                <div key={index} style={{
                  padding: '8px',
                  marginBottom: '5px',
                  backgroundColor: getEventColor(event.type),
                  borderLeft: `4px solid ${event.isPrivate ? '#ff9800' : '#2196F3'}`,
                  borderRadius: '4px',
                  fontSize: '12px'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                    턴 {event.turn} {event.isPrivate && '🔒'}
                  </div>
                  <div>{event.content}</div>
                </div>
            );
          })}
        </div>
      </div>
  );
}
// Define PropTypes for EventLog component
EventLog.propTypes = {
  events: PropTypes.arrayOf(PropTypes.shape({
    turn: PropTypes.number,
    type: PropTypes.string,
    content: PropTypes.string,
    isPrivate: PropTypes.bool,
    recipient: PropTypes.string
  })).isRequired,
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired
};

// END: EventLog Component

// START: Turn Processing Function
// [10] 턴 처리 함수: 모든 플레이어가 턴을 종료하면 실행되는 핵심 로직입니다.
const processTurn = async (db, gameData) => {
  const batch = writeBatch(db);
  const gameRef = doc(db, 'games', gameData.id);
  // 데이터의 안전한 처리를 위해 깊은 복사(deep copy) 사용
  let updatedMap = JSON.parse(JSON.stringify(gameData.map));
  let updatedNations = JSON.parse(JSON.stringify(gameData.nations));
  let updatedPlayers = JSON.parse(JSON.stringify(gameData.players));
  let updatedAdvisors = JSON.parse(JSON.stringify(gameData.advisors));
  let newEvents = [];

  // [10-1] 보좌관 배신 단계
  for (const player of updatedPlayers) {
    if (player.status !== 'playing') continue;
    const playerAdvisors = updatedAdvisors[player.uid];
    const playerNation = updatedNations[player.nation];
    for (const advisorType in playerAdvisors) {
      const advisor = playerAdvisors[advisorType];
      if (advisor.loyalty < 20 && Math.random() < 0.33) {
        const stolenResources = Math.floor(playerNation.resources * 0.1);
        playerNation.resources -= stolenResources;
        newEvents.push({
          turn: gameData.turn,
          type: 'betrayal',
          nation: player.nation,
          content: `[비밀 보고] ${advisorType} 장관의 횡령으로 자원 ${stolenResources}이 사라졌습니다!`,
          isPrivate: true,
          recipient: player.uid
        });
        newEvents.push({
          turn: gameData.turn,
          type: 'economy',
          nation: player.nation,
          content: `국고에서 원인 불명의 자원 손실이 발생했습니다.`
        });
      }
    }
  }

  // [10-2] 동적 이벤트 발생 단계
  if (Math.random() < 0.25) {
    const systemPrompt = `당신은 이 지정학 게임의 스토리텔러입니다. 현재 게임 상황을 바탕으로 흥미로운 무작위 이벤트를 생성하세요. 결과는 반드시 다음 JSON 형식이어야 합니다: {"title": "이벤트 제목", "description": "이벤트 설명", "effects": [{"nation": "국가명", "effect": "자원변경/안정도변경/군사력변경/기술발전", "value": 숫자, "tech_name": "기술명(기술발전인 경우만)"}]}. 효과는 게임에 참여중인 국가 중 하나 이상에 적용되어야 합니다.`;
    const userPrompt = `현재 게임 상태: ${JSON.stringify(gameData.nations)}`;
    const eventResult = await callGroqLlmApi(userPrompt, systemPrompt);
    if (eventResult && !eventResult.error && eventResult.effects) {
      newEvents.push({
        turn: gameData.turn,
        type: 'dynamic_event',
        content: `${eventResult.title}: ${eventResult.description}`
      });
      for (const effect of eventResult.effects) {
        if (updatedNations[effect.nation]) {
          if (effect.effect === '자원변경') {
            updatedNations[effect.nation].resources += effect.value;
          } else if (effect.effect === '안정도변경') {
            updatedNations[effect.nation].stability = Math.max(0, Math.min(100, updatedNations[effect.nation].stability + effect.value));
          } else if (effect.effect === '군사력변경') {
            // 군사력 변경은 수도에 적용
            const capitalId = Object.values(updatedMap.territories)
              .find(t => t.owner === effect.nation && t.isCapital)?.id;
            if (capitalId) {
              updatedMap.territories[capitalId].army = Math.max(0, updatedMap.territories[capitalId].army + effect.value);
            }
          } else if (effect.effect === '기술발전' && effect.tech_name && techTree[effect.tech_name]) {
            // 기술 레벨 향상
            const techKey = effect.tech_name;
            if (updatedNations[effect.nation].technologies[techKey]) {
              updatedNations[effect.nation].technologies[techKey].level += effect.value;
              newEvents.push({
                turn: gameData.turn,
                type: 'technology',
                nation: effect.nation,
                content: `${effect.nation}이(가) ${techTree[techKey].name} 기술에서 돌파구를 발견했습니다! (레벨 +${effect.value})`
              });
            }
          }
        }
      }
    }
  }

  // [10-3] 전투 단계
  const attackActions = gameData.pendingActions.filter(a => a.action === 'attack' && a.turn === gameData.turn);
  for (const action of attackActions) {
    const { fromId, toId } = action.details;
    const attackerTerritory = updatedMap.territories[fromId];
    const defenderTerritory = updatedMap.territories[toId];
    const attackerNation = action.fromNation;
    const defenderNation = defenderTerritory.owner;

    if (attackerTerritory.owner !== attackerNation || defenderTerritory.owner === attackerNation) continue;

    // 공학 기술 레벨에 따른 전투력 보너스 적용
    const attackerEngLevel = updatedNations[attackerNation]?.technologies?.engineering?.level || 0;
    const defenderEngLevel = defenderNation ? updatedNations[defenderNation]?.technologies?.engineering?.level || 0 : 0;
    
    const attackerBonus = attackerEngLevel * techTree.engineering.combatBonusPerLevel;
    const defenderBonus = defenderEngLevel * techTree.engineering.combatBonusPerLevel;
    
    const attackerPower = attackerTerritory.army * (1 + Math.random() * 0.2 + attackerBonus);
    const defenderPower = defenderTerritory.army * (1 + Math.random() * 0.2 + defenderBonus);
    const totalPower = attackerPower + defenderPower;
    const attackerLossRate = Math.min(1, (defenderPower / totalPower) * 1.2);
    const defenderLossRate = Math.min(1, (attackerPower / totalPower) * 1.2);
    const attackerLosses = Math.round(attackerTerritory.army * attackerLossRate);
    const defenderLosses = Math.round(defenderTerritory.army * defenderLossRate);

    attackerTerritory.army -= attackerLosses;
    defenderTerritory.army -= defenderLosses;
    newEvents.push({
      turn: gameData.turn,
      type: 'battle',
      content: `${attackerNation}의 ${attackerTerritory.name}가 ${defenderNation ? defenderNation + '의 ' : ''}${defenderTerritory.name}를 공격! 피해: (공격측: ${attackerLosses}, 수비측: ${defenderLosses})`
    });

    // 전투 결과에 따른 영토 점령 처리
    if (defenderTerritory.army <= 0) {
      defenderTerritory.owner = attackerNation;
      defenderTerritory.army = Math.max(1, attackerTerritory.army - attackerLosses);
      attackerTerritory.army = Math.max(0, attackerTerritory.army - attackerLosses);
      newEvents.push({
        turn: gameData.turn,
        type: 'conquest',
        content: `${attackerNation}이 ${defenderTerritory.name}을 점령했습니다!`
      });

      // 수도 점령 시 국가 멸망 처리
      if (defenderTerritory.isCapital && defenderNation) {
        updatedNations[defenderNation].status = 'eliminated';
        const eliminatedPlayer = updatedPlayers.find(p => p.nation === defenderNation);
        if (eliminatedPlayer) eliminatedPlayer.status = 'eliminated';
        newEvents.push({
          turn: gameData.turn,
          type: 'elimination',
          content: `${defenderNation}이 멸망했습니다! ${attackerNation}의 승리!`
        });
      }
    }
  }

  // [10-4] 자원 생산 단계
  for (const player of updatedPlayers) {
    if (player.status !== 'playing') continue;
    const nation = updatedNations[player.nation];
    const territories = Object.values(updatedMap.territories).filter(t => t.owner === player.nation);
    const agricultureLevel = nation.technologies.agriculture.level;
    
    // 향상된 농업 기술 효과 적용
    const baseProduction = territories.length * 50;
    const bonusRate = agricultureLevel * techTree.agriculture.effectPerLevel;
    const bonus = Math.floor(baseProduction * bonusRate);
    const totalProduction = baseProduction + bonus;
    
    nation.resources += totalProduction;
    newEvents.push({
      turn: gameData.turn,
      type: 'production',
      nation: player.nation,
      content: `자원 ${totalProduction} 생산 (기본: ${baseProduction}, 농업 보너스: ${bonus}, 농업 레벨: ${agricultureLevel})`
    });
  }

  // [10-5] 안정도 업데이트
  for (const player of updatedPlayers) {
    if (player.status !== 'playing') continue;
    const nation = updatedNations[player.nation];
    const playerAdvisors = updatedAdvisors[player.uid];

    // 낮은 충성도 보좌관으로 인한 안정도 감소
    let stabilityChange = 0;
    for (const advisorType in playerAdvisors) {
      if (playerAdvisors[advisorType].loyalty < 30) stabilityChange -= 2;
    }

    // 자원 부족으로 인한 안정도 감소
    if (nation.resources < 100) stabilityChange -= 5;

    nation.stability = Math.max(0, Math.min(100, nation.stability + stabilityChange));

    if (stabilityChange !== 0) {
      newEvents.push({
        turn: gameData.turn,
        type: 'stability',
        nation: player.nation,
        content: `안정도가 ${stabilityChange > 0 ? '+' : ''}${stabilityChange} 변화했습니다.`
      });
    }

    // 안정도가 0이 되면 국가 멸망
    if (nation.stability <= 0) {
      nation.status = 'eliminated';
      player.status = 'eliminated';
      newEvents.push({
        turn: gameData.turn,
        type: 'collapse',
        content: `${player.nation}이 내부 혼란으로 붕괴했습니다!`
      });
    }
  }

  // [10-6] 승리 조건 확인
  const activePlayers = updatedPlayers.filter(p => p.status === 'playing');
  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    newEvents.push({
      turn: gameData.turn,
      type: 'victory',
      content: `${winner.nation}이 최후의 승자가 되었습니다!`
    });

    // 게임 종료 상태 업데이트
    batch.update(gameRef, {
      status: 'finished',
      winner: winner.nation,
      players: updatedPlayers,
      nations: updatedNations,
      map: updatedMap,
      advisors: updatedAdvisors,
      events: [...gameData.events, ...newEvents],
      turn: gameData.turn + 1,
      pendingActions: []
    });
  } else {
    // 다음 턴 준비
    updatedPlayers.forEach(p => { p.isTurnReady = false; });

    batch.update(gameRef, {
      players: updatedPlayers,
      nations: updatedNations,
      map: updatedMap,
      advisors: updatedAdvisors,
      events: [...gameData.events, ...newEvents],
      turn: gameData.turn + 1,
      pendingActions: []
    });
  }

  await batch.commit();
};
// END: Turn Processing Function

// START: Main App Component
// [11] 최상위 컴포넌트: Firebase 초기화, 사용자 인증 및 게임 상태에 따른 화면 전환을 담당합니다.
function App() {
  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [gameId, setGameId] = useState(null);

  // 컴포넌트 마운트 시 Firebase 초기화 및 익명 로그인 처리
  useEffect(() => {
    const app = initializeApp(firebaseConfig);
    const authInstance = getAuth(app);
    const dbInstance = getFirestore(app);
    setDb(dbInstance);
    const unsubscribe = onAuthStateChanged(authInstance, (currentUser) => {
      if (currentUser) setUser(currentUser);
      else signInAnonymously(authInstance).catch(error => console.error("익명 로그인 실패:", error));
    });
    return () => unsubscribe();
  }, []);

  // 로딩 화면
  if (!user || !db) return <div style={{textAlign: 'center', paddingTop: '50px'}}>Loading...</div>;

  // 게임 ID 유무에 따라 로비 또는 게임방을 렌더링
  return (
      <div style={{ fontFamily: 'sans-serif', padding: '20px', maxWidth: '1400px', margin: 'auto' }}>
        <h1 style={{textAlign: 'center', color: '#333'}}>Council of Crowns (Final Version)</h1>
        <p style={{textAlign: 'center', color: '#666', marginBottom: '20px'}}>사용자 ID: {user.uid}</p>
        <hr />
        {gameId ? <GameRoom db={db} user={user} gameId={gameId} setGameId={setGameId} /> : <Lobby db={db} user={user} setGameId={setGameId} />}
      </div>
  );
}
// END: Main App Component

// START: Lobby Component
// [12] 로비 컴포넌트: 새 게임을 생성하거나 기존 게임에 참여하는 UI를 제공합니다.
function Lobby({ db, user, setGameId }) {
  const [newGameName, setNewGameName] = useState('');
  const [joinGameId, setJoinGameId] = useState('');
  const [error, setError] = useState('');

  // 새 게임 생성 핸들러
  const handleCreateGame = async () => {
    if (!newGameName.trim()) { setError('게임 이름을 입력해주세요.'); return; }
    setError('');
    try {
      // 게임에 필요한 모든 초기 데이터(기술, 국가, 보좌관, 지도 등)를 설정합니다.
      const initialTechs = Object.keys(techTree).reduce((acc, key) => ({...acc, [key]: { level: 0 }}), {});
      const nations = {
        '에라시아': { name: '에라시아', resources: 1000, stability: 75, owner: null, status: 'active', technologies: JSON.parse(JSON.stringify(initialTechs)) },
        '브라카다': { name: '브라카다', resources: 1200, stability: 80, owner: null, status: 'active', technologies: JSON.parse(JSON.stringify(initialTechs)) },
        '아블리': { name: '아블리', resources: 800, stability: 65, owner: null, status: 'active', technologies: JSON.parse(JSON.stringify(initialTechs)) },
      };
      const playerInfo = { uid: user.uid, name: `플레이어 ${user.uid.substring(0, 4)}`, nation: null, isTurnReady: false, status: 'playing' };
      const initialAdvisors = {};
      Object.keys(advisorPersonas).forEach(key => {
        initialAdvisors[key] = { loyalty: 50, ambition: advisorPersonas[key].ambition };
      });

      // Firestore에 새 게임 문서를 생성합니다.
      const newGameDoc = await addDoc(collection(db, 'games'), {
        name: newGameName, players: [playerInfo], nations: nations,
        advisors: { [user.uid]: initialAdvisors },
        map: JSON.parse(JSON.stringify(initialMapData)),
        status: 'waiting', turn: 1,
        events: [{ turn: 1, type: 'game_start', content: '새로운 역사가 시작됩니다.' }],
        diplomacy: { proposals: [], treaties: [], wars: [] },
        pendingActions: [], createdAt: new Date(),
      });
      setGameId(newGameDoc.id);
    } catch (e) { console.error("게임 생성 오류: ", e); setError('게임 생성에 실패했습니다.'); }
  };

  // 기존 게임 참여 핸들러
  const handleJoinGame = async () => {
    if (!joinGameId.trim()) { setError('참여할 게임 ID를 입력해주세요.'); return; }
    setError('');
    try {
      const gameRef = doc(db, 'games', joinGameId);
      const gameSnap = await getDoc(gameRef);
      if (gameSnap.exists()) {
        const gameData = gameSnap.data();
        // 이미 참여한 플레이어인지 확인
        if (gameData.players.some(p => p.uid === user.uid)) setGameId(joinGameId);
        else {
          // 새로운 플레이어 정보와 보좌관 정보를 추가
          const playerInfo = { uid: user.uid, name: `플레이어 ${user.uid.substring(0, 4)}`, nation: null, isTurnReady: false, status: 'playing' };
          const initialAdvisors = {};
          Object.keys(advisorPersonas).forEach(key => {
            initialAdvisors[key] = { loyalty: 50, ambition: advisorPersonas[key].ambition };
          });
          await updateDoc(gameRef, {
            players: arrayUnion(playerInfo),
            [`advisors.${user.uid}`]: initialAdvisors
          });
          setGameId(joinGameId);
        }
      } else setError('존재하지 않는 게임 ID입니다.');
    } catch (e) { console.error("게임 참여 오류: ", e); setError('게임 참여에 실패했습니다.'); }
  };

  return (
      <div>
        <h2 style={{textAlign: 'center'}}>게임 로비</h2>
        {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
        <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
          <h3>새 게임 만들기</h3>
          <input type="text" value={newGameName} onChange={(e) => setNewGameName(e.target.value)} placeholder="게임 이름" style={{ marginRight: '10px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          <button onClick={handleCreateGame} style={{ padding: '8px 15px', borderRadius: '4px', border: 'none', backgroundColor: '#4CAF50', color: 'white', cursor: 'pointer' }}>생성</button>
        </div>
        <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
          <h3>게임 참여하기</h3>
          <input type="text" value={joinGameId} onChange={(e) => setJoinGameId(e.target.value)} placeholder="게임 ID" style={{ marginRight: '10px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
          <button onClick={handleJoinGame} style={{ padding: '8px 15px', borderRadius: '4px', border: 'none', backgroundColor: '#008CBA', color: 'white', cursor: 'pointer' }}>참여</button>
        </div>
      </div>
  );
}
// Define PropTypes for Lobby component
Lobby.propTypes = {
  db: PropTypes.object.isRequired,
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired,
  setGameId: PropTypes.func.isRequired
};

// END: Lobby Component

// START: GameRoom Component
// [13] 게임방 컴포넌트: 실제 게임 플레이가 이루어지는 메인 컨테이너입니다.
function GameRoom({ db, user, gameId, setGameId }) {
  const [gameData, setGameData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Firestore의 게임 데이터를 실시간으로 구독하고, 턴 종료 조건을 확인합니다.
  useEffect(() => {
    const gameRef = doc(db, 'games', gameId);
    const unsubscribe = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() };
        setGameData(data);
        const activePlayers = data.players.filter(p => p.status === 'playing');
        const allPlayersReady = data.status === 'playing' && activePlayers.length > 0 && activePlayers.every(p => p.isTurnReady);
        const isMyPlayerHost = data.players[0]?.uid === user.uid; // 첫 번째 플레이어가 호스트 역할
        if (allPlayersReady && isMyPlayerHost) processTurn(db, data);
      } else { setGameId(null); }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db, gameId, setGameId, user.uid]);

  // 국가 선택 핸들러
  const handleSelectNation = async (nationName) => {
    if (!gameData) return;
    const playerIndex = gameData.players.findIndex(p => p.uid === user.uid);
    if (playerIndex === -1 || gameData.nations[nationName].owner) return;
    const batch = writeBatch(db);
    const gameRef = doc(db, 'games', gameId);
    const updatedPlayers = [...gameData.players];
    updatedPlayers[playerIndex].nation = nationName;
    const updatedNations = { ...gameData.nations, [nationName]: { ...gameData.nations[nationName], owner: user.uid } };
    batch.update(gameRef, { players: updatedPlayers, nations: updatedNations });
    await batch.commit();
  };

  // 게임 시작 핸들러
  const handleStartGame = async () => {
    if (gameData.players.every(p => p.nation)) await updateDoc(doc(db, 'games', gameId), { status: 'playing' });
    else alert('모든 플레이어가 국가를 선택해야 게임을 시작할 수 있습니다.');
  };

  // 턴 종료 핸들러
  const handleEndTurn = async () => {
    const playerIndex = gameData.players.findIndex(p => p.uid === user.uid);
    const updatedPlayers = [...gameData.players];
    updatedPlayers[playerIndex].isTurnReady = true;
    await updateDoc(doc(db, 'games', gameId), { players: updatedPlayers });
  };

  // AI 보좌관에게 내린 자연어 명령을 해석하고 실행하는 함수
  const executeCommand = async (command) => {
    // 기본 유효성 검사
    if (!command || typeof command !== 'object') {
      return { success: false, message: "명령을 처리할 수 없습니다. 다시 시도해주세요." };
    }
    
    const myNationName = gameData.players.find(p => p.uid === user.uid)?.nation;
    if (!myNationName) return { success: false, message: "국가를 선택하지 않았습니다." };
    
    // 게임 상태 확인
    if (gameData.status !== 'playing') {
      return { success: false, message: "게임이 아직 시작되지 않았거나 이미 종료되었습니다." };
    }
    
    // 턴 준비 상태 확인
    const currentPlayer = gameData.players.find(p => p.uid === user.uid);
    if (currentPlayer.isTurnReady) {
      return { success: false, message: "이미 턴을 종료했습니다. 다음 턴까지 기다려주세요." };
    }

    const gameRef = doc(db, 'games', gameId);
    let updates = {};
    let event = null;
    let loyaltyChange = {};

    // 공격 명령 처리
    if (command.action === 'attack') {
      const fromTerritory = Object.values(gameData.map.territories).find(t => t.name === command.from);
      const toTerritory = Object.values(gameData.map.territories).find(t => t.name === command.to);
      if (!fromTerritory || !toTerritory) return { success: false, message: "잘못된 영토 이름입니다." };
      if (fromTerritory.owner !== myNationName) return { success: false, message: "공격을 시작할 영토는 당신의 소유가 아닙니다." };
      if (fromTerritory.army <= 0) return { success: false, message: "공격에 사용할 군대가 없습니다." };
      if (!fromTerritory.neighbors.includes(toTerritory.id)) return { success: false, message: "인접하지 않은 영토는 공격할 수 없습니다."};
      if (toTerritory.owner === myNationName) return { success: false, message: "자신의 영토를 공격할 수 없습니다."};

      updates['pendingActions'] = arrayUnion({ fromNation: myNationName, action: 'attack', details: { fromId: fromTerritory.id, toId: toTerritory.id }, turn: gameData.turn });
      loyaltyChange = { '국방': 5, '외교': -5, '재무': -2 };
    }
    // 군사 훈련 명령 처리
    else if (command.action === 'build_military') {
      const engLevel = gameData.nations[myNationName].technologies.engineering.level;
      // 향상된 공학 기술 효과 적용
      const discount = 1 - (engLevel * techTree.engineering.discountPerLevel);
      const baseCost = command.value * 10;
      const cost = Math.round(baseCost * discount);
      const savings = baseCost - cost;
      
      if (gameData.nations[myNationName].resources < cost) return { 
        success: false, 
        message: `자원이 부족합니다. (필요: ${cost}, 보유: ${gameData.nations[myNationName].resources})` 
      };

      const capitalId = Object.values(gameData.map.territories).find(t => t.owner === myNationName && t.isCapital)?.id;
      if(!capitalId) return { success: false, message: "수도가 없어 군대를 훈련할 수 없습니다." };

      updates[`map.territories.${capitalId}.army`] = increment(command.value);
      updates[`nations.${myNationName}.resources`] = increment(-cost);
      
      // 이벤트 메시지에 공학 기술 할인 정보 추가
      let eventMessage = `수도에서 군사 유닛 ${command.value}개를 훈련했습니다.`;
      if (savings > 0) {
        eventMessage += ` (공학 기술 할인: ${savings} 자원 절약)`;
      }
      
      event = { 
        turn: gameData.turn, 
        type: 'military', 
        nation: myNationName, 
        content: eventMessage
      };
      
      loyaltyChange = { '국방': 3, '재무': -1 };
    }
    // 기술 연구 명령 처리
    else if (command.action === 'research') {
      const techKey = command.tech_name;
      const tech = techTree[techKey];
      if (!tech) return { success: false, message: "존재하지 않는 기술입니다." };
      const currentLevel = gameData.nations[myNationName].technologies[techKey].level;
      const cost = tech.baseCost * (currentLevel + 1);
      if (gameData.nations[myNationName].resources < cost) return { success: false, message: `연구 자금이 부족합니다. (필요: ${cost})` };

      updates[`nations.${myNationName}.resources`] = increment(-cost);
      updates[`nations.${myNationName}.technologies.${techKey}.level`] = increment(1);
      event = { turn: gameData.turn, type: 'technology', nation: myNationName, content: `'${tech.name}' 기술 연구를 완료했습니다! (레벨 ${currentLevel + 1})` };
      loyaltyChange = { '재무': 5, '국방': 1, '정보': 1 };
    }
    // 부대 이동 명령 처리
    else if (command.action === 'move_troops') {
      const fromTerritory = Object.values(gameData.map.territories).find(t => t.name === command.from);
      const toTerritory = Object.values(gameData.map.territories).find(t => t.name === command.to);
      
      // 유효성 검사
      if (!fromTerritory || !toTerritory) return { success: false, message: "잘못된 영토 이름입니다." };
      if (fromTerritory.owner !== myNationName) return { success: false, message: "출발 영토는 당신의 소유가 아닙니다." };
      if (toTerritory.owner !== myNationName) return { success: false, message: "도착 영토는 당신의 소유가 아닙니다." };
      if (!fromTerritory.neighbors.includes(toTerritory.id)) return { success: false, message: "인접하지 않은 영토로는 이동할 수 없습니다."};
      
      const troopsToMove = Math.min(fromTerritory.army - 1, command.value); // 최소 1개 부대는 남겨둠
      if (troopsToMove <= 0) return { success: false, message: "이동할 수 있는 부대가 없습니다. 최소 1개 부대는 영토에 남겨두어야 합니다." };
      
      // 부대 이동 처리
      updates[`map.territories.${fromTerritory.id}.army`] = increment(-troopsToMove);
      updates[`map.territories.${toTerritory.id}.army`] = increment(troopsToMove);
      event = { 
        turn: gameData.turn, 
        type: 'troop_movement', 
        nation: myNationName, 
        content: `${fromTerritory.name}에서 ${toTerritory.name}으로 ${troopsToMove}개 부대를 이동했습니다.` 
      };
      loyaltyChange = { '국방': 2, '정보': 1 };
    }

    // 보좌관 충성도 변경 적용
    if (Object.keys(loyaltyChange).length > 0) {
      for (const advisor in loyaltyChange) {
        updates[`advisors.${user.uid}.${advisor}.loyalty`] = increment(loyaltyChange[advisor]);
      }
    }
    // 이벤트 로그 추가
    if (event) updates['events'] = arrayUnion(event);

    try {
      // Firestore에 모든 변경사항을 한 번에 업데이트
      await updateDoc(gameRef, updates);
      return { success: true, message: `명령이 접수되었습니다.` };
    } catch (error) {
      console.error("Firestore 업데이트 중 오류 발생:", error);
      return { success: false, message: "명령을 처리하는 중 오류가 발생했습니다. 다시 시도해주세요." };
    }
  };

  if (loading) return <div style={{textAlign: 'center', paddingTop: '50px'}}>게임 데이터를 불러오는 중...</div>;
  if (!gameData) return <div style={{textAlign: 'center', paddingTop: '50px'}}>게임이 존재하지 않습니다. 로비로 돌아가주세요.</div>;

  const currentPlayer = gameData.players.find(p => p.uid === user.uid);
  const myNation = currentPlayer ? gameData.nations[currentPlayer.nation] : null;

  // 게임 오버 또는 승리 화면
  if (currentPlayer && currentPlayer.status === 'eliminated') return <div style={{textAlign: 'center', paddingTop: '50px'}}><h2>당신은 패배했습니다.</h2><p>당신의 국가는 역사 속으로 사라졌습니다.</p><button onClick={() => setGameId(null)}>로비로 돌아가기</button></div>;
  if (gameData.status === 'finished') return <div style={{textAlign: 'center', paddingTop: '50px'}}><h2>게임 종료!</h2><p>최후의 승자는 {gameData.winner} 입니다!</p><button onClick={() => setGameId(null)}>로비로 돌아가기</button></div>;

  return (
      <div>
        <h2 style={{textAlign: 'center'}}>게임방: {gameData.name} (ID: {gameData.id})</h2>
        <hr/>
        {gameData.status === 'waiting' ? (
            // 게임 대기 중 UI
            <div>
              <h3>참여 플레이어</h3>
              <ul>{gameData.players.map(p => <li key={p.uid}>{p.name} ({p.uid.substring(0, 4)}) - 국가: {p.nation || '선택 안 함'}</li>)}</ul>
              <hr/>
              <h3>국가 선택</h3>
              {!currentPlayer.nation ? (
                  <div>{Object.values(gameData.nations).filter(n => !n.owner).map(nation => <button key={nation.name} onClick={() => handleSelectNation(nation.name)} style={{margin: '5px', padding: '10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>{nation.name} 선택</button>)}</div>
              ) : (<p>당신은 <strong>{myNation.name}</strong>을(를) 선택했습니다. 다른 플레이어를 기다려주세요.</p>)}
              <hr/>
              <button onClick={handleStartGame} style={{padding: '10px 20px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>게임 시작</button>
            </div>
        ) : (
            // 게임 플레이 중 UI
            <div style={{display: 'flex', gap: '20px'}}>
              <div style={{flex: 3}}>
                <MapView mapData={gameData.map} nations={gameData.nations} />
              </div>
              <div style={{flex: 2}}>
                <TurnControls gameData={gameData} currentPlayer={currentPlayer} onEndTurn={handleEndTurn} />
                <Dashboard myNation={myNation} gameData={gameData} />
                <AdvisorView db={db} gameData={gameData} myNation={myNation} user={user} onCommand={executeCommand} />
                <DiplomacyView db={db} gameData={gameData} myNation={myNation} />
              </div>
              <div style={{flex: 1}}>
                <TechnologyView myNation={myNation} />
                <EventLog events={gameData.events} user={user} />
              </div>
            </div>
        )}
        <hr/>
        <button onClick={() => setGameId(null)} style={{marginTop: '20px', padding: '8px 15px', backgroundColor: '#666', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>로비로 돌아가기</button>
      </div>
  );
}
// Define PropTypes for GameRoom component
GameRoom.propTypes = {
  db: PropTypes.object.isRequired,
  user: PropTypes.shape({
    uid: PropTypes.string.isRequired
  }).isRequired,
  gameId: PropTypes.string.isRequired,
  setGameId: PropTypes.func.isRequired
};

// END: GameRoom Component

export default App;