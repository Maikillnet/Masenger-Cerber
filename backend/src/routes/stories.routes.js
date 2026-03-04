import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import prisma from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const STORIES_DIR = path.join(UPLOADS_DIR, 'stories');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(STORIES_DIR)) {
  fs.mkdirSync(STORIES_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORIES_DIR),
    filename: (req, file, cb) => {
      if (!req.user?.id) {
        return cb(new Error('Требуется авторизация'));
      }
      const ext = path.extname(file.originalname) || '.jpg';
      const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.mp4'];
      const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.jpg';
      cb(null, `${req.user.id}-${Date.now()}${safeExt}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|mp4)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Разрешены: jpg, png, webp, mp4'));
  },
});

function getMediaType(filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  if (ext === 'mp4') return 'video';
  return 'image';
}

router.use(authenticateToken);

// POST /api/stories — загрузка истории (фронт: formData.append('media', file))
router.post('/', upload.single('media'), async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Прикрепите медиафайл (image или video)' });
  }

  const mediaUrl = `/uploads/stories/${req.file.filename}`;
  const mediaType = getMediaType(req.file.filename);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  let textSettings = null;
  if (req.body.textSettings) {
    try {
      textSettings = typeof req.body.textSettings === 'string'
        ? JSON.parse(req.body.textSettings)
        : req.body.textSettings;
    } catch {
      textSettings = null;
    }
  }

  let mediaSettings = null;
  if (req.body.mediaSettings) {
    try {
      mediaSettings = typeof req.body.mediaSettings === 'string'
        ? JSON.parse(req.body.mediaSettings)
        : req.body.mediaSettings;
    } catch {
      mediaSettings = null;
    }
  }

  const caption = req.body.caption?.trim() || null;

  try {
    const story = await prisma.story.create({
      data: {
        mediaUrl,
        mediaType,
        expiresAt,
        authorId: req.user.id,
        caption,
        textSettings,
        mediaSettings,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    if (req.app.get('io')) {
      req.app.get('io').emit('new_story', story);
    }

    res.status(201).json(story);
  } catch (err) {
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (unlinkErr) {
      console.error('Failed to delete uploaded file:', unlinkErr);
    }
    console.error('Story upload error:', err);
    res.status(500).json({ error: 'Ошибка загрузки истории' });
  }
});

// Multer error handler (fileFilter, limits, etc.)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
  }
  next();
});

// GET /api/stories/feed — массив пользователей, у каждого внутри массив stories
router.get('/feed', async (req, res) => {
  try {
    const now = new Date();

    const usersWithStories = await prisma.user.findMany({
      where: {
        stories: {
          some: { expiresAt: { gt: now } },
        },
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        stories: {
          where: { expiresAt: { gt: now } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            mediaUrl: true,
            mediaType: true,
            createdAt: true,
            expiresAt: true,
            views: true,
            caption: true,
            textSettings: true,
            mediaSettings: true,
          },
        },
      },
    });

    const feed = usersWithStories
      .filter((u) => u.stories.length > 0)
      .map(({ stories, ...user }) => ({ ...user, stories }));

    res.json(feed);
  } catch (err) {
    console.error('Stories feed error:', err);
    res.status(500).json({ error: 'Ошибка загрузки ленты историй' });
  }
});

// GET /api/stories/archive — архив историй текущего пользователя
router.get('/archive', async (req, res) => {
  try {
    const stories = await prisma.story.findMany({
      where: { authorId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        mediaUrl: true,
        mediaType: true,
        createdAt: true,
        expiresAt: true,
        views: true,
        caption: true,
        textSettings: true,
        mediaSettings: true,
      },
    });
    res.json(stories);
  } catch (err) {
    console.error('Stories archive error:', err);
    res.status(500).json({ error: 'Ошибка загрузки архива историй' });
  }
});

// POST /api/stories/:id/view — идемпотентная фиксация уникального просмотра
router.post('/:id/view', async (req, res) => {
  try {
    const storyId = req.params.id;
    const userId = req.user.id;

    const story = await prisma.story.findFirst({
      where: { id: storyId },
    });
    if (!story) return res.status(404).json({ error: 'История не найдена' });

    const now = new Date();
    if (story.expiresAt < now) {
      return res.status(410).json({ error: 'История истекла' });
    }

    const existingView = await prisma.storyView.findUnique({
      where: { storyId_userId: { storyId, userId } },
    });

    if (!existingView) {
      await prisma.storyView.create({
        data: { storyId, userId },
      });
    }

    const viewsCount = await prisma.storyView.count({ where: { storyId } });
    res.json({ views: viewsCount });
  } catch (err) {
    console.error('View story error:', err);
    res.status(500).json({ error: 'Ошибка фиксации просмотра' });
  }
});

// DELETE /api/stories/:id
router.delete('/:id', async (req, res) => {
  try {
    const story = await prisma.story.findFirst({
      where: { id: req.params.id, authorId: req.user.id },
    });
    if (!story) return res.status(404).json({ error: 'История не найдена' });

    const filePath = path.join(__dirname, '../..', story.mediaUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.story.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Story delete error:', err);
    res.status(500).json({ error: 'Ошибка удаления истории' });
  }
});

export default router;
