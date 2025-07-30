/**
 * @file ResponsiveGrid.jsx
 * 다양한 화면 크기에 적응하는 반응형 그리드 레이아웃 컴포넌트입니다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import useResponsive from '../../hooks/useResponsive';

/**
 * 다양한 화면 크기에 적응하는 반응형 그리드 레이아웃 컴포넌트
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {React.ReactNode} props.children - 그리드 내용
 * @param {number} props.cols - 기본 열 수 (기본값: 1)
 * @param {number} props.smCols - 소형 화면(sm)에서의 열 수
 * @param {number} props.mdCols - 중형 화면(md)에서의 열 수
 * @param {number} props.lgCols - 대형 화면(lg)에서의 열 수
 * @param {number} props.xlCols - 초대형 화면(xl)에서의 열 수
 * @param {string} props.gap - 그리드 간격 (기본값: '1rem')
 * @param {string} props.rowGap - 행 간격 (기본값: gap과 동일)
 * @param {string} props.colGap - 열 간격 (기본값: gap과 동일)
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 반응형 그리드 컴포넌트
 */
const ResponsiveGrid = ({ 
  children, 
  cols = 1, 
  smCols,
  mdCols,
  lgCols,
  xlCols,
  gap = '1rem',
  rowGap,
  colGap,
  className = '',
  ...rest 
}) => {
  const { isMinWidth } = useResponsive();
  
  // 현재 화면 크기에 따른 열 수 계산
  const getColumnCount = () => {
    if (isMinWidth.xl && xlCols !== undefined) return xlCols;
    if (isMinWidth.lg && lgCols !== undefined) return lgCols;
    if (isMinWidth.md && mdCols !== undefined) return mdCols;
    if (isMinWidth.sm && smCols !== undefined) return smCols;
    return cols;
  };
  
  const columnCount = getColumnCount();
  
  // 그리드 스타일 계산
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
    gap: gap,
    rowGap: rowGap || gap,
    columnGap: colGap || gap,
  };

  return (
    <div 
      className={className}
      style={gridStyle}
      {...rest}
    >
      {children}
    </div>
  );
};

/**
 * 그리드 아이템 컴포넌트 - 그리드 내에서 특정 셀의 크기를 지정합니다.
 * 
 * @param {Object} props - 컴포넌트 props
 * @param {React.ReactNode} props.children - 아이템 내용
 * @param {number} props.span - 기본 열 병합 수 (기본값: 1)
 * @param {number} props.smSpan - 소형 화면(sm)에서의 열 병합 수
 * @param {number} props.mdSpan - 중형 화면(md)에서의 열 병합 수
 * @param {number} props.lgSpan - 대형 화면(lg)에서의 열 병합 수
 * @param {number} props.xlSpan - 초대형 화면(xl)에서의 열 병합 수
 * @param {number} props.rowSpan - 행 병합 수 (기본값: 1)
 * @param {string} props.className - 추가 CSS 클래스
 * @returns {React.ReactElement} 그리드 아이템 컴포넌트
 */
export const GridItem = ({ 
  children, 
  span = 1, 
  smSpan,
  mdSpan,
  lgSpan,
  xlSpan,
  rowSpan = 1,
  className = '',
  ...rest 
}) => {
  const { isMinWidth } = useResponsive();
  
  // 현재 화면 크기에 따른 열 병합 수 계산
  const getColumnSpan = () => {
    if (isMinWidth.xl && xlSpan !== undefined) return xlSpan;
    if (isMinWidth.lg && lgSpan !== undefined) return lgSpan;
    if (isMinWidth.md && mdSpan !== undefined) return mdSpan;
    if (isMinWidth.sm && smSpan !== undefined) return smSpan;
    return span;
  };
  
  const columnSpan = getColumnSpan();
  
  // 그리드 아이템 스타일 계산
  const gridItemStyle = {
    gridColumn: `span ${columnSpan} / span ${columnSpan}`,
    gridRow: rowSpan > 1 ? `span ${rowSpan} / span ${rowSpan}` : 'auto',
  };

  return (
    <div 
      className={className}
      style={gridItemStyle}
      {...rest}
    >
      {children}
    </div>
  );
};

ResponsiveGrid.propTypes = {
  children: PropTypes.node.isRequired,
  cols: PropTypes.number,
  smCols: PropTypes.number,
  mdCols: PropTypes.number,
  lgCols: PropTypes.number,
  xlCols: PropTypes.number,
  gap: PropTypes.string,
  rowGap: PropTypes.string,
  colGap: PropTypes.string,
  className: PropTypes.string,
};

GridItem.propTypes = {
  children: PropTypes.node.isRequired,
  span: PropTypes.number,
  smSpan: PropTypes.number,
  mdSpan: PropTypes.number,
  lgSpan: PropTypes.number,
  xlSpan: PropTypes.number,
  rowSpan: PropTypes.number,
  className: PropTypes.string,
};

export default ResponsiveGrid;