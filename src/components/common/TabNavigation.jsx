/**
 * @file TabNavigation.jsx
 * 애플리케이션 전체에서 사용되는 재사용 가능한 탭 네비게이션 컴포넌트입니다.
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * 다양한 스타일과 레이아웃을 지원하는 재사용 가능한 탭 네비게이션 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {Array} props.tabs - 탭 객체 배열 [{id: string, label: string, icon?: ReactNode}]
 * @param {string} props.activeTab - 현재 활성화된 탭의 ID
 * @param {Function} props.onTabChange - 탭 변경 핸들러 함수 (tabId) => void
 * @param {string} props.variant - 탭 스타일 변형 (default, pills, underline)
 * @param {string} props.size - 탭 크기 (sm, md, lg)
 * @param {boolean} props.fullWidth - 탭이 컨테이너의 전체 너비를 차지하는지 여부
 * @param {boolean} props.scrollable - 탭이 스크롤 가능한지 여부 (모바일 대응)
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 탭 네비게이션 컴포넌트
 */
const TabNavigation = ({ 
  tabs = [], 
  activeTab, 
  onTabChange, 
  variant = 'default', 
  size = 'md', 
  fullWidth = false,
  scrollable = true,
  className = '',
  ...rest 
}) => {
  // 탭 변형에 따른 스타일 클래스
  const variantClasses = {
    default: {
      container: 'border-b border-gray-200 dark:border-gray-700',
      tab: {
        active: 'bg-indigo-600 text-white',
        inactive: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
      },
      tabStyle: 'rounded-t-lg transition-colors'
    },
    pills: {
      container: '',
      tab: {
        active: 'bg-indigo-600 text-white',
        inactive: 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
      },
      tabStyle: 'rounded-full transition-colors'
    },
    underline: {
      container: '',
      tab: {
        active: 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400',
        inactive: 'text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 border-b-2 border-transparent'
      },
      tabStyle: 'transition-colors'
    }
  };

  // 탭 크기에 따른 패딩 클래스
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  // 너비 클래스
  const widthClass = fullWidth ? 'flex-1 text-center' : '';

  // 스크롤 클래스
  const scrollClass = scrollable ? 'overflow-x-auto pb-1' : '';

  return (
    <div className={`${variantClasses[variant]?.container || variantClasses.default.container} ${className}`} {...rest}>
      <nav className={`flex ${fullWidth ? '' : 'space-x-2'} ${scrollClass}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              ${sizeClasses[size] || sizeClasses.md}
              ${variantClasses[variant]?.tabStyle || variantClasses.default.tabStyle}
              ${activeTab === tab.id 
                ? variantClasses[variant]?.tab.active || variantClasses.default.tab.active
                : variantClasses[variant]?.tab.inactive || variantClasses.default.tab.inactive
              }
              ${widthClass}
              font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
            `}
          >
            {tab.icon && (
              <span className={`${tab.label ? 'mr-2' : ''} inline-flex`}>
                {tab.icon}
              </span>
            )}
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

TabNavigation.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string,
      icon: PropTypes.node
    })
  ).isRequired,
  activeTab: PropTypes.string.isRequired,
  onTabChange: PropTypes.func.isRequired,
  variant: PropTypes.oneOf(['default', 'pills', 'underline']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  fullWidth: PropTypes.bool,
  scrollable: PropTypes.bool,
  className: PropTypes.string,
};

export default TabNavigation;