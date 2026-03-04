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

export async function pinMessage(chatId, messageId, visibility = 'all') {
  const res = await fetch(`${API_BASE}/chats/${chatId}/pin`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ messageId, visibility }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка закрепления');
  return data;
}

export async function unpinMessage(chatId, messageId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/unpin`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ messageId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка открепления');
  return data;
}

export async function pinPost(channelId, postId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/pin`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ postId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка закрепления');
  return data;
}

export async function unpinPost(channelId, postId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/unpin`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ postId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка открепления');
  return data;
}

export async function getMessages(chatId, cursor = null) {
  const url = cursor
    ? `${API_BASE}/chats/${chatId}/messages?cursor=${cursor}&limit=40`
    : `${API_BASE}/chats/${chatId}/messages?limit=40`;
  const res = await fetch(url, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки сообщений');
  return data;
}

/** Переслать медиа (фото/видео/стикер) в чат или канал. url — путь к файлу, type — image|video|document|sticker, forwardedFrom — оригинальный отправитель */
export async function forwardMedia(targetId, isChannel, { url, type, forwardedFrom }) {
  if (!url) throw new Error('Нет медиа для пересылки');
  if (type === 'sticker' && !isChannel) {
    return sendMessage(targetId, '', [], null, url, forwardedFrom);
  }
  const fullUrl =
    url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')
      ? url
      : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
  const res = await fetch(fullUrl);
  if (!res.ok) throw new Error('Не удалось загрузить файл');
  const blob = await res.blob();
  const ext = type === 'video' ? 'mp4' : type === 'document' ? 'pdf' : 'jpg';
  const file = new File([blob], `forward_${Date.now()}.${ext}`, { type: blob.type });
  if (isChannel) {
    return createPost(targetId, '', [file], forwardedFrom);
  }
  return sendMessage(targetId, '', [file], null, null, forwardedFrom);
}

export async function sendMessage(chatId, text, mediaFiles = [], replyToId = null, stickerUrl = null, forwardedFrom = null) {
  const token = localStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const files = Array.isArray(mediaFiles) ? mediaFiles : mediaFiles ? [mediaFiles] : [];

  let body;
  if (files.length > 0) {
    const formData = new FormData();
    formData.append('text', text || '');
    files.forEach((file) => formData.append('media', file));
    if (replyToId) formData.append('replyToId', replyToId);
    if (forwardedFrom) formData.append('forwardedFrom', forwardedFrom);
    body = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({
      text: text || '',
      replyToId: replyToId || undefined,
      stickerUrl: stickerUrl || undefined,
      forwardedFrom: forwardedFrom || undefined,
    });
  }

  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    headers,
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка отправки');
  return data;
}

export async function addReaction(chatId, messageId, emoji) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}/reactions`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ emoji }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка реакции');
  return data;
}

export async function reactToMessage(chatId, messageId, emoji) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}/react`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ emoji }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка добавления реакции');
  return data;
}

export async function removeMessageReaction(chatId, messageId, emoji) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}/react`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ emoji }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка удаления реакции');
  return data;
}

export async function editMessage(chatId, messageId, text) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ text: text.trim() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка редактирования');
  return data;
}

