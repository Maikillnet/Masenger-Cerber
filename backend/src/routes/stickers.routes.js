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

const MAX_PACKS_PER_USER = 10;

function sanitizeName(name) {
  return String(name || 'pack')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 50) || 'pack';
}

const stickerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const tempDir = path.join(STICKERS_BASE, '_temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      const allowed = ['.png', '.webp', '.gif'];
      const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.png';
      cb(null, `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 МБ (для GIF)
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(png|webp|gif)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error('Разрешены только PNG, WEBP, GIF'));
  },
});

// GET /api/stickers — паки пользователя + общие (authorId null)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const packs = await prisma.stickerPack.findMany({
      where: {
        OR: [
          { authorId: req.user.id },
          { authorId: null },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { stickers: true },
    });
    res.json(packs);
  } catch (err) {
    console.error('Stickers list error:', err);
    res.status(500).json({ error: 'Ошибка загрузки стикеров' });
  }
});

// GET /api/stickers/my-packs — паки текущего пользователя
router.get('/my-packs', authenticateToken, async (req, res) => {
  try {
    const packs = await prisma.stickerPack.findMany({
      where: { authorId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { stickers: true },
    });
    res.json(packs);
  } catch (err) {
    console.error('My stickers error:', err);
    res.status(500).json({ error: 'Ошибка загрузки стикерпаков' });
  }
});

// POST /api/stickers/packs — создание пака
router.post('/packs', authenticateToken, (req, res, next) => {
  stickerUpload.fields([{ name: 'cover', maxCount: 1 }, { name: 'stickers', maxCount: 50 }])(req, res, (err) => {
    if (err) {
      const allFiles = [
        ...(req.files?.['cover'] || []),
        ...(req.files?.['stickers'] || []),
      ];
      allFiles.forEach((f) => {
        try { if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
      });
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Файл слишком большой (макс. 10 МБ)' : (err.message || 'Ошибка загрузки файлов');
      return res.status(400).json({ error: msg });
    }
    next();
  });
}, async (req, res) => {
  const coverFile = req.files?.['cover']?.[0];
  const stickerFiles = req.files?.['stickers'] || [];

  if (stickerFiles.length === 0) {
    [coverFile, ...stickerFiles].filter(Boolean).forEach((f) => {
      try { if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
    });
    return res.status(400).json({ error: 'Прикрепите хотя бы один стикер (PNG, WEBP, GIF)' });
  }

  const cleanupFiles = () => {
    [coverFile, ...stickerFiles].filter(Boolean).forEach((f) => {
      try { if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
    });
  };

  let packDir = null;
  try {
    const count = await prisma.stickerPack.count({ where: { authorId: req.user.id } });
    if (count >= MAX_PACKS_PER_USER) {
      cleanupFiles();
      return res.status(400).json({ error: 'Лимит 10 стикерпаков достигнут' });
    }

    const baseName = sanitizeName(req.body?.name || 'pack');
    const packName = `${baseName}-${req.user.id.slice(0, 8)}-${Date.now()}`;
    packDir = path.join(STICKERS_BASE, packName);

    if (!fs.existsSync(packDir)) fs.mkdirSync(packDir, { recursive: true });

    let coverUrl = null;
    if (coverFile) {
      const coverExt = path.extname(coverFile.originalname) || '.png';
      const allowed = ['.png', '.webp', '.gif'];
      const safeCoverExt = allowed.includes(coverExt.toLowerCase()) ? coverExt : '.png';
      const coverDestName = `cover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeCoverExt}`;
      const coverDestPath = path.join(packDir, coverDestName);
      fs.renameSync(coverFile.path, coverDestPath);
      coverUrl = `/uploads/stickers/${packName}/${coverDestName}`;
    }

    const stickerUrls = [];
    for (const f of stickerFiles) {
      const ext = path.extname(f.originalname) || '.png';
      const allowed = ['.png', '.webp', '.gif'];
      const safeExt = allowed.includes(ext.toLowerCase()) ? ext : '.png';
      const destName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
      const destPath = path.join(packDir, destName);
      fs.renameSync(f.path, destPath);
      stickerUrls.push(`/uploads/stickers/${packName}/${destName}`);
    }

    const iconUrl = coverUrl ?? stickerUrls[0];

    const pack = await prisma.stickerPack.create({
      data: {
        name: (req.body?.name?.trim() || baseName).slice(0, 100),
        iconUrl,
        coverUrl,
        authorId: req.user.id,
        stickers: {
          create: stickerUrls.map((url) => ({ url })),
        },
      },
      include: { stickers: true },
    });

    res.status(201).json(pack);
  } catch (createErr) {
    try {
      if (packDir && fs.existsSync(packDir)) {
        fs.readdirSync(packDir).forEach((f) => fs.unlinkSync(path.join(packDir, f)));
        fs.rmdirSync(packDir);
      }
    } catch (unlinkErr) {
      console.error('Cleanup error:', unlinkErr);
    }
    console.error('Sticker pack create error:', createErr);
    res.status(500).json({ error: 'Ошибка создания пака стикеров' });
  }
});

// DELETE /api/stickers/packs/:id — удаление пака (только автор)
router.delete('/packs/:id', authenticateToken, async (req, res) => {
  try {
    const pack = await prisma.stickerPack.findUnique({ where: { id: req.params.id } });
    if (!pack) return res.status(404).json({ error: 'Пак не найден' });
    if (pack.authorId !== req.user.id) return res.status(403).json({ error: 'Нет прав на удаление' });

    const packFolder = pack.iconUrl ? path.basename(path.dirname(pack.iconUrl)) : null;
    const packDir = packFolder ? path.join(STICKERS_BASE, packFolder) : null;
    if (packDir && fs.existsSync(packDir)) {
      fs.readdirSync(packDir).forEach((f) => fs.unlinkSync(path.join(packDir, f)));
      fs.rmdirSync(packDir);
    }

    await prisma.stickerPack.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('Sticker pack delete error:', err);
    res.status(500).json({ error: 'Ошибка удаления пака' });
  }
});

export default router;
