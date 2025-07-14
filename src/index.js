import React from 'react';
import ReactDOM from 'react-dom/client'; // React 18부터는 createRoot를 사용합니다.
import App from './App'; // App.jsx 파일을 불러옵니다.

// React 18부터는 createRoot를 사용하여 앱을 렌더링하는 것을 권장합니다.
// 이는 동시성(Concurrent Mode) 기능을 활성화하는 데 필요합니다.
const root = ReactDOM.createRoot(document.getElementById('root'));

// 'root' 엘리먼트에 App 컴포넌트를 렌더링합니다.
// <React.StrictMode>는 개발 모드에서 잠재적인 문제를 감지하기 위한 도구입니다.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 만약 React 17 이하 버전을 사용 중이거나,  
// createRoot를 사용할 수 없는 환경이라면 아래 코드를 사용합니다.
/*
ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);
*/
