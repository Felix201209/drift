import express from 'express';
import type {Request, Response} from 'express';
import {createServer} from 'http';
import {randomBytes} from 'crypto';
import {Server, type Socket} from 'socket.io';
import cors from 'cors';

const app = express();
app.set('trust proxy', true);
app.use(express.json({limit: '32kb'}));

const isProd = process.env.NODE_ENV === 'production';
const log = isProd ? (..._args: unknown[]) => {} : (...args: unknown[]) => console.log(...args);

const corsOrigins: (string | RegExp)[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  /\.vercel\.app$/,
  /\.railway\.app$/,
  /\.onrender\.com$/,
];
if (process.env.CORS_ORIGIN) {
  corsOrigins.push(process.env.CORS_ORIGIN);
}

app.use(cors({origin: corsOrigins, credentials: true}));

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket'],
  pingInterval: 20_000,
  pingTimeout: 10_000,
  maxHttpBufferSize: 16 * 1024,
  perMessageDeflate: {
    threshold: 128,
    zlibDeflateOptions: {level: 6},
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
  },
});

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

interface HumanPassRecord {
  ip: string;
  expiresAt: number;
}

interface TurnstileVerifyResult {
  success: boolean;
  errorCodes: string[];
}

const WINDOW_MS = 60_000;
const QUEUE_TIMEOUT_MS = 30_000;
const HUMAN_PASS_TTL_MS = 10 * 60_000;
const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY?.trim() ?? '';
const HUMAN_PROTECTION_ENABLED = TURNSTILE_SECRET_KEY.length > 0;
const MAX_SOCKETS_PER_IP = Number(process.env.MAX_SOCKETS_PER_IP || 4);
const MAX_CONNECTIONS_PER_MIN = Number(process.env.MAX_CONNECTIONS_PER_MIN || 20);
const MAX_QUEUE_JOINS_PER_MIN = Number(process.env.MAX_QUEUE_JOINS_PER_MIN || 6);
const MAX_MESSAGES_PER_MIN = Number(process.env.MAX_MESSAGES_PER_MIN || 40);
const MAX_TYPING_EVENTS_PER_MIN = Number(process.env.MAX_TYPING_EVENTS_PER_MIN || 120);

const msgTimestamps = new Map<string, number[]>();
const queueTimestamps = new Map<string, number[]>();
const typingTimestamps = new Map<string, number[]>();
const connectionTimestamps = new Map<string, number[]>();
const activeSocketsByIp = new Map<string, number>();
const humanPasses = new Map<string, HumanPassRecord>();

function normalizeIp(rawIp?: string | null): string {
  if (!rawIp) return 'unknown';
  const ip = rawIp.split(',')[0]?.trim() || rawIp.trim();
  if (ip === '::1') return '127.0.0.1';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  return ip;
}

function getRequestIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return normalizeIp(forwardedIp || req.ip || req.socket.remoteAddress);
}

function getSocketIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return normalizeIp(forwardedIp || socket.handshake.address || socket.conn.remoteAddress);
}

function getCountryHint(req: Request): string | null {
  const candidates = [
    req.headers['cf-ipcountry'],
    req.headers['x-vercel-ip-country'],
    req.headers['x-country-code'],
    req.headers['x-country'],
  ];

  for (const candidate of candidates) {
    const value = Array.isArray(candidate) ? candidate[0] : candidate;
    const normalized = value?.trim().toUpperCase();
    if (normalized) return normalized;
  }

  return null;
}

function inferUiLocale(req: Request): 'en' | 'zh' {
  const country = getCountryHint(req);
  if (country === 'CN') {
    return 'zh';
  }

  const acceptLanguage = req.headers['accept-language'];
  const raw = Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage;
  if (raw?.toLowerCase().startsWith('zh')) {
    return 'zh';
  }

  return 'en';
}

function isRateLimited(map: Map<string, number[]>, key: string, limit: number): boolean {
  const now = Date.now();
  const timestamps = (map.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= limit) {
    map.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  map.set(key, timestamps);
  return false;
}

function issueHumanPass(ip: string): string {
  const pass = randomBytes(24).toString('base64url');
  humanPasses.set(pass, {
    ip,
    expiresAt: Date.now() + HUMAN_PASS_TTL_MS,
  });
  return pass;
}

function consumeHumanPass(pass: string | undefined, ip: string): boolean {
  if (!HUMAN_PROTECTION_ENABLED) return true;
  if (!pass) return false;

  const record = humanPasses.get(pass);
  if (!record) return false;
  if (record.ip !== ip || record.expiresAt < Date.now()) {
    humanPasses.delete(pass);
    return false;
  }

  humanPasses.delete(pass);
  return true;
}

async function verifyTurnstileToken(token: string, ip: string): Promise<TurnstileVerifyResult> {
  if (!HUMAN_PROTECTION_ENABLED) {
    return {success: true, errorCodes: []};
  }

  try {
    const body = new URLSearchParams({
      secret: TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: ip,
    });

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body,
    });

    if (!response.ok) {
      return {success: false, errorCodes: ['turnstile-http-failed']};
    }

    const data = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    return {
      success: Boolean(data.success),
      errorCodes: data['error-codes'] ?? [],
    };
  } catch {
    return {
      success: false,
      errorCodes: ['turnstile-network-failed'],
    };
  }
}

