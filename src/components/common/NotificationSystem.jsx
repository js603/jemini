/**
 * @file NotificationSystem.jsx
 * 게임 내 알림 및 토스트 메시지를 표시하는 컴포넌트입니다.
 */

import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { AnimatedElement } from './';

/**
 * 게임 내 알림 및 토스트 메시지를 표시하는 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {Array} props.notifications - 표시할 알림 배열
 * @param {Function} props.onDismiss - 알림 닫기 핸들러
 * @param {string} props.position - 알림 표시 위치 (top-right, top-left, bottom-right, bottom-left, top-center, bottom-center)
 * @param {number} props.autoDismissTime - 자동 닫힘 시간 (밀리초, 0이면 자동 닫힘 없음)
 * @returns {React.ReactElement} 알림 시스템 컴포넌트
 */
const NotificationSystem = ({ 
  notifications = [], 
  onDismiss, 
  position = 'top-right',
  autoDismissTime = 5000
}) => {
  // 위치에 따른 스타일 클래스
  const positionClasses = {
    'top-right': 'top-4 right-4 items-end',
    'top-left': 'top-4 left-4 items-start',
    'bottom-right': 'bottom-4 right-4 items-end',
    'bottom-left': 'bottom-4 left-4 items-start',
    'top-center': 'top-4 left-1/2 -translate-x-1/2 items-center',
    'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2 items-center'
  };

  // 알림 타입에 따른 스타일 클래스
  const typeClasses = {
    success: 'bg-green-600 dark:bg-green-700 border-green-500 dark:border-green-600',
    error: 'bg-red-600 dark:bg-red-700 border-red-500 dark:border-red-600',
    warning: 'bg-yellow-600 dark:bg-yellow-700 border-yellow-500 dark:border-yellow-600',
    info: 'bg-blue-600 dark:bg-blue-700 border-blue-500 dark:border-blue-600',
    battle: 'bg-purple-600 dark:bg-purple-700 border-purple-500 dark:border-purple-600',
    diplomacy: 'bg-indigo-600 dark:bg-indigo-700 border-indigo-500 dark:border-indigo-600',
    technology: 'bg-teal-600 dark:bg-teal-700 border-teal-500 dark:border-teal-600',
    economy: 'bg-amber-600 dark:bg-amber-700 border-amber-500 dark:border-amber-600',
    default: 'bg-gray-700 dark:bg-gray-800 border-gray-600 dark:border-gray-700'
  };

  // 알림 타입에 따른 아이콘
  const typeIcons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️',
    battle: '⚔️',
    diplomacy: '🤝',
    technology: '🔬',
    economy: '💰',
    default: '📢'
  };

  // 자동 닫힘 타이머 관리
  useEffect(() => {
    if (autoDismissTime <= 0 || notifications.length === 0 || !onDismiss) return;

    const timers = notifications.map(notification => {
      return setTimeout(() => {
        onDismiss(notification.id);
      }, autoDismissTime);
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [notifications, autoDismissTime, onDismiss]);

  // 알림 닫기 핸들러
  const handleDismiss = useCallback((id) => {
    if (onDismiss) {
      onDismiss(id);
    }
  }, [onDismiss]);

  if (notifications.length === 0) return null;

  return (
    <div 
      className={`fixed z-50 flex flex-col gap-2 max-w-sm w-full ${positionClasses[position] || positionClasses['top-right']}`}
      aria-live="polite"
    >
      {notifications.map((notification) => (
        <AnimatedElement
          key={notification.id}
          animation="fade-slide"
          duration={300}
          className="w-full"
        >
          <div 
            className={`rounded-lg shadow-lg border-l-4 text-white overflow-hidden ${typeClasses[notification.type] || typeClasses.default}`}
          >
            <div className="p-4 flex items-start">
              <div className="flex-shrink-0 mr-3 text-xl">
                {typeIcons[notification.type] || typeIcons.default}
              </div>
              <div className="flex-1 mr-2">
                {notification.title && (
                  <h4 className="text-sm font-medium mb-1">{notification.title}</h4>
                )}
                <p className="text-sm opacity-90">{notification.message}</p>
              </div>
              <button
                onClick={() => handleDismiss(notification.id)}
                className="flex-shrink-0 ml-auto -mt-1 -mr-1 text-white opacity-60 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 rounded"
                aria-label="닫기"
              >
                <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {autoDismissTime > 0 && (
              <div className="h-1 bg-white bg-opacity-20">
                <div 
                  className="h-full bg-white bg-opacity-40 transition-all duration-100"
                  style={{ 
                    width: '100%',
                    animation: `shrink ${autoDismissTime}ms linear forwards`
                  }}
                />
              </div>
            )}
          </div>
        </AnimatedElement>
      ))}
      {/* 애니메이션 키프레임은 전역 CSS 파일에 정의해야 합니다 */}
    </div>
  );
};

NotificationSystem.propTypes = {
  notifications: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      type: PropTypes.oneOf(['success', 'error', 'warning', 'info', 'battle', 'diplomacy', 'technology', 'economy', 'default']),
      title: PropTypes.string,
      message: PropTypes.string.isRequired
    })
  ),
  onDismiss: PropTypes.func,
  position: PropTypes.oneOf(['top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center']),
  autoDismissTime: PropTypes.number
};

export default NotificationSystem;