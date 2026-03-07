import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {KeyboardEvent} from 'react';
import {useSocket} from './hooks/useSocket';
import {useUiLocale} from './hooks/useUiLocale';
import {HumanCheck} from './components/HumanCheck';
import {LANGUAGES} from './languages';
import type {LangCode} from './languages';
import {getLanguageLabel, UI_COPY} from './uiCopy';
import type {UiLocale} from './uiCopy';

const API_BASE = import.meta.env.VITE_SOCKET_URL || window.location.origin;

function FadeIn({children}: {children: React.ReactNode}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.35s ease';
    requestAnimationFrame(() => {
      el.style.opacity = '1';
    });
  }, []);

  return <div ref={ref}>{children}</div>;
}

export interface ChatState {
  status: 'landing' | 'selecting_language' | 'waiting' | 'chatting' | 'disconnected' | 'waking_up';
  language: LangCode | null;
  messages: Array<{id: string; text: string; from: 'me' | 'them'; ts: number}>;
  isPartnerTyping: boolean;
  isJoiningQueue: boolean;
  humanCheckError: string | null;
}

export interface ChatActions {
  startDrifting: () => void;
  selectLanguage: (lang: LangCode) => void;
  joinQueue: (humanToken?: string | null) => Promise<void>;
  sendMessage: (text: string) => void;
  setTyping: (isTyping: boolean) => void;
  leaveRoom: () => void;
  resetToLanding: () => void;
  changeLanguage: () => void;
}

