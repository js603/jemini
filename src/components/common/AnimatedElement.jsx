/**
 * @file AnimatedElement.jsx
 * 애플리케이션 전체에서 사용되는 재사용 가능한 애니메이션 요소 컴포넌트입니다.
 */

import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * 다양한 애니메이션 효과를 지원하는 재사용 가능한 애니메이션 요소 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {React.ReactNode} props.children - 애니메이션을 적용할 내용
 * @param {string} props.animation - 애니메이션 유형 (fade, slide, scale, bounce)
 * @param {string} props.direction - 애니메이션 방향 (in, out, up, down, left, right)
 * @param {number} props.duration - 애니메이션 지속 시간 (밀리초)
 * @param {number} props.delay - 애니메이션 시작 전 지연 시간 (밀리초)
 * @param {boolean} props.animate - 애니메이션 활성화 여부
 * @param {string} props.as - 렌더링할 HTML 요소 (기본값: div)
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 애니메이션 요소 컴포넌트
 */
const AnimatedElement = ({ 
  children, 
  animation = 'fade', 
  direction = 'in',
  duration = 300,
  delay = 0,
  animate = true,
  as: Component = 'div',
  className = '',
  ...rest 
}) => {
  const [isVisible, setIsVisible] = useState(!animation.includes('in'));
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (animate && !hasAnimated) {
      const timer = setTimeout(() => {
        setIsVisible(true);
        setHasAnimated(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [animate, delay, hasAnimated]);

  // 애니메이션 유형에 따른 클래스
  const getAnimationClasses = () => {
    const baseTransition = `transition-all duration-${duration}`;
    
    // 애니메이션이 비활성화된 경우
    if (!animate) return '';
    
    // 페이드 애니메이션
    if (animation === 'fade') {
      return `${baseTransition} ${isVisible ? 'opacity-100' : 'opacity-0'}`;
    }
    
    // 슬라이드 애니메이션
    if (animation === 'slide') {
      const slideDirections = {
        in: isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        up: isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        down: isVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0',
        left: isVisible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0',
        right: isVisible ? 'translate-x-0 opacity-100' : '-translate-x-4 opacity-0',
      };
      return `${baseTransition} transform ${slideDirections[direction] || slideDirections.in}`;
    }
    
    // 스케일 애니메이션
    if (animation === 'scale') {
      return `${baseTransition} transform ${isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`;
    }
    
    // 바운스 애니메이션
    if (animation === 'bounce') {
      if (!isVisible) return `${baseTransition} transform scale-95 opacity-0`;
      return `${baseTransition} transform opacity-100 animate-bounce`;
    }
    
    return '';
  };

  return (
    <Component 
      className={`${getAnimationClasses()} ${className}`}
      style={{ transitionDuration: `${duration}ms` }}
      {...rest}
    >
      {children}
    </Component>
  );
};

AnimatedElement.propTypes = {
  children: PropTypes.node.isRequired,
  animation: PropTypes.oneOf(['fade', 'slide', 'scale', 'bounce']),
  direction: PropTypes.oneOf(['in', 'out', 'up', 'down', 'left', 'right']),
  duration: PropTypes.number,
  delay: PropTypes.number,
  animate: PropTypes.bool,
  as: PropTypes.elementType,
  className: PropTypes.string,
};

export default AnimatedElement;