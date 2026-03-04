import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEDIA_DIR = path.join(__dirname, '../../uploads/media');
const AVATARS_DIR = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

const mediaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.mp4'];
    const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.jpg';
    cb(null, `${req.user.id}-${Date.now()}${safeExt}`);
  },
});

const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|mp4)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены: jpg, png, webp, mp4'));
    }
  },
});

const channelAvatarsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.jpg';
    cb(null, `channel-${req.params.id}-${Date.now()}${safeExt}`);
  },
});

const uploadChannelAvatar = multer({
  storage: channelAvatarsStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Разрешены: jpg, png, gif, webp'));
  },
});

function getMediaType(filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  if (ext === 'mp4') return 'video';
  return 'document';
}

router.use(authenticateToken);

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/channels — список каналов (мои + публичные)
router.get('/', async (req, res) => {
  try {
    const channels = await prisma.channel.findMany({
      where: {
        OR: [
          { members: { some: { userId: req.user.id } } },
          { creatorId: req.user.id },
          { isPublic: true },
        ],
      },
      include: {
        creator: { select: { id: true, username: true, avatar: true } },
        _count: { select: { members: true, posts: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const withMembership = await Promise.all(
      channels.map(async (ch) => {
        const mem = await prisma.channelMember.findUnique({
          where: { userId_channelId: { userId: req.user.id, channelId: ch.id } },
        });
        return {
          ...ch,
          isMember: !!mem,
          isAdmin: ch.creatorId === req.user.id || mem?.role === 'admin',
        };
      })
    );
    res.json(withMembership);
  } catch (err) {
    console.error('Get channels error:', err);
    res.status(500).json({ error: 'Ошибка загрузки каналов' });
  }
});

// POST /api/channels — создать канал (только авторизованный)
router.post('/', async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Укажите название канала' });
    }
    let slug = slugify(name);
    const existing = await prisma.channel.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const channel = await prisma.channel.create({
      data: {
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        isPublic: isPublic !== false,
        creatorId: req.user.id,
      },
      include: {
        creator: { select: { id: true, username: true, avatar: true } },
      },
    });

    await prisma.channelMember.create({
      data: { userId: req.user.id, channelId: channel.id, role: 'admin' },
    });

    res.status(201).json(channel);
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: 'Ошибка создания канала' });
  }
});

// GET /api/channels/:id — канал по ID
router.get('/:id', async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      include: {
        creator: { select: { id: true, username: true, avatar: true } },
        _count: { select: { members: true, posts: true } },
        members: {
          include: { user: { select: { id: true, username: true, avatar: true } } },
        },
      },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });
    const mem = await prisma.channelMember.findUnique({
      where: { userId_channelId: { userId: req.user.id, channelId: channel.id } },
    });
    const isAdmin = channel.creatorId === req.user.id || mem?.role === 'admin';
    const result = {
      ...channel,
      isMember: !!mem || channel.creatorId === req.user.id,
      isAdmin,
    };
    if (channel.hideMembers && !isAdmin) {
      result.members = [];
    }
    res.json(result);
  } catch (err) {
    console.error('Get channel error:', err);
    res.status(500).json({ error: 'Ошибка загрузки канала' });
  }
});

// POST /api/channels/:id/subscribe — подписаться
router.post('/:id/subscribe', async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });

    await prisma.channelMember.upsert({
      where: {
        userId_channelId: { userId: req.user.id, channelId: req.params.id },
      },
      create: { userId: req.user.id, channelId: req.params.id },
      update: {},
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Subscribe error:', err);
    res.status(500).json({ error: 'Ошибка подписки' });
  }
});

// POST /api/channels/:id/join — самостоятельная подписка на канал
router.post('/:id/join', async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });

    const existing = await prisma.channelMember.findUnique({
      where: {
        userId_channelId: { userId: req.user.id, channelId: req.params.id },
      },
    });

    if (!existing) {
      await prisma.channelMember.create({
        data: {
          userId: req.user.id,
          channelId: req.params.id,
          role: 'member',
        },
      });
    }

    res.json({ success: true, message: 'Вы подписались на канал' });
  } catch (err) {
    console.error('Join channel error:', err);
    res.status(500).json({ error: 'Ошибка подписки' });
  }
});

