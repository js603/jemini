/**
 * @file useNotifications.js
 * 알림 관리를 위한 커스텀 훅입니다.
 */

import { useState, useCallback } from 'react';

/**
 * 알림 관리를 위한 커스텀 훅
 * 
 * @returns {Object} 알림 관리 함수와 상태
 * @returns {Array} notifications - 현재 알림 배열
 * @returns {Function} addNotification - 알림 추가 함수
 * @returns {Function} removeNotification - 알림 제거 함수
 * @returns {Function} clearNotifications - 모든 알림 제거 함수
 */
const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);

  /**
   * 새 알림 추가
   * 
   * @param {Object} notification - 알림 객체
   * @param {string} notification.type - 알림 타입 (success, error, warning, info, battle, diplomacy, technology, economy)
   * @param {string} notification.message - 알림 메시지
   * @param {string} [notification.title] - 알림 제목 (선택 사항)
   * @param {number} [notification.id] - 알림 ID (제공되지 않으면 자동 생성)
   * @returns {number} 생성된 알림 ID
   */
  const addNotification = useCallback((notification) => {
    const id = notification.id || Date.now();
    setNotifications(prev => [...prev, { ...notification, id }]);
    return id;
  }, []);

  /**
   * 게임 이벤트를 알림으로 변환
   * 
   * @param {Object} event - 게임 이벤트 객체
   * @param {string} event.type - 이벤트 타입
   * @param {string} event.content - 이벤트 내용
   * @param {number} event.turn - 이벤트 발생 턴
   * @returns {number} 생성된 알림 ID
   */
  const addEventNotification = useCallback((event) => {
    // 이벤트 타입에 따른 알림 타입 매핑
    const typeMap = {
      battle: 'battle',
      conquest: 'battle',
      elimination: 'battle',
      diplomacy: 'diplomacy',
      technology: 'technology',
      economy: 'economy',
      production: 'economy',
      stability: 'info',
      betrayal: 'warning',
      collapse: 'error',
      victory: 'success',
      default: 'info'
    };

    // 이벤트 타입에 따른 알림 제목 매핑
    const titleMap = {
      battle: '전투 발생',
      conquest: '영토 점령',
      elimination: '국가 멸망',
      diplomacy: '외교 이벤트',
      technology: '기술 발전',
      economy: '경제 이벤트',
      production: '자원 생산',
      stability: '안정도 변화',
      betrayal: '보좌관 배신',
      collapse: '국가 붕괴',
      victory: '승리',
      default: '이벤트 발생'
    };

    return addNotification({
      type: typeMap[event.type] || typeMap.default,
      title: `${titleMap[event.type] || titleMap.default} (턴 ${event.turn})`,
      message: event.content
    });
  }, [addNotification]);

  /**
   * 알림 제거
   * 
   * @param {number|string} id - 제거할 알림 ID
   */
  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  }, []);

  /**
   * 모든 알림 제거
   */
  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    addNotification,
    addEventNotification,
    removeNotification,
    clearNotifications
  };
};

export { useNotifications };