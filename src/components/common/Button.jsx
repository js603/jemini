/**
 * @file Button.jsx
 * 애플리케이션 전체에서 사용되는 재사용 가능한 버튼 컴포넌트입니다.
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * 다양한 스타일과 크기를 지원하는 재사용 가능한 버튼 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {string} props.variant - 버튼 변형 (primary, secondary, success, danger, warning, info)
 * @param {string} props.size - 버튼 크기 (sm, md, lg)
 * @param {boolean} props.fullWidth - 버튼이 부모 컨테이너의 전체 너비를 차지하는지 여부
 * @param {boolean} props.disabled - 버튼 비활성화 여부
 * @param {boolean} props.isLoading - 로딩 상태 여부
 * @param {Function} props.onClick - 클릭 이벤트 핸들러
 * @param {React.ReactNode} props.children - 버튼 내용
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 버튼 컴포넌트
 */
const Button = ({ 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false, 
  disabled = false, 
  isLoading = false, 
  onClick, 
  children, 
  className = '',
  ...rest 
}) => {
  // 버튼 변형에 따른 스타일 클래스
  const variantClasses = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white focus:ring-gray-500',
    success: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    warning: 'bg-yellow-600 hover:bg-yellow-700 text-white focus:ring-yellow-500',
    info: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
  };

  // 버튼 크기에 따른 패딩 클래스
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  // 너비 클래스
  const widthClass = fullWidth ? 'w-full' : '';

  // 비활성화 및 로딩 상태 클래스
  const stateClasses = `
    ${disabled || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
    transition-colors duration-200
  `;

  // 기본 버튼 클래스
  const baseClasses = 'font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2';

  return (
    <button
      type="button"
      className={`
        ${baseClasses}
        ${variantClasses[variant] || variantClasses.primary}
        ${sizeClasses[size] || sizeClasses.md}
        ${widthClass}
        ${stateClasses}
        ${className}
      `}
      disabled={disabled || isLoading}
      onClick={onClick}
      {...rest}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          로딩 중...
        </div>
      ) : children}
    </button>
  );
};

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary', 'success', 'danger', 'warning', 'info']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  fullWidth: PropTypes.bool,
  disabled: PropTypes.bool,
  isLoading: PropTypes.bool,
  onClick: PropTypes.func,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default Button;