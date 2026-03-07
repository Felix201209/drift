import {useEffect, useState} from 'react';
import type {UiLocale} from '../uiCopy';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

type LocaleState = {
  locale: UiLocale;
  country: string | null;
  source: 'browser' | 'server';
};

function detectBrowserLocale(): UiLocale {
  if (typeof navigator === 'undefined') return 'en';
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function useUiLocale(): LocaleState {
  const [state, setState] = useState<LocaleState>({
    locale: detectBrowserLocale(),
    country: null,
    source: 'browser',
  });

  useEffect(() => {
    let cancelled = false;

    fetch(`${SOCKET_URL}/api/locale-hint`)
      .then(async (res) => {
        if (!res.ok) throw new Error('locale hint failed');
        return (await res.json()) as {locale?: UiLocale; country?: string | null};
      })
      .then((data) => {
        if (cancelled) return;
        if (data.locale === 'zh' || data.locale === 'en') {
          setState({
            locale: data.locale,
            country: data.country ?? null,
            source: 'server',
          });
        }
      })
      .catch(() => {
        // keep browser fallback
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
