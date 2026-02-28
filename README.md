# drift 🌊

> one conversation. then gone.

A minimalist anonymous chat app. Two strangers, matched by language. When you close the tab — it's gone forever.

## Features
- 🌍 Multi-language matching (EN / 中文 / ES / FR / JA / KO / DE / PT / RU / AR)
- 💨 No accounts, no history, no logs
- ⚡ Real-time with Socket.io
- 🎯 Refresh = gone

## Deploy

### Backend (Railway)
1. Fork this repo
2. Create new Railway project → Deploy from GitHub
3. Set root directory to `backend/`
4. Done. Copy the Railway URL.

### Frontend (Vercel)
1. Create new Vercel project → Deploy from GitHub
2. Set root directory to `frontend/`
3. Set env var: `VITE_SOCKET_URL=<your Railway URL>`
4. Done.

## Local Dev
```bash
# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

## Tech Stack
- Frontend: React + TypeScript + Tailwind CSS + Vite
- Backend: Node.js + Express + Socket.io
- Deploy: Vercel (frontend) + Railway (backend)
