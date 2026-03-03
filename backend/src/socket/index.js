import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export function setupSocket(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Требуется авторизация'));
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.userId = payload.id;
      next();
    } catch {
      next(new Error('Недействительный токен'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    console.log(`User connected: ${userId} (${socket.id})`);

    // Пользователь присоединяется к комнате своего ID для получения личных сообщений
    socket.join(userId);

    socket.on('join_channel', (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on('leave_channel', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    // mark_as_read — отметить сообщения чата как прочитанные (логика как в Telegram)
    socket.on('mark_as_read', async ({ chatId }) => {
      if (!chatId || !userId) return;
      try {
        const chat = await prisma.chat.findFirst({
          where: {
            id: chatId,
            userChats: { some: { userId } },
          },
          include: { userChats: { select: { userId: true } } },
        });
        if (!chat) return;

        await prisma.message.updateMany({
          where: {
            chatId,
            senderId: { not: userId },
            isRead: false,
          },
          data: { isRead: true },
        });

        const participantIds = chat.userChats.map((uc) => uc.userId);
        participantIds.forEach((id) => io.to(id).emit('messages_read', { chatId }));
      } catch (err) {
        console.error('mark_as_read error:', err);
      }
    });

    // Обновляем статус на online и уведомляем всех
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'online' },
    });
    socket.broadcast.emit('user_status', { userId, status: 'online' });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${userId} (${socket.id})`);
      const sockets = await io.in(userId).fetchSockets();
      if (sockets.length === 0) {
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'offline' },
        });
        socket.broadcast.emit('user_status', { userId, status: 'offline' });
      }
    });
  });

  return io;
}