const waitingQueue: WaitingUser[] = [];
const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, string>();

setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, ts] of msgTimestamps) {
    const fresh = ts.filter((t) => t > cutoff);
    if (fresh.length === 0) msgTimestamps.delete(key);
    else msgTimestamps.set(key, fresh);
  }
  for (const [key, ts] of queueTimestamps) {
    const fresh = ts.filter((t) => t > cutoff);
    if (fresh.length === 0) queueTimestamps.delete(key);
    else queueTimestamps.set(key, fresh);
  }
  for (const [key, ts] of typingTimestamps) {
    const fresh = ts.filter((t) => t > cutoff);
    if (fresh.length === 0) typingTimestamps.delete(key);
    else typingTimestamps.set(key, fresh);
  }
  for (const [key, ts] of connectionTimestamps) {
    const fresh = ts.filter((t) => t > cutoff);
    if (fresh.length === 0) connectionTimestamps.delete(key);
    else connectionTimestamps.set(key, fresh);
  }
  for (const [pass, record] of humanPasses) {
    if (record.expiresAt < Date.now()) {
      humanPasses.delete(pass);
    }
  }
}, 5 * 60_000).unref();

setInterval(() => {
  const now = Date.now();
  const before = waitingQueue.length;

  for (let i = waitingQueue.length - 1; i >= 0; i--) {
    const user = waitingQueue[i];
    const sock = io.sockets.sockets.get(user.socketId);
    if (!sock || !sock.connected || now - user.joinedAt > QUEUE_TIMEOUT_MS) {
      waitingQueue.splice(i, 1);
    }
  }

  if (waitingQueue.length !== before) {
    log(`[QUEUE] cleanup: ${before} → ${waitingQueue.length}`);
  }
}, 30_000).unref();

function findMatch(socketId: string, language: Language): WaitingUser | null {
  const idx = waitingQueue.findIndex(
    (user) =>
      user.socketId !== socketId &&
      (user.language === language || user.language === 'any' || language === 'any'),
  );
  if (idx === -1) return null;
  return waitingQueue.splice(idx, 1)[0];
}

function removeFromQueue(socketId: string): boolean {
  const idx = waitingQueue.findIndex((user) => user.socketId === socketId);
  if (idx === -1) return false;
  waitingQueue.splice(idx, 1);
  return true;
}

function createRoom(userA: string, userB: string, language: Language): Room {
  const id = Math.random().toString(36).slice(2, 10);
  const room: Room = {id, userA, userB, language, createdAt: Date.now()};
  rooms.set(id, room);
  socketToRoom.set(userA, id);
  socketToRoom.set(userB, id);
  return room;
}

function queueByLanguage(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const user of waitingQueue) {
    result[user.language] = (result[user.language] || 0) + 1;
  }
  return result;
}

function validateLanguage(language: unknown): Language {
  const allowed: Language[] = ['en', 'zh', 'es', 'fr', 'ja', 'ko', 'de', 'pt', 'ru', 'ar', 'any'];
  return typeof language === 'string' && allowed.includes(language as Language)
    ? (language as Language)
    : 'any';
}

app.post('/api/human-pass', async (req, res) => {
  const ip = getRequestIp(req);

  if (isRateLimited(queueTimestamps, `${ip}:human-pass`, MAX_QUEUE_JOINS_PER_MIN)) {
    res.status(429).json({ok: false, error: 'Too many verification attempts'});
    return;
  }

  if (!HUMAN_PROTECTION_ENABLED) {
    res.json({
      ok: true,
      pass: issueHumanPass(ip),
      expiresInMs: HUMAN_PASS_TTL_MS,
      protectionEnabled: false,
    });
    return;
  }

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  if (!token) {
    res.status(400).json({ok: false, error: 'Missing human verification token'});
    return;
  }

  const verification = await verifyTurnstileToken(token, ip);
  if (!verification.success) {
    res.status(403).json({
      ok: false,
      error: 'Human verification failed',
      errorCodes: verification.errorCodes,
    });
    return;
  }

  res.json({
    ok: true,
    pass: issueHumanPass(ip),
    expiresInMs: HUMAN_PASS_TTL_MS,
    protectionEnabled: true,
  });
});

io.use((socket, next) => {
  const ip = getSocketIp(socket);
  socket.data.ip = ip;

  if (isRateLimited(connectionTimestamps, ip, MAX_CONNECTIONS_PER_MIN)) {
    next(new Error('too_many_connections'));
    return;
  }

  const activeCount = activeSocketsByIp.get(ip) || 0;
  if (activeCount >= MAX_SOCKETS_PER_IP) {
    next(new Error('too_many_active_sockets'));
    return;
  }

  activeSocketsByIp.set(ip, activeCount + 1);
  next();
});

