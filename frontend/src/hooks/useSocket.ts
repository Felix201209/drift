import {io, Socket} from 'socket.io-client';
import {useState, useEffect, useRef, useCallback} from 'react';
import type {LangCode} from '../languages';

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
  isJoiningQueue: boolean;
  humanCheckError: string | null;
}

interface ChatActions {
  startDrifting: () => void;
  selectLanguage: (lang: LangCode) => void;
  joinQueue: (humanToken?: string | null) => Promise<void>;
  sendMessage: (text: string) => void;
  setTyping: (isTyping: boolean) => void;
  leaveRoom: () => void;
  resetToLanding: () => void;
  changeLanguage: () => void;
}

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
const HUMAN_CHECK_ENABLED = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);

export function useSocket(preferredLanguage: LangCode | null = null): {state: ChatState; actions: ChatActions} {
  const socketRef = useRef<Socket | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const [state, setState] = useState<ChatState>({
    status: 'landing',
    language: null,
    messages: [],
    isPartnerTyping: false,
    roomId: null,
    queuePosition: null,
    isJoiningQueue: false,
    humanCheckError: null,
  });

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

  const selectLanguage = useCallback((lang: LangCode) => {
    setState((prev) => ({...prev, language: lang, humanCheckError: null}));
    localStorage.setItem('drift_lang', lang);
  }, []);

  const goToLanguageSelection = useCallback(() => {
    const savedLang = localStorage.getItem('drift_lang') as LangCode | null;
    setState((prev) => ({
      ...prev,
      status: 'selecting_language',
      language: savedLang ?? prev.language ?? preferredLanguage,
      queuePosition: null,
      isJoiningQueue: false,
      humanCheckError: null,
    }));
  }, [preferredLanguage]);

  const startDrifting = useCallback(async () => {
    const healthUrl = `${SOCKET_URL}/health`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(healthUrl, {signal: controller.signal});
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error('Health check failed');
      goToLanguageSelection();
    } catch {
      setState((prev) => ({
        ...prev,
        status: 'waking_up',
        isJoiningQueue: false,
        humanCheckError: null,
      }));

      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch(healthUrl);
          if (res.ok) {
            clearInterval(pollInterval);
            goToLanguageSelection();
          }
        } catch {
          // Still waking up, continue polling
        }
      }, 2000);

      return () => clearInterval(pollInterval);
    }
  }, [goToLanguageSelection]);

  const ensureHumanPass = useCallback(async (humanToken?: string | null) => {
    if (!HUMAN_CHECK_ENABLED) return null;
    if (!humanToken) {
      throw new Error('先过一下人机验证。');
    }

    const response = await fetch(`${SOCKET_URL}/api/human-pass`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: humanToken}),
    });

    const data = (await response.json().catch(() => ({}))) as {
      pass?: string;
      error?: string;
    };

    if (!response.ok || !data.pass) {
      throw new Error(data.error || '人机验证失败，请重试。');
    }

    return data.pass;
  }, []);

  const joinQueue = useCallback(
    async (humanToken?: string | null) => {
      if (!state.language) return;

      setState((prev) => ({
        ...prev,
        isJoiningQueue: true,
        humanCheckError: null,
      }));

      let humanPass: string | null = null;
      try {
        humanPass = await ensureHumanPass(humanToken);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isJoiningQueue: false,
          humanCheckError: error instanceof Error ? error.message : '人机验证失败，请重试。',
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        status: 'waiting',
        queuePosition: null,
        isJoiningQueue: false,
        humanCheckError: null,
      }));

      if (!socketRef.current) {
        socketRef.current = io(SOCKET_URL, {
          autoConnect: false,
          transports: ['websocket'],
        });
      }

      const socket = socketRef.current;

      socket.off('matched');
      socket.off('waiting');
      socket.off('message');
      socket.off('typing');
      socket.off('partner_left');
      socket.off('human_check_required');
      socket.off('rate_limited');
      socket.off('connect_error');

      socket.on('matched', ({roomId, language}: {roomId: string; language: LangCode}) => {
        setState((prev) => ({
          ...prev,
          status: 'chatting',
          roomId,
          language,
          queuePosition: null,
          humanCheckError: null,
        }));
      });

      socket.on('waiting', ({position}: {position: number}) => {
        setState((prev) => ({
          ...prev,
          status: 'waiting',
          queuePosition: position,
        }));
      });

      socket.on('message', ({text, ts}: {text: string; ts: number}) => {
        const newMessage: Message = {
          id: generateMessageId(),
          text,
          from: 'them',
          ts,
        };

        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, newMessage],
        }));
      });

      socket.on('typing', ({isTyping}: {isTyping: boolean}) => {
        setState((prev) => ({...prev, isPartnerTyping: isTyping}));
      });

      socket.on('partner_left', () => {
        setState((prev) => ({
          ...prev,
          status: 'disconnected',
          isPartnerTyping: false,
        }));
      });

      socket.on('human_check_required', () => {
        setState((prev) => ({
          ...prev,
          status: 'selecting_language',
          queuePosition: null,
          humanCheckError: '验证过期了，重新过一下。',
        }));
      });

      socket.on('rate_limited', ({scope}: {scope?: string}) => {
        const message =
          scope === 'queue'
            ? '点得太猛了，缓几秒再试。'
            : scope === 'message'
              ? '消息发太快了。'
              : '请求太快了，缓一下。';

        setState((prev) => ({
          ...prev,
          humanCheckError: message,
          status: prev.status === 'waiting' ? 'selecting_language' : prev.status,
        }));
      });

      socket.on('connect_error', (error: Error) => {
        const message =
          error.message === 'too_many_connections'
            ? '连接太频繁了，等几秒。'
            : error.message === 'too_many_active_sockets'
              ? '同一网络开太多连接了，先关掉几页。'
              : '连接失败了，重试一下。';

        setState((prev) => ({
          ...prev,
          status: 'selecting_language',
          humanCheckError: message,
        }));
      });

      if (!socket.connected) {
        socket.connect();
      }

      socket.emit('join_queue', {
        language: state.language,
        humanPass: humanPass || undefined,
      });
    },
    [ensureHumanPass, state.language],
  );

  const sendMessage = useCallback(
    (text: string) => {
      if (!socketRef.current || !state.roomId) return;

      const trimmed = text.trim();
      if (!trimmed) return;

      const ts = Date.now();
      const newMessage: Message = {
        id: generateMessageId(),
        text: trimmed,
        from: 'me',
        ts,
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, newMessage],
      }));

      socketRef.current.emit('message', {roomId: state.roomId, text: trimmed});
    },
    [state.roomId],
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      if (!socketRef.current || !state.roomId) return;

      const now = Date.now();
      if (isTyping && now - lastTypingSentRef.current < 500) return;
      lastTypingSentRef.current = now;

      socketRef.current.emit('typing', {roomId: state.roomId, isTyping});

      if (isTyping) {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        typingTimeoutRef.current = setTimeout(() => {
          if (socketRef.current && state.roomId) {
            socketRef.current.emit('typing', {roomId: state.roomId, isTyping: false});
          }
        }, 1500);
      }
    },
    [state.roomId],
  );

  const leaveRoom = useCallback(() => {
    if (!socketRef.current || !state.roomId) return;

    socketRef.current.emit('leave_room', {roomId: state.roomId});
    setState((prev) => ({...prev, status: 'disconnected'}));
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
      isJoiningQueue: false,
      humanCheckError: null,
    });
  }, []);

  const changeLanguage = useCallback(() => {
    localStorage.removeItem('drift_lang');
    setState((prev) => ({
      ...prev,
      language: null,
      status: 'selecting_language',
      humanCheckError: null,
    }));
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

  return {state, actions};
}

function generateMessageId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
