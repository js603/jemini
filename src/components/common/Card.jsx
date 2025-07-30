/**
 * @file Card.jsx
 * 애플리케이션 전체에서 사용되는 재사용 가능한 카드 컴포넌트입니다.
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * 다양한 스타일과 레이아웃을 지원하는 재사용 가능한 카드 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {React.ReactNode} props.children - 카드 내용
 * @param {string} props.title - 카드 제목 (선택 사항)
 * @param {React.ReactNode} props.headerAction - 카드 헤더에 표시될 액션 버튼 또는 요소 (선택 사항)
 * @param {React.ReactNode} props.footer - 카드 푸터 내용 (선택 사항)
 * @param {string} props.variant - 카드 변형 (default, primary, secondary, info, success, warning, danger)
 * @param {boolean} props.noPadding - 패딩 없음 여부
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 카드 컴포넌트
 */
const Card = ({ 
  children, 
  title, 
  headerAction, 
  footer, 
  variant = 'default', 
  noPadding = false, 
  className = '',
  ...rest 
}) => {
  // 카드 변형에 따른 스타일 클래스
  const variantClasses = {
    default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    primary: 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800',
    secondary: 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800',
    info: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800',
    success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800',
    warning: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800',
    danger: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',
  };

  // 기본 카드 클래스
  const baseClasses = 'rounded-lg shadow-md overflow-hidden border transition-all hover:shadow-lg';
  
  // 패딩 클래스
  const paddingClass = noPadding ? '' : 'p-4';

  return (
    <div 
      className={`
        ${baseClasses}
        ${variantClasses[variant] || variantClasses.default}
        ${className}
      `}
      {...rest}
    >
      {/* 카드 헤더 (제목이나 액션이 있는 경우에만 표시) */}
      {(title || headerAction) && (
        <div className={`flex justify-between items-center border-b border-gray-200 dark:border-gray-700 ${noPadding ? 'p-4' : 'pb-3 mb-3'}`}>
          {title && (
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              {title}
            </h3>
          )}
          {headerAction && (
            <div className="flex items-center">
              {headerAction}
            </div>
          )}
        </div>
      )}
      
      {/* 카드 내용 */}
      <div className={paddingClass}>
        {children}
      </div>
      
      {/* 카드 푸터 (있는 경우에만 표시) */}
      {footer && (
        <div className={`border-t border-gray-200 dark:border-gray-700 ${noPadding ? 'p-4' : 'pt-3 mt-3'}`}>
          {footer}
        </div>
      )}
    </div>
  );
};

Card.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string,
  headerAction: PropTypes.node,
  footer: PropTypes.node,
  variant: PropTypes.oneOf(['default', 'primary', 'secondary', 'info', 'success', 'warning', 'danger']),
  noPadding: PropTypes.bool,
  className: PropTypes.string,
};

export default Card;