io.on('connection', (socket) => {
  const ip = String(socket.data.ip || getSocketIp(socket));
  log(`[CONN] ${socket.id} connected (${ip})`);

  socket.on('join_queue', ({language, humanPass}: {language?: Language; humanPass?: string}) => {
    if (!consumeHumanPass(humanPass, ip)) {
      socket.emit('human_check_required');
      return;
    }

    if (isRateLimited(queueTimestamps, ip, MAX_QUEUE_JOINS_PER_MIN)) {
      socket.emit('rate_limited', {scope: 'queue'});
      return;
    }

    const lang = validateLanguage(language);
    removeFromQueue(socket.id);

    const match = findMatch(socket.id, lang);
    if (match) {
      const matchedLang = lang === 'any' ? match.language : lang;
      const room = createRoom(socket.id, match.socketId, matchedLang);
      socket.join(room.id);
      io.sockets.sockets.get(match.socketId)?.join(room.id);
      io.to(room.id).emit('matched', {roomId: room.id, language: room.language});
      log(`[MATCH] ${socket.id} <-> ${match.socketId} room=${room.id} lang=${room.language}`);
      return;
    }

    waitingQueue.push({socketId: socket.id, language: lang, joinedAt: Date.now()});
    socket.emit('waiting', {position: waitingQueue.length});
    log(`[QUEUE] ${socket.id} lang=${lang} size=${waitingQueue.length}`);
  });

  socket.on('message', ({roomId, text}: {roomId: string; text: string}) => {
    if (isRateLimited(msgTimestamps, ip, MAX_MESSAGES_PER_MIN)) {
      socket.emit('rate_limited', {scope: 'message'});
      return;
    }

    const ownRoomId = socketToRoom.get(socket.id);
    if (!roomId || ownRoomId !== roomId) return;
    if (!rooms.has(roomId)) return;

    const trimmed = typeof text === 'string' ? text.trim().slice(0, 1000) : '';
    if (!trimmed) return;

    socket.to(roomId).emit('message', {text: trimmed, ts: Date.now()});
  });

  socket.on('typing', ({roomId, isTyping}: {roomId: string; isTyping: boolean}) => {
    if (isRateLimited(typingTimestamps, ip, MAX_TYPING_EVENTS_PER_MIN)) {
      return;
    }

    const ownRoomId = socketToRoom.get(socket.id);
    if (!roomId || ownRoomId !== roomId) return;
    socket.to(roomId).emit('typing', {isTyping: Boolean(isTyping)});
  });

  socket.on('leave_room', ({roomId}: {roomId: string}) => {
    const room = rooms.get(roomId);
    if (!room) return;

    socket.to(roomId).emit('partner_left');
    rooms.delete(roomId);
    socketToRoom.delete(room.userA);
    socketToRoom.delete(room.userB);
    log(`[LEAVE] ${socket.id} room=${roomId}`);
  });

  socket.on('disconnect', () => {
    const inQueue = removeFromQueue(socket.id);
    const roomId = socketToRoom.get(socket.id);
    log(`[DC] ${socket.id} room=${roomId ?? 'none'} queue=${inQueue}`);

    const activeCount = activeSocketsByIp.get(ip) || 0;
    if (activeCount <= 1) {
      activeSocketsByIp.delete(ip);
    } else {
      activeSocketsByIp.set(ip, activeCount - 1);
    }

    if (!roomId) return;

    socket.to(roomId).emit('partner_left');
    const room = rooms.get(roomId);
    if (!room) return;

    socketToRoom.delete(room.userA);
    socketToRoom.delete(room.userB);
    rooms.delete(roomId);
  });
});

app.get('/api/locale-hint', (req, res) => {
  res.json({
    ok: true,
    locale: inferUiLocale(req),
    country: getCountryHint(req),
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    waiting: waitingQueue.length,
    rooms: rooms.size,
    queueByLanguage: queueByLanguage(),
    humanProtectionEnabled: HUMAN_PROTECTION_ENABLED,
    activeSockets: Array.from(activeSocketsByIp.values()).reduce((sum, count) => sum + count, 0),
    uptime: Math.round(process.uptime() * 10) / 10,
  });
});

const PORT = process.env.PORT || 3002;
const server = httpServer.listen(PORT, () => {
  console.log(`[Drift] :${PORT} (${isProd ? 'prod' : 'dev'}) human-protection=${HUMAN_PROTECTION_ENABLED ? 'on' : 'off'}`);
});

function shutdown(signal: string) {
  console.log(`[Drift] ${signal} — shutting down`);
  io.emit('partner_left');
  io.close(() => {
    server.close(() => {
      console.log('[Drift] closed');
      process.exit(0);
    });
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
