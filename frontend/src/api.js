const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

function getHeaders(includeAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (includeAuth && token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function register(username, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: getHeaders(false),
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
  return data;
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: getHeaders(false),
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка входа');
  return data;
}

export async function getMe() {
  const res = await fetch(`${API_BASE}/users/me`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки профиля');
  return data;
}

export async function updateProfile(username, bio) {
  const res = await fetch(`${API_BASE}/users/profile`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ username, bio }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка обновления');
  return data;
}

export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await fetch(`${API_BASE}/users/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data;
}

export async function changePassword(currentPassword, newPassword) {
  const res = await fetch(`${API_BASE}/users/password`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка смены пароля');
  return data;
}

export async function getNotifications() {
  const res = await fetch(`${API_BASE}/users/notifications`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data;
}

export async function updateNotifications(settings) {
  const res = await fetch(`${API_BASE}/users/notifications`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(settings),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка обновления');
  return data;
}

export function avatarUrl(path) {
  if (!path) return null;
  return path.startsWith('http') ? path : path;
}

// Chats
export async function getChats() {
  const res = await fetch(`${API_BASE}/chats`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки чатов');
  return data;
}

export async function getChat(id) {
  const res = await fetch(`${API_BASE}/chats/${id}`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Чат не найден');
  return data;
  const res = await fetch(`${API_BASE}/chats/${id}`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Чат не найден');
  return data;
}

export async function createChat(otherUserId) {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ otherUserId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка создания чата');
  return data;
}

export async function createGroupChat(name, participantIds) {
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, participantIds }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка создания группы');
  return data;
}

export async function pinMessage(chatId, messageId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/pin`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ messageId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка закрепления');
  return data;
}

export async function unpinMessage(chatId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/unpin`, {
    method: 'PUT',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка открепления');
  return data;
}

export async function getMessages(chatId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки сообщений');
  return data;
}

export async function sendMessage(chatId, text) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка отправки');
  return data;
}

export async function markChatRead(chatId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/read`, {
    method: 'PUT',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

export async function getUsers() {
  const res = await fetch(`${API_BASE}/users`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки пользователей');
  return data;
}

// Channels
export async function getChannels() {
  const res = await fetch(`${API_BASE}/channels`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки каналов');
  return data;
}

export async function createChannel(name, description, isPublic = true) {
  const res = await fetch(`${API_BASE}/channels`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, description, isPublic }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка создания канала');
  return data;
}

export async function getChannel(id) {
  const res = await fetch(`${API_BASE}/channels/${id}`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Канал не найден');
  return data;
}

export async function subscribeChannel(id) {
  const res = await fetch(`${API_BASE}/channels/${id}/subscribe`, {
    method: 'POST',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка подписки');
  return data;
}

export async function unsubscribeChannel(id) {
  const res = await fetch(`${API_BASE}/channels/${id}/subscribe`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка отписки');
  return data;
}

export async function getChannelPosts(channelId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/posts`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки постов');
  return data;
}

export async function createPost(channelId, content) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/posts`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка публикации');
  return data;
}

export async function getPost(id) {
  const res = await fetch(`${API_BASE}/posts/${id}`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Пост не найден');
  return data;
}

export async function reactToPost(postId, emoji) {
  const res = await fetch(`${API_BASE}/posts/${postId}/react`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ emoji }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка реакции');
  return data;
}

export async function getPostComments(postId) {
  const res = await fetch(`${API_BASE}/posts/${postId}/comments`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки комментариев');
  return data;
}

export async function addComment(postId, content) {
  const res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ content }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка добавления комментария');
  return data;
}
