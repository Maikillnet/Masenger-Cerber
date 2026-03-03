import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
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
      },
    });
    if (!channel) return res.status(404).json({ error: 'Канал не найден' });
    const mem = await prisma.channelMember.findUnique({
      where: { userId_channelId: { userId: req.user.id, channelId: channel.id } },
    });
    res.json({
      ...channel,
      isMember: !!mem || channel.creatorId === req.user.id,
      isAdmin: channel.creatorId === req.user.id || mem?.role === 'admin',
    });
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

// POST /api/channels/:id/posts — создать пост (только админ)
router.post('/:id/posts', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Текст поста не может быть пустым' });
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

    const post = await prisma.post.create({
      data: {
        content: content.trim(),
        authorId: req.user.id,
        channelId: req.params.id,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${req.params.id}`).emit('new_post', post);
    }

    res.status(201).json(post);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Ошибка публикации' });
  }
});

export default router;
