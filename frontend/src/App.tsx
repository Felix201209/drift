import React, { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useSocket } from './hooks/useSocket';
import { LANGUAGES } from './languages';
import type { LangCode } from './languages';

// ─── Fade wrapper ─────────────────────────────────────────────────────────────
function FadeIn({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export interface ChatState {
  status: 'landing' | 'selecting_language' | 'waiting' | 'chatting' | 'disconnected' | 'waking_up';
  language: LangCode | null;
  messages: Array<{ id: string; text: string; from: 'me' | 'them'; ts: number }>;
  isPartnerTyping: boolean;
}

export interface ChatActions {
  startDrifting: () => void;
  selectLanguage: (lang: LangCode) => void;
  joinQueue: () => void;
  sendMessage: (text: string) => void;
  setTyping: (isTyping: boolean) => void;
  leaveRoom: () => void;
  resetToLanding: () => void;
  changeLanguage: () => void;
}

function Landing({ onStart }: { onStart: () => void }) {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white selection:bg-white/20 overflow-hidden">
      
      {/* Background Particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div 
          className="absolute w-64 h-64 rounded-full bg-white blur-3xl"
          style={{ 
            top: '20%', left: '15%', opacity: 0.03,
            animation: 'particle-drift 20s ease-in-out infinite alternate' 
          }}
        />
        <div 
          className="absolute w-96 h-96 rounded-full bg-white blur-3xl"
          style={{ 
            bottom: '10%', right: '20%', opacity: 0.04,
            animation: 'particle-drift 25s ease-in-out infinite alternate-reverse',
            animationDelay: '-5s'
          }}
        />
        <div 
          className="absolute w-48 h-48 rounded-full bg-white blur-3xl"
          style={{ 
            top: '40%', right: '10%', opacity: 0.02,
            animation: 'particle-drift 18s ease-in-out infinite alternate',
            animationDelay: '-10s'
          }}
        />
      </div>

      {/* Top Left Logo */}
      <div className="absolute top-6 left-8 font-light tracking-widest text-sm text-white/80 z-10">
        drift
      </div>

      {/* Center Content */}
      <div className="flex flex-col items-center text-center z-10">
        <h1 
          className="text-8xl font-thin tracking-[0.3em] text-white ml-[0.3em]"
          style={{ 
            animation: 'fade-in-up 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards, drift-float 12s ease-in-out infinite 1.8s',
            opacity: 0,
            willChange: 'transform, opacity, filter'
          }}
        >
          drift
        </h1>

        <div 
          className="w-16 h-px bg-white/20 mx-auto my-6 origin-center"
          style={{
            animation: 'scale-x-in 1s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            animationDelay: '0.4s',
            transform: 'scaleX(0)'
          }}
        ></div>

        <div 
          className="text-base text-white/40 font-light tracking-wide leading-relaxed"
          style={{
            animation: 'fade-in 1.2s ease-out forwards',
            animationDelay: '0.8s',
            opacity: 0
          }}
        >
          one conversation.<br/>then gone.
        </div>

        {/* Features */}
        <div className="mt-12 flex flex-col items-start gap-3">
          <div 
            className="flex items-center gap-4"
            style={{ animation: 'slide-in-right 0.8s ease-out forwards', animationDelay: '1.2s', opacity: 0, transform: 'translateX(-10px)' }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            <span className="text-sm text-white/30 font-light">matched by language</span>
          </div>
          <div 
            className="flex items-center gap-4"
            style={{ animation: 'slide-in-right 0.8s ease-out forwards', animationDelay: '1.3s', opacity: 0, transform: 'translateX(-10px)' }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            <span className="text-sm text-white/30 font-light">zero accounts, zero history</span>
          </div>
          <div 
            className="flex items-center gap-4"
            style={{ animation: 'slide-in-right 0.8s ease-out forwards', animationDelay: '1.4s', opacity: 0, transform: 'translateX(-10px)' }}
          >
            <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
            <span className="text-sm text-white/30 font-light">close tab = it never happened</span>
          </div>
        </div>

        {/* Action */}
        <button
          onClick={onStart}
          className="mt-12 px-10 py-3 text-sm tracking-widest uppercase border border-white text-white hover:bg-white hover:text-[#0a0a0a] transition-colors duration-300"
          style={{
            animation: 'fade-in 1s ease-out forwards',
            animationDelay: '1.8s',
            opacity: 0
          }}
        >
          start drifting
        </button>

        <div 
          className="text-xs text-white/20 mt-4 font-light"
          style={{
            animation: 'fade-in 1s ease-out forwards',
            animationDelay: '2.0s',
            opacity: 0
          }}
        >
          somewhere out there, a stranger is waiting.
        </div>
      </div>

      {/* Bottom — version + credits, same opacity as v0.1 */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-between px-8 z-10">
        <span className="text-xs text-white/10 font-light">
          by{' '}
          <a
            href="https://github.com/Felix201209/drift"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/25 transition-colors"
          >
            Felix Yu
          </a>
          {' '}·{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white/25 transition-colors"
          >
            CC BY 4.0
          </a>
        </span>
        <span className="text-xs text-white/10 font-light">v0.1</span>
      </div>
    </div>
  );
}

function WakingUp() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white selection:bg-white/20">
      {/* Top Left Logo */}
      <div className="absolute top-6 left-8 font-light tracking-widest text-sm text-white/80">
        drift
      </div>

      {/* Center Content */}
      <div className="flex flex-col items-center text-center">
        {/* Pulse Animation */}
        <div className="relative">
          <div className="w-3 h-3 bg-white/60 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 w-3 h-3 bg-white/30 rounded-full animate-ping"></div>
        </div>

        {/* Text */}
        <div className="mt-8">
          <p className="text-white/40 font-light tracking-wide">
            waking up...
          </p>
          <p className="text-xs text-white/20 font-light mt-2">
            free servers sleep when idle · just a moment
          </p>
        </div>
      </div>

      {/* Bottom Right Version */}
      <div className="absolute bottom-6 right-8 text-xs text-white/10 font-light">
        v0.1
      </div>
    </div>
  );
}

function LanguageSelection({
  selectedLang,
  onSelect,
  onNext,
  showChangeHint
}: {
  selectedLang: LangCode | null,
  onSelect: (l: LangCode) => void,
  onNext: () => void,
  showChangeHint?: boolean
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white p-6 selection:bg-white/20">
      <h2 className="text-2xl font-light tracking-wide mb-12">choose your language</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-3xl mb-16">
        {LANGUAGES.map((lang) => {
          const isSelected = selectedLang === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => onSelect(lang.code)}
              className={`flex flex-col items-start p-4 rounded-lg border transition-all duration-200 ${
                isSelected
                  ? 'border-white/60 bg-white/5'
                  : 'border-white/10 hover:border-white/30'
              }`}
            >
              <span className="text-sm font-medium text-white/90">{lang.label}</span>
              <span className="text-xs text-white/30 mt-1 uppercase tracking-wider">{lang.code}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onNext}
        disabled={!selectedLang}
        className={`flex items-center gap-2 text-sm tracking-widest uppercase transition-all duration-300 ${
          selectedLang
            ? 'text-white hover:text-white/70 cursor-pointer'
            : 'text-white/20 cursor-not-allowed'
        }`}
      >
        <span>continue &rarr;</span>
      </button>

      {showChangeHint && (
        <p className="mt-6 text-xs text-white/20 font-light">
          your previous choice was saved. <span className="text-white/40">change language below if needed.</span>
        </p>
      )}
    </div>
  );
}

function Waiting({
  onCancel,
  language
}: {
  onCancel: () => void;
  language: LangCode | null;
}) {
  const [msgIndex, setMsgIndex] = useState(0);
  const [queueCount, setQueueCount] = useState<number | null>(null);

  const messages = [
    "finding your match...",
    "someone out there is waiting too",
    "connecting across timezones...",
    "almost there"
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages.length]);

  // Poll queue count
  useEffect(() => {
    const fetchQueueCount = async () => {
      try {
        const res = await fetch('/health');
        const data = await res.json();
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
  }, [language]);

  const langLabel = LANGUAGES.find(l => l.code === language)?.label || language;

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white selection:bg-white/20">
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Spinner */}
        <div className="w-[60px] h-[60px] rounded-full border border-white/10 border-t-white animate-spin"></div>

        {/* Text */}
        <div className="h-6 mt-8">
          <p className="text-sm text-white/50 font-light transition-opacity duration-500">
            {messages[msgIndex]}
          </p>
        </div>

        {/* Queue count - subtle */}
        <div className="h-4 mt-3">
          <p className="text-xs text-white/20 font-light">
            {queueCount === null ? '' : queueCount === 0 ? `no one waiting in ${langLabel} yet` : `${queueCount} other waiting`}
          </p>
        </div>
      </div>

      {/* Cancel Button */}
      <div className="pb-12">
        <button
          onClick={onCancel}
          className="text-xs text-white/20 hover:text-white/50 transition-colors tracking-widest uppercase"
        >
          cancel
        </button>
      </div>
    </div>
  );
}

function Chatting({
  state,
  actions
}: {
  state: ChatState,
  actions: ChatActions
}) {
  const [input, setInput] = useState('');
  const [showEnd, setShowEnd] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.isPartnerTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    actions.sendMessage(input);
    setInput('');
    // Force reset textarea height and value display
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
    actions.setTyping(false);
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
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
  };

  const langObj = LANGUAGES.find(l => l.code === state.language) || LANGUAGES[0];
  const msgCount = state.messages.length;

  return (
    <div className="flex flex-col h-dvh bg-[#0a0a0a] text-white selection:bg-white/20 font-light">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-[#0a0a0a]/95 backdrop-blur-md z-10 flex items-center justify-between px-6"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-4">
          <span className="font-light tracking-widest text-sm text-white/80">drift</span>
          <span className="w-px h-3 bg-white/10"></span>
          <span className="text-xs text-white/30 uppercase tracking-wider">{langObj.label}</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 animate-pulse"></span>
            <span className="text-[10px] text-white/20 tracking-wider uppercase">live</span>
          </span>
        </div>

        <div className="flex items-center gap-6">
          <span className="text-[10px] text-white/15 tracking-wider">{msgCount} msg{msgCount !== 1 ? 's' : ''}</span>
          {showEnd ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/30">end this?</span>
              <button onClick={actions.leaveRoom} className="text-xs text-red-400/80 hover:text-red-400 tracking-widest uppercase transition-colors">yes</button>
              <button onClick={() => setShowEnd(false)} className="text-xs text-white/20 hover:text-white/50 tracking-widest uppercase transition-colors">no</button>
            </div>
          ) : (
            <button
              onClick={() => setShowEnd(true)}
              className="text-xs text-white/20 hover:text-white/50 tracking-widest uppercase transition-colors"
            >
              end
            </button>
          )}
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 pt-20 pb-28">
        {state.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ marginTop: 'calc(50vh - 140px)' }}>
            <div className="w-8 h-px bg-white/10"></div>
            <p className="text-xs text-white/20 font-light tracking-wider">you're connected · say something</p>
            <div className="w-8 h-px bg-white/10"></div>
          </div>
        )}

        <div className="space-y-2">
          {state.messages.map((msg, idx) => {
            const isMe = msg.from === 'me';
            const prev = state.messages[idx - 1];
            const isGrouped = prev && prev.from === msg.from;

            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-0.5' : 'mt-4'}`}>
                <div className="relative group max-w-xs md:max-w-md">
                  <div
                    className={`px-4 py-2.5 whitespace-pre-wrap break-words text-sm leading-relaxed transition-all duration-200 ${
                      isMe
                        ? 'bg-white text-[#0a0a0a] rounded-2xl rounded-tr-sm shadow-[0_0_20px_rgba(255,255,255,0.08)]'
                        : 'bg-[#161616] text-white/90 rounded-2xl rounded-tl-sm border border-white/8 shadow-[0_2px_16px_rgba(0,0,0,0.4)]'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <div className={`absolute -bottom-4 ${isMe ? 'right-0' : 'left-0'} opacity-0 group-hover:opacity-100 transition-opacity duration-200`}>
                    <span className="text-[9px] text-white/20 whitespace-nowrap">
                      {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {state.isPartnerTyping && (
          <div className="flex justify-start mt-4">
            <div className="flex gap-1.5 items-center px-4 py-3 bg-[#161616] border border-white/8 rounded-2xl rounded-tl-sm">
              <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
              <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
              <span className="w-1.5 h-1.5 bg-white/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="fixed bottom-0 left-0 right-0 z-10" style={{ background: 'linear-gradient(to top, #0a0a0a 80%, transparent)' }}>
        <div className="max-w-2xl mx-auto px-4 pb-6 pt-4">
          <div
            className="flex items-end gap-3 px-4 py-3 rounded-2xl border transition-all duration-200"
            style={{
              background: 'rgba(22,22,22,0.95)',
              borderColor: input.trim() ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.07)',
              boxShadow: input.trim() ? '0 0 24px rgba(255,255,255,0.04)' : 'none',
              backdropFilter: 'blur(16px)',
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="say something..."
              rows={1}
              className="flex-1 bg-transparent text-white/90 placeholder-white/20 text-sm resize-none outline-none py-0.5 min-h-[22px] max-h-32 leading-relaxed"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 ${
                input.trim()
                  ? 'bg-white text-[#0a0a0a] hover:bg-white/90 cursor-pointer'
                  : 'bg-white/5 text-white/20 cursor-not-allowed'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <p className="text-center text-[10px] text-white/10 mt-2 tracking-wide">enter to send · shift+enter for new line</p>
        </div>
      </div>
    </div>
  );
}

function Disconnected({ onReset, onHome, onChangeLanguage }: { onReset: () => void, onHome: () => void, onChangeLanguage: () => void }) {
  const hasSavedLang = localStorage.getItem('drift_lang') !== null;

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-[#0a0a0a] text-white selection:bg-white/20">
      <div className="text-center mb-10">
        <h2 className="text-4xl font-thin text-white/60 mb-3">they drifted away.</h2>
        <p className="text-sm text-white/30 font-light">that conversation is gone forever.</p>
      </div>

      <div className="flex items-center gap-8 mt-10">
        <button
          onClick={onReset}
          className="px-8 py-3 border border-white text-sm tracking-widest uppercase hover:bg-white hover:text-black transition-colors"
        >
          drift again
        </button>
        <button
          onClick={onHome}
          className="text-sm text-white/20 hover:text-white/60 tracking-widest uppercase transition-colors"
        >
          go home
        </button>
      </div>

      {hasSavedLang && (
        <button
          onClick={onChangeLanguage}
          className="mt-8 text-xs text-white/20 hover:text-white/40 tracking-widest uppercase transition-colors"
        >
          change language
        </button>
      )}
    </div>
  );
}



export default function App() {
  const { state, actions } = useSocket();
  switch (state.status) {
    case 'landing':
      return <FadeIn key="landing"><Landing onStart={actions.startDrifting} /></FadeIn>;
    case 'waking_up':
      return <FadeIn key="waking"><WakingUp /></FadeIn>;
    case 'selecting_language':
      return (
        <FadeIn key="lang">
          <LanguageSelection
            selectedLang={state.language}
            onSelect={actions.selectLanguage}
            onNext={actions.joinQueue}
            showChangeHint={localStorage.getItem('drift_lang') !== null}
          />
        </FadeIn>
      );
    case 'waiting':
      return (
        <FadeIn key="waiting">
          <Waiting
            onCancel={actions.startDrifting}
            language={state.language}
          />
        </FadeIn>
      );
    case 'chatting':
      return <FadeIn key="chat"><Chatting state={state} actions={actions} /></FadeIn>;
    case 'disconnected':
      return (
        <FadeIn key="dc">
          <Disconnected
            onReset={actions.startDrifting}
            onHome={actions.resetToLanding}
            onChangeLanguage={actions.changeLanguage}
          />
        </FadeIn>
      );
    default:
      return null;
  }
}
