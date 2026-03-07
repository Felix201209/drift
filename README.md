# drift 🌊

> one conversation. then gone.

A minimalist anonymous chat app. Two strangers, matched by language. When you close the tab — it never happened.

Built by **[Felix (Yu Pengzheng)](https://github.com/Felix201209)**.

---

## What it is

- 🌍 Matched by language (EN / 中文 / ES / FR / JA / KO / DE / PT / RU / AR)
- 💨 No accounts. No history. No logs.
- ⚡ Real-time via Socket.io
- 🎯 Close the tab = it's gone

## Tech Stack

- Frontend: React + TypeScript + Tailwind CSS + Vite
- Backend: Node.js + Express + Socket.io

## Human Protection

Drift now supports a real anti-bot layer for queue entry:

- Cloudflare Turnstile on the frontend
- Server-side Turnstile verification
- One-time human pass bound to IP + short TTL
- Socket/IP rate limits for connect / queue / message / typing

## Locale Detection

Drift now exposes `/api/locale-hint` and auto-switches the interface to Chinese when the request country resolves to `CN` (for example via `cf-ipcountry` or `x-vercel-ip-country`).
If geo headers are missing, it falls back to the browser language.

### Environment Variables

**Frontend**

```bash
VITE_TURNSTILE_SITE_KEY=your_turnstile_site_key
VITE_SOCKET_URL=https://your-backend.example.com
```

**Backend**

```bash
TURNSTILE_SECRET_KEY=your_turnstile_secret_key
MAX_SOCKETS_PER_IP=4
MAX_CONNECTIONS_PER_MIN=20
MAX_QUEUE_JOINS_PER_MIN=6
MAX_MESSAGES_PER_MIN=40
MAX_TYPING_EVENTS_PER_MIN=120
```

If `TURNSTILE_SECRET_KEY` is not set, the human protection layer stays off.

---

## License

[Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)](https://creativecommons.org/licenses/by-nc/4.0/)

You're free to share and adapt this project for non-commercial purposes, with attribution.
