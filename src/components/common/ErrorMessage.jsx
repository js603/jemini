/**
 * @file ErrorMessage.jsx
 * 애플리케이션 전체에서 사용되는 재사용 가능한 오류 메시지 컴포넌트입니다.
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * 다양한 유형과 스타일을 지원하는 재사용 가능한 오류 메시지 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {string} props.message - 표시할 오류 메시지
 * @param {string} props.type - 오류 유형 (error, warning, info)
 * @param {string} props.title - 오류 제목 (선택 사항)
 * @param {boolean} props.dismissible - 닫기 버튼 표시 여부
 * @param {Function} props.onDismiss - 닫기 버튼 클릭 시 호출될 함수
 * @param {boolean} props.withIcon - 아이콘 표시 여부
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement|null} 오류 메시지 컴포넌트 또는 null (닫힌 경우)
 */
const ErrorMessage = ({ 
  message, 
  type = 'error', 
  title,
  dismissible = false,
  onDismiss,
  withIcon = true,
  className = '',
  ...rest 
}) => {
  const [dismissed, setDismissed] = useState(false);

  // 이미 닫힌 경우 null 반환
  if (dismissed) return null;

  // 오류 유형에 따른 스타일 클래스
  const typeClasses = {
    error: {
      container: 'bg-red-100 dark:bg-red-900 border-red-500 text-red-700 dark:text-red-200',
      icon: (
        <svg className="w-5 h-5 text-red-500 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )
    },
    warning: {
      container: 'bg-yellow-100 dark:bg-yellow-900 border-yellow-500 text-yellow-700 dark:text-yellow-200',
      icon: (
        <svg className="w-5 h-5 text-yellow-500 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )
    },
    info: {
      container: 'bg-blue-100 dark:bg-blue-900 border-blue-500 text-blue-700 dark:text-blue-200',
      icon: (
        <svg className="w-5 h-5 text-blue-500 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      )
    },
    success: {
      container: 'bg-green-100 dark:bg-green-900 border-green-500 text-green-700 dark:text-green-200',
      icon: (
        <svg className="w-5 h-5 text-green-500 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )
    }
  };

  // 닫기 버튼 클릭 핸들러
  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) onDismiss();
  };

  return (
    <div 
      className={`p-4 mb-4 border-l-4 rounded-md ${typeClasses[type]?.container || typeClasses.error.container} ${className}`}
      role="alert"
      {...rest}
    >
      <div className="flex items-start">
        {withIcon && (
          <div className="flex-shrink-0 mr-3">
            {typeClasses[type]?.icon || typeClasses.error.icon}
          </div>
        )}
        <div className="flex-1">
          {title && (
            <h3 className="text-lg font-semibold mb-1">
              {title}
            </h3>
          )}
          <div className={title ? 'text-sm' : ''}>
            {message}
          </div>
        </div>
        {dismissible && (
          <button 
            type="button" 
            className="ml-auto -mx-1.5 -my-1.5 rounded-lg focus:ring-2 p-1.5 inline-flex h-8 w-8 hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-offset-2"
            onClick={handleDismiss}
            aria-label="닫기"
          >
            <span className="sr-only">닫기</span>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

ErrorMessage.propTypes = {
  message: PropTypes.string.isRequired,
  type: PropTypes.oneOf(['error', 'warning', 'info', 'success']),
  title: PropTypes.string,
  dismissible: PropTypes.bool,
  onDismiss: PropTypes.func,
  withIcon: PropTypes.bool,
  className: PropTypes.string,
};

export default ErrorMessage;