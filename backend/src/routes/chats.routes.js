import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAT_MEDIA_DIR = path.join(__dirname, '../../uploads/media');
if (!fs.existsSync(CHAT_MEDIA_DIR)) {
  fs.mkdirSync(CHAT_MEDIA_DIR, { recursive: true });
}

const chatMediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CHAT_MEDIA_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4'];
    const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.jpg';
    cb(null, `chat-${req.user.id}-${Date.now()}${safeExt}`);
  },
});

const uploadChatMedia = multer({
  storage: chatMediaStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|gif|mp4)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Разрешены: jpg, png, webp, gif, mp4'));
  },
});

function getMediaType(filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (ext === 'mp4') return 'video';
  return 'document';
}

router.use(authenticateToken);

// GET /api/chats — список чатов текущего пользователя
router.get('/', async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        userChats: { some: { userId: req.user.id } },
      },
      include: {
        userChats: {
          include: {
            user: {
              select: { id: true, username: true, avatar: true, status: true },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true } },
          },
        },
        pinnedMessage: {
          include: { sender: { select: { id: true, username: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = [];
    for (const chat of chats) {
      const otherUser = chat.userChats.find((uc) => uc.userId !== req.user.id)?.user;
      const lastMessage = chat.messages[0];
      const myUserChat = chat.userChats.find((uc) => uc.userId === req.user.id);
      const unreadCount = await prisma.message.count({
        where: {
          chatId: chat.id,
          senderId: { not: req.user.id },
          createdAt: { gt: myUserChat?.lastReadAt ?? new Date(0) },
        },
      });
      result.push({
        id: chat.id,
        isGroup: chat.isGroup,
        name: chat.name,
        avatar: chat.avatar,
        otherUser: otherUser || null,
        pinnedMessage: chat.pinnedMessage || null,
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              text: lastMessage.text,
              createdAt: lastMessage.createdAt,
              sender: lastMessage.sender,
            }
          : null,
        unreadCount,
        updatedAt: chat.updatedAt,
      });
    }

    res.json(result);
  } catch (err) {
    console.error('Get chats error:', err);
    res.status(500).json({ error: 'Ошибка загрузки чатов' });
  }
});

// POST /api/chats — создать личный чат (otherUserId) или группу (name, participantIds)
router.post('/', async (req, res) => {
  try {
    const { otherUserId, name, participantIds } = req.body;

    // Групповой чат
    if (name && Array.isArray(participantIds) && participantIds.length > 0) {
      const ids = [...new Set([req.user.id, ...participantIds])];
      if (ids.length < 2) {
        return res.status(400).json({ error: 'Добавьте хотя бы одного участника' });
      }

      const chat = await prisma.chat.create({
        data: {
          isGroup: true,
          name: String(name).trim(),
          userChats: {
            create: ids.map((userId) => ({ userId })),
          },
        },
        include: {
          userChats: {
            include: {
              user: { select: { id: true, username: true, avatar: true, status: true } },
            },
          },
        },
      });

      return res.json({
        id: chat.id,
        isGroup: true,
        name: chat.name,
        otherUser: null,
        updatedAt: chat.updatedAt,
      });
    }

    // Личный чат
    if (!otherUserId) {
      return res.status(400).json({ error: 'Укажите otherUserId или name + participantIds' });
    }
    if (otherUserId === req.user.id) {
      return res.status(400).json({ error: 'Нельзя создать чат с самим собой' });
    }

    const otherUser = await prisma.user.findUnique({
      where: { id: otherUserId },
      select: { id: true, username: true, avatar: true, status: true },
    });
    if (!otherUser) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const existing = await prisma.chat.findFirst({
      where: {
        isGroup: false,
        AND: [
          { userChats: { some: { userId: req.user.id } } },
          { userChats: { some: { userId: otherUserId } } },
        ],
      },
      include: {
        userChats: {
          include: {
            user: { select: { id: true, username: true, avatar: true, status: true } },
          },
        },
      },
    });

    let chat = existing;

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          isGroup: false,
          userChats: {
            create: [
              { userId: req.user.id },
              { userId: otherUserId },
            ],
          },
        },
        include: {
          userChats: {
            include: {
              user: { select: { id: true, username: true, avatar: true, status: true } },
            },
          },
        },
      });
    } else {
      chat = await prisma.chat.findUnique({
        where: { id: chat.id },
        include: {
          userChats: {
            include: {
              user: { select: { id: true, username: true, avatar: true, status: true } },
            },
          },
        },
      });
    }

    const other = chat.userChats.find((uc) => uc.userId !== req.user.id)?.user;
    res.json({
      id: chat.id,
      isGroup: chat.isGroup,
      name: chat.name,
      otherUser: other,
      updatedAt: chat.updatedAt,
    });
  } catch (err) {
    console.error('Create chat error:', err);
    res.status(500).json({ error: 'Ошибка создания чата' });
  }
});