// DELETE /api/channels/:id/subscribe — отписаться
router.delete('/:id/subscribe', async (req, res) => {
  try {
    await prisma.channelMember.deleteMany({
      where: {
        channelId: req.params.id,
        userId: req.user.id,
        role: { not: 'admin' },
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    res.status(500).json({ error: 'Ошибка отписки' });
  }
});

// GET /api/channels/:id/posts — посты канала
router.get('/:id/posts', async (req, res) => {
  try {
    const channel = await prisma.channel.findFirst({
      where: { id: req.params.id },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });

    const posts = await prisma.post.findMany({
      where: { channelId: req.params.id, isDeleted: false },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        _count: { select: { comments: true, reactions: true } },
        reactions: { include: { user: { select: { id: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withReactionSummary = posts.map((p) => {
      const byEmoji = {};
      p.reactions.forEach((r) => {
        byEmoji[r.emoji] = (byEmoji[r.emoji] || 0) + 1;
      });
      const userReacted = p.reactions.find((r) => r.userId === req.user.id)?.emoji || null;
      const { reactions, ...rest } = p;
      return {
        ...rest,
        reactionCounts: byEmoji,
        commentCount: p._count.comments,
        userReacted,
      };
    });

    res.json(withReactionSummary);
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Ошибка загрузки постов' });
  }
});

// POST /api/channels/:id/posts — создать пост (только админ), multipart/form-data: content, media (массив)
router.post('/:id/posts', uploadMedia.array('media', 20), async (req, res) => {
  try {
    const content = (req.body.content || '').trim();
    const files = Array.isArray(req.files) ? req.files : [];
    const hasMedia = files.length > 0;

    if (!content && !hasMedia) {
      return res.status(400).json({ error: 'Укажите текст или прикрепите медиафайл' });
    }

    if (hasMedia) {
      const mediaTypes = files.map((f) => getMediaType(f.filename));
      const videoCount = mediaTypes.filter((t) => t === 'video').length;
      const photoCount = mediaTypes.filter((t) => t === 'image').length;
      if (photoCount > 20) {
        files.forEach((f) => {
          try {
            if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
          } catch (e) { /* ignore */ }
        });
        return res.status(400).json({ error: 'Максимум 20 фото в одном посте' });
      }
      if (videoCount > 8) {
        files.forEach((f) => {
          try {
            if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
          } catch (e) { /* ignore */ }
        });
        return res.status(400).json({ error: 'Максимум 8 видео в одном посте' });
      }
    }

    const channel = await prisma.channel.findFirst({
      where: { id: req.params.id },
      include: { members: true },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });

    const isAdmin = channel.creatorId === req.user.id ||
      channel.members.some((m) => m.userId === req.user.id && (m.role === 'admin' || m.role === 'moderator'));
    if (!isAdmin) {
      return res.status(403).json({ error: 'Только админ может публиковать посты' });
    }

    const postData = {
      content: content || '',
      authorId: req.user.id,
      channelId: req.params.id,
      mediaUrls: [],
      mediaTypes: [],
    };

    if (hasMedia) {
      postData.mediaUrls = files.map((f) => `/uploads/media/${f.filename}`);
      postData.mediaTypes = files.map((f) => getMediaType(f.filename));
    }

    let post;
    try {
      post = await prisma.post.create({
        data: postData,
        include: {
          author: { select: { id: true, username: true, avatar: true } },
        },
      });
    } catch (createErr) {
      if (hasMedia && files.length > 0) {
        files.forEach((f) => {
          try {
            if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path);
          } catch (unlinkErr) {
            console.error('Failed to delete uploaded file:', unlinkErr);
          }
        });
      }
      throw createErr;
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${req.params.id}`).emit('new_post', post);
    }

    res.status(201).json(post);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: err.message || 'Ошибка публикации' });
  }
});

// ============ API настроек каналов ============

// PUT /api/channels/:id — обновление названия, описания и hideMembers (только creatorId)
router.put('/:id', async (req, res) => {
  try {
    const { name, description, hideMembers } = req.body;

    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });
    if (channel.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Только создатель может редактировать канал' });
    }

    const data = {};
    if (name !== undefined && name !== null) {
      const trimmed = String(name).trim();
      if (trimmed) {
        data.name = trimmed;
        let slug = slugify(data.name);
        const existing = await prisma.channel.findFirst({
          where: { slug, id: { not: req.params.id } },
        });
        if (existing) slug = `${slug}-${Date.now().toString(36)}`;
        data.slug = slug;
      }
    }
    if (description !== undefined) data.description = description?.trim() || null;
    if (hideMembers !== undefined) data.hideMembers = Boolean(hideMembers);
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Укажите name, description или hideMembers' });
    }

    const updated = await prisma.channel.update({
      where: { id: req.params.id },
      data,
      include: {
        creator: { select: { id: true, username: true, avatar: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    console.error('Update channel error:', err);
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// POST /api/channels/:id/avatar — загрузка аватарки канала (только creatorId)
router.post('/:id/avatar', (req, res, next) => {
  uploadChannelAvatar.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Прикрепите файл' });

    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
    });
    if (!channel) {
      if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ } }
      return res.status(404).json({ error: 'Канал не найден' });
    }
    if (channel.creatorId !== req.user.id) {
      if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ } }
      return res.status(403).json({ error: 'Только создатель может менять аватар' });
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;
    const oldAvatar = channel.avatar;
    if (oldAvatar) {
      const oldPath = path.join(__dirname, '../..', oldAvatar.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
      }
    }

    const updated = await prisma.channel.update({
      where: { id: req.params.id },
      data: { avatar: avatarPath },
      include: {
        creator: { select: { id: true, username: true, avatar: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    if (req.file?.path) { try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ } }
    console.error('Channel avatar upload error:', err);
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

// DELETE /api/channels/:id/members/:userId — удаление подписчика (только creatorId)
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;

    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });
    if (channel.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Только создатель может исключать подписчиков' });
    }
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Используйте удаление канала для выхода' });
    }

    const deleted = await prisma.channelMember.deleteMany({
      where: {
        channelId: req.params.id,
        userId: targetUserId,
      },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Подписчик не найден' });

    res.json({ success: true });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Ошибка исключения' });
  }
});

// DELETE /api/channels/:id/leave — отписка (Smart Leave: передача прав или удаление)
router.delete('/:id/leave', async (req, res) => {
  try {
    const { transferToUserId, deleteChannel } = req.body;

    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });

    if (channel.creatorId === req.user.id) {
      if (!transferToUserId && !deleteChannel) {
        return res.status(400).json({
          error: 'Требуется передача прав или удаление канала',
          requireTransfer: true,
        });
      }

      if (deleteChannel === true) {
        const oldAvatar = channel.avatar;
        if (oldAvatar) {
          const oldPath = path.join(__dirname, '../..', oldAvatar.replace(/^\//, ''));
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
          }
        }
        await prisma.channel.delete({ where: { id: req.params.id } });
        return res.json({ success: true, channelDeleted: true });
      }

      if (transferToUserId) {
        const targetMember = channel.members.find((m) => m.userId === transferToUserId);
        if (!targetMember) {
          return res.status(400).json({ error: 'Указанный пользователь не подписан на канал' });
        }

        await prisma.$transaction([
          prisma.channel.update({
            where: { id: req.params.id },
            data: { creatorId: transferToUserId },
          }),
          prisma.channelMember.updateMany({
            where: { channelId: req.params.id, userId: transferToUserId },
            data: { role: 'admin' },
          }),
          prisma.channelMember.deleteMany({
            where: { channelId: req.params.id, userId: req.user.id },
          }),
        ]);
        return res.json({ success: true, channelDeleted: false, transferredTo: transferToUserId });
      }
    }

    const deleted = await prisma.channelMember.deleteMany({
      where: {
        channelId: req.params.id,
        userId: req.user.id,
      },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Вы не подписаны на этот канал' });

    res.json({ success: true });
  } catch (err) {
    console.error('Leave channel error:', err);
    res.status(500).json({ error: 'Ошибка отписки' });
  }
});

// DELETE /api/channels/:id — полное удаление канала (только creatorId)
router.delete('/:id', async (req, res) => {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });
    if (channel.creatorId !== req.user.id) {
      return res.status(403).json({ error: 'Только создатель может удалить канал' });
    }

    const oldAvatar = channel.avatar;
    if (oldAvatar) {
      const oldPath = path.join(__dirname, '../..', oldAvatar.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) {
        try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
      }
    }

    await prisma.channel.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete channel error:', err);
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

export default router;
