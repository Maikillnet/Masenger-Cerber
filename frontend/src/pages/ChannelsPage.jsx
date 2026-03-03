import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getChannels,
  createChannel,
  subscribeChannel,
  unsubscribeChannel,
} from '../api';

export default function ChannelsPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadChannels = () => {
    getChannels().then(setChannels).catch(console.error);
  };

  useEffect(() => {
    loadChannels();
  }, []);

  const handleCreate = () => {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    createChannel(name.trim(), description.trim())
      .then(() => {
        loadChannels();
        setShowCreate(false);
        setName('');
        setDescription('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setCreating(false));
  };

  const handleSubscribe = async (e, channel) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (channel.isMember) {
        await unsubscribeChannel(channel.id);
      } else {
        await subscribeChannel(channel.id);
      }
      loadChannels();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[30%] min-w-[260px] max-w-[400px] flex flex-col bg-white/5 backdrop-blur-md border-r border-white/10 shadow-2xl">
        <header className="flex-shrink-0 p-4 border-b border-white/10">
          <h1 className="text-xl font-semibold text-gray-100 mb-4">Каналы</h1>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 hover:scale-105 transition-all duration-300 border border-blue-500/30"
              onClick={() => setShowCreate(true)}
              title="Создать канал"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
            <Link to="/chats" className="px-4 py-2 rounded-xl bg-black/40 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-gray-100 transition-all text-sm">
              Чаты
            </Link>
            <Link to="/cabinet" className="px-4 py-2 rounded-xl bg-black/40 text-gray-300 border border-white/10 hover:bg-white/10 hover:text-gray-100 transition-all text-sm">
              Профиль
            </Link>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {channels.map((ch) => (
            <Link
              key={ch.id}
              to={`/channels/${ch.id}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {ch.avatar ? <img src={ch.avatar} alt="" className="w-full h-full object-cover" /> : ch.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-100 block truncate">{ch.name}</span>
                <span className="text-sm text-gray-500 truncate block">
                  {ch._count?.members ?? 0} подписчиков
                </span>
              </div>
              {ch.creatorId === user?.id ? (
                <span className="flex-shrink-0 px-2 py-0.5 rounded-lg bg-blue-500/30 text-blue-300 text-xs font-medium">
                  Админ
                </span>
              ) : (
                <button
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    ch.isMember
                      ? 'bg-white/10 text-gray-300 border border-white/10'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                  }`}
                  onClick={(e) => handleSubscribe(e, ch)}
                >
                  {ch.isMember ? 'Отписаться' : 'Подписаться'}
                </button>
              )}
            </Link>
          ))}
        </div>
      </aside>

      <main className="flex-1 flex items-center justify-center bg-white/5 backdrop-blur-md border-l border-white/10">
        <p className="text-gray-500">Выберите канал слева или создайте новый</p>
      </main>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Создать канал</h2>
            {error && <div className="mb-4 p-3 rounded-xl bg-red-500/20 text-red-400 text-sm border border-red-500/30">{error}</div>}
            <label className="block mb-2 text-sm text-gray-400">
              Название
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название канала"
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </label>
            <label className="block mb-4 text-sm text-gray-400">
              Описание
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание (необязательно)"
                rows={3}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all resize-none"
              />
            </label>
            <button
              className="w-full py-3 rounded-xl bg-blue-500/30 text-blue-300 font-medium border border-blue-500/50 hover:bg-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-2"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
            <button
              className="w-full py-2 rounded-xl bg-black/40 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-200 transition-all"
              onClick={() => setShowCreate(false)}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
