import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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

  const inputClass = "mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all";
  const labelClass = "block mb-2 text-sm text-gray-400";
  const btnPrimary = "w-full py-3 rounded-xl bg-blue-500/30 text-blue-300 font-medium border border-blue-500/50 hover:bg-blue-500/40 transition-all disabled:opacity-50";

  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-gray-100">Личный кабинет</h1>
          <Link to="/chats" className="text-sm text-blue-400 hover:text-blue-300">Чаты</Link>
          <Link to="/channels" className="text-sm text-blue-400 hover:text-blue-300">Каналы</Link>
        </div>
        <button
          className="px-4 py-2 rounded-xl bg-black/40 text-gray-400 border border-white/10 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 transition-all"
          onClick={() => { logout(); navigate('/login'); }}
        >
          Выйти
        </button>
      </header>

      <nav className="flex gap-2 mb-8">
        <button
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'profile' ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' : 'bg-black/40 text-gray-400 border border-white/10 hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('profile')}
        >
          Профиль
        </button>
        <button
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'password' ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' : 'bg-black/40 text-gray-400 border border-white/10 hover:bg-white/5'
          }`}
          onClick={() => setActiveTab('password')}
        >
          Пароль
        </button>
        <button
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'notifications' ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50' : 'bg-black/40 text-gray-400 border border-white/10 hover:bg-white/5'
          }`}
          onClick={() => { setActiveTab('notifications'); loadNotifications(); }}
        >
          Уведомления
        </button>
      </nav>

      <main className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
        {activeTab === 'profile' && (
          <section>
            <h2 className="text-lg font-semibold text-gray-100 mb-6">Редактирование профиля</h2>

            <div className="flex items-center gap-4 mb-6">
              {avatarSrc ? (
                <img src={avatarSrc} alt="Аватар" className="w-20 h-20 rounded-full object-cover border-2 border-white/10" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-500/30 flex items-center justify-center text-2xl text-white font-medium">
                  {user.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={handleAvatarChange} className="hidden" />
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-black/40 text-gray-300 border border-white/10 hover:bg-white/10 transition-all disabled:opacity-50"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarLoading}
              >
                {avatarLoading ? 'Загрузка...' : 'Изменить аватар'}
              </button>
            </div>
            {avatarError && <div className="mb-4 p-3 rounded-xl bg-red-500/20 text-red-400 text-sm border border-red-500/30">{avatarError}</div>}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              {profileError && <div className="p-3 rounded-xl bg-red-500/20 text-red-400 text-sm border border-red-500/30">{profileError}</div>}
              {profileSuccess && <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm border border-emerald-500/30">{profileSuccess}</div>}
              <label className={labelClass}>
                Имя пользователя
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={2} className={inputClass} />
              </label>
              <label className={labelClass}>
                О себе
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Расскажите о себе" className={inputClass} />
              </label>
              <button type="submit" disabled={profileLoading} className={btnPrimary}>{profileLoading ? 'Сохранение...' : 'Сохранить'}</button>
            </form>
          </section>
        )}

        {activeTab === 'password' && (
          <section>
            <h2 className="text-lg font-semibold text-gray-100 mb-6">Смена пароля</h2>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              {passwordError && <div className="p-3 rounded-xl bg-red-500/20 text-red-400 text-sm border border-red-500/30">{passwordError}</div>}
              {passwordSuccess && <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm border border-emerald-500/30">{passwordSuccess}</div>}
              <label className={labelClass}>
                Текущий пароль
                <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required className={inputClass} />
              </label>
              <label className={labelClass}>
                Новый пароль
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} className={inputClass} />
              </label>
              <label className={labelClass}>
                Подтвердите новый пароль
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className={inputClass} />
              </label>
              <button type="submit" disabled={passwordLoading} className={btnPrimary}>{passwordLoading ? 'Сохранение...' : 'Изменить пароль'}</button>
            </form>
          </section>
        )}

        {activeTab === 'notifications' && (
          <section>
            <h2 className="text-lg font-semibold text-gray-100 mb-6">Настройки уведомлений</h2>
            <p className="text-gray-500 mb-4">Управление уведомлениями</p>
            {notifLoading && <p className="text-gray-500 mb-4">Загрузка...</p>}
            {notifSettings && (
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={notifSettings.emailNotifications ?? true} onChange={(e) => handleNotifChange('emailNotifications', e.target.checked)} className="rounded bg-black/40 border-white/10" />
                  <span className="text-gray-200">Email-уведомления</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={notifSettings.pushEnabled ?? false} onChange={(e) => handleNotifChange('pushEnabled', e.target.checked)} className="rounded bg-black/40 border-white/10" />
                  <span className="text-gray-200">Push-уведомления</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={notifSettings.soundEnabled ?? true} onChange={(e) => handleNotifChange('soundEnabled', e.target.checked)} className="rounded bg-black/40 border-white/10" />
                  <span className="text-gray-200">Звук</span>
                </label>
              </div>
            )}
            {notifError && <div className="mt-4 p-3 rounded-xl bg-red-500/20 text-red-400 text-sm border border-red-500/30">{notifError}</div>}
          </section>
        )}
      </main>
    </div>
  );
}
