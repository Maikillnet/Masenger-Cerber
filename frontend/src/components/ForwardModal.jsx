import { useState } from 'react';
import { X, Search, Send, Forward } from 'lucide-react';
import { sendMessage, createPost } from '../api';

export default function ForwardModal({ isOpen, onClose, chats, channels, currentUser, forwardData }) {
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState(null);

  if (!isOpen || !forwardData) return null;

  // Фильтруем: Личные чаты, Группы и Каналы (только где мы админы/создатели)
  const availableChats = (chats || []).map((c) => ({ ...c, type: 'chat' }));
  const availableChannels = (channels || [])
    .filter((c) => c.creatorId === currentUser?.id || c.isAdmin)
    .map((c) => ({ ...c, type: 'channel' }));

  const allTargets = [...availableChats, ...availableChannels].filter((t) => {
    const name = t.name || t.otherUser?.username || '';
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const getMediaUrl = () => {
    const url = forwardData.mediaUrl || forwardData.mediaUrls?.[0];
    if (!url) return null;
    if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) return url;
    const origin = window.location.origin;
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  const handleForward = async (target) => {
    const mediaUrl = getMediaUrl();
    if (!mediaUrl) {
      alert('Нет медиа для пересылки');
      return;
    }

    setLoadingId(target.id);
    try {
      const response = await fetch(mediaUrl);
      if (!response.ok) throw new Error('Не удалось загрузить файл');
      const blob = await response.blob();
      const ext = blob.type?.split('/')[1] || 'jpg';
      const file = new File([blob], `forward_${Date.now()}.${ext}`, { type: blob.type });

      if (target.type === 'channel') {
        await createPost(target.id, '', [file], forwardData.forwardedFrom);
      } else {
        await sendMessage(target.id, '', [file], null, null, forwardData.forwardedFrom);
      }
      onClose();
    } catch (e) {
      console.error(e);
      alert('Ошибка при пересылке');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#131313]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Forward size={20} /> Переслать
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </header>
        <div className="p-3 border-b border-white/5">
          <div className="flex items-center bg-black/50 border border-white/10 rounded-xl px-3 py-2">
            <Search size={18} className="text-gray-400 mr-2 flex-shrink-0" />
            <input
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none outline-none text-white w-full text-sm placeholder-gray-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {allTargets.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Нет чатов или каналов для пересылки</p>
          ) : (
            allTargets.map((t) => {
              const name = t.name || t.otherUser?.username || 'Без названия';
              const avatar = t.avatar || t.otherUser?.avatar;
              const sub = t.type === 'channel' ? 'Канал' : t.isGroup ? 'Группа' : 'Личный чат';
              return (
                <div
                  key={`${t.type}-${t.id}`}
                  onClick={() => handleForward(t)}
                  className="flex items-center gap-3 p-3 hover:bg-white/5 rounded-xl cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {avatar ? (
                      <img src={avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-medium">{name?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium text-sm truncate">{name}</h4>
                    <p className="text-gray-500 text-xs">{sub}</p>
                  </div>
                  {loadingId === t.id ? (
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  ) : (
                    <Send size={18} className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
