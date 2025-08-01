// ChatInterface.jsx - 채팅 인터페이스 컴포넌트
import React, { useEffect, useRef, useState } from 'react';
import useGameStore from '../stores/gameStore';
import '../styles/ChatInterface.css';

/**
 * 채팅 인터페이스 컴포넌트
 * - 게임 메시지 표시
 * - 선택지 표시 (채팅 내부)
 * - 자동 스크롤 관리
 * - 메시지 타입별 스타일링
 * - 모바일 친화적 디자인
 */
const ChatInterface = ({ onChoiceSelect }) => {
  const { 
    messages, 
    isLoading, 
    currentChoices, 
    isWaitingForChoice, 
    selectChoice 
  } = useGameStore();
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 새 메시지가 추가될 때 자동 스크롤
  useEffect(() => {
    scrollToBottom();
  }, [messages, currentChoices]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  };

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
        case 'creation': return '✨';
        case 'wisdom': return '🧠';
        case 'power': return '⚡';
        case 'compassion': return '❤️';
        case 'destruction': return '💥';
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

  // 메시지 타입별 아이콘 반환
  const getMessageIcon = (type, sender) => {
    switch (type) {
      case 'system':
        return '🌌';
      case 'gm':
        return '🎭';
      case 'player':
        return '👤';
      case 'choice':
        return '⚡';
      case 'achievement':
        return '🏆';
      case 'error':
        return '⚠️';
      default:
        return sender === 'GM' ? '🎭' : '👤';
    }
  };

  // 메시지 타입별 CSS 클래스 반환
  const getMessageClass = (type, sender) => {
    const baseClass = 'chat-message';
    
    if (type === 'system') return `${baseClass} system-message`;
    if (type === 'player' || sender === 'Player') return `${baseClass} player-message`;
    if (type === 'gm' || sender === 'GM') return `${baseClass} gm-message`;
    if (type === 'achievement') return `${baseClass} achievement-message`;
    if (type === 'error') return `${baseClass} error-message`;
    
    return `${baseClass} default-message`;
  };

  // 시간 포맷팅
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 메시지 내용 렌더링 (마크다운 스타일 지원)
  const renderMessageContent = (content) => {
    // 간단한 마크다운 스타일 지원
    let formattedContent = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold**
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // *italic*
      .replace(/`(.*?)`/g, '<code>$1</code>'); // `code`

    return (
      <div 
        className="message-content"
        dangerouslySetInnerHTML={{ __html: formattedContent }}
      />
    );
  };

  return (
    <div className="chat-interface">
      <div className="chat-header">
        <div className="chat-title">
          <span className="title-icon">🌟</span>
          <h2>창조의 여정</h2>
        </div>
        <div className="chat-status">
          {isLoading && (
            <div className="loading-indicator">
              <span className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
              <span className="loading-text">AI가 생각 중...</span>
            </div>
          )}
        </div>
      </div>

      <div 
        className="chat-messages" 
        ref={chatContainerRef}
      >
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-icon">🌌</div>
            <p>창조의 여정이 곧 시작됩니다...</p>
          </div>
        ) : (
          messages.map((message) => (
            <div 
              key={message.id} 
              className={getMessageClass(message.type, message.sender)}
            >
              <div className="message-header">
                <span className="message-icon">
                  {getMessageIcon(message.type, message.sender)}
                </span>
                <span className="message-sender">
                  {message.sender || (message.type === 'system' ? '시스템' : '알 수 없음')}
                </span>
                <span className="message-time">
                  {formatTime(message.timestamp)}
                </span>
              </div>
              
              {renderMessageContent(message.content)}
              
              {message.choice && (
                <div className="choice-indicator">
                  <span className="choice-badge">선택됨</span>
                </div>
              )}
            </div>
          ))
        )}
        
        {/* 선택지 표시 (채팅 내부) */}
        {isWaitingForChoice && currentChoices.length > 0 && (
          <div className="chat-choices-container">
            <div className="choices-header">
              <div className="choices-title">
                <span className="choices-icon">🤔</span>
                <span className="choices-text">어떤 선택을 하시겠습니까?</span>
              </div>
            </div>
            
            <div className="chat-choices">
              {currentChoices.map((choice, index) => (
                <button
                  key={choice.id}
                  className={`chat-choice-button ${selectedChoiceId === choice.id ? 'selected' : ''} ${choice.type || 'default'}`}
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
            <div className="choices-help">
              <div className="help-icon">💡</div>
              <div className="help-text">
                각 선택지는 당신의 능력치와 세계에 다른 영향을 미칩니다.
              </div>
            </div>
          </div>
        )}
        
        {/* 스크롤 앵커 */}
        <div ref={messagesEndRef} />
      </div>

      {/* 타이핑 인디케이터 */}
      {isLoading && (
        <div className="typing-indicator">
          <div className="typing-message gm-message">
            <div className="message-header">
              <span className="message-icon">🎭</span>
              <span className="message-sender">GM</span>
            </div>
            <div className="typing-animation">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
// ChatInterface.jsx 끝