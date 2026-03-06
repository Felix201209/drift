import { io, Socket } from 'socket.io-client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { LangCode } from '../languages';

type Status = 'landing' | 'selecting_language' | 'waiting' | 'chatting' | 'disconnected' | 'waking_up';

interface Message {
  id: string;
  text: string;
  from: 'me' | 'them';
  ts: number;
}

interface ChatState {
  status: Status;
  language: LangCode | null;
  messages: Message[];
  isPartnerTyping: boolean;
  roomId: string | null;
  queuePosition: number | null;
}

interface ChatActions {
  startDrifting: () => void;
  selectLanguage: (lang: LangCode) => void;
  joinQueue: () => void;
  sendMessage: (text: string) => void;
  setTyping: (isTyping: boolean) => void;
  leaveRoom: () => void;
  resetToLanding: () => void;
  changeLanguage: () => void;
}

export function useSocket(): { state: ChatState; actions: ChatActions } {
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);   // throttle typing events
  
  const [state, setState] = useState<ChatState>({
    status: 'landing',
    language: null,
    messages: [],
    isPartnerTyping: false,
    roomId: null,
    queuePosition: null,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Auto-join queue when language is set but status is still landing (from localStorage)
  useEffect(() => {
    if (state.language && state.status === 'landing') {
      joinQueue();
    }
  }, [state.language, state.status]);

  const selectLanguage = useCallback((lang: LangCode) => {
    setState(prev => ({ ...prev, language: lang }));
    localStorage.setItem('drift_lang', lang);
  }, []);

  const startDrifting = useCallback(async () => {
    // Health check before starting - detect if backend is waking up
    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    console.log('[Drift] SOCKET_URL:', SOCKET_URL, 'VITE_SOCKET_URL:', import.meta.env.VITE_SOCKET_URL);
    const healthUrl = `${SOCKET_URL}/health`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    try {
      const response = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('Health check failed');
    } catch {
      // Health check failed or timed out - backend is likely waking up
      setState(prev => ({ ...prev, status: 'waking_up' }));
      
      // Poll until backend is ready
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch(healthUrl);
          if (res.ok) {
            clearInterval(pollInterval);
            // Backend is ready, always go to language selection
            // savedLang only used for pre-selection, not skipping
            setState(prev => ({ ...prev, status: 'selecting_language' }));
          }
        } catch {
          // Still waking up, continue polling
        }
      }, 2000);
      
      // Cleanup polling on unmount
      return () => clearInterval(pollInterval);
    }
    
    // Health check passed quickly - proceed normally
    const savedLang = localStorage.getItem('drift_lang') as LangCode | null;
    if (savedLang) {
      setState(prev => ({ ...prev, language: savedLang }));
      // Will trigger joinQueue via useEffect when language changes
    } else {
      setState(prev => ({ ...prev, status: 'selecting_language' }));
    }
  }, []);

  const joinQueue = useCallback(() => {
    if (!state.language) return;

    // Optimistic update: show waiting UI immediately
    setState(prev => ({ ...prev, status: 'waiting', queuePosition: null }));

    // Create socket connection on demand
    if (!socketRef.current) {
      const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
      console.log('[Drift Client] Socket connecting to:', SOCKET_URL, 'env:', import.meta.env);
      socketRef.current = io(SOCKET_URL, {
        autoConnect: false,
        transports: ['websocket'],  // skip HTTP polling
      });
    }

    const socket = socketRef.current;

    // Always re-register events (clean first to avoid duplicates)
    socket.off('matched');
    socket.off('waiting');
    socket.off('message');
    socket.off('typing');
    socket.off('partner_left');

    socket.on('matched', ({ roomId, language }: { roomId: string; language: LangCode }) => {
      setState(prev => ({
        ...prev,
        status: 'chatting',
        roomId,
        language,
        queuePosition: null,
      }));
    });

    socket.on('waiting', ({ position }: { position: number }) => {
      setState(prev => ({
        ...prev,
        status: 'waiting',
        queuePosition: position,
      }));
    });

    socket.on('message', ({ text, ts }: { text: string; ts: number }) => {
      const newMessage: Message = {
        id: generateMessageId(),
        text,
        from: 'them',
        ts,
      };
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, newMessage],
      }));
    });

    socket.on('typing', ({ isTyping }: { isTyping: boolean }) => {
      setState(prev => ({ ...prev, isPartnerTyping: isTyping }));
    });

    socket.on('partner_left', () => {
      setState(prev => ({ ...prev, status: 'disconnected' }));
    });

    // Connect and join queue
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('join_queue', { language: state.language });
  }, [state.language]);

  const sendMessage = useCallback((text: string) => {
    if (!socketRef.current || !state.roomId) return;
    
    const ts = Date.now();
    const newMessage: Message = {
      id: generateMessageId(),
      text,
      from: 'me',
      ts,
    };
    
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage],
    }));
    
    socketRef.current.emit('message', { roomId: state.roomId, text });
  }, [state.roomId]);

  const setTyping = useCallback((isTyping: boolean) => {
    if (!socketRef.current || !state.roomId) return;

    const now = Date.now();
    // Throttle: only send 'isTyping=true' every 500ms to cut event spam
    if (isTyping && now - lastTypingSentRef.current < 500) return;
    lastTypingSentRef.current = now;

    socketRef.current.emit('typing', { roomId: state.roomId, isTyping });

    // Auto-send stop-typing after 2s of silence
    if (isTyping) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current && state.roomId) {
          socketRef.current.emit('typing', { roomId: state.roomId, isTyping: false });
        }
      }, 2000);
    }
  }, [state.roomId]);

  const leaveRoom = useCallback(() => {
    if (!socketRef.current || !state.roomId) return;
    
    socketRef.current.emit('leave_room', { roomId: state.roomId });
    setState(prev => ({ ...prev, status: 'disconnected' }));
  }, [state.roomId]);

  const resetToLanding = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    setState({
      status: 'landing',
      language: null,
      messages: [],
      isPartnerTyping: false,
      roomId: null,
      queuePosition: null,
    });
  }, []);

  const changeLanguage = useCallback(() => {
    localStorage.removeItem('drift_lang');
    setState(prev => ({ ...prev, language: null, status: 'selecting_language' }));
  }, []);

  const actions: ChatActions = {
    startDrifting,
    selectLanguage,
    joinQueue,
    sendMessage,
    setTyping,
    leaveRoom,
    resetToLanding,
    changeLanguage,
  };

  return { state, actions };
}

function generateMessageId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
