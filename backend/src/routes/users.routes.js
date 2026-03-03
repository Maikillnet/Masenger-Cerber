import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import prisma from '../lib/prisma.js';
import { sanitizeUser } from '../utils/sanitizeUser.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Папка для загрузки аватаров
const UPLOAD_DIR = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.jpg';
    cb(null, `${req.user.id}-${Date.now()}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Неверный формат. Разрешены: jpg, png, gif, webp'));
    }
  },
});

router.use(authenticateToken);

// PUT /api/users/profile — обновление username, bio
router.put('/profile', async (req, res) => {
  try {
    const { username, bio } = req.body;
    const updateData = {};

    if (username !== undefined) {
      const trimmed = String(username).trim();
      if (!trimmed) {
        return res.status(400).json({ error: 'Имя пользователя не может быть пустым' });
      }
      const existing = await prisma.user.findFirst({
        where: { username: trimmed, NOT: { id: req.user.id } },
      });
      if (existing) {
        return res.status(400).json({ error: 'Имя пользователя уже занято' });
      }
      updateData.username = trimmed;
    }

    if (bio !== undefined) {
      updateData.bio = String(bio).trim() || null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
    });

    res.json({ success: true, user: sanitizeUser(updatedUser) });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(400).json({ error: 'Ошибка обновления профиля' });
  }
});

// POST /api/users/avatar — загрузка аватара
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user?.avatar) {
      const oldPath = path.join(__dirname, '../../', user.avatar.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { avatar: avatarPath },
    });

    res.json({ success: true, user: sanitizeUser(updatedUser) });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(400).json({ error: err.message || 'Ошибка загрузки аватара' });
  }
});

// PUT /api/users/password — смена пароля
router.put('/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(400).json({ error: 'Ошибка смены пароля' });
  }
});

// GET /api/users — список пользователей (для нового чата)
router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { id: { not: req.user.id } },
      select: { id: true, username: true, avatar: true, status: true },
      orderBy: { username: 'asc' },
    });
    res.json(users);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Ошибка загрузки пользователей' });
  }
});

// GET /api/users/me — текущий пользователь
router.get('/me', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ error: 'Ошибка получения профиля' });
  }
});

// GET/PUT /api/users/notifications — заглушка настроек уведомлений
router.get('/notifications', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { notificationSettings: true },
  });
  res.json({
    success: true,
    settings: user?.notificationSettings ?? {
      emailNotifications: true,
      pushEnabled: false,
      soundEnabled: true,
    },
  });
});

router.put('/notifications', async (req, res) => {
  try {
    const { emailNotifications, pushEnabled, soundEnabled } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const current = (user?.notificationSettings && typeof user.notificationSettings === 'object')
      ? user.notificationSettings
      : { emailNotifications: true, pushEnabled: false, soundEnabled: true };
    const settings = { ...current };
    if (typeof emailNotifications === 'boolean') settings.emailNotifications = emailNotifications;
    if (typeof pushEnabled === 'boolean') settings.pushEnabled = pushEnabled;
    if (typeof soundEnabled === 'boolean') settings.soundEnabled = soundEnabled;

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { notificationSettings: settings },
    });

    res.json({ success: true, settings: updated.notificationSettings });
  } catch (err) {
    console.error('Notifications update error:', err);
    res.status(400).json({ error: 'Ошибка обновления настроек' });
  }
});

export default router;
