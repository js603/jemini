// MessageInput.jsx - 메시지 입력 컴포넌트
import React, { useState, useRef, useEffect } from 'react';
import useGameStore from '../stores/gameStore';
import '../styles/MessageInput.css';

/**
 * 메시지 입력 컴포넌트
 * - 사용자 텍스트 입력 처리
 * - 자동 높이 조절
 * - 전송 버튼 및 키보드 단축키
 * - 입력 검증 및 제한
 * - 모바일 친화적 인터페이스
 */
const MessageInput = ({ onSendMessage, placeholder = "창조자로서 무엇을 하시겠습니까?" }) => {
  const { isLoading, isWaitingForChoice } = useGameStore();
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef(null);
  const maxLength = 500;

  // 텍스트 영역 자동 높이 조절
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // 메시지 전송 처리
  const handleSendMessage = async () => {
    const trimmedMessage = message.trim();
    
    if (!trimmedMessage || isLoading) return;
    
    if (trimmedMessage.length > maxLength) {
      alert(`메시지는 ${maxLength}자를 초과할 수 없습니다.`);
      return;
    }

    try {
      // 메시지 초기화
      setMessage('');
      
      // 부모 컴포넌트에 메시지 전달
      if (onSendMessage) {
        await onSendMessage(trimmedMessage);
      }
      
      // 포커스 유지
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (error) {
      console.error('메시지 전송 중 오류:', error);
    }
  };

  // 키보드 이벤트 처리
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift + Enter: 줄바꿈
        return;
      } else {
        // Enter: 전송
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  // 입력 변경 처리
  const handleInputChange = (e) => {
    const value = e.target.value;
    if (value.length <= maxLength) {
      setMessage(value);
    }
  };

  // 포커스 처리
  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  // 입력 비활성화 조건
  const isDisabled = isLoading || isWaitingForChoice;
  const canSend = message.trim().length > 0 && !isDisabled;

  // 플레이스홀더 동적 변경
  const getPlaceholder = () => {
    if (isWaitingForChoice) {
      return "위의 선택지 중에서 선택해주세요...";
    }
    if (isLoading) {
      return "AI가 응답을 생성하는 중...";
    }
    return placeholder;
  };

  return (
    <div className={`message-input-container ${isFocused ? 'focused' : ''} ${isDisabled ? 'disabled' : ''}`}>
      {/* 입력 상태 표시 */}
      {isWaitingForChoice && (
        <div className="input-status choice-waiting">
          <span className="status-icon">⏳</span>
          <span className="status-text">선택지에서 선택해주세요</span>
        </div>
      )}

      <div className="input-wrapper">
        {/* 텍스트 입력 영역 */}
        <div className="textarea-container">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={getPlaceholder()}
            disabled={isDisabled}
            className="message-textarea"
            rows={1}
            maxLength={maxLength}
          />
          
          {/* 글자 수 표시 */}
          <div className="character-count">
            <span className={message.length > maxLength * 0.8 ? 'warning' : ''}>
              {message.length}/{maxLength}
            </span>
          </div>
        </div>

        {/* 전송 버튼 */}
        <button
          onClick={handleSendMessage}
          disabled={!canSend}
          className={`send-button ${canSend ? 'active' : ''}`}
          title="메시지 전송 (Enter)"
        >
          {isLoading ? (
            <div className="send-loading">
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <div className="send-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22,2 15,22 11,13 2,9 22,2"></polygon>
              </svg>
            </div>
          )}
        </button>
      </div>

      {/* 입력 도움말 */}
      <div className="input-help">
        <div className="help-shortcuts">
          <span className="shortcut">
            <kbd>Enter</kbd> 전송
          </span>
          <span className="shortcut">
            <kbd>Shift</kbd> + <kbd>Enter</kbd> 줄바꿈
          </span>
        </div>
        
        {!isWaitingForChoice && (
          <div className="help-tips">
            💡 창조적인 아이디어를 자유롭게 표현해보세요!
          </div>
        )}
      </div>

      {/* 로딩 오버레이 */}
      {isLoading && (
        <div className="input-overlay">
          <div className="overlay-content">
            <div className="overlay-spinner"></div>
            <div className="overlay-text">AI가 응답을 생성하는 중...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageInput;
// MessageInput.jsx 끝