// GET /api/chats/:id — получить чат по ID (включая закреплённое сообщение)
router.get('/:id', async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userChats: { some: { userId: req.user.id } },
      },
      include: {
        userChats: {
          include: {
            user: { select: { id: true, username: true, avatar: true, status: true } },
          },
        },
        pinnedMessage: {
          include: {
            sender: { select: { id: true, username: true } },
          },
        },
      },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });
    const other = chat.isGroup ? null : chat.userChats.find((uc) => uc.userId !== req.user.id)?.user;
    res.json({
      id: chat.id,
      isGroup: chat.isGroup,
      name: chat.name,
      otherUser: other,
      pinnedMessage: chat.pinnedMessage,
      participantCount: chat.userChats?.length ?? 0,
      updatedAt: chat.updatedAt,
    });
  } catch (err) {
    console.error('Get chat error:', err);
    res.status(500).json({ error: 'Ошибка загрузки чата' });
  }
});

// GET /api/chats/:id/messages — сообщения чата
router.get('/:id/messages', async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userChats: { some: { userId: req.user.id } },
      },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const messages = await prisma.message.findMany({
      where: { chatId: req.params.id, isDeleted: false },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  }
});

// POST /api/chats/:id/messages — отправить сообщение (JSON или multipart с media)
router.post('/:id/messages', (req, res, next) => {
  uploadChatMedia.single('media')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    next();
  });
}, async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    const hasMedia = !!req.file;

    if (!text && !hasMedia) {
      return res.status(400).json({ error: 'Укажите текст или прикрепите файл' });
    }

    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userChats: { some: { userId: req.user.id } },
      },
      include: { userChats: true },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const messageData = {
      text: text || '',
      senderId: req.user.id,
      chatId: req.params.id,
    };
    if (hasMedia) {
      messageData.mediaUrl = `/uploads/media/${req.file.filename}`;
      messageData.mediaType = getMediaType(req.file.filename);
    }

    const message = await prisma.message.create({
      data: messageData,
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
      },
    });

    await prisma.chat.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });

    // Рассылка сообщения обоим участникам чата через Socket.IO
    const io = req.app.get('io');
    if (io) {
      const participantIds = chat.userChats.map((uc) => uc.userId);
      participantIds.forEach((id) => io.to(id).emit('receive_message', message));
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

// PUT /api/chats/:id/pin — закрепить сообщение
router.put('/:id/pin', async (req, res) => {
  try {
    const { messageId } = req.body;
    if (!messageId) {
      return res.status(400).json({ error: 'Укажите messageId' });
    }

    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userChats: { some: { userId: req.user.id } },
      },
      include: {
        userChats: true,
        pinnedMessage: { include: { sender: { select: { id: true, username: true } } } },
      },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const message = await prisma.message.findFirst({
      where: { id: messageId, chatId: req.params.id, isDeleted: false },
      include: { sender: { select: { id: true, username: true } } },
    });
    if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });

    await prisma.chat.update({
      where: { id: req.params.id },
      data: { pinnedMessageId: messageId },
    });

    const io = req.app.get('io');
    if (io) {
      const participantIds = chat.userChats.map((uc) => uc.userId);
      participantIds.forEach((id) =>
        io.to(id).emit('message_pinned', { chatId: req.params.id, message, pinned: true })
      );
    }

    res.json({ success: true, pinnedMessage: message });
  } catch (err) {
    console.error('Pin message error:', err);
    res.status(500).json({ error: 'Ошибка закрепления' });
  }
});

// PUT /api/chats/:id/unpin — открепить сообщение
router.put('/:id/unpin', async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userChats: { some: { userId: req.user.id } },
      },
      include: { userChats: true },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    await prisma.chat.update({
      where: { id: req.params.id },
      data: { pinnedMessageId: null },
    });

    const io = req.app.get('io');
    if (io) {
      const participantIds = chat.userChats.map((uc) => uc.userId);
      participantIds.forEach((id) =>
        io.to(id).emit('message_pinned', { chatId: req.params.id, pinned: false })
      );
    }

    res.json({ success: true, pinnedMessage: null });
  } catch (err) {
    console.error('Unpin message error:', err);
    res.status(500).json({ error: 'Ошибка открепления' });
  }
});

// PUT /api/chats/:id/read — отметить прочитанным
router.put('/:id/read', async (req, res) => {
  try {
    await prisma.userChat.updateMany({
      where: {
        chatId: req.params.id,
        userId: req.user.id,
      },
      data: { lastReadAt: new Date() },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Ошибка' });
  }
});

export default router;
