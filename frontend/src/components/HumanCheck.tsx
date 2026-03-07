import {useEffect, useRef, useState} from 'react';
import type {UiLocale} from '../uiCopy';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          appearance?: 'always' | 'execute' | 'interaction-only';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'timeout-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ) => string;
      remove?: (widgetId: string) => void;
      reset?: (widgetId: string) => void;
    };
  }
}

const SCRIPT_ID = 'drift-turnstile-script';
let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window is unavailable'));
  }

  if (window.turnstile) {
    return Promise.resolve();
  }

  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }

  turnstileScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), {once: true});
      existing.addEventListener('error', () => reject(new Error('failed to load Turnstile')), {once: true});
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed to load Turnstile'));
    document.head.appendChild(script);
  });

  return turnstileScriptPromise;
}

interface HumanCheckProps {
  siteKey: string;
  value: string | null;
  onChange: (token: string | null) => void;
  error?: string | null;
  locale: UiLocale;
}

export function HumanCheck({siteKey, value, onChange, error, locale}: HumanCheckProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    onChange(null);

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        containerRef.current.innerHTML = '';
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: 'dark',
          appearance: 'always',
          callback: (token) => {
            if (cancelled) return;
            setStatus('ready');
            onChange(token);
          },
          'expired-callback': () => {
            if (cancelled) return;
            setStatus('loading');
            onChange(null);
          },
          'timeout-callback': () => {
            if (cancelled) return;
            setStatus('loading');
            onChange(null);
          },
          'error-callback': () => {
            if (cancelled) return;
            setStatus('error');
            onChange(null);
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        onChange(null);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, onChange]);

  return (
    <div className="w-full max-w-3xl mb-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-sm tracking-[0.18em] uppercase text-white/70">
            {locale === 'zh' ? '人机验证' : 'human check'}
          </p>
          <p className="mt-2 text-sm text-white/35 font-light">
            {locale === 'zh'
              ? '先过一下这个，再进池子。主要是挡僵尸浏览器和脚本洪水。'
              : 'Pass this first, then enter the pool. It is here to block zombie browsers and scripted floods.'}
          </p>
        </div>
        <div
          className={`text-xs tracking-widest uppercase ${
            value
              ? 'text-emerald-300/90'
              : status === 'error'
                ? 'text-red-300/80'
                : 'text-white/25'
          }`}
        >
          {value
            ? locale === 'zh'
              ? '已通过'
              : 'verified'
            : status === 'error'
              ? locale === 'zh'
                ? '不可用'
                : 'unavailable'
              : locale === 'zh'
                ? '必需'
                : 'required'}
        </div>
      </div>

      <div ref={containerRef} className="min-h-[72px] overflow-hidden rounded-xl" />

      {error ? <p className="mt-4 text-sm text-red-300/85">{error}</p> : null}
      {!error && status === 'error' ? (
        <p className="mt-4 text-sm text-red-300/85">
          {locale === 'zh' ? '验证组件加载失败，刷新后再试。' : 'Verification widget failed to load. Refresh and try again.'}
        </p>
      ) : null}
    </div>
  );
}
