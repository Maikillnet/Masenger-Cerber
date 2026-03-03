/**
 * Удаляет чувствительные поля из объекта пользователя
 */
export function sanitizeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}
