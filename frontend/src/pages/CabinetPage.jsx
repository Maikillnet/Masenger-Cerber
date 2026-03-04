import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Camera, User, Lock, Bell, LogOut, History, Trash2, Image, Plus } from 'lucide-react';
import {
  updateProfile,
  uploadAvatar,
  changePassword,
  getNotifications,
  updateNotifications,
  getMyStoriesArchive,
  deleteStory,
  getMyStickerPacks,
  createStickerPack,
  deleteStickerPack,
} from '../api';
import { useAuth } from '../context/AuthContext';

const cardClass = 'bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-2xl';
const inputClass =
  'w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all';

function HorizontalScrollArea({ className = '', children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    const handler = (e) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);
  return (
    <div ref={ref} className={`flex gap-4 overflow-x-auto no-scrollbar pb-4 ${className}`}>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-blue-500' : 'bg-white/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function ProfileCard({ user, onUpdate }) {
  const fileInputRef = useRef(null);
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  useEffect(() => {
    if (user) {
      setUsername(user.username ?? '');
      setBio(user.bio ?? '');
    }
  }, [user?.id, user?.username, user?.bio]);

  const profileChanged = username !== (user?.username ?? '') || bio !== (user?.bio ?? '');

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');
    setProfileLoading(true);
    try {
      const { user: u } = await updateProfile(username, bio);
      onUpdate(u);
      setProfileSuccess('Профиль обновлён');
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setAvatarLoading(true);
    try {
      const { user: u } = await uploadAvatar(file);
      onUpdate(u);
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarLoading(false);
      e.target.value = '';
    }
  };

  const avatarSrc = user?.avatar ?? null;

  return (
    <section className={`${cardClass} flex flex-col items-center sm:flex-row sm:items-start gap-6`}>
      <div className="flex-shrink-0">
        <div
          className="relative w-28 h-28 rounded-full overflow-hidden bg-white/10 flex items-center justify-center cursor-pointer group"
          onClick={() => !avatarLoading && fileInputRef.current?.click()}
        >
          {avatarSrc ? (
            <img src={avatarSrc} alt="Аватар" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl font-bold text-gray-400">
              {user?.username?.[0]?.toUpperCase() || '?'}
            </span>
          )}
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Camera size={32} className="text-white" />
          </div>
          {avatarLoading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-sm text-white">Загрузка...</span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleAvatarChange}
          className="hidden"
        />
      </div>

      <div className="flex-1 w-full min-w-0 space-y-4">
        {avatarError && (
          <div className="p-3 rounded-xl bg-red-500/20 text-red-400 text-sm border border-red-500/30">
            {avatarError}
          </div>
        )}
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          {profileError && (
            <div className="p-3 rounded-xl bg-red-500/20 text-red-400 text-sm border border-red-500/30">
              {profileError}
            </div>
          )}
          {profileSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm border border-emerald-500/30">
              {profileSuccess}
            </div>
          )}
          <label className="block">
            <span className="text-sm text-gray-400 mb-1.5 flex items-center gap-2">
              <User size={16} />
              Имя пользователя
            </span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={2}
              placeholder="Ваш никнейм"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm text-gray-400 mb-1.5 block">О себе</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Расскажите о себе"
              className={`${inputClass} resize-none`}
            />
          </label>
          {profileChanged && (
            <button
              type="submit"
              disabled={profileLoading}
              className="w-full py-2.5 rounded-xl bg-blue-500/30 text-blue-300 font-medium border border-blue-500/50 hover:bg-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {profileLoading ? 'Сохранение...' : 'Сохранить профиль'}
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

function SecurityCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState({ type: null, text: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: null, text: '' });
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Пароль должен быть не менее 6 символов' });
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setMessage({ type: 'success', text: 'Пароль успешно обновлён' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold text-gray-100 mb-6 flex items-center gap-2">
        <Lock size={20} />
        Безопасность
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {message.text && (
          <div
            className={`p-3 rounded-xl text-sm border ${
              message.type === 'success'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-red-500/20 text-red-400 border-red-500/30'
            }`}
          >
            {message.text}
          </div>
        )}
        <label className="block">
          <span className="text-sm text-gray-400 mb-1.5 block">Текущий пароль</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            placeholder="Введите текущий пароль"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-400 mb-1.5 block">Новый пароль</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Минимум 6 символов"
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-blue-500/30 text-blue-300 font-medium border border-blue-500/50 hover:bg-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Сохранение...' : 'Обновить пароль'}
        </button>
      </form>
    </section>
  );
}

function NotificationsCard() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getNotifications()
      .then((r) => setSettings(r.settings ?? {}))
      .catch(() => setError('Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = async (key, value) => {
    const next = { ...(settings ?? {}), [key]: value };
    setSettings(next);
    setError('');
    try {
      await updateNotifications(next);
    } catch {
      setError('Ошибка сохранения');
    }
  };

  const items = [
    { key: 'emailNotifications', label: 'Email уведомления', default: true },
    { key: 'pushEnabled', label: 'Push-уведомления', default: false },
    { key: 'soundEnabled', label: 'Звук в приложении', default: true },
  ];

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold text-gray-100 mb-6 flex items-center gap-2">
        <Bell size={20} />
        Уведомления
      </h2>
      {loading ? (
        <p className="text-gray-500">Загрузка...</p>
      ) : error ? (
        <div className="p-3 rounded-xl bg-red-500/20 text-red-400 text-sm border border-red-500/30">
          {error}
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(({ key, label, default: def }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 py-3 border-b border-white/5 last:border-0"
            >
              <span className="text-gray-200">{label}</span>
              <Toggle
                checked={settings?.[key] ?? def}
                onChange={(v) => handleChange(key, v)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StickerPackModal({ open, onClose, onCreate, creating }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const coverInputRef = useRef(null);
  const stickersInputRef = useRef(null);

  const resetForm = () => {
    setStep(1);
    setName('');
    setCoverFile(null);
    setCoverPreview(null);
    setFiles([]);
    setError('');
    if (coverInputRef.current) coverInputRef.current.value = '';
    if (stickersInputRef.current) stickersInputRef.current.value = '';
  };

  useEffect(() => {
    if (open) resetForm();
  }, [open]);

  const handleCoverChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    const reader = new FileReader();
    reader.onload = () => setCoverPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || files.length === 0) {
      setError('Введите название и выберите хотя бы один стикер (PNG, WEBP, GIF)');
      return;
    }
    try {
      await onCreate(name.trim(), coverFile || null, files);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !creating && onClose()}>
      <div className="bg-gray-900/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-white/10">
          <h3 className="text-lg font-semibold text-gray-100">Создание стикерпака</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {step === 1 && (
            <>
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Шаг 1: Обложка и Название</h4>
                <div className="flex items-center gap-4">
                  <div
                    className="w-[100px] h-[100px] flex-shrink-0 rounded-xl overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center cursor-pointer hover:bg-white/15 transition-colors"
                    onClick={() => coverInputRef.current?.click()}
                  >
                    {coverPreview ? (
                      <img src={coverPreview} alt="Обложка" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-gray-500 text-xs text-center px-2">100×100</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept=".png,.webp,.gif,image/png,image/webp,image/gif"
                      onChange={handleCoverChange}
                      className="hidden"
                    />
                    <p className="text-xs text-gray-500 mb-2">Обложка пака (опционально)</p>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Название пака"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5">
                  Назад
                </button>
                <button
                  type="button"
                  onClick={() => name.trim() && setStep(2)}
                  disabled={!name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-blue-500/30 text-blue-300 font-medium border border-blue-500/50 disabled:opacity-50"
                >
                  Далее
                </button>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-3">Шаг 2: Стикеры</h4>
                <input
                  ref={stickersInputRef}
                  type="file"
                  accept=".png,.webp,.gif,image/png,image/webp,image/gif"
                  multiple
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => stickersInputRef.current?.click()}
                  className="w-full py-4 rounded-xl border border-dashed border-white/20 text-gray-400 hover:border-blue-500/50 hover:text-blue-400 hover:bg-white/5 transition-all"
                >
                  Выбрать файлы ({files.length}) — PNG, WEBP, GIF
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5">
                  Назад
                </button>
                <button
                  type="submit"
                  disabled={creating || files.length === 0}
                  className="flex-1 py-2.5 rounded-xl bg-blue-500/30 text-blue-300 font-medium border border-blue-500/50 disabled:opacity-50"
                >
                  {creating ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </form>
      </div>
    </div>
  );
}

function AccountCard({ onLogout }) {
  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold text-gray-100 mb-6">Аккаунт</h2>
      <button
        onClick={onLogout}
        className="w-full py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all font-medium flex items-center justify-center gap-2"
      >
        <LogOut size={20} />
        Выйти из аккаунта
      </button>
    </section>
  );
}

function StickerPacksCard() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadPacks = () => {
    setLoading(true);
    getMyStickerPacks()
      .then((data) => setPacks(Array.isArray(data) ? data : []))
      .catch(() => setPacks([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPacks();
  }, []);

  const handleCreate = async (name, coverFile, files) => {
    setCreating(true);
    try {
      await createStickerPack(name, coverFile, files);
      loadPacks();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Удалить этот стикерпак?')) return;
    try {
      await deleteStickerPack(id);
      loadPacks();
    } catch (err) {
      alert(err.message);
    }
  };

  const count = packs.length;
  const maxPacks = 10;
  const stickerCount = (pack) => pack.stickers?.length ?? 0;

  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
          <Image size={20} />
          Мои Стикерпаки
        </h2>
        <span className="text-sm text-gray-500">Использовано {count}/{maxPacks} паков</span>
      </div>

      <button
        type="button"
        onClick={() => setShowModal(true)}
        disabled={count >= maxPacks}
        className="w-full py-3 rounded-xl border border-dashed border-white/20 text-gray-400 hover:border-blue-500/50 hover:text-blue-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
      >
        <Plus size={20} />
        Создать пак
      </button>

      <StickerPackModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreate={handleCreate}
        creating={creating}
      />

      {loading ? (
        <p className="text-gray-500 text-sm py-4">Загрузка...</p>
      ) : packs.length === 0 ? (
        <p className="text-gray-500 text-sm py-4">Пока нет стикерпаков</p>
      ) : (
        <HorizontalScrollArea>
          {packs.map((pack) => (
            <div
              key={pack.id}
              className="relative flex-shrink-0 w-36 sm:w-40 rounded-2xl overflow-hidden bg-white/10 backdrop-blur-xl border border-white/20 group"
            >
              <div className="aspect-square flex items-center justify-center p-3">
                <img
                  src={pack.coverUrl || pack.iconUrl || pack.stickers?.[0]?.url}
                  alt={pack.name}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6">
                <p className="text-sm font-medium text-gray-100 truncate">{pack.name}</p>
                <p className="text-xs text-gray-300">
                  {(() => {
                    const n = stickerCount(pack);
                    const w = n % 10 === 1 && n % 100 !== 11 ? 'стикер' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'стикера' : 'стикеров';
                    return `${n} ${w}`;
                  })()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(pack.id)}
                className="absolute top-2 right-2 p-1.5 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                title="Удалить"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </HorizontalScrollArea>
      )}
    </section>
  );
}

export default function CabinetPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [myStories, setMyStories] = useState([]);

  useEffect(() => {
    getMyStoriesArchive().then(setMyStories).catch(console.error);
  }, []);

  const handleDeleteStory = async (id, e) => {
    e?.stopPropagation?.();
    if (!confirm('Удалить историю навсегда?')) return;
    try {
      await deleteStory(id);
      setMyStories((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err.message || 'Ошибка удаления');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen w-full bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 w-full max-w-3xl mx-auto custom-scrollbar space-y-12">
        <header className="flex items-center gap-4">
          <Link
            to="/chats"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all"
            aria-label="Назад"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-semibold text-gray-100 flex-1">Настройки</h1>
          <div
            className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/10 flex items-center justify-center flex-shrink-0"
            aria-label="Аватар"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-medium text-gray-300">{user?.username?.[0]?.toUpperCase() || '?'}</span>
            )}
          </div>
        </header>

        <ProfileCard user={user} onUpdate={updateUser} />

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
            <History size={20} />
            Архив историй
          </h2>
          <HorizontalScrollArea>
            {myStories.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">Пока нет историй</p>
            ) : (
              myStories.map((story) => {
                const isActive = new Date(story.expiresAt) > new Date();
                return (
                  <div
                    key={story.id}
                    className="relative w-[120px] aspect-[9/16] flex-shrink-0 rounded-2xl overflow-hidden cursor-pointer group bg-white/10 backdrop-blur-xl border border-white/20"
                  >
                    {story.mediaType === 'video' ? (
                      <video
                        src={story.mediaUrl}
                        preload="metadata"
                        muted
                        playsInline
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <img
                        src={story.mediaUrl}
                        alt=""
                        className="object-cover w-full h-full"
                      />
                    )}
                    <span
                      className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs font-medium ${
                        isActive
                          ? 'bg-emerald-500/80 text-white'
                          : 'bg-gray-500/80 text-gray-200'
                      }`}
                    >
                      {isActive ? 'Активна' : 'Архив'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteStory(story.id, e)}
                      className="absolute bottom-2 right-2 p-2 rounded-full bg-red-500/80 text-white opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-all"
                      title="Удалить"
                      aria-label="Удалить историю"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            )}
          </HorizontalScrollArea>
        </section>

        <StickerPacksCard />

        <SecurityCard />
        <NotificationsCard />
        <AccountCard onLogout={handleLogout} />
      </div>
    </div>
  );
}
