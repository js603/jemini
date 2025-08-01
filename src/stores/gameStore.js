// GameStore.js - 게임 상태 관리 (Zustand)
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * 게임 상태 관리 스토어
 * - 채팅 메시지 관리
 * - 선택지 관리
 * - 게임 진행 상태 관리
 * - 플레이어 정보 관리
 * - AI 로딩 상태 관리
 */
const useGameStore = create(
  subscribeWithSelector((set, get) => ({
    // === 게임 상태 ===
    gameId: null,
    isGameStarted: false,
    isLoading: false,
    error: null,
    
    // === 채팅 메시지 ===
    messages: [],
    
    // === 선택지 ===
    currentChoices: [],
    isWaitingForChoice: false,
    
    // === 플레이어 정보 ===
    player: {
      name: '창조자',
      stats: {
        wisdom: 50,
        power: 50,
        compassion: 50,
        creativity: 50
      },
      achievements: [],
      createdElements: []
    },
    
    // === 게임 세계 상태 ===
    world: {
      stage: 'beginning', // beginning, creation, development, advanced
      elements: [],
      population: 0,
      environment: 'void',
      events: []
    },
    
    // === 액션들 ===
    
    // 게임 시작
    startGame: () => {
      const gameId = `game_${Date.now()}`;
      set({
        gameId,
        isGameStarted: true,
        messages: [{
          id: `msg_${Date.now()}`,
          type: 'system',
          content: '🌌 창조의 시작에 오신 것을 환영합니다. 당신은 이제 새로운 세계의 창조자가 되었습니다.',
          timestamp: new Date().toISOString(),
          sender: 'GM'
        }],
        world: {
          stage: 'beginning',
          elements: [],
          population: 0,
          environment: 'void',
          events: []
        }
      });
    },
    
    // 메시지 추가
    addMessage: (message) => {
      const newMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        ...message
      };
      
      set((state) => ({
        messages: [...state.messages, newMessage]
      }));
    },
    
    // 선택지 설정
    setChoices: (choices) => {
      set({
        currentChoices: choices.map((choice, index) => ({
          id: `choice_${Date.now()}_${index}`,
          ...choice
        })),
        isWaitingForChoice: choices.length > 0
      });
    },
    
    // 선택지 선택
    selectChoice: (choiceId) => {
      const state = get();
      const selectedChoice = state.currentChoices.find(choice => choice.id === choiceId);
      
      if (selectedChoice) {
        // 선택한 내용을 메시지로 추가
        get().addMessage({
          type: 'player',
          content: selectedChoice.text,
          sender: 'Player',
          choice: true
        });
        
        // 선택지 초기화
        set({
          currentChoices: [],
          isWaitingForChoice: false
        });
        
        return selectedChoice;
      }
      return null;
    },
    
    // 로딩 상태 설정
    setLoading: (loading) => {
      set({ isLoading: loading });
    },
    
    // 에러 설정
    setError: (error) => {
      set({ error });
    },
    
    // 플레이어 스탯 업데이트
    updatePlayerStats: (statUpdates) => {
      set((state) => ({
        player: {
          ...state.player,
          stats: {
            ...state.player.stats,
            ...statUpdates
          }
        }
      }));
    },
    
    // 세계 상태 업데이트
    updateWorld: (worldUpdates) => {
      set((state) => ({
        world: {
          ...state.world,
          ...worldUpdates
        }
      }));
    },
    
    // 창조 요소 추가
    addCreatedElement: (element) => {
      set((state) => ({
        player: {
          ...state.player,
          createdElements: [...state.player.createdElements, {
            id: `element_${Date.now()}`,
            name: element,
            timestamp: new Date().toISOString()
          }]
        },
        world: {
          ...state.world,
          elements: [...state.world.elements, element]
        }
      }));
    },
    
    // 업적 추가
    addAchievement: (achievement) => {
      set((state) => ({
        player: {
          ...state.player,
          achievements: [...state.player.achievements, {
            id: `achievement_${Date.now()}`,
            name: achievement,
            timestamp: new Date().toISOString()
          }]
        }
      }));
    },
    
    // 게임 리셋
    resetGame: () => {
      set({
        gameId: null,
        isGameStarted: false,
        isLoading: false,
        error: null,
        messages: [],
        currentChoices: [],
        isWaitingForChoice: false,
        player: {
          name: '창조자',
          stats: {
            wisdom: 50,
            power: 50,
            compassion: 50,
            creativity: 50
          },
          achievements: [],
          createdElements: []
        },
        world: {
          stage: 'beginning',
          elements: [],
          population: 0,
          environment: 'void',
          events: []
        }
      });
    },
    
    // 메시지 히스토리 가져오기 (최근 N개)
    getRecentMessages: (count = 10) => {
      const state = get();
      return state.messages.slice(-count);
    },
    
    // 게임 상태 요약 가져오기
    getGameSummary: () => {
      const state = get();
      return {
        stage: state.world.stage,
        elementsCount: state.world.elements.length,
        playerStats: state.player.stats,
        achievements: state.player.achievements.length,
        messagesCount: state.messages.length
      };
    }
  }))
);

export default useGameStore;
// GameStore.js 끝