/**
 * Интеграционный тест: регистрация → токен → обновление bio → проверка в БД
 *
 * Запуск: npm test (из папки backend)
 * Требуется: PostgreSQL с DATABASE_URL в .env
 */

import request from 'supertest';
import app from '../server.js';
import prisma from '../src/lib/prisma.js';

const TEST_EMAIL = `test-${Date.now()}@example.com`;
const TEST_USERNAME = `user${Date.now()}`;
const TEST_PASSWORD = 'password123';
let authToken;
let userId;

describe('Auth & Profile Integration', () => {
  beforeAll(async () => {
    // Проверка подключения к БД
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('POST /api/auth/register — регистрирует пользователя и возвращает токен', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: TEST_USERNAME,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.email).toBe(TEST_EMAIL);
    expect(res.body.user.username).toBe(TEST_USERNAME);
    expect(res.body.user).not.toHaveProperty('password');

    authToken = res.body.token;
    userId = res.body.user.id;
  });

  it('POST /api/auth/login — возвращает токен при верных данных', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.id).toBe(userId);
  });

  it('PUT /api/users/profile — обновляет bio с токеном', async () => {
    const newBio = 'Обновлённая информация о себе из теста';

    const res = await request(app)
      .put('/api/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ bio: newBio });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.bio).toBe(newBio);
  });

  it('Проверка: bio сохранён в БД', async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    expect(user).toBeTruthy();
    expect(user.bio).toBe('Обновлённая информация о себе из теста');
  });

  it('PUT /api/users/profile без токена — 401', async () => {
    const res = await request(app)
      .put('/api/users/profile')
      .send({ bio: 'test' });

    expect(res.status).toBe(401);
  });

  it('POST /api/auth/register — ошибка при занятом username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: TEST_USERNAME,
        email: `other-${Date.now()}@example.com`,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/занят|username|имя/i);
  });

  it('POST /api/auth/register — ошибка при занятом email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: `other${Date.now()}`,
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/занят|email/i);
  });
});
