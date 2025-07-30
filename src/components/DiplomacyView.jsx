import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { doc, updateDoc, arrayUnion, increment } from 'firebase/firestore';
import { useResponsive } from '../hooks';
import { techTree } from '../data';

/**
 * DiplomacyView.jsx - 외교 시스템 컴포넌트
 * 
 * 다른 국가와의 외교 제안 송수신, 조약 체결 및 관리를 담당합니다.
 * 모바일 환경에서도 잘 작동하도록 반응형으로 설계되었습니다.
 */
function DiplomacyView({ db, gameData, myNation }) {
  const { isMinWidth } = useResponsive();
  const [selectedTarget, setSelectedTarget] = useState('');
  const [proposalType, setProposalType] = useState('alliance');
  const [proposalText, setProposalText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!myNation) {
    return (
      <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4 text-center text-gray-300">
        국가를 선택해주세요.
      </div>
    );
  }

  // 외교 가능한 다른 국가들 필터링
  const otherNations = Object.keys(gameData.nations).filter(name =>
    name !== myNation.name && gameData.nations[name].status === 'active'
  );

  // 제안 유형에 따른 아이콘 및 설명
  const proposalTypeInfo = {
    'alliance': { 
      icon: '🤝', 
      title: '동맹 제안', 
      description: '양국은 서로를 지원하며, 안정도가 증가하고 수도에 군대가 추가됩니다.' 
    },
    'trade': { 
      icon: '💰', 
      title: '무역 협정', 
      description: '양국은 즉시 자원을 얻고, 외교 기술 레벨에 따라 추가 보너스를 받습니다.' 
    },
    'non_aggression': { 
      icon: '🕊️', 
      title: '불가침 조약', 
      description: '양국은 서로를 공격하지 않기로 약속하며, 안정도가 증가합니다.' 
    },
    'military_access': { 
      icon: '🚶', 
      title: '군사 통행권', 
      description: '양국은 서로의 영토를 통과할 수 있으며, 소량의 안정도가 증가합니다.' 
    }
  };

  /**
   * 외교 제안 전송 핸들러
   */
  const handleSendProposal = async () => {
    if (!selectedTarget || !proposalText.trim()) return;
    
    setIsSubmitting(true);
    
    try {
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
          content: `${myNation.name}이 ${selectedTarget}에게 ${proposalTypeInfo[proposalType].title}을 했습니다.`
        })
      });

      setProposalText('');
      setIsSubmitting(false);
    } catch (error) {
      console.error("제안 전송 중 오류:", error);
      setIsSubmitting(false);
    }
  };

  /**
   * 제안 응답 핸들러
   * @param {Object} proposal - 응답할 제안 객체
   * @param {boolean} accept - 수락 여부
   */
  const handleRespondToProposal = async (proposal, accept) => {
    setIsSubmitting(true);
    
    try {
      const gameRef = doc(db, 'games', gameData.id);
      const updatedProposals = gameData.diplomacy.proposals.map(p =>
        p.id === proposal.id ? { ...p, status: accept ? 'accepted' : 'rejected' } : p
      );

      let updates = {
        'diplomacy.proposals': updatedProposals,
        events: arrayUnion({
          turn: gameData.turn,
          type: 'diplomacy',
          content: `${myNation.name}이 ${proposal.from}의 ${proposalTypeInfo[proposal.type].title}을 ${accept ? '수락' : '거부'}했습니다.`
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
      setIsSubmitting(false);
    } catch (error) {
      console.error("제안 응답 중 오류:", error);
      setIsSubmitting(false);
    }
  };

  // 내게 온 제안, 보낸 제안, 체결된 조약 필터링
  const myProposals = gameData.diplomacy.proposals.filter(p => p.to === myNation.name && p.status === 'pending');
  const sentProposals = gameData.diplomacy.proposals.filter(p => p.from === myNation.name);
  const myTreaties = gameData.diplomacy.treaties.filter(t => t.nations.includes(myNation.name));

  return (
    <div className="border-2 border-gray-700 rounded-lg p-4 bg-gray-800 shadow-lg mb-4">
      <h3 className="text-xl font-bold text-white mb-4">외교</h3>
      
      {/* 새 제안 보내기 */}
      <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 mb-6">
        <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
          </svg>
          새 제안
        </h4>
        
        <div className="space-y-3">
          <div>
            <label className="block text-gray-300 text-sm mb-1">대상 국가</label>
            <select
              value={selectedTarget}
              onChange={(e) => setSelectedTarget(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 text-white"
              disabled={isSubmitting}
            >
              <option value="">대상 선택</option>
              {otherNations.map(nation => (
                <option key={nation} value={nation}>{nation}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-gray-300 text-sm mb-1">제안 유형</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(proposalTypeInfo).map(([type, info]) => (
                <button
                  key={type}
                  onClick={() => setProposalType(type)}
                  className={`p-2 rounded-md flex items-center justify-center transition-colors ${
                    proposalType === type
                      ? 'bg-blue-700 text-white border border-blue-500'
                      : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
                  }`}
                  disabled={isSubmitting}
                >
                  <span className="mr-2">{info.icon}</span>
                  <span>{info.title}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-gray-400">
              {proposalTypeInfo[proposalType].description}
            </p>
          </div>
          
          <div>
            <label className="block text-gray-300 text-sm mb-1">제안 내용</label>
            <textarea
              value={proposalText}
              onChange={(e) => setProposalText(e.target.value)}
              placeholder="제안 내용을 입력하세요..."
              className="w-full bg-gray-800 border border-gray-600 rounded-md p-2 text-white h-20 resize-none"
              disabled={isSubmitting}
            />
          </div>
          
          <button
            onClick={handleSendProposal}
            disabled={!selectedTarget || !proposalText.trim() || isSubmitting}
            className={`w-full py-2 rounded-md font-semibold transition-colors ${
              !selectedTarget || !proposalText.trim() || isSubmitting
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                제안 전송 중...
              </span>
            ) : '제안 보내기'}
          </button>
        </div>
      </div>
      
      {/* 받은 제안 */}
      {myProposals.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
            </svg>
            받은 제안
          </h4>
          
          <div className="space-y-3">
            {myProposals.map(proposal => (
              <div 
                key={proposal.id} 
                className="bg-gray-700/50 rounded-lg p-3 border border-gray-600"
              >
                <div className="flex items-center mb-2">
                  <span className="text-xl mr-2">{proposalTypeInfo[proposal.type].icon}</span>
                  <div>
                    <div className="text-white font-medium">
                      {proposal.from}의 {proposalTypeInfo[proposal.type].title}
                    </div>
                    <div className="text-sm text-gray-400">
                      턴 {proposal.turn}에 제안됨
                    </div>
                  </div>
                </div>
                
                <p className="text-gray-300 text-sm mb-3 border-l-2 border-gray-500 pl-2 italic">
                  &ldquo;{proposal.text}&rdquo;
                </p>
                
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleRespondToProposal(proposal, true)}
                    disabled={isSubmitting}
                    className={`flex-1 py-1 rounded-md font-medium text-sm transition-colors ${
                      isSubmitting
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    수락
                  </button>
                  <button
                    onClick={() => handleRespondToProposal(proposal, false)}
                    disabled={isSubmitting}
                    className={`flex-1 py-1 rounded-md font-medium text-sm transition-colors ${
                      isSubmitting
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    거부
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 체결된 조약 */}
      {myTreaties.length > 0 && (
        <div className="mb-6">
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            체결된 조약
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myTreaties.map(treaty => {
              const partnerNation = treaty.nations.find(n => n !== myNation.name);
              const treatyInfo = proposalTypeInfo[treaty.type];
              
              return (
                <div 
                  key={treaty.id} 
                  className="bg-gray-700/50 rounded-lg p-3 border border-green-800"
                >
                  <div className="flex items-center">
                    <span className="text-xl mr-2">{treatyInfo.icon}</span>
                    <div>
                      <div className="text-white font-medium">
                        {partnerNation}와의 {treatyInfo.title}
                      </div>
                      <div className="text-xs text-gray-400">
                        턴 {treaty.turn}에 체결됨
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* 보낸 제안 */}
      {sentProposals.length > 0 && (
        <div>
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
            보낸 제안
          </h4>
          
          <div className="space-y-1">
            {sentProposals.map(proposal => {
              let statusColor = 'bg-yellow-700';
              let statusText = '대기 중';
              
              if (proposal.status === 'accepted') {
                statusColor = 'bg-green-700';
                statusText = '수락됨';
              } else if (proposal.status === 'rejected') {
                statusColor = 'bg-red-700';
                statusText = '거부됨';
              }
              
              return (
                <div 
                  key={proposal.id} 
                  className="flex justify-between items-center p-2 bg-gray-700/30 rounded-md"
                >
                  <div className="flex items-center">
                    <span className="text-lg mr-2">{proposalTypeInfo[proposal.type].icon}</span>
                    <span className="text-gray-300 text-sm">
                      {proposal.to}에게: {proposalTypeInfo[proposal.type].title}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full text-white ${statusColor}`}>
                    {statusText}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {/* 빈 상태 표시 */}
      {otherNations.length === 0 && (
        <div className="text-center py-6 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>외교 관계를 맺을 수 있는 국가가 없습니다.</p>
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
      status: PropTypes.string,
      technologies: PropTypes.objectOf(PropTypes.shape({
        level: PropTypes.number
      }))
    })).isRequired,
    diplomacy: PropTypes.shape({
      proposals: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        status: PropTypes.string,
        from: PropTypes.string,
        to: PropTypes.string,
        type: PropTypes.string,
        text: PropTypes.string,
        turn: PropTypes.number
      })),
      treaties: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        nations: PropTypes.arrayOf(PropTypes.string),
        type: PropTypes.string,
        turn: PropTypes.number
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

export default DiplomacyView;