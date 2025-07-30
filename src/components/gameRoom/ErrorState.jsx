/**
 * @file ErrorState.jsx
 * 게임 오류 상태를 표시하는 컴포넌트입니다.
 * 오류 유형에 따라 맞춤형 메시지와 해결 방법을 제공합니다.
 */

import React from 'react';
import PropTypes from 'prop-types';

/**
 * 오류 유형에 따른 해결 방법을 제공하는 함수
 * @param {Object} error - 오류 객체
 * @returns {Object} 오류 정보 및 해결 방법
 */
const getErrorInfo = (error) => {
  // 오류 메시지에서 키워드 추출
  const errorMessage = error?.message || '';
  const errorCode = error?.code || '';
  
  // 오류 유형별 정보
  const errorTypes = {
    // Firebase 연결 오류
    connection: {
      title: '연결 오류',
      message: '서버에 연결할 수 없습니다.',
      resolution: [
        '인터넷 연결을 확인해주세요.',
        '잠시 후 다시 시도해주세요.',
        '문제가 지속되면 브라우저를 새로고침하세요.'
      ],
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        </svg>
      )
    },
    // 인증 오류
    auth: {
      title: '인증 오류',
      message: '사용자 인증에 실패했습니다.',
      resolution: [
        '브라우저를 새로고침하여 다시 로그인해주세요.',
        '쿠키와 캐시를 삭제한 후 다시 시도해주세요.',
        '다른 브라우저로 접속을 시도해보세요.'
      ],
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    },
    // 게임 데이터 오류
    data: {
      title: '데이터 오류',
      message: '게임 데이터를 불러올 수 없습니다.',
      resolution: [
        '로비로 돌아가서 다른 게임에 참여해보세요.',
        '게임이 이미 종료되었거나 삭제되었을 수 있습니다.',
        '브라우저를 새로고침한 후 다시 시도해주세요.'
      ],
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    },
    // 권한 오류
    permission: {
      title: '권한 오류',
      message: '게임에 접근할 권한이 없습니다.',
      resolution: [
        '게임 초대를 다시 확인해주세요.',
        '게임 호스트에게 문의하세요.',
        '로비로 돌아가서 새 게임을 시작해보세요.'
      ],
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      )
    },
    // 기본 오류
    default: {
      title: '오류가 발생했습니다',
      message: '게임을 불러오는 중 문제가 발생했습니다.',
      resolution: [
        '로비로 돌아가서 다시 시도해주세요.',
        '브라우저를 새로고침한 후 다시 접속해보세요.',
        '잠시 후에 다시 시도해주세요.'
      ],
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  };
  
  // 오류 메시지 키워드에 따라 오류 유형 결정
  let errorType = 'default';
  
  if (errorMessage.includes('network') || errorMessage.includes('연결') || 
      errorMessage.includes('connection') || errorCode.includes('unavailable')) {
    errorType = 'connection';
  } else if (errorMessage.includes('auth') || errorMessage.includes('인증') || 
             errorMessage.includes('login') || errorCode.includes('auth')) {
    errorType = 'auth';
  } else if (errorMessage.includes('찾을 수 없') || errorMessage.includes('not found') || 
             errorMessage.includes('데이터') || errorCode.includes('not-found')) {
    errorType = 'data';
  } else if (errorMessage.includes('permission') || errorMessage.includes('권한') || 
             errorMessage.includes('access') || errorCode.includes('permission-denied')) {
    errorType = 'permission';
  }
  
  // 선택된 오류 유형 정보 반환
  return {
    ...errorTypes[errorType],
    originalMessage: errorMessage
  };
};

/**
 * 게임 데이터 로딩 중 오류가 발생했을 때 표시되는 오류 상태 컴포넌트
 * 오류 유형에 따라 맞춤형 메시지와 해결 방법을 제공합니다.
 * 
 * @param {Object} props - 컴포넌트 속성
 * @param {Object} props.error - 오류 객체
 * @param {Function} props.onReturn - 로비로 돌아가기 버튼 클릭 시 호출될 함수
 * @param {Function} props.onRetry - 재시도 버튼 클릭 시 호출될 함수 (선택적)
 */
function ErrorState({ error, onReturn, onRetry }) {
  const errorInfo = getErrorInfo(error);
  
  return (
    <div className="bg-gray-900 rounded-lg shadow-xl overflow-hidden border border-gray-700 p-8">
      <div className="flex flex-col items-center justify-center py-8">
        <div className="bg-red-900/30 p-4 rounded-full mb-6">
          {errorInfo.icon}
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{errorInfo.title}</h2>
        <p className="text-gray-400 text-center mb-4">
          {errorInfo.message}
        </p>
        
        {/* 원본 오류 메시지 (접을 수 있음) */}
        <details className="mb-6 w-full max-w-md">
          <summary className="text-gray-500 cursor-pointer hover:text-gray-300 transition-colors text-sm">
            상세 오류 정보 보기
          </summary>
          <p className="mt-2 p-2 bg-gray-800 rounded text-gray-400 text-sm break-all">
            {errorInfo.originalMessage || '추가 정보가 없습니다.'}
          </p>
        </details>
        
        {/* 해결 방법 */}
        <div className="bg-gray-800/50 rounded-lg p-4 mb-6 w-full max-w-md">
          <h3 className="text-indigo-400 font-medium mb-2">해결 방법:</h3>
          <ul className="text-gray-300 text-sm space-y-2">
            {errorInfo.resolution.map((step, index) => (
              <li key={index} className="flex items-start">
                <span className="inline-block bg-indigo-900/50 text-indigo-300 rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 mt-0.5">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ul>
        </div>
        
        {/* 버튼 영역 */}
        <div className="flex space-x-4">
          <button 
            onClick={onReturn}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            로비로 돌아가기
          </button>
          
          {onRetry && (
            <button 
              onClick={onRetry}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              다시 시도
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

ErrorState.propTypes = {
  error: PropTypes.object,
  onReturn: PropTypes.func.isRequired,
  onRetry: PropTypes.func
};

export default ErrorState;