export async function deleteMessage(chatId, messageId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка удаления');
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

// Группы — настройки (name, description, hideMembers — один запрос)
export async function updateGroupSettings(chatId, payload) {
  const body = {};
  const name = payload.name;
  if (name !== undefined && name !== null) {
    const t = String(name).trim();
    if (t) body.name = t;
  }
  if (payload.description !== undefined) body.description = payload.description == null ? null : String(payload.description ?? '').trim() || null;
  if (payload.hideMembers !== undefined) body.hideMembers = Boolean(payload.hideMembers);
  if (Object.keys(body).length === 0) return {};
  const res = await fetch(`${API_BASE}/chats/${chatId}/name`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка обновления');
  return data;
}

export async function uploadGroupAvatar(chatId, file) {
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await fetch(`${API_BASE}/chats/${chatId}/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data;
}

export async function removeGroupMember(chatId, userId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/members/${userId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка исключения');
  return data;
}

export async function addGroupMembers(chatId, userIds) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/members`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ userIds }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка добавления');
  return data;
}

export async function leaveGroup(chatId, payload = {}) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/leave`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Ошибка выхода');
    err.status = res.status;
    err.requireTransfer = data.requireTransfer;
    throw err;
  }
  return data;
}

export async function deleteGroup(chatId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка удаления');
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

export async function joinChannel(channelId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/join`, {
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

// Каналы — настройки (name, description, hideMembers — один запрос)
export async function updateChannel(channelId, payload) {
  const body = {};
  const name = payload?.name;
  if (name !== undefined && name !== null) {
    const t = String(name).trim();
    if (t) body.name = t;
  }
  if (payload?.description !== undefined) body.description = payload.description == null ? null : String(payload.description ?? '').trim() || null;
  if (payload?.hideMembers !== undefined) body.hideMembers = Boolean(payload.hideMembers);
  if (Object.keys(body).length === 0) return {};
  const res = await fetch(`${API_BASE}/channels/${channelId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(res.status === 400 ? 'Неверный запрос' : 'Ошибка обновления');
  }
  if (!res.ok) throw new Error(data?.error || 'Ошибка обновления');
  return data;
}

export async function uploadChannelAvatar(channelId, file) {
  const formData = new FormData();
  formData.append('avatar', file);
  const res = await fetch(`${API_BASE}/channels/${channelId}/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');
  return data;
}

export async function removeChannelMember(channelId, userId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/members/${userId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка исключения');
  return data;
}

export async function leaveChannel(channelId, payload = {}) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/leave`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Ошибка отписки');
    err.status = res.status;
    err.requireTransfer = data.requireTransfer;
    throw err;
  }
  return data;
}

export async function deleteChannel(channelId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка удаления');
  return data;
}

export async function getChannelPosts(channelId) {
  const res = await fetch(`${API_BASE}/channels/${channelId}/posts`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки постов');
  return data;
}

export async function createPost(channelId, content, mediaFiles = [], forwardedFrom = null) {
  const token = localStorage.getItem('token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const files = Array.isArray(mediaFiles) ? mediaFiles : mediaFiles ? [mediaFiles] : [];

  let body;
  if (files.length > 0) {
    const formData = new FormData();
    formData.append('content', content || '');
    files.forEach((file) => formData.append('media', file));
    if (forwardedFrom) formData.append('forwardedFrom', forwardedFrom);
    body = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ content: content || '', forwardedFrom: forwardedFrom || undefined });
  }

  const res = await fetch(`${API_BASE}/channels/${channelId}/posts`, {
    method: 'POST',
    headers,
    body,
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

export async function markPostAsViewed(postId) {
  const res = await fetch(`${API_BASE}/posts/${postId}/view`, {
    method: 'POST',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка фиксации просмотра');
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

// Stories
export async function getStoryFeed() {
  const res = await fetch(`${API_BASE}/stories/feed`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки ленты историй');
  return data;
}

export async function uploadStory(file, textOverlay, mediaSettings) {
  const formData = new FormData();
  formData.append('media', file);
  if (textOverlay) {
    if (textOverlay.caption != null) formData.append('caption', textOverlay.caption);
    if (textOverlay.settings != null) formData.append('textSettings', JSON.stringify(textOverlay.settings));
  }
  if (mediaSettings) {
    formData.append('mediaSettings', JSON.stringify(mediaSettings));
  }
  const res = await fetch(`${API_BASE}/stories`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки истории');
  return data;
}

export async function getMyStoriesArchive() {
  const res = await fetch(`${API_BASE}/stories/archive`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки архива историй');
  return data;
}

export async function markStoryAsViewed(storyId) {
  const res = await fetch(`${API_BASE}/stories/${storyId}/view`, {
    method: 'POST',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка фиксации просмотра');
  return data;
}

export async function markMessageAsViewed(chatId, messageId) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/${messageId}/view`, {
    method: 'POST',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка фиксации просмотра');
  return data;
}

export async function getStickers() {
  const res = await fetch(`${API_BASE}/stickers`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки стикеров');
  return data;
}

export async function createStickerPack(name, coverFile, stickerFiles) {
  const formData = new FormData();
  formData.append('name', name);
  if (coverFile) formData.append('cover', coverFile);
  stickerFiles.forEach(file => formData.append('stickers', file));

  const res = await fetch(`${API_BASE}/stickers/packs`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка создания стикерпака');
  return data;
}

export async function getMyStickerPacks() {
  const res = await fetch(`${API_BASE}/stickers/my-packs`, { headers: getHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка загрузки стикерпаков');
  return data;
}

export async function deleteStickerPack(id) {
  const res = await fetch(`${API_BASE}/stickers/packs/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка удаления стикерпака');
  return data;
}

export async function deleteStory(id) {
  const res = await fetch(`${API_BASE}/stories/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка удаления истории');
  return data;
}
