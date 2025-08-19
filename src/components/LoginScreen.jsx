import React, { useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';

function LoginScreen({ db, setLoading, setMessage, setCurrentUser, setUser, setGameState, loading }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isRegister, setIsRegister] = useState(false);

    const handleAuth = async () => {
        if (!username || !password) {
            setMessage('사용자 이름과 비밀번호를 모두 입력해주세요.');
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            if (isRegister) {
                const userRef = doc(db, 'users', username);
                const userDoc = await getDoc(userRef);

                if (userDoc.exists()) {
                    setMessage('이미 존재하는 사용자 이름입니다.');
                    setLoading(false);
                    return;
                }

                await setDoc(userRef, {
                    username,
                    password, // In a real app, this should be hashed!
                    createdAt: new Date(),
                    lastLogin: new Date(),
                    characters: []
                });

                setMessage('회원가입 성공! 이제 로그인해주세요.');
                setIsRegister(false);
            } else {
                const userRef = doc(db, 'users', username);
                const userDoc = await getDoc(userRef);

                if (!userDoc.exists()) {
                    setMessage('존재하지 않는 사용자입니다.');
                    setLoading(false);
                    return;
                }

                const userData = userDoc.data();

                if (userData.password !== password) {
                    setMessage('비밀번호가 일치하지 않습니다.');
                    setLoading(false);
                    return;
                }

                // Login success
                setCurrentUser(userData);
                setUser(userData);
                setGameState('character');
                setMessage(`환영합니다, ${username}님!`);
            }
        } catch (error) {
            console.error('인증 오류:', error);
            setMessage('인증 과정에서 오류가 발생했습니다: ' + error.message);
        }

        setLoading(false);
    };

    return (
        <div className="login-screen">
            <h2>{isRegister ? '회원가입' : '로그인'}</h2>
            <div className="form-group">
                <label htmlFor="username">사용자 이름</label>
                <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                />
            </div>
            <div className="form-group">
                <label htmlFor="password">비밀번호</label>
                <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
            </div>
            <button onClick={handleAuth} disabled={loading}>
                {loading ? '처리 중...' : isRegister ? '가입하기' : '로그인'}
            </button>
            <p className="toggle-auth" onClick={() => setIsRegister(!isRegister)}>
                {isRegister ? '이미 계정이 있으신가요? 로그인하기' : '계정이 없으신가요? 가입하기'}
            </p>
        </div>
    );
}

export default LoginScreen;