function Landing({onStart, locale}: {onStart: () => void; locale: UiLocale}) {
  const copy = UI_COPY[locale];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white selection:bg-white/20 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute w-64 h-64 rounded-full bg-white blur-3xl"
          style={{
            top: '20%',
            left: '15%',
            opacity: 0.03,
            animation: 'particle-drift 20s ease-in-out infinite alternate',
          }}
        />
        <div
          className="absolute w-96 h-96 rounded-full bg-white blur-3xl"
          style={{
            bottom: '10%',
            right: '20%',
            opacity: 0.04,
            animation: 'particle-drift 25s ease-in-out infinite alternate-reverse',
            animationDelay: '-5s',
          }}
        />
        <div
          className="absolute w-48 h-48 rounded-full bg-white blur-3xl"
          style={{
            top: '40%',
            right: '10%',
            opacity: 0.02,
            animation: 'particle-drift 18s ease-in-out infinite alternate',
            animationDelay: '-10s',
          }}
        />
      </div>

      <div className="absolute top-6 left-8 font-light tracking-widest text-sm text-white/80 z-10">drift</div>

      <div className="flex flex-col items-center text-center z-10">
        <h1
          className="text-8xl font-thin tracking-[0.3em] text-white ml-[0.3em]"
          style={{
            animation:
              'fade-in-up 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards, drift-float 12s ease-in-out infinite 1.8s',
            opacity: 0,
            willChange: 'transform, opacity, filter',
          }}
        >
          drift
        </h1>

        <div
          className="w-16 h-px bg-white/20 mx-auto my-6 origin-center"
          style={{
            animation: 'scale-x-in 1s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            animationDelay: '0.4s',
            transform: 'scaleX(0)',
          }}
        />

        <div
          className="text-base text-white/40 font-light tracking-wide leading-relaxed"
          style={{
            animation: 'fade-in 1.2s ease-out forwards',
            animationDelay: '0.8s',
            opacity: 0,
          }}
        >
          {copy.landingTaglineTop}
          <br />
          {copy.landingTaglineBottom}
        </div>

        <div className="mt-12 flex flex-col items-start gap-3">
          <div
            className="flex items-center gap-4"
            style={{
              animation: 'slide-in-right 0.8s ease-out forwards',
              animationDelay: '1.2s',
              opacity: 0,
              transform: 'translateX(-10px)',
            }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
            <span className="text-sm text-white/30 font-light">{copy.landingFeatureMatched}</span>
          </div>
          <div
            className="flex items-center gap-4"
            style={{
              animation: 'slide-in-right 0.8s ease-out forwards',
              animationDelay: '1.3s',
              opacity: 0,
              transform: 'translateX(-10px)',
            }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
            <span className="text-sm text-white/30 font-light">{copy.landingFeatureNoHistory}</span>
          </div>
          <div
            className="flex items-center gap-4"
            style={{
              animation: 'slide-in-right 0.8s ease-out forwards',
              animationDelay: '1.4s',
              opacity: 0,
              transform: 'translateX(-10px)',
            }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
            <span className="text-sm text-white/30 font-light">{copy.landingFeatureGone}</span>
          </div>
        </div>

        <button
          onClick={onStart}
          className="mt-12 px-10 py-3 text-sm tracking-widest uppercase border border-white text-white hover:bg-white hover:text-[#0a0a0a] transition-colors duration-300"
          style={{
            animation: 'fade-in 1s ease-out forwards',
            animationDelay: '1.8s',
            opacity: 0,
          }}
        >
          {copy.landingStart}
        </button>

        <div
          className="text-xs text-white/20 mt-4 font-light"
          style={{
            animation: 'fade-in 1s ease-out forwards',
            animationDelay: '2.0s',
            opacity: 0,
          }}
        >
          {copy.landingHint}
        </div>
      </div>

      <div className="absolute bottom-6 left-8 text-[11px] text-white/10 font-light tracking-wide z-10">made by felix</div>
      <div className="absolute bottom-6 right-8 text-xs text-white/10 font-light z-10">v0.1</div>
    </div>
  );
}

function WakingUp({locale}: {locale: UiLocale}) {
  const copy = UI_COPY[locale];

  return (
    <div className="relative flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white selection:bg-white/20">
      <div className="absolute top-6 left-8 font-light tracking-widest text-sm text-white/80">drift</div>

      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <div className="w-3 h-3 bg-white/60 rounded-full animate-pulse" />
          <div className="absolute inset-0 w-3 h-3 bg-white/30 rounded-full animate-ping" />
        </div>

        <div className="mt-8">
          <p className="text-white/40 font-light tracking-wide">{copy.wakingTitle}</p>
          <p className="text-xs text-white/20 font-light mt-2">{copy.wakingHint}</p>
        </div>
      </div>

      <div className="absolute bottom-6 left-8 text-[11px] text-white/10 font-light tracking-wide">made by felix</div>
      <div className="absolute bottom-6 right-8 text-xs text-white/10 font-light">v0.1</div>
    </div>
  );
}

function LanguageSelection({
  selectedLang,
  onSelect,
  onNext,
  showChangeHint,
  humanCheckEnabled,
  humanToken,
  onHumanTokenChange,
  isJoiningQueue,
  humanCheckError,
  siteKey,
  locale,
}: {
  selectedLang: LangCode | null;
  onSelect: (l: LangCode) => void;
  onNext: (humanToken?: string | null) => void | Promise<void>;
  showChangeHint?: boolean;
  humanCheckEnabled: boolean;
  humanToken: string | null;
  onHumanTokenChange: (token: string | null) => void;
  isJoiningQueue: boolean;
  humanCheckError: string | null;
  siteKey?: string;
  locale: UiLocale;
}) {
  const copy = UI_COPY[locale];

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white p-6 selection:bg-white/20">
      <h2 className="text-2xl font-light tracking-wide mb-12">{copy.languageTitle}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-3xl mb-16">
        {LANGUAGES.map((lang) => {
          const isSelected = selectedLang === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => onSelect(lang.code)}
              className={`flex flex-col items-start p-4 rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-white/60 bg-white/5' : 'border-white/10 hover:border-white/30'
              }`}
            >
              <span className="text-sm font-medium text-white/90">{getLanguageLabel(lang.code, locale)}</span>
              <span className="text-xs text-white/30 mt-1 uppercase tracking-wider">{lang.code}</span>
            </button>
          );
        })}
      </div>

      {humanCheckEnabled && siteKey ? (
        <HumanCheck
          siteKey={siteKey}
          value={humanToken}
          onChange={onHumanTokenChange}
          error={humanCheckError}
          locale={locale}
        />
      ) : null}

      <button
        onClick={() => onNext(humanToken)}
        disabled={!selectedLang || isJoiningQueue || (humanCheckEnabled && !humanToken)}
        className={`flex items-center gap-2 text-sm tracking-widest uppercase transition-all duration-300 ${
          selectedLang && !isJoiningQueue && (!humanCheckEnabled || Boolean(humanToken))
            ? 'text-white hover:text-white/70 cursor-pointer'
            : 'text-white/20 cursor-not-allowed'
        }`}
      >
        <span>{isJoiningQueue ? copy.verifying : copy.continue}</span>
      </button>

      {!humanCheckEnabled ? <p className="mt-5 text-xs text-white/18 font-light">{copy.humanCheckOff}</p> : null}

      {showChangeHint ? (
        <p className="mt-6 text-xs text-white/20 font-light text-center">
          {copy.changeHintLead} <span className="text-white/40">{copy.changeHintTail}</span>
        </p>
      ) : null}
    </div>
  );
}

