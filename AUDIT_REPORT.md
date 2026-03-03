# Аудит мессенджера: Этапы 1 и 2

**Дата:** 2026-03-03  
**Проверка:** Prisma-схема, бэкенд (auth, users), verify_db.js, интеграционные тесты

---

## 1. Prisma-схема (`backend/prisma/schema.prisma`)

### Модели и связи

| Модель | Связи | Статус |
|--------|-------|--------|
| **User** | messages, reactions, comments, posts, userChats, createdChannels, channelMembers, postReactions | ✅ Все связи заданы |
| **Chat** | messages, userChats, pinnedMessage | ✅ |
| **UserChat** | user → User, chat → Chat, onDelete: Cascade | ✅ |
| **Message** | sender → User, chat → Chat, reactions, pinnedInChats | ✅ |
| **Channel** | creator → User, posts, members | ✅ |
| **ChannelMember** | user → User, channel → Channel | ✅ |
| **Post** | author → User, channel → Channel, comments, reactions | ✅ |
| **Reaction** | user → User, message → Message | ✅ |
| **PostReaction** | user → User, post → Post | ✅ |
| **Comment** | author → User, post → Post | ✅ |

**Вывод:** Схема полная, связи настроены корректно. Индексы на chatId, senderId, userId и т.д. присутствуют.

**Замечание:** `notificationSettings Json?` помечен как «заглушка» в комментарии — это только поле, не влияет на связи.

---

## 2. Бэкенд: аутентификация и пользователи

### auth.routes.js

| Функция | Реализация | Статус |
|---------|------------|--------|
| Хэширование пароля | `bcrypt.hash(password, 10)` | ✅ Реальное |
| Сравнение пароля | `bcrypt.compare(password, user.password)` | ✅ Реальное |
| JWT | `jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' })` | ✅ Реальное |
| Валидация | Проверка полей, длина пароля ≥ 6 | ✅ |
| Дубликаты | Проверка email/username перед созданием | ✅ |

### auth middleware

| Функция | Реализация | Статус |
|---------|------------|--------|
| Извлечение токена | `Authorization: Bearer <token>` | ✅ |
| Верификация | `jwt.verify(token, JWT_SECRET)` | ✅ |
| req.user | `req.user = payload` (payload содержит `id`) | ✅ |

### users.routes.js

| Эндпоинт | Реализация | Статус |
|----------|------------|--------|
| PUT /profile | Обновление username, bio, проверка уникальности | ✅ |
| POST /avatar | Multer, проверка формата, удаление старого файла | ✅ |
| PUT /password | `bcrypt.compare` + `bcrypt.hash` | ✅ Реальное |
| GET /me | `sanitizeUser` (исключает password) | ✅ |
| GET/PUT /notifications | Работа с JSON-полем | 🟡 Заглушка (логика есть, но не полноценные уведомления) |

### sanitizeUser.js

- Исключает поле `password` из объекта пользователя. ✅

---

## 3. verify_db.js

**Скрипт:** `backend/verify_db.js`

**Логика:**
1. Подключение к PostgreSQL через Prisma
2. Создание тестового пользователя (bcrypt)
3. Чтение пользователя из БД
4. Удаление пользователя
5. Проверка, что пользователь удалён

**Результат запуска:**
```
❌ ОШИБКА: Can't reach database server at `localhost:5432`
```

**Причина:** PostgreSQL не запущен. `docker-compose up -d` не выполнялся или контейнер остановлен.

---

## 4. Интеграционные тесты

**Файл:** `backend/tests/auth.integration.test.js`

**Покрытие:**
- POST /api/auth/register → токен и user
- POST /api/auth/login → токен
- PUT /api/users/profile с токеном
- Проверка сохранения bio в БД
- 401 без токена
- 400 при занятом username
- 400 при занятом email

**Результат:** Тесты не запускались из-за недоступности БД (PostgreSQL не запущен).

---

## 5. Миграции

**Проверка:** `backend/prisma/migrations/` — папка отсутствует.

**Вывод:** Миграции не созданы. Схема, скорее всего, применялась через `prisma db push` или БД ещё не инициализирована.

---

# ИТОГОВЫЙ ОТЧЁТ

## Этап 1: База данных

### 🟡 СДЕЛАНО ЧАСТИЧНО

**Что сделано:**
- Prisma-схема полная, все модели и связи настроены
- `prisma/seed.js` с bcrypt-хешированием
- `verify_db.js` написан и логически корректен
- `docker-compose.yml` для PostgreSQL настроен

**Почему не зелёный статус:**
1. **Папка migrations отсутствует** — нет истории миграций, непонятно, применена ли схема к БД
2. **PostgreSQL недоступен** — `verify_db.js` падает с `Can't reach database server at localhost:5432`
3. **Нет подтверждения работы БД** — создать/удалить тестового пользователя не удалось

**Что нужно сделать:**
1. Запустить PostgreSQL: `docker-compose up -d`
2. Применить схему: `npx prisma migrate dev` (создать миграцию) или `npx prisma db push`
3. Запустить `node verify_db.js` и убедиться, что все шаги проходят

---

## Этап 2: Аутентификация

### 🟡 СДЕЛАНО ЧАСТИЧНО

**Что сделано:**
- Реальное хэширование паролей (bcrypt, 10 раундов)
- Реальная генерация и проверка JWT
- Валидация полей и проверка дубликатов
- `sanitizeUser` исключает password
- Интеграционные тесты написаны

**Почему не зелёный статус:**
1. **Тесты не пройдены** — из-за недоступности БД
2. **JWT_SECRET по умолчанию** — `process.env.JWT_SECRET || 'dev-secret-change-in-production'` небезопасен для продакшена
3. **Уведомления** — GET/PUT notifications помечены как заглушка (логика есть, но не полноценная система уведомлений)

**Что нужно сделать:**
1. Запустить PostgreSQL и пройти тесты: `npm test`
2. В продакшене обязательно задавать `JWT_SECRET` в переменных окружения
3. (Опционально) Реализовать полноценные уведомления вместо заглушки

---

## Резюме

| Этап | Статус | Главная причина |
|------|--------|------------------|
| Этап 1: База | 🟡 Частично | БД недоступна, migrations не созданы |
| Этап 2: Auth | 🟡 Частично | Тесты не пройдены, JWT fallback небезопасен |

Код аутентификации и работы с пользователями реализован корректно. Для перехода в статус «полностью готово» нужно:
1. Запустить PostgreSQL
2. Применить схему и выполнить `verify_db.js`
3. Успешно пройти `npm test`
