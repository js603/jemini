/**
 * @file Container.jsx
 * 애플리케이션 전체에서 사용되는 재사용 가능한 반응형 컨테이너 컴포넌트입니다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import useResponsive from '../../hooks/useResponsive';

/**
 * 다양한 화면 크기에 최적화된 반응형 컨테이너 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {React.ReactNode} props.children - 컨테이너 내용
 * @param {boolean} props.fluid - 최대 너비 제한 없이 화면 전체 너비를 사용할지 여부
 * @param {string} props.as - 렌더링할 HTML 요소 (기본값: div)
 * @param {boolean} props.centered - 내용을 가운데 정렬할지 여부
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 컨테이너 컴포넌트
 */
const Container = ({ 
  children, 
  fluid = false, 
  as: Component = 'div',
  centered = false,
  className = '',
  ...rest 
}) => {
  const { isMobile, isTablet } = useResponsive();
  
  // 화면 크기에 따른 패딩 조정
  const paddingClass = isMobile 
    ? 'px-4 py-4' 
    : isTablet 
      ? 'px-6 py-5' 
      : 'px-8 py-6';
  
  // 최대 너비 클래스 (fluid가 아닌 경우에만 적용)
  const maxWidthClass = fluid ? 'w-full' : 'max-w-7xl mx-auto';
  
  // 중앙 정렬 클래스
  const centerClass = centered ? 'flex flex-col items-center justify-center' : '';

  return (
    <Component 
      className={`${paddingClass} ${maxWidthClass} ${centerClass} ${className}`}
      {...rest}
    >
      {children}
    </Component>
  );
};

Container.propTypes = {
  children: PropTypes.node.isRequired,
  fluid: PropTypes.bool,
  as: PropTypes.elementType,
  centered: PropTypes.bool,
  className: PropTypes.string,
};

export default Container;