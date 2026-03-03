import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import authRoutes from './src/routes/auth.routes.js';
import usersRoutes from './src/routes/users.routes.js';
import chatsRoutes from './src/routes/chats.routes.js';
import channelsRoutes from './src/routes/channels.routes.js';
import postsRoutes from './src/routes/posts.routes.js';
import storiesRoutes from './src/routes/stories.routes.js';
import { setupSocket } from './src/socket/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/channels', channelsRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/stories', storiesRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV !== 'test') {
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
  });

  setupSocket(io);

  // Экспортируем io для использования в routes (emit при отправке сообщения)
  app.set('io', io);

  server.listen(PORT, () => {
    console.log(`🚀 Backend: http://localhost:${PORT}`);
  });
}

export default app;
