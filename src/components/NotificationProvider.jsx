/**
 * @file NotificationProvider.jsx
 * 애플리케이션 전체에 알림 기능을 제공하는 컴포넌트입니다.
 */

import React, { createContext, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { NotificationSystem } from './common';
import useNotifications from '../hooks/useNotifications';

// 알림 컨텍스트 생성
const NotificationContext = createContext(null);

/**
 * 알림 컨텍스트 사용을 위한 커스텀 훅
 * 
 * @returns {Object} 알림 관리 함수와 상태
 */
export const useNotificationContext = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
};

/**
 * 애플리케이션 전체에 알림 기능을 제공하는 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {React.ReactNode} props.children - 자식 컴포넌트
 * @param {Object} props.gameData - 게임 데이터 (이벤트 감지용)
 * @param {string} [props.position='top-right'] - 알림 표시 위치
 * @param {number} [props.autoDismissTime=5000] - 자동 닫힘 시간 (밀리초)
 * @returns {React.ReactElement} 알림 제공자 컴포넌트
 */
const NotificationProvider = ({ 
  children, 
  gameData, 
  position = 'top-right',
  autoDismissTime = 5000
}) => {
  const {
    notifications,
    addNotification,
    addEventNotification,
    removeNotification,
    clearNotifications
  } = useNotifications();

  // 게임 이벤트 감지 및 알림 생성
  useEffect(() => {
    if (!gameData || !gameData.events || !gameData.events.length) return;

    // 마지막 이벤트 가져오기
    const lastEvent = gameData.events[gameData.events.length - 1];
    
    // 이미 표시된 이벤트인지 확인하기 위한 ID 생성
    const eventId = `${lastEvent.turn}-${lastEvent.type}-${lastEvent.content.substring(0, 20)}`;
    
    // 이벤트가 비공개이고 현재 사용자에게 해당하지 않으면 표시하지 않음
    if (lastEvent.isPrivate && lastEvent.recipient !== gameData.currentUserId) {
      return;
    }
    
    // 이벤트 알림 추가
    addEventNotification({
      ...lastEvent,
      id: eventId
    });
    
  }, [gameData?.events, gameData?.currentUserId, addEventNotification]);

  return (
    <NotificationContext.Provider
      value={{
        addNotification,
        addEventNotification,
        removeNotification,
        clearNotifications
      }}
    >
      {children}
      <NotificationSystem
        notifications={notifications}
        onDismiss={removeNotification}
        position={position}
        autoDismissTime={autoDismissTime}
      />
    </NotificationContext.Provider>
  );
};

NotificationProvider.propTypes = {
  children: PropTypes.node.isRequired,
  gameData: PropTypes.shape({
    events: PropTypes.array,
    currentUserId: PropTypes.string
  }),
  position: PropTypes.oneOf(['top-right', 'top-left', 'bottom-right', 'bottom-left', 'top-center', 'bottom-center']),
  autoDismissTime: PropTypes.number
};

export default NotificationProvider;