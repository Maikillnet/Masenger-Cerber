# Mesanger — Мессенджер

Монорепозиторий: `frontend` + `backend`.

## Этап 1: База данных (Prisma + PostgreSQL)

### Требования

- Node.js 18+
- PostgreSQL (локально или Docker)

### Установка

```bash
npm install
```

### Настройка БД

**Вариант A: Docker (рекомендуется)**

```bash
docker-compose up -d
```

PostgreSQL будет доступен на `localhost:5432` с учётом `postgres/postgres` и БД `mesanger`.

**Вариант B: Локальный PostgreSQL**

1. Создайте базу: `CREATE DATABASE mesanger;`
2. Скопируйте `backend/.env.example` в `backend/.env` и укажите свой `DATABASE_URL`

### Миграции и seed

```bash
# Применить миграции (создаёт таблицы)
npm run db:migrate

# Заполнить тестовыми пользователями
npm run db:seed
```

> ⚠️ Если `prisma migrate dev` выдаёт `Can't reach database server`:
> - **Docker**: `docker-compose up -d` (если установлен)
> - **Локально**: установите PostgreSQL и создайте БД `mesanger`
> - **Облако**: [Neon](https://neon.tech) или [Supabase](https://supabase.com) — бесплатные PostgreSQL, скопируйте connection string в `backend/.env`

Тестовые пользователи:
- `alice@example.com` / `password123`
- `bob@example.com` / `testuser456`

### Prisma Studio

```bash
npm run db:studio
```

Откроется веб-интерфейс для просмотра данных.

---

## Этап 2: Аутентификация и Личный кабинет

### Backend API

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/register` | Регистрация (username, email, password) |
| POST | `/api/auth/login` | Вход (email, password) → JWT |
| GET | `/api/users/me` | Текущий пользователь (Authorization: Bearer) |
| PUT | `/api/users/profile` | Обновление username, bio |
| POST | `/api/users/avatar` | Загрузка аватара (multipart/form-data) |
| PUT | `/api/users/password` | Смена пароля |
| GET/PUT | `/api/users/notifications` | Настройки уведомлений (заглушка) |

### Запуск

```bash
# Backend (порт 3001)
npm run dev:backend

# Frontend (порт 5173)
npm run dev:frontend
```

Откройте http://localhost:5173 — страницы входа, регистрации и личный кабинет.

### Тесты

```bash
npm test
```

Интеграционный тест: регистрация → логин → обновление bio → проверка в БД. Требуется запущенный PostgreSQL.

---

## Этап 3: P2P общение (WebSockets)

### Функционал

- **Socket.IO**: мгновенная доставка сообщений
- **Online/Offline**: при подключении — статус "Online", при отключении — "Offline"
- **Чат-лист** слева: список диалогов с последним сообщением и счётчиком непрочитанных
- **Окно переписки** справа: история из БД + real-time через сокет
- **Прочитано/Не прочитано**: `lastReadAt` в UserChat, счётчик непрочитанных

### Проверка

1. Запустите backend и frontend
2. Откройте два браузера (или один + инкогнито)
3. Залогиньтесь под alice и bob
4. Создайте чат (кнопка +) и отправьте сообщение
5. Сообщение должно появиться во втором окне без перезагрузки
6. Обновите страницу — история загружается из БД

---

## Этап 4: Групповые чаты и закрепление сообщений

### Функционал

- **Групповые чаты**: кнопка «+» → вкладка «Группа» → название + выбор участников
- **Закрепление**: правый клик по сообщению → «Закрепить» / «Открепить»
- **Плашка закреплённого**: вверху чата, клик — скролл к сообщению
- **Socket `message_pinned`**: рассылка всем участникам при pin/unpin

### Проверка

1. Создайте группу с 2+ участниками
2. В двух окнах откройте группу
3. Закрепите сообщение — плашка должна появиться у всех
4. Открепите — плашка исчезает
