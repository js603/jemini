import React, { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError() {
    // 다음 렌더링에서 폴백 UI가 보이도록 상태를 업데이트합니다.
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // 에러 정보를 상태에 저장
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // 에러 로깅
    // eslint-disable-next-line no-console
    console.error("ErrorBoundary 에러 발생:", error);
    // eslint-disable-next-line no-console
    console.error("컴포넌트 스택:", errorInfo.componentStack);
  }

  handleReload = () => {
    // 페이지 새로고침
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // 폴백 UI를 렌더링합니다.
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col items-center justify-center p-4">
          <div className="bg-black bg-opacity-50 backdrop-blur-sm rounded-xl p-8 shadow-2xl border border-white border-opacity-10 max-w-lg">
            <h1 className="text-2xl font-bold text-red-400 mb-4">앱에 오류가 발생했습니다</h1>
            <p className="text-white mb-6">
              예상치 못한 오류가 발생했습니다. 페이지를 새로고침하여 다시 시도해주세요.
            </p>
            
            {this.state.error && (
              <div className="bg-red-900 bg-opacity-30 p-4 rounded-lg mb-6 overflow-auto max-h-40">
                <p className="text-red-300 text-sm font-mono">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            
            <button
              onClick={this.handleReload}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors shadow-lg flex items-center justify-center space-x-2 mx-auto"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                <path d="M21 3v5h-5"/>
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                <path d="M3 21v-5h5"/>
              </svg>
              <span>페이지 새로고침</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;