function Waiting({
  onCancel,
  language,
  locale,
  apiBase,
}: {
  onCancel: () => void;
  language: LangCode | null;
  locale: UiLocale;
  apiBase: string;
}) {
  const copy = UI_COPY[locale];
  const [msgIndex, setMsgIndex] = useState(0);
  const [queueCount, setQueueCount] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % copy.waitingMessages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [copy.waitingMessages.length]);

  useEffect(() => {
    const fetchQueueCount = async () => {
      try {
        const res = await fetch(`${apiBase}/health`);
        const data = (await res.json()) as {queueByLanguage?: Record<string, number>};
        if (data.queueByLanguage && language) {
          setQueueCount(data.queueByLanguage[language] || 0);
        }
      } catch {
        // silently fail
      }
    };

    fetchQueueCount();
    const interval = setInterval(fetchQueueCount, 5000);
    return () => clearInterval(interval);
  }, [apiBase, language]);

  const langLabel = language ? getLanguageLabel(language, locale) : '';

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white selection:bg-white/20">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-[60px] h-[60px] rounded-full border border-white/10 border-t-white animate-spin" />

        <div className="h-6 mt-8">
          <p className="text-sm text-white/50 font-light transition-opacity duration-500">{copy.waitingMessages[msgIndex]}</p>
        </div>

        <div className="h-4 mt-3">
          <p className="text-xs text-white/20 font-light">
            {queueCount === null
              ? ''
              : queueCount === 0
                ? copy.waitingEmpty(langLabel)
                : copy.waitingOthers(queueCount)}
          </p>
        </div>
      </div>

      <div className="pb-12">
        <button
          onClick={onCancel}
          className="text-xs text-white/20 hover:text-white/50 transition-colors tracking-widest uppercase"
        >
          {copy.cancel}
        </button>
      </div>
    </div>
  );
}

