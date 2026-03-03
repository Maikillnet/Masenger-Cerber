import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
    <div className="channels-page">
      <aside className="channels-sidebar">
        <header className="channels-sidebar-header">
          <h1>Каналы</h1>
          <div className="channels-sidebar-actions">
            <button className="btn-new" onClick={() => setShowCreate(true)}>
              + Создать
            </button>
            <Link to="/chats" className="btn-link">Чаты</Link>
            <Link to="/cabinet" className="btn-link">Профиль</Link>
          </div>
        </header>
        <div className="channels-list">
          {channels.map((ch) => (
            <Link key={ch.id} to={`/channels/${ch.id}`} className="channel-item">
              <div className="channel-avatar">
                {ch.avatar ? <img src={ch.avatar} alt="" /> : ch.name[0]?.toUpperCase()}
              </div>
              <div className="channel-info">
                <span className="channel-name">{ch.name}</span>
                <span className="channel-meta">
                  {ch._count?.members ?? 0} подписчиков
                </span>
              </div>
              {ch.creatorId === user?.id ? (
                <span className="channel-badge">Админ</span>
              ) : (
                <button
                  className={`btn-subscribe ${ch.isMember ? 'subscribed' : ''}`}
                  onClick={(e) => handleSubscribe(e, ch)}
                >
                  {ch.isMember ? 'Отписаться' : 'Подписаться'}
                </button>
              )}
            </Link>
          ))}
        </div>
      </aside>

      <main className="channels-main">
        <div className="channels-welcome">
          <p>Выберите канал слева или создайте новый</p>
        </div>
      </main>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Создать канал</h2>
            {error && <div className="error-msg">{error}</div>}
            <label className="modal-label">
              Название
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название канала"
              />
            </label>
            <label className="modal-label">
              Описание
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание (необязательно)"
                rows={3}
              />
            </label>
            <button
              className="btn-create-group"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
            <button className="btn-close" onClick={() => setShowCreate(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
