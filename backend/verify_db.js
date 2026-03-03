/**
 * verify_db.js — проверка подключения к PostgreSQL и записи
 * Создаёт тестового пользователя, проверяет его наличие, удаляет.
 *
 * Запуск: node verify_db.js (из папки backend)
 * Требуется: .env с DATABASE_URL
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_EMAIL = `verify-test-${Date.now()}@audit.local`;
const TEST_USERNAME = `verify_user_${Date.now()}`;
const TEST_PASSWORD = 'audit_verify_123';

async function verify() {
  console.log('=== verify_db.js: Проверка БД ===\n');

  try {
    // 1. Подключение
    console.log('1. Подключение к PostgreSQL...');
    await prisma.$connect();
    console.log('   ✅ Подключение успешно\n');

    // 2. Создание тестового пользователя
    console.log('2. Создание тестового пользователя...');
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        password: hashedPassword,
      },
    });
    console.log(`   ✅ Создан: id=${user.id}, email=${user.email}\n`);

    // 3. Чтение из БД
    console.log('3. Чтение пользователя из БД...');
    const found = await prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!found || found.email !== TEST_EMAIL) {
      throw new Error('Пользователь не найден после создания');
    }
    console.log('   ✅ Запись прочитана корректно\n');

    // 4. Удаление
    console.log('4. Удаление тестового пользователя...');
    await prisma.user.delete({
      where: { id: user.id },
    });
    const afterDelete = await prisma.user.findUnique({
      where: { id: user.id },
    });
    if (afterDelete) {
      throw new Error('Пользователь не удалился');
    }
    console.log('   ✅ Удаление выполнено\n');

    console.log('=== ✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ===');
    console.log('База данных доступна, запись и чтение работают.\n');
  } catch (err) {
    console.error('\n❌ ОШИБКА:', err.message);
    if (err.code) console.error('   Код:', err.code);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
