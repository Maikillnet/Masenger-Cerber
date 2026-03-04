import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
router.use(authenticateToken);

// GET /api/posts/:id — пост по ID (без автоинкремента просмотров — используйте POST /:id/view)
router.get('/:id', async (req, res) => {
  try {
    const post = await prisma.post.findFirst({
      where: { id: req.params.id, isDeleted: false },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        channel: { select: { id: true, name: true } },
        reactions: { include: { user: { select: { id: true } } } },
        _count: { select: { comments: true, views: true } },
      },
    });
    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    const viewCount = post._count?.views ?? post.viewCount ?? 0;

    const byEmoji = {};
    post.reactions.forEach((r) => {
      byEmoji[r.emoji] = (byEmoji[r.emoji] || 0) + 1;
    });
    const userReacted = post.reactions.find((r) => r.userId === req.user.id)?.emoji;

    res.json({
      ...post,
      viewCount,
      reactionCounts: byEmoji,
      commentCount: post._count.comments,
      userReacted: userReacted || null,
    });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Ошибка загрузки поста' });
  }
});

// POST /api/posts/:id/view — идемпотентная фиксация уникального просмотра
router.post('/:id/view', async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const post = await prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    const existingView = await prisma.postView.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (!existingView) {
      await prisma.postView.create({
        data: { postId, userId },
      });
    }

    const viewsCount = await prisma.postView.count({ where: { postId } });
    res.json({ views: viewsCount });
  } catch (err) {
    console.error('View post error:', err);
    res.status(500).json({ error: 'Ошибка фиксации просмотра' });
  }
});

// POST /api/posts/:id/react — toggle реакция
router.post('/:id/react', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji?.trim()) {
      return res.status(400).json({ error: 'Укажите emoji' });
    }

    const post = await prisma.post.findFirst({
      where: { id: req.params.id, isDeleted: false },
      include: { channel: true },
    });
    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    const existing = await prisma.postReaction.findFirst({
      where: {
        userId: req.user.id,
        postId: req.params.id,
        emoji: emoji.trim(),
      },
    });

    if (existing) {
      await prisma.postReaction.delete({
        where: { id: existing.id },
      });
    } else {
      await prisma.postReaction.create({
        data: {
          userId: req.user.id,
          postId: req.params.id,
          emoji: emoji.trim(),
        },
      });
    }

    const reactions = await prisma.postReaction.findMany({
      where: { postId: req.params.id },
      include: { user: { select: { id: true } } },
    });
    const byEmoji = {};
    reactions.forEach((r) => {
      byEmoji[r.emoji] = (byEmoji[r.emoji] || 0) + 1;
    });
    const userReacted = reactions.find((r) => r.userId === req.user.id)?.emoji || null;

    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${post.channelId}`).emit('post_reaction', {
        postId: req.params.id,
        reactionCounts: byEmoji,
      });
    }

    res.json({ reactionCounts: byEmoji, userReacted });
  } catch (err) {
    console.error('React error:', err);
    res.status(500).json({ error: 'Ошибка реакции' });
  }
});

// GET /api/posts/:id/comments — комментарии поста
router.get('/:id/comments', async (req, res) => {
  try {
    const post = await prisma.post.findFirst({
      where: { id: req.params.id, isDeleted: false },
    });
    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    const comments = await prisma.comment.findMany({
      where: { postId: req.params.id, isDeleted: false },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Ошибка загрузки комментариев' });
  }
});

// POST /api/posts/:id/comments — добавить комментарий
router.post('/:id/comments', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: 'Текст комментария не может быть пустым' });
    }

    const post = await prisma.post.findFirst({
      where: { id: req.params.id, isDeleted: false },
      include: { channel: true },
    });
    if (!post) return res.status(404).json({ error: 'Пост не найден' });

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        authorId: req.user.id,
        postId: req.params.id,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${post.channelId}`).emit('new_comment', { postId: req.params.id, comment });
    }

    res.status(201).json(comment);
  } catch (err) {
    console.error('Create comment error:', err);
    res.status(500).json({ error: 'Ошибка добавления комментария' });
  }
});

export default router;
