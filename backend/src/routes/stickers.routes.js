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
const STICKERS_BASE = path.join(UPLOADS_DIR, 'stickers');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(STICKERS_BASE)) {
  fs.mkdirSync(STICKERS_BASE, { recursive: true });
}

function sanitizeName(name) {
  return String(name || 'pack')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 50) || 'pack';
}

function requireAdmin(req, res, next) {
  const adminIds = process.env.ADMIN_USER_IDS?.split(',').map((id) => id.trim()).filter(Boolean);
  if (adminIds?.length && !adminIds.includes(req.user?.id)) {
    return res.status(403).json({ error: 'Требуются права администратора' });
  }
  next();
}

// GET /api/stickers — все паки со стикерами
router.get('/', async (req, res) => {
  try {
    const packs = await prisma.stickerPack.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        stickers: true,
      },
    });
    res.json(packs);
  } catch (err) {
    console.error('Stickers list error:', err);
    res.status(500).json({ error: 'Ошибка загрузки стикеров' });
  }
});

const TEMP_STICKERS = path.join(STICKERS_BASE, '_temp');

const stickerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!fs.existsSync(TEMP_STICKERS)) fs.mkdirSync(TEMP_STICKERS, { recursive: true });
      cb(null, TEMP_STICKERS);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.png';
      if (file.fieldname === 'icon') {
        cb(null, `icon-${Date.now()}${safeExt}`);
      } else {
        cb(null, `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
      }
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(png|jpg|jpeg|webp|gif)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Разрешены: png, jpg, webp, gif'));
  },
}).fields([
  { name: 'icon', maxCount: 1 },
  { name: 'stickers', maxCount: 50 },
]);

// POST /api/stickers/pack — создание пака (для админа)
router.post('/pack', authenticateToken, requireAdmin, (req, res) => {
  stickerUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Ошибка загрузки файлов' });
    }

    const iconFile = req.files?.icon?.[0];
    const stickerFiles = req.files?.stickers || [];

    if (!iconFile || stickerFiles.length === 0) {
      [iconFile, ...stickerFiles].filter(Boolean).forEach((f) => {
        try { if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
      });
      return res.status(400).json({ error: 'Прикрепите иконку пака и хотя бы один стикер' });
    }

    const packName = sanitizeName(req.body?.name || `pack-${Date.now()}`);
    const packDir = path.join(STICKERS_BASE, packName);

    try {
      if (!fs.existsSync(packDir)) fs.mkdirSync(packDir, { recursive: true });

      const iconExt = path.extname(iconFile.originalname) || '.png';
      const iconDest = path.join(packDir, `icon${iconExt}`);
      fs.renameSync(iconFile.path, iconDest);
      const iconUrl = `/uploads/stickers/${packName}/icon${iconExt}`;

      const stickerUrls = [];
      for (const f of stickerFiles) {
        const ext = path.extname(f.originalname) || '.png';
        const destName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
        const destPath = path.join(packDir, destName);
        fs.renameSync(f.path, destPath);
        stickerUrls.push(`/uploads/stickers/${packName}/${destName}`);
      }

      const pack = await prisma.stickerPack.create({
        data: {
          name: (req.body?.name?.trim() || packName).slice(0, 100),
          iconUrl,
          stickers: {
            create: stickerUrls.map((url) => ({ url })),
          },
        },
        include: { stickers: true },
      });

      res.status(201).json(pack);
    } catch (createErr) {
      try {
        if (fs.existsSync(packDir)) {
          fs.readdirSync(packDir).forEach((f) => fs.unlinkSync(path.join(packDir, f)));
          fs.rmdirSync(packDir);
        }
        if (iconFile?.path && fs.existsSync(iconFile.path)) fs.unlinkSync(iconFile.path);
        stickerFiles.forEach((f) => { if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      } catch (unlinkErr) {
        console.error('Cleanup error:', unlinkErr);
      }
      console.error('Sticker pack create error:', createErr);
      res.status(500).json({ error: createErr.code === 'P2002' ? 'Пак с таким именем уже существует' : 'Ошибка создания пака стикеров' });
    }
  });
});

export default router;
