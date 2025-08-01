// ChoiceButtons.jsx - 선택지 버튼 컴포넌트
import React, { useState } from 'react';
import useGameStore from '../stores/gameStore';
import '../styles/ChoiceButtons.css';

/**
 * 선택지 버튼 컴포넌트
 * - AI가 제안한 선택지 표시
 * - 선택지 클릭 처리
 * - 선택 후 피드백 표시
 * - 모바일 친화적 터치 인터페이스
 */
const ChoiceButtons = ({ onChoiceSelect }) => {
  const { currentChoices, isWaitingForChoice, selectChoice, isLoading } = useGameStore();
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 선택지가 없거나 대기 중이 아니면 렌더링하지 않음
  if (!isWaitingForChoice || currentChoices.length === 0) {
    return null;
  }

  // 선택지 클릭 핸들러
  const handleChoiceClick = async (choice) => {
    if (isProcessing || isLoading) return;

    try {
      setIsProcessing(true);
      setSelectedChoiceId(choice.id);

      // 선택지 선택 처리
      const selectedChoice = selectChoice(choice.id);
      
      if (selectedChoice && onChoiceSelect) {
        // 부모 컴포넌트에 선택 결과 전달
        await onChoiceSelect(selectedChoice);
      }

    } catch (error) {
      console.error('선택지 처리 중 오류:', error);
    } finally {
      setIsProcessing(false);
      setSelectedChoiceId(null);
    }
  };

  // 선택지 아이콘 반환
  const getChoiceIcon = (choice) => {
    if (choice.type) {
      switch (choice.type) {
        case 'creative': return '🎨';
        case 'wisdom': return '🧠';
        case 'power': return '⚡';
        case 'compassion': return '❤️';
        case 'destruction': return '💥';
        case 'creation': return '✨';
        case 'exploration': return '🔍';
        case 'protection': return '🛡️';
        default: return '⭐';
      }
    }
    return '⭐';
  };

  // 선택지 효과 표시
  const getChoiceEffect = (choice) => {
    if (choice.effects && choice.effects.length > 0) {
      return choice.effects.map(effect => {
        if (effect.stat) {
          const sign = effect.value > 0 ? '+' : '';
          return `${effect.stat} ${sign}${effect.value}`;
        }
        return effect.description || '';
      }).join(', ');
    }
    return null;
  };

  return (
    <div className="choice-buttons-container">
      <div className="choice-header">
        <div className="choice-title">
          <span className="choice-icon">🤔</span>
          <h3>어떤 선택을 하시겠습니까?</h3>
        </div>
        <div className="choice-subtitle">
          선택에 따라 세계의 운명이 달라집니다
        </div>
      </div>

      <div className="choice-buttons">
        {currentChoices.map((choice, index) => (
          <button
            key={choice.id}
            className={`choice-button ${selectedChoiceId === choice.id ? 'selected' : ''} ${choice.type || 'default'}`}
            onClick={() => handleChoiceClick(choice)}
            disabled={isProcessing || isLoading}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="choice-content">
              <div className="choice-main">
                <span className="choice-emoji">
                  {getChoiceIcon(choice)}
                </span>
                <span className="choice-text">
                  {choice.text}
                </span>
              </div>
              
              {choice.description && (
                <div className="choice-description">
                  {choice.description}
                </div>
              )}
              
              {getChoiceEffect(choice) && (
                <div className="choice-effects">
                  <span className="effects-label">효과:</span>
                  <span className="effects-text">
                    {getChoiceEffect(choice)}
                  </span>
                </div>
              )}
            </div>

            {/* 선택 처리 중 로딩 */}
            {selectedChoiceId === choice.id && isProcessing && (
              <div className="choice-loading">
                <div className="choice-spinner"></div>
              </div>
            )}

            {/* 호버 효과 */}
            <div className="choice-hover-effect"></div>
          </button>
        ))}
      </div>

      {/* 선택 도움말 */}
      <div className="choice-help">
        <div className="help-icon">💡</div>
        <div className="help-text">
          각 선택지는 당신의 능력치와 세계에 다른 영향을 미칩니다. 신중하게 선택하세요!
        </div>
      </div>

      {/* 전체 로딩 오버레이 */}
      {isLoading && (
        <div className="choice-overlay">
          <div className="overlay-content">
            <div className="overlay-spinner"></div>
            <div className="overlay-text">선택을 처리하는 중...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChoiceButtons;
// ChoiceButtons.jsx 끝