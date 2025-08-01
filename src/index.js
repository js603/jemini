import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx'; // 메인 앱 컴포넌트 import

// 'root' id를 가진 DOM 요소를 찾습니다.
const rootElement = document.getElementById('root');

// React 18의 새로운 createRoot API를 사용하여 root를 생성합니다.
const root = ReactDOM.createRoot(rootElement);

// App 컴포넌트를 렌더링합니다.
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
