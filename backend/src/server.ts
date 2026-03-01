import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();

const corsOrigins: (string | RegExp)[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  /\.vercel\.app$/,
  /\.railway\.app$/,
];

app.use(cors({ origin: corsOrigins, credentials: true }));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// ─── Types ───────────────────────────────────────────────────────────────────
type Language = 'en' | 'zh' | 'es' | 'fr' | 'ja' | 'ko' | 'de' | 'pt' | 'ru' | 'ar' | 'any';

interface WaitingUser {
  socketId: string;
  language: Language;
  joinedAt: number;
}

interface Room {
  id: string;
  userA: string;
  userB: string;
  language: Language;
  createdAt: number;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const msgTimestamps = new Map<string, number[]>();    // IP → message timestamps
const queueTimestamps = new Map<string, number[]>();  // IP → join_queue timestamps

function isRateLimited(map: Map<string, number[]>, ip: string, limit: number): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = (map.get(ip) || []).filter(t => now - t < windowMs);
  if (timestamps.length >= limit) {
    map.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  map.set(ip, timestamps);
  return false;
}

// ─── State (in-memory, no DB) ─────────────────────────────────────────────────
const waitingQueue: WaitingUser[] = [];    // users waiting for match
const rooms = new Map<string, Room>();      // roomId → Room
const socketToRoom = new Map<string, string>(); // socketId → roomId

// ─── Queue Cleanup: remove stale waiting users every 30s ──────────────────────
const QUEUE_TIMEOUT_MS = 30_000;
setInterval(() => {
  const now = Date.now();
  const before = waitingQueue.length;
  for (let i = waitingQueue.length - 1; i >= 0; i--) {
    const u = waitingQueue[i];
    const sock = io.sockets.sockets.get(u.socketId);
    if (!sock || !sock.connected || now - u.joinedAt > QUEUE_TIMEOUT_MS) {
      waitingQueue.splice(i, 1);
    }
  }
  if (waitingQueue.length !== before) {
    console.log(`[QUEUE] cleanup: ${before} → ${waitingQueue.length}`);
  }
}, 30_000);

// ─── Matching Logic ───────────────────────────────────────────────────────────
function findMatch(socketId: string, language: Language): WaitingUser | null {
  const idx = waitingQueue.findIndex(u =>
    u.socketId !== socketId &&
    (u.language === language || u.language === 'any' || language === 'any')
  );
  if (idx === -1) return null;
  return waitingQueue.splice(idx, 1)[0];
}

function removeFromQueue(socketId: string): boolean {
  const idx = waitingQueue.findIndex(u => u.socketId === socketId);
  if (idx !== -1) { waitingQueue.splice(idx, 1); return true; }
  return false;
}

function createRoom(userA: string, userB: string, language: Language): Room {
  const id = Math.random().toString(36).slice(2, 10);
  const room: Room = { id, userA, userB, language, createdAt: Date.now() };
  rooms.set(id, room);
  socketToRoom.set(userA, id);
  socketToRoom.set(userB, id);
  return room;
}

function queueByLanguage(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const u of waitingQueue) {
    result[u.language] = (result[u.language] || 0) + 1;
  }
  return result;
}

// ─── Socket Events ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[CONN] ${socket.id} connected`);

  socket.on('join_queue', ({ language }: { language: Language }) => {
    const ip = socket.handshake.address;
    if (isRateLimited(queueTimestamps, ip, 10)) return;
    const lang: Language = language || 'any';
    removeFromQueue(socket.id);

    const match = findMatch(socket.id, lang);
    if (match) {
      const matchedLang = lang === 'any' ? match.language : lang;
      const room = createRoom(socket.id, match.socketId, matchedLang);
      socket.join(room.id);
      io.sockets.sockets.get(match.socketId)?.join(room.id);

      io.to(room.id).emit('matched', { roomId: room.id, language: room.language });
      console.log(`[MATCH] ${socket.id} <-> ${match.socketId} → room ${room.id} (lang: ${room.language})`);
    } else {
      waitingQueue.push({ socketId: socket.id, language: lang, joinedAt: Date.now() });
      socket.emit('waiting', { position: waitingQueue.length });
      console.log(`[QUEUE] ${socket.id} joined (lang: ${lang}, queue size: ${waitingQueue.length})`);
    }
  });

  socket.on('message', ({ roomId, text }: { roomId: string; text: string }) => {
    const ip = socket.handshake.address;
    if (isRateLimited(msgTimestamps, ip, 60)) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const trimmed = text.slice(0, 1000);
    console.log(`[MSG]   room ${roomId}: ${trimmed.length} chars`);
    socket.to(roomId).emit('message', { text: trimmed, ts: Date.now() });
  });

  socket.on('typing', ({ roomId, isTyping }: { roomId: string; isTyping: boolean }) => {
    socket.to(roomId).emit('typing', { isTyping });
  });

  socket.on('leave_room', ({ roomId }: { roomId: string }) => {
    const room = rooms.get(roomId);
    if (room) {
      console.log(`[LEAVE] ${socket.id} left room ${roomId}`);
      socket.to(roomId).emit('partner_left');
      rooms.delete(roomId);
      socketToRoom.delete(room.userA);
      socketToRoom.delete(room.userB);
    }
  });

  socket.on('disconnect', () => {
    const inQueue = removeFromQueue(socket.id);
    const roomId = socketToRoom.get(socket.id);
    console.log(`[DC]    ${socket.id} disconnected (was in room: ${roomId ?? 'none'} / in queue: ${inQueue})`);
    if (roomId) {
      socket.to(roomId).emit('partner_left');
      const room = rooms.get(roomId);
      if (room) {
        socketToRoom.delete(room.userA);
        socketToRoom.delete(room.userB);
        rooms.delete(roomId);
      }
    }
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    waiting: waitingQueue.length,
    rooms: rooms.size,
    queueByLanguage: queueByLanguage(),
    uptime: Math.round(process.uptime() * 10) / 10,
  });
});

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => console.log(`[Drift] Server running on :${PORT}`));
