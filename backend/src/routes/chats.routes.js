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
const GROUP_AVATARS_DIR = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(CHAT_MEDIA_DIR)) {
  fs.mkdirSync(CHAT_MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(GROUP_AVATARS_DIR)) {
  fs.mkdirSync(GROUP_AVATARS_DIR, { recursive: true });
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

const groupAvatarsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, GROUP_AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.jpg';
    cb(null, `group-${req.params.id}-${Date.now()}${safeExt}`);
  },
});

const uploadGroupAvatar = multer({
  storage: groupAvatarsStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Разрешены: jpg, png, gif, webp'));
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
            create: ids.map((userId) => ({
              userId,
              role: userId === req.user.id ? 'admin' : 'member',
            })),
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
    const base = {
      id: chat.id,
      isGroup: chat.isGroup,
      name: chat.name,
      avatar: chat.avatar,
      otherUser: other,
      pinnedMessage: chat.pinnedMessage,
      participantCount: chat.userChats?.length ?? 0,
      updatedAt: chat.updatedAt,
    };
    if (chat.isGroup) {
      base.userChats = chat.userChats.map((uc) => ({
        userId: uc.userId,
        role: uc.role,
        user: uc.user,
      }));
    }
    res.json(base);
  } catch (err) {
    console.error('Get chat error:', err);
    res.status(500).json({ error: 'Ошибка загрузки чата' });
  }
});

// GET /api/chats/:id/messages — сообщения чата (пагинация: cursor или limit)
router.get('/:id/messages', async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        userChats: { some: { userId: req.user.id } },
      },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 40);
    const cursor = req.query.cursor || undefined;

    const messages = await prisma.message.findMany({
      where: { chatId: req.params.id },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: {
          include: { sender: { select: { id: true, username: true } } },
        },
        reactions: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    const chatWithUsers = await prisma.chat.findFirst({
      where: { id: req.params.id },
      include: { userChats: true },
    });

    const isGroup = chatWithUsers?.isGroup ?? false;
    const withReadStatus = messages.map((m) => {
      const msg = { ...m };
      if (m.senderId === req.user.id) {
        if (isGroup) {
          const msgTime = new Date(m.createdAt).getTime();
          msg.isRead = chatWithUsers?.userChats?.some(
            (uc) => uc.userId !== req.user.id && uc.lastReadAt && new Date(uc.lastReadAt).getTime() >= msgTime
          ) ?? false;
        }
      }
      return msg;
    });

    const hasMore = messages.length === limit;
    const nextCursor = hasMore ? messages[messages.length - 1].id : null;

    res.json({
      messages: withReadStatus.reverse(),
      nextCursor,
      hasMore,
    });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Ошибка загрузки сообщений' });
  }
});

// POST /api/chats/:id/messages — отправить сообщение (JSON или multipart с media)
router.post('/:id/messages', (req, res, next) => {
  // Для JSON (стикер) — пропускаем multer, body уже разобран express.json()
  const isJson = req.headers['content-type']?.includes('application/json');
  if (isJson) return next();
  uploadChatMedia.single('media')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    next();
  });
}, async (req, res) => {
  try {
    const text = (req.body.text || '').trim();
    const replyToId = req.body.replyToId || null;
    const hasMedia = !!req.file;
    const stickerUrl = (req.body.stickerUrl || '').trim() || null;

    if (!text && !hasMedia && !stickerUrl) {
      return res.status(400).json({ error: 'Укажите текст, прикрепите файл или выберите стикер' });
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
      replyToId: replyToId || undefined,
    };
    if (hasMedia) {
      messageData.mediaUrl = `/uploads/media/${req.file.filename}`;
      messageData.mediaType = getMediaType(req.file.filename);
    } else if (stickerUrl) {
      messageData.mediaUrl = stickerUrl;
      messageData.mediaType = 'sticker';
    }

    let message;
    try {
      message = await prisma.message.create({
        data: messageData,
        include: {
          sender: { select: { id: true, username: true, avatar: true } },
          replyTo: {
            include: { sender: { select: { id: true, username: true } } },
          },
          reactions: { include: { user: { select: { id: true, username: true } } } },
        },
      });

      await prisma.chat.update({
        where: { id: req.params.id },
        data: { updatedAt: new Date() },
      });
    } catch (createErr) {
      if (hasMedia && req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error('Failed to delete uploaded file:', unlinkErr);
        }
      }
      throw createErr;
    }

    // Рассылка сообщения всем участникам чата через Socket.IO (включая стикеры)
    const io = req.app.get('io');
    if (io) {
      const payload = { ...message, chatId: req.params.id };
      const participantIds = chat.userChats.map((uc) => uc.userId);
      participantIds.forEach((id) => io.to(id).emit('receive_message', payload));
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Ошибка отправки сообщения' });
  }
});

