import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import './styles.css'; // 스타일 시트 불러오기

const rootElement = document.getElementById('root');
const root = ReactDOM.createRoot(rootElement);

// StrictMode 제거 및 ErrorBoundary 추가
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);