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

const storiesStorage = multer.diskStorage({
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
});

const uploadStory = multer({
  storage: storiesStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB (подходит для вертикального видео)
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|mp4)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены: jpg, png, webp, mp4'));
    }
  },
});

function getMediaType(filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  if (ext === 'mp4') return 'video';
  return 'image';
}

router.use(authenticateToken);

// POST /api/stories — загрузка истории
router.post('/', (req, res, next) => {
  uploadStory.single('media')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'Прикрепите медиафайл (image или video)' });
  }

  const mediaUrl = `/uploads/stories/${req.file.filename}`;
  const mediaType = getMediaType(req.file.filename);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    const story = await prisma.story.create({
      data: {
        mediaUrl,
        mediaType,
        expiresAt,
        authorId: req.user.id,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
      },
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('new_story', story);
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

// GET /api/stories/feed — лента активных историй (пользователи с неистёкшими историями)
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

// GET /api/stories/archive — архив историй текущего пользователя (включая протухшие)
router.get('/archive', async (req, res) => {
  try {
    const stories = await prisma.story.findMany({
      where: { authorId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json(stories);
  } catch (err) {
    console.error('Stories archive error:', err);
    res.status(500).json({ error: 'Ошибка загрузки архива историй' });
  }
});

// DELETE /api/stories/:id — удаление истории (только автор)
router.delete('/:id', async (req, res) => {
  try {
    const story = await prisma.story.findFirst({
      where: { id: req.params.id, authorId: req.user.id },
    });
    if (!story) return res.status(404).json({ error: 'История не найдена' });

    const filePath = path.join(__dirname, '../..', story.mediaUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) console.error('Failed to delete story file:', err);
      });
    }

    await prisma.story.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Story delete error:', err);
    res.status(500).json({ error: 'Ошибка удаления истории' });
  }
});

export default router;
