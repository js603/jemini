/**
 * @file useResponsive.js
 * 반응형 디자인을 위한 커스텀 훅을 제공합니다.
 */

import { useMediaQuery } from 'react-responsive';

/**
 * 다양한 화면 크기에 대한 반응형 미디어 쿼리를 제공하는 커스텀 훅
 * 
 * @returns {Object} 다양한 화면 크기에 대한 boolean 값
 */
const useResponsive = () => {
  // Tailwind CSS의 기본 브레이크포인트와 일치하도록 설정
  const isMobile = useMediaQuery({ maxWidth: 639 }); // xs: < 640px
  const isTablet = useMediaQuery({ minWidth: 640, maxWidth: 767 }); // sm: >= 640px
  const isLaptop = useMediaQuery({ minWidth: 768, maxWidth: 1023 }); // md: >= 768px
  const isDesktop = useMediaQuery({ minWidth: 1024, maxWidth: 1279 }); // lg: >= 1024px
  const isLargeDesktop = useMediaQuery({ minWidth: 1280 }); // xl: >= 1280px

  // 특정 크기 이상인지 확인하는 헬퍼 함수
  const isMinWidth = {
    sm: useMediaQuery({ minWidth: 640 }), // sm 이상
    md: useMediaQuery({ minWidth: 768 }), // md 이상
    lg: useMediaQuery({ minWidth: 1024 }), // lg 이상
    xl: useMediaQuery({ minWidth: 1280 }), // xl 이상
  };

  // 특정 크기 이하인지 확인하는 헬퍼 함수
  const isMaxWidth = {
    xs: useMediaQuery({ maxWidth: 639 }), // xs 이하
    sm: useMediaQuery({ maxWidth: 767 }), // sm 이하
    md: useMediaQuery({ maxWidth: 1023 }), // md 이하
    lg: useMediaQuery({ maxWidth: 1279 }), // lg 이하
  };

  // 현재 화면 크기에 따른 디바이스 타입
  const deviceType = isMobile 
    ? 'mobile' 
    : isTablet 
      ? 'tablet' 
      : isLaptop 
        ? 'laptop' 
        : isDesktop 
          ? 'desktop' 
          : 'largeDesktop';

  return {
    isMobile,
    isTablet,
    isLaptop,
    isDesktop,
    isLargeDesktop,
    isMinWidth,
    isMaxWidth,
    deviceType
  };
};

export { useResponsive };