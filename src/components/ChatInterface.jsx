// ChatInterface.jsx - 채팅 인터페이스 컴포넌트
import React, { useEffect, useRef } from 'react';
import useGameStore from '../stores/gameStore';
import '../styles/ChatInterface.css';

/**
 * 채팅 인터페이스 컴포넌트
 * - 게임 메시지 표시
 * - 자동 스크롤 관리
 * - 메시지 타입별 스타일링
 * - 모바일 친화적 디자인
 */
const ChatInterface = () => {
  const { messages, isLoading } = useGameStore();
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // 새 메시지가 추가될 때 자동 스크롤
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
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