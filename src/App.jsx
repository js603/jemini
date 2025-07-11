import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  onSnapshot,
  serverTimestamp,
  addDoc,
  getDocs,
  deleteDoc,
  runTransaction,
  orderBy,
  limit,
  arrayUnion,
} from 'firebase/firestore';

// ====================================================================
// Firebase configuration information - 수정 금지
const defaultFirebaseConfig = {
  apiKey: 'AIzaSyBNJtmpRWzjobrY556bnHkwbZmpFJqgPX8',
  authDomain: 'text-adventure-game-cb731.firebaseapp.com',
  projectId: 'text-adventure-game-cb731',
  storageBucket: 'text-adventure-game-cb731.appspot.com',
  messagingSenderId: '1092941614820',
  appId: '1:1092941614820:web:5545f36014b73c268026f1',
  measurementId: 'G-FNGF42T1FP',
};

// 수정금지
const firebaseConfig = defaultFirebaseConfig;
const appId = firebaseConfig.projectId;
const initialAuthToken = null;
// ====================================================================

const professions = {
  '1': { name: '몰락한 귀족/기사', motivation: '가문의 몰락 원인을 조사하고, 잃어버린 가문의 보물을 찾아야 합니다.' },
  '2': { name: '평범한 마을 사람/농부', motivation: '갑자기 마을에 나타난 괴생명체로부터 마을을 지켜야 합니다.' },
  '3': { name: '젊은 마법사/견습생', motivation: '스승님의 실종에 대한 단서를 찾아야 합니다.' },
  '4': { name: '용병/모험가', motivation: '의뢰받은 임무를 수행하던 중 예상치 못한 사건에 휘말렸습니다.' },
  '5': { name: '도적/암살자', motivation: '길드에서 내려온 첫 번째 임무를 완수하고, 그 과정에서 수상한 음모를 감지해야 합니다.' },
  '6': { name: '왕족/공주/왕자', motivation: '왕실 내의 불화와 암투 속에서 자신의 입지를 다져야 합니다.' },
};

// Firestore 경로 유틸
const getMainScenarioRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'mainScenario', 'main');
const getPrivatePlayerStateRef = (db, appId, userId) => doc(db, 'artifacts', appId, 'users', userId, 'playerState', 'state');
const getGameStatusRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'gameStatus', 'status');
const getMajorEventsRef = (db, appId) => collection(db, 'artifacts', appId, 'public', 'data', 'majorEvents');
const getPersonalStoryLogRef = (db, appId, userId) => collection(db, 'artifacts', appId, 'users', userId, 'personalStoryLog');
const getNpcRef = (db, appId, npcId) => doc(db, 'artifacts', appId, 'public', 'data', 'npcs', npcId);
const getActiveTurningPointRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'turningPoints', 'active');
const getWorldviewRef = (db, appId) => doc(db, 'artifacts', appId, 'public', 'data', 'worldview', 'main');

// 상태 초기화 유틸
const getDefaultGameState = () => ({ publicLog: [], subtleClues: [], lastUpdate: null });
const getDefaultPrivatePlayerState = () => ({ stats: { strength: 10, intelligence: 10, agility: 10, charisma: 10 }, inventory: [], initialMotivation: '', reputation: {}, activeQuests: [], companions: [], knownClues: [], activeMemories: [], characterCreated: false, profession: '', choices: [], groups: [], npcRelations: {}, knownEventIds: [], currentLocation: '방랑자의 안식처' });

function App() {
// ... (생략: 사용자가 제공한 전체 코드가 여기에 들어갑니다) ...
}

export default App;