function Chatting({
  state,
  actions,
  locale,
}: {
  state: ChatState;
  actions: ChatActions;
  locale: UiLocale;
}) {
  const copy = UI_COPY[locale];
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [state.messages, state.isPartnerTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    actions.sendMessage(input);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    actions.setTyping(e.target.value.length > 0);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
  };

  const langLabel = getLanguageLabel(state.language || 'any', locale);

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0a] text-white selection:bg-white/20 font-light">
      <header className="fixed top-0 left-0 right-0 h-14 bg-[#0a0a0a]/90 backdrop-blur-sm z-10 flex items-center justify-between px-6 border-b border-white/5">
        <div className="flex items-center gap-4">
          <span className="font-light tracking-widest text-sm text-white/80">drift</span>
          <span className="w-px h-3 bg-white/10" />
          <span className="text-xs text-white/30 uppercase tracking-wider">{langLabel}</span>
        </div>

        <button
          onClick={actions.leaveRoom}
          className="text-xs text-white/20 hover:text-red-400 tracking-widest uppercase transition-colors"
        >
          {copy.end}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-20 pb-24 space-y-6 flex flex-col">
        <div className="flex-1" />
        {state.messages.map((msg) => {
          const isMe = msg.from === 'me';
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`px-4 py-2 max-w-xs md:max-w-md whitespace-pre-wrap break-words text-sm leading-relaxed ${
                  isMe
                    ? 'bg-white text-black rounded-2xl rounded-tr-sm'
                    : 'bg-white/8 text-white rounded-2xl rounded-tl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {state.isPartnerTyping ? (
          <div className="flex justify-start">
            <div className="flex gap-1.5 items-center px-4 py-3 h-10">
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
              <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-white/5 p-4 z-10">
        <div className="max-w-4xl mx-auto flex items-end gap-4">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={copy.typePlaceholder}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-white/20 text-sm resize-none outline-none py-2 min-h-[24px] max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="pb-2 text-white/30 hover:text-white disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

function Disconnected({
  onReset,
  onHome,
  onChangeLanguage,
  locale,
}: {
  onReset: () => void;
  onHome: () => void;
  onChangeLanguage: () => void;
  locale: UiLocale;
}) {
  const copy = UI_COPY[locale];
  const hasSavedLang = localStorage.getItem('drift_lang') !== null;

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white selection:bg-white/20">
      <div className="text-center mb-10">
        <h2 className="text-4xl font-thin text-white/60 mb-3">{copy.disconnectedTitle}</h2>
        <p className="text-sm text-white/30 font-light">{copy.disconnectedSubtitle}</p>
      </div>

      <div className="flex items-center gap-8 mt-10">
        <button
          onClick={onReset}
          className="px-8 py-3 border border-white text-sm tracking-widest uppercase hover:bg-white hover:text-black transition-colors"
        >
          {copy.driftAgain}
        </button>
        <button
          onClick={onHome}
          className="text-sm text-white/20 hover:text-white/60 tracking-widest uppercase transition-colors"
        >
          {copy.goHome}
        </button>
      </div>

      {hasSavedLang ? (
        <button
          onClick={onChangeLanguage}
          className="mt-8 text-xs text-white/20 hover:text-white/40 tracking-widest uppercase transition-colors"
        >
          {copy.changeLanguage}
        </button>
      ) : null}
    </div>
  );
}

export default function App() {
  const {locale: uiLocale} = useUiLocale();
  const preferredLanguage: LangCode | null = uiLocale === 'zh' ? 'zh' : null;
  const {state, actions} = useSocket(preferredLanguage);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const humanCheckEnabled = Boolean(siteKey);
  const [humanToken, setHumanToken] = useState<string | null>(null);

  const handleHumanTokenChange = useCallback((token: string | null) => {
    setHumanToken(token);
  }, []);

  switch (state.status) {
    case 'landing':
      return (
        <FadeIn key="landing">
          <Landing onStart={actions.startDrifting} locale={uiLocale} />
        </FadeIn>
      );
    case 'waking_up':
      return (
        <FadeIn key="waking">
          <WakingUp locale={uiLocale} />
        </FadeIn>
      );
    case 'selecting_language':
      return (
        <FadeIn key="lang">
          <LanguageSelection
            selectedLang={state.language}
            onSelect={actions.selectLanguage}
            onNext={actions.joinQueue}
            showChangeHint={localStorage.getItem('drift_lang') !== null}
            humanCheckEnabled={humanCheckEnabled}
            humanToken={humanToken}
            onHumanTokenChange={handleHumanTokenChange}
            isJoiningQueue={state.isJoiningQueue}
            humanCheckError={state.humanCheckError}
            siteKey={siteKey}
            locale={uiLocale}
          />
        </FadeIn>
      );
    case 'waiting':
      return (
        <FadeIn key="waiting">
          <Waiting onCancel={actions.startDrifting} language={state.language} locale={uiLocale} apiBase={API_BASE} />
        </FadeIn>
      );
    case 'chatting':
      return (
        <FadeIn key="chat">
          <Chatting state={state} actions={actions} locale={uiLocale} />
        </FadeIn>
      );
    case 'disconnected':
      return (
        <FadeIn key="dc">
          <Disconnected
            onReset={actions.startDrifting}
            onHome={actions.resetToLanding}
            onChangeLanguage={actions.changeLanguage}
            locale={uiLocale}
          />
        </FadeIn>
      );
    default:
      return null;
  }
}
