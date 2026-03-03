import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  updateProfile,
  uploadAvatar,
  changePassword,
  getNotifications,
  updateNotifications,
} from '../api';
import { useAuth } from '../context/AuthContext';

export default function CabinetPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('profile');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');

  useEffect(() => {
    if (user) {
      setUsername(user.username ?? '');
      setBio(user.bio ?? '');
    }
  }, [user?.id, user?.username, user?.bio]);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const [notifSettings, setNotifSettings] = useState(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState('');

  const loadNotifications = () => {
    setNotifLoading(true);
    getNotifications()
      .then((r) => setNotifSettings(r.settings))
      .catch(() => setNotifError('Не удалось загрузить настройки'))
      .finally(() => setNotifLoading(false));
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileLoading(true);
    try {
      const { user: u } = await updateProfile(username, bio);
      updateUser(u);
      setProfileSuccess('Профиль обновлён');
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    if (newPassword !== confirmPassword) {
      setPasswordError('Пароли не совпадают');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Пароль должен быть не менее 6 символов');
      return;
    }
    setPasswordLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess('Пароль изменён');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setAvatarLoading(true);
    try {
      const { user: u } = await uploadAvatar(file);
      updateUser(u);
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleNotifChange = async (key, value) => {
    const next = { ...notifSettings, [key]: value };
    setNotifSettings(next);
    try {
      await updateNotifications(next);
    } catch {
      setNotifError('Ошибка сохранения');
    }
  };

  if (!user) return null;

  const avatarSrc = user.avatar ? user.avatar : null;

  return (
    <div className="cabinet">
      <header className="cabinet-header">
        <h1>Личный кабинет</h1>
        <button className="btn-logout" onClick={() => { logout(); navigate('/login'); }}>
          Выйти
        </button>
      </header>

      <nav className="cabinet-tabs">
        <button className={activeTab === 'profile' ? 'active' : ''} onClick={() => setActiveTab('profile')}>
          Профиль
        </button>
        <button className={activeTab === 'password' ? 'active' : ''} onClick={() => setActiveTab('password')}>
          Пароль
        </button>
        <button className={activeTab === 'notifications' ? 'active' : ''} onClick={() => { setActiveTab('notifications'); loadNotifications(); }}>
          Уведомления
        </button>
      </nav>

      <main className="cabinet-content">
        {activeTab === 'profile' && (
          <section className="cabinet-section">
            <h2>Редактирование профиля</h2>

            <div className="avatar-block">
              <div className="avatar-wrap">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="Аватар" className="avatar-img" />
                ) : (
                  <div className="avatar-placeholder">{user.username?.[0]?.toUpperCase() || '?'}</div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleAvatarChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="btn-avatar"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarLoading}
                >
                  {avatarLoading ? 'Загрузка...' : 'Изменить аватар'}
                </button>
              </div>
              {avatarError && <div className="error-msg">{avatarError}</div>}
            </div>

            <form onSubmit={handleProfileSubmit}>
              {profileError && <div className="error-msg">{profileError}</div>}
              {profileSuccess && <div className="success-msg">{profileSuccess}</div>}
              <label>
                Имя пользователя
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={2}
                />
              </label>
              <label>
                О себе
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  placeholder="Расскажите о себе"
                />
              </label>
              <button type="submit" disabled={profileLoading}>
                {profileLoading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </form>
          </section>
        )}

        {activeTab === 'password' && (
          <section className="cabinet-section">
            <h2>Смена пароля</h2>
            <form onSubmit={handlePasswordSubmit}>
              {passwordError && <div className="error-msg">{passwordError}</div>}
              {passwordSuccess && <div className="success-msg">{passwordSuccess}</div>}
              <label>
                Текущий пароль
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label>
                Новый пароль
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </label>
              <label>
                Подтвердите новый пароль
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={passwordLoading}>
                {passwordLoading ? 'Сохранение...' : 'Изменить пароль'}
              </button>
            </form>
          </section>
        )}

        {activeTab === 'notifications' && (
          <section className="cabinet-section">
            <h2>Настройки уведомлений</h2>
            <p className="muted">Заглушка — настройки будут доступны позже</p>
            {notifLoading && <p>Загрузка...</p>}
            {notifSettings && (
              <div className="notif-settings">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={notifSettings.emailNotifications ?? true}
                    onChange={(e) => handleNotifChange('emailNotifications', e.target.checked)}
                  />
                  Email-уведомления
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={notifSettings.pushEnabled ?? false}
                    onChange={(e) => handleNotifChange('pushEnabled', e.target.checked)}
                  />
                  Push-уведомления
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={notifSettings.soundEnabled ?? true}
                    onChange={(e) => handleNotifChange('soundEnabled', e.target.checked)}
                  />
                  Звук
                </label>
              </div>
            )}
            {notifError && <div className="error-msg">{notifError}</div>}
          </section>
        )}
      </main>
    </div>
  );
}