// PUT /api/chats/:chatId/messages/:messageId — редактировать сообщение
router.put('/:id/messages/:messageId', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Укажите текст' });

    const message = await prisma.message.findFirst({
      where: {
        id: req.params.messageId,
        chatId: req.params.id,
        senderId: req.user.id,
        isDeleted: false,
      },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, username: true } } } },
      },
    });
    if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });

    const updated = await prisma.message.update({
      where: { id: req.params.messageId },
      data: { text: text.trim(), editedAt: new Date() },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, username: true } } } },
      },
    });

    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id },
      include: { userChats: { select: { userId: true } } },
    });
    const io = req.app.get('io');
    if (io && chat) {
      chat.userChats.forEach((uc) => io.to(uc.userId).emit('message_edited', updated));
    }
    res.json(updated);
  } catch (err) {
    console.error('Edit message error:', err);
    res.status(500).json({ error: 'Ошибка редактирования' });
  }
});

// DELETE /api/chats/:chatId/messages/:messageId — удалить сообщение
router.delete('/:id/messages/:messageId', async (req, res) => {
  try {
    const message = await prisma.message.findFirst({
      where: {
        id: req.params.messageId,
        chatId: req.params.id,
        senderId: req.user.id,
      },
    });
    if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });

    const updated = await prisma.message.update({
      where: { id: req.params.messageId },
      data: { isDeleted: true, text: '', editedAt: new Date() },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, username: true } } } },
      },
    });

    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id },
      include: { userChats: { select: { userId: true } } },
    });
    const io = req.app.get('io');
    if (io && chat) {
      chat.userChats.forEach((uc) => io.to(uc.userId).emit('message_deleted', updated));
    }
    res.json(updated);
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// POST /api/chats/:id/messages/:messageId/reactions — добавить/переключить реакцию (legacy)
router.post('/:id/messages/:messageId/reactions', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji || typeof emoji !== 'string' || emoji.length > 10) {
      return res.status(400).json({ error: 'Укажите emoji' });
    }

    const message = await prisma.message.findFirst({
      where: {
        id: req.params.messageId,
        chatId: req.params.id,
      },
    });
    if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });

    const inChat = await prisma.userChat.findFirst({
      where: { chatId: req.params.id, userId: req.user.id },
    });
    if (!inChat) return res.status(403).json({ error: 'Нет доступа к чату' });

    const existing = await prisma.reaction.findUnique({
      where: {
        userId_messageId_emoji: {
          userId: req.user.id,
          messageId: req.params.messageId,
          emoji: emoji.trim(),
        },
      },
    });

    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await prisma.reaction.create({
        data: {
          userId: req.user.id,
          messageId: req.params.messageId,
          emoji: emoji.trim(),
        },
      });
    }

    const updated = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: {
        sender: { select: { id: true, username: true, avatar: true } },
        replyTo: { include: { sender: { select: { id: true, username: true } } } },
        reactions: { include: { user: { select: { id: true, username: true } } } },
      },
    });

    const chat = await prisma.chat.findFirst({
      where: { id: req.params.id },
      include: { userChats: { select: { userId: true } } },
    });
    const io = req.app.get('io');
    if (io && chat) {
      chat.userChats.forEach((uc) => io.to(uc.userId).emit('message_reaction', updated));
    }
    res.json(updated);
  } catch (err) {
    console.error('Reaction error:', err);
    res.status(500).json({ error: 'Ошибка реакции' });
  }
});

// POST /api/chats/:id/messages/:messageId/react — добавление реакции (upsert)
router.post('/:id/messages/:messageId/react', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji || typeof emoji !== 'string' || (typeof emoji === 'string' && emoji.trim().length === 0) || emoji.length > 100) {
      return res.status(400).json({ error: 'Укажите emoji или ссылку на стикер' });
    }
    const emojiVal = typeof emoji === 'string' ? emoji.trim() : String(emoji);

    const inChat = await prisma.userChat.findFirst({
      where: { chatId: req.params.id, userId: req.user.id },
    });
    if (!inChat) return res.status(403).json({ error: 'Нет доступа к чату' });

    const message = await prisma.message.findFirst({
      where: { id: req.params.messageId, chatId: req.params.id },
    });
    if (!message) return res.status(404).json({ error: 'Сообщение не найдено' });

    const reaction = await prisma.reaction.upsert({
      where: {
        userId_messageId_emoji: {
          userId: req.user.id,
          messageId: req.params.messageId,
          emoji: emojiVal,
        },
      },
      update: {},
      create: {
        userId: req.user.id,
        messageId: req.params.messageId,
        emoji: emojiVal,
      },
      include: { user: { select: { id: true, username: true } } },
    });

    const chat = await prisma.chat.findUnique({
      where: { id: req.params.id },
      include: { userChats: true },
    });
    const io = req.app.get('io');
    if (io && chat) {
      chat.userChats.forEach((uc) =>
        io.to(uc.userId).emit('message_reaction_updated', {
          messageId: req.params.messageId,
          chatId: req.params.id,
          reaction,
          type: 'added',
        })
      );
    }
    res.json(reaction);
  } catch (err) {
    console.error('React add error:', err);
    res.status(500).json({ error: 'Ошибка реакции' });
  }
});

