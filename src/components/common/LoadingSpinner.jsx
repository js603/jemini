/**
 * @file LoadingSpinner.jsx
 * 애플리케이션 전체에서 사용되는 재사용 가능한 로딩 스피너 컴포넌트입니다.
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * 다양한 크기와 색상을 지원하는 재사용 가능한 로딩 스피너 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {string} props.size - 스피너 크기 (xs, sm, md, lg, xl)
 * @param {string} props.color - 스피너 색상 (primary, secondary, success, danger, warning, info)
 * @param {string} props.label - 스피너 아래에 표시될 텍스트 (선택 사항)
 * @param {boolean} props.fullScreen - 전체 화면 오버레이로 표시할지 여부
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 로딩 스피너 컴포넌트
 */
const LoadingSpinner = ({ 
  size = 'md', 
  color = 'primary', 
  label,
  fullScreen = false,
  className = '',
  ...rest 
}) => {
  // 스피너 크기에 따른 클래스
  const sizeClasses = {
    xs: 'h-4 w-4',
    sm: 'h-6 w-6',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  // 스피너 색상에 따른 클래스
  const colorClasses = {
    primary: 'text-indigo-600',
    secondary: 'text-gray-600',
    success: 'text-green-600',
    danger: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600',
  };

  // 스피너 컴포넌트
  const spinner = (
    <div className={`flex flex-col items-center justify-center ${className}`} {...rest}>
      <svg 
        className={`animate-spin ${sizeClasses[size] || sizeClasses.md} ${colorClasses[color] || colorClasses.primary}`} 
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24"
      >
        <circle 
          className="opacity-25" 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="4"
        ></circle>
        <path 
          className="opacity-75" 
          fill="currentColor" 
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      
      {label && (
        <span className={`mt-2 text-${color === 'primary' ? 'indigo' : color}-600 dark:text-${color === 'primary' ? 'indigo' : color}-400 font-medium`}>
          {label}
        </span>
      )}
    </div>
  );

  // 전체 화면 오버레이로 표시
  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
};

LoadingSpinner.propTypes = {
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  color: PropTypes.oneOf(['primary', 'secondary', 'success', 'danger', 'warning', 'info']),
  label: PropTypes.string,
  fullScreen: PropTypes.bool,
  className: PropTypes.string,
};

export default LoadingSpinner;