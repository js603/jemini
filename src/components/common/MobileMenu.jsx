/**
 * @file MobileMenu.jsx
 * 모바일 장치를 위한 반응형 메뉴 컴포넌트입니다.
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import AnimatedElement from './AnimatedElement';

/**
 * 모바일 장치에 최적화된 햄버거 메뉴 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {Array} props.items - 메뉴 항목 배열 [{id: string, label: string, icon?: ReactNode, onClick?: Function}]
 * @param {string} props.activeItemId - 현재 활성화된 항목의 ID
 * @param {Function} props.onItemClick - 항목 클릭 핸들러 함수 (itemId) => void
 * @param {string} props.title - 메뉴 제목 (선택 사항)
 * @param {React.ReactNode} props.headerContent - 메뉴 헤더에 표시될 추가 콘텐츠 (선택 사항)
 * @param {React.ReactNode} props.footerContent - 메뉴 푸터에 표시될 추가 콘텐츠 (선택 사항)
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 모바일 메뉴 컴포넌트
 */
const MobileMenu = ({ 
  items = [], 
  activeItemId,
  onItemClick,
  title,
  headerContent,
  footerContent,
  className = '',
  ...rest 
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // 메뉴 토글 핸들러
  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  // 항목 클릭 핸들러
  const handleItemClick = (itemId) => {
    if (onItemClick) {
      onItemClick(itemId);
    }
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} {...rest}>
      {/* 햄버거 버튼 */}
      <button
        type="button"
        onClick={toggleMenu}
        className="p-2 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded-md"
        aria-expanded={isOpen}
        aria-label="메뉴 열기"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* 메뉴 패널 */}
      {isOpen && (
        <AnimatedElement
          animation="slide"
          direction="down"
          className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-50"
        >
          <div className="py-1">
            {/* 메뉴 헤더 */}
            {(title || headerContent) && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                {title && (
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    {title}
                  </h3>
                )}
                {headerContent}
              </div>
            )}

            {/* 메뉴 항목 */}
            <div className="py-1">
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`
                    w-full text-left px-4 py-2 text-sm flex items-center
                    ${activeItemId === item.id 
                      ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' 
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  {item.icon && (
                    <span className="mr-2">{item.icon}</span>
                  )}
                  {item.label}
                </button>
              ))}
            </div>

            {/* 메뉴 푸터 */}
            {footerContent && (
              <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
                {footerContent}
              </div>
            )}
          </div>
        </AnimatedElement>
      )}
    </div>
  );
};

MobileMenu.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.node,
      onClick: PropTypes.func
    })
  ).isRequired,
  activeItemId: PropTypes.string,
  onItemClick: PropTypes.func,
  title: PropTypes.string,
  headerContent: PropTypes.node,
  footerContent: PropTypes.node,
  className: PropTypes.string,
};

export default MobileMenu;