// DELETE /api/chats/:id/messages/:messageId/react — удаление реакции
router.delete('/:id/messages/:messageId/react', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji || typeof emoji !== 'string' || (typeof emoji === 'string' && emoji.trim().length === 0) || emoji.length > 100) {
      return res.status(400).json({ error: 'Укажите emoji' });
    }
    const emojiVal = typeof emoji === 'string' ? emoji.trim() : String(emoji);

    const inChat = await prisma.userChat.findFirst({
      where: { chatId: req.params.id, userId: req.user.id },
    });
    if (!inChat) return res.status(403).json({ error: 'Нет доступа к чату' });

    const reaction = await prisma.reaction.findUnique({
      where: {
        userId_messageId_emoji: {
          userId: req.user.id,
          messageId: req.params.messageId,
          emoji: emojiVal,
        },
      },
      include: { user: { select: { id: true, username: true } } },
    });

    if (reaction) {
      await prisma.reaction.delete({ where: { id: reaction.id } });
    }

    const chat = await prisma.chat.findUnique({
      where: { id: req.params.id },
      include: { userChats: true },
    });
    const io = req.app.get('io');
    if (io && chat) {
      chat.userChats.forEach((uc) =>
        io.to(uc.userId).emit('message_reaction_updated', {
          messageId: req.params.messageId,
          chatId: req.params.id,
          reaction: reaction || { userId: req.user.id, emoji: emojiVal },
          type: 'removed',
        })
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('React remove error:', err);
    res.status(500).json({ error: 'Ошибка' });
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

// ============ API настроек групп (только для групповых чатов) ============

// PUT /api/chats/:id/name — обновление названия группы (только admin)
router.put('/:id/name', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Укажите название' });

    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        isGroup: true,
        userChats: { some: { userId: req.user.id } },
      },
      include: { userChats: true },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const myUserChat = chat.userChats.find((uc) => uc.userId === req.user.id);
    if (myUserChat?.role !== 'admin') {
      return res.status(403).json({ error: 'Только администратор может менять название' });
    }

    const updated = await prisma.chat.update({
      where: { id: req.params.id },
      data: { name: name.trim() },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update group name error:', err);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// POST /api/chats/:id/avatar — загрузка аватарки группы (только admin)
router.post('/:id/avatar', (req, res, next) => {
  uploadGroupAvatar.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Прикрепите файл' });

    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        isGroup: true,
        userChats: { some: { userId: req.user.id } },
      },
      include: { userChats: true },
    });
    if (!chat) {
      if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ } }
      return res.status(404).json({ error: 'Чат не найден' });
    }

    const myUserChat = chat.userChats.find((uc) => uc.userId === req.user.id);
    if (myUserChat?.role !== 'admin') {
      if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ } }
      return res.status(403).json({ error: 'Только администратор может менять аватар' });
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    const oldAvatar = chat.avatar;
    if (oldAvatar) {
      const oldPath = path.join(__dirname, '../..', oldAvatar.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
      }
    }

    const updated = await prisma.chat.update({
      where: { id: req.params.id },
      data: { avatar: avatarPath },
    });
    res.json(updated);
  } catch (err) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ } }
    console.error('Group avatar upload error:', err);
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

