/**
 * Seed скрипт для мессенджера
 * Добавляет двух тестовых пользователей в БД
 *
 * Запуск: npm run db:seed (или npx prisma db seed)
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Начинаем seed...');

  // Хешируем пароли (в продакшене используйте более надёжный подход)
  const hashedPassword1 = await bcrypt.hash('password123', 10);
  const hashedPassword2 = await bcrypt.hash('testuser456', 10);

  // Создаём первого тестового пользователя
  const user1 = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      username: 'alice',
      email: 'alice@example.com',
      password: hashedPassword1,
      avatar: null,
      bio: 'Тестовый пользователь 1',
      status: 'offline',
    },
  });
  console.log('✅ Создан пользователь:', user1.username, '(' + user1.email + ')');

  // Создаём второго тестового пользователя
  const user2 = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      username: 'bob',
      email: 'bob@example.com',
      password: hashedPassword2,
      avatar: null,
      bio: 'Тестовый пользователь 2',
      status: 'offline',
    },
  });
  console.log('✅ Создан пользователь:', user2.username, '(' + user2.email + ')');

  console.log('\n🎉 Seed завершён успешно!');
  console.log('   Тестовые учётные данные:');
  console.log('   - alice@example.com / password123');
  console.log('   - bob@example.com / testuser456');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