// POST /api/chats/:id/members — добавление участников в группу (только admin)
router.post('/:id/members', async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Укажите userIds (массив ID пользователей)' });
    }

    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        isGroup: true,
        userChats: { some: { userId: req.user.id } },
      },
      include: { userChats: true },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const myUserChat = chat.userChats.find((uc) => uc.userId === req.user.id);
    if (myUserChat?.role !== 'admin') {
      return res.status(403).json({ error: 'Только администратор может добавлять участников' });
    }

    const existingIds = new Set(chat.userChats.map((uc) => uc.userId));
    const toAdd = [...new Set(userIds)].filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      const userChats = await prisma.userChat.findMany({
        where: { chatId: req.params.id },
        include: { user: { select: { id: true, username: true, avatar: true, status: true } } },
      });
      return res.json({ userChats });
    }

    const validUsers = await prisma.user.findMany({
      where: { id: { in: toAdd } },
      select: { id: true },
    });
    const validIds = validUsers.map((u) => u.id);

    await prisma.userChat.createMany({
      data: validIds.map((userId) => ({
        chatId: req.params.id,
        userId,
        role: 'member',
      })),
      skipDuplicates: true,
    });

    const userChats = await prisma.userChat.findMany({
      where: { chatId: req.params.id },
      include: { user: { select: { id: true, username: true, avatar: true, status: true } } },
    });

    res.status(201).json({ userChats });
  } catch (err) {
    console.error('Add members error:', err);
    res.status(500).json({ error: 'Ошибка добавления участников' });
  }
});

// DELETE /api/chats/:id/members/:userId — кик участника (только admin)
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;

    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        isGroup: true,
        userChats: { some: { userId: req.user.id } },
      },
      include: { userChats: true },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const myUserChat = chat.userChats.find((uc) => uc.userId === req.user.id);
    if (myUserChat?.role !== 'admin') {
      return res.status(403).json({ error: 'Только администратор может исключать участников' });
    }
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Используйте выход из группы для удаления себя' });
    }

    const deleted = await prisma.userChat.deleteMany({
      where: {
        chatId: req.params.id,
        userId: targetUserId,
      },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Участник не найден' });

    res.json({ success: true });
  } catch (err) {
    console.error('Kick member error:', err);
    res.status(500).json({ error: 'Ошибка исключения' });
  }
});

// DELETE /api/chats/:id/leave — выход из группы (Smart Leave: передача прав или удаление)
router.delete('/:id/leave', async (req, res) => {
  try {
    const { transferToUserId, deleteChat } = req.body;

    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        isGroup: true,
        userChats: { some: { userId: req.user.id } },
      },
      include: { userChats: true },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const myUserChat = chat.userChats.find((uc) => uc.userId === req.user.id);
    const admins = chat.userChats.filter((uc) => uc.role === 'admin');
    const remaining = chat.userChats.filter((uc) => uc.userId !== req.user.id);
    const isOnlyAdmin = admins.length === 1 && myUserChat?.role === 'admin';

    if (isOnlyAdmin && remaining.length > 0) {
      if (!transferToUserId && !deleteChat) {
        return res.status(400).json({
          error: 'Требуется передача прав или удаление группы',
          requireTransfer: true,
        });
      }

      if (deleteChat === true) {
        await prisma.chat.delete({ where: { id: req.params.id } });
        return res.json({ success: true, chatDeleted: true });
      }

      if (transferToUserId) {
        const targetInGroup = remaining.find((uc) => uc.userId === transferToUserId);
        if (!targetInGroup) {
          return res.status(400).json({ error: 'Указанный пользователь не является участником группы' });
        }

        await prisma.$transaction([
          prisma.userChat.updateMany({
            where: { chatId: req.params.id, userId: transferToUserId },
            data: { role: 'admin' },
          }),
          prisma.userChat.deleteMany({
            where: { chatId: req.params.id, userId: req.user.id },
          }),
        ]);
        return res.json({ success: true, chatDeleted: false, transferredTo: transferToUserId });
      }
    }

    await prisma.userChat.deleteMany({
      where: {
        chatId: req.params.id,
        userId: req.user.id,
      },
    });

    if (remaining.length === 0) {
      await prisma.chat.delete({ where: { id: req.params.id } });
      return res.json({ success: true, chatDeleted: true });
    }

    res.json({ success: true, chatDeleted: false });
  } catch (err) {
    console.error('Leave group error:', err);
    res.status(500).json({ error: 'Ошибка выхода' });
  }
});

// DELETE /api/chats/:id — полное удаление группы (только admin)
router.delete('/:id', async (req, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: req.params.id,
        isGroup: true,
        userChats: { some: { userId: req.user.id } },
      },
      include: { userChats: true },
    });
    if (!chat) return res.status(404).json({ error: 'Чат не найден' });

    const myUserChat = chat.userChats.find((uc) => uc.userId === req.user.id);
    if (myUserChat?.role !== 'admin') {
      return res.status(403).json({ error: 'Только администратор может удалить группу' });
    }

    await prisma.chat.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

export default router;
