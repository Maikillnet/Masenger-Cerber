import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Send, Paperclip, Menu, Check, CheckCheck } from 'lucide-react';
import {
  getChats,
  getChat,
  createChat,
  createGroupChat,
  getMessages,
  sendMessage,
  markChatRead,
  getUsers,
  pinMessage,
  unpinMessage,
} from '../api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

function formatTime(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString('ru', { weekday: 'short' });
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

function ChatList({ chats, selectedId, onSelect, userStatus, searchQuery }) {
  const filtered = searchQuery.trim()
    ? chats.filter((chat) => {
        const name = chat.otherUser?.username || chat.name || '';
        const preview = chat.lastMessage?.text || '';
        const q = searchQuery.toLowerCase();
        return name.toLowerCase().includes(q) || preview.toLowerCase().includes(q);
      })
    : chats;

  const sorted = [...filtered].sort((a, b) => {
    const timeA = a.lastMessage?.createdAt || a.updatedAt || 0;
    const timeB = b.lastMessage?.createdAt || b.updatedAt || 0;
    return new Date(timeB) - new Date(timeA);
  });

  return (
    <div className="flex-1 overflow-y-auto">
      {sorted.length === 0 ? (
        <p className="p-8 text-center text-gray-500">
          {searchQuery.trim() ? 'Ничего не найдено' : 'Нет чатов. Начните новый диалог.'}
        </p>
      ) : (
        sorted.map((chat) => {
          const other = chat.otherUser;
          const name = other?.username || chat.name || 'Чат';
          const avatar = other?.avatar;
          const status = userStatus[other?.id] ?? other?.status ?? 'offline';
          return (
            <button
              key={chat.id}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 border-b border-white/5 hover:bg-white/5 ${
                selectedId === chat.id ? 'bg-white/10' : ''
              }`}
              onClick={() => onSelect(chat)}
            >
              <div className="relative flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden">
                {avatar ? (
                  <img src={avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-medium">{name[0]?.toUpperCase() || '?'}</span>
                )}
                {status === 'online' && (
                  <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center gap-2">
                  <span className="font-medium text-gray-100 truncate">{name}</span>
                  {chat.lastMessage && (
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatTime(chat.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 truncate mt-0.5">
                  {chat.lastMessage?.text
                    ? chat.lastMessage.text.slice(0, 40) + (chat.lastMessage.text.length > 40 ? '…' : '')
                    : 'Нет сообщений'}
                </div>
              </div>
              {chat.unreadCount > 0 && (
                <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-blue-500/50 text-white text-xs font-medium flex items-center justify-center">
                  {chat.unreadCount}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

function ChatWindow({ chat, messages, onSend, loading, pinnedMessage, onPin, onUnpin, userStatus }) {
  const [text, setText] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null); // { url, type: 'image'|'video' }
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({});
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [menuMsg, setMenuMsg] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (chat) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.id]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [text]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim() && !mediaFile) return;
    onSend(text.trim(), mediaFile);
    setText('');
    clearMedia();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() || mediaFile) {
        onSend(text.trim(), mediaFile);
        setText('');
        clearMedia();
      }
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    if (!allowed.includes(file.type)) {
      alert('Разрешены: jpg, png, webp, gif, mp4');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('Максимум 20 МБ');
      return;
    }
    setMediaFile(file);
    setMediaPreview({ url: URL.createObjectURL(file), type: file.type.startsWith('video') ? 'video' : 'image' });
  };

  const clearMedia = () => {
    if (mediaPreview?.url) URL.revokeObjectURL(mediaPreview.url);
    setMediaFile(null);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const scrollToMessage = (msgId) => {
    const el = messageRefs.current[msgId] || document.getElementById(`msg-${msgId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleMessageContextMenu = (e, msg) => {
    e.preventDefault();
    setMenuMsg({ msg, x: e.clientX, y: e.clientY });
  };

  if (!chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white/5 backdrop-blur-md border-l border-white/10">
        <p className="text-gray-500">Выберите чат или начните новый диалог</p>
      </div>
    );
  }

  const name = chat.otherUser?.username || chat.name || 'Чат';
  const avatar = chat.otherUser?.avatar;
  const status = chat.isGroup
    ? `${chat.participantCount ?? 0} участников`
    : (userStatus[chat.otherUser?.id] === 'online' ? 'в сети' : 'не в сети');

  return (
    <div className="flex-1 flex flex-col bg-white/5 backdrop-blur-md border-l border-white/10 shadow-2xl min-w-0">
      <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
          {avatar ? (
            <img src={avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-medium">{name[0]?.toUpperCase() || '?'}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-100 truncate">{name}</div>
          <div className="text-sm text-gray-500 truncate">{status}</div>
        </div>
      </header>

      {pinnedMessage && (
        <button
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2 mx-4 mt-2 border border-white/10 rounded-xl bg-white/10 backdrop-blur-sm hover:bg-white/15 transition-all text-left"
          onClick={() => scrollToMessage(pinnedMessage.id)}
        >
          <span className="text-xs">📌</span>
          <div className="flex-1 min-w-0">
            <span className="text-xs text-blue-400 font-medium">{pinnedMessage.sender?.username}</span>
            <span className="text-sm text-gray-300 truncate block">{pinnedMessage.text}</span>
          </div>
        </button>
      )}

      <div className="flex-1 overflow-y-auto p-4 pb-8 md:pb-10 space-y-3 flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">Загрузка...</div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.senderId === user?.id;
            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                ref={(el) => { messageRefs.current[msg.id] = el; }}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                onContextMenu={(e) => handleMessageContextMenu(e, msg)}
              >
                <div
                  className={`max-w-[75%] rounded-2xl overflow-hidden shadow-lg p-4 ${
                    isOwn
                      ? 'bg-blue-600/80 backdrop-blur-sm rounded-tr-sm text-white'
                      : 'bg-white/10 backdrop-blur-sm border border-white/5 rounded-tl-sm'
                  }`}
                >
                  {msg.mediaUrl && msg.mediaType === 'image' && (
                    <img src={msg.mediaUrl} alt="" className="rounded-lg max-h-64 object-cover mb-2" />
                  )}
                  {msg.mediaUrl && msg.mediaType === 'video' && (
                    <video src={msg.mediaUrl} controls className="rounded-lg max-h-64 mb-2" />
                  )}
                  {msg.text && <div className="whitespace-pre-wrap break-words">{msg.text}</div>}
                  <div className={`flex justify-end items-center gap-1 mt-1 text-xs ${isOwn ? 'text-blue-200' : 'text-gray-500'}`}>
                    <span>
                      {new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isOwn && (
                      msg.isRead ? (
                        <CheckCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      ) : (
                        <Check className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {menuMsg && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenuMsg(null)}
        >
          <div
            className="absolute bg-white/10 backdrop-blur-md border border-white/10 rounded-xl px-2 py-1 shadow-2xl min-w-[140px]"
            onClick={(e) => e.stopPropagation()}
            style={{ left: menuMsg.x, top: menuMsg.y }}
          >
            {pinnedMessage?.id === menuMsg.msg?.id ? (
              <button
                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => { onUnpin(); setMenuMsg(null); }}
              >
                Открепить
              </button>
            ) : (
              <button
                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
                onClick={() => { onPin(menuMsg.msg?.id); setMenuMsg(null); }}
              >
                Закрепить
              </button>
            )}
          </div>
        </div>
      )}

      <form className="flex-shrink-0 p-4 pb-6 md:pb-8" onSubmit={handleSubmit}>
        {mediaPreview && (
          <div className="relative inline-block mb-3 ml-2">
            {mediaPreview.type === 'video' ? (
              <video src={mediaPreview.url} controls className="max-h-20 rounded-xl shadow-lg" />
            ) : (
              <img src={mediaPreview.url} alt="" className="max-h-20 rounded-xl object-cover shadow-lg" />
            )}
            <button
              type="button"
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center text-sm hover:bg-black/70 transition-colors"
              onClick={clearMedia}
              aria-label="Убрать"
            >
              ×
            </button>
          </div>
        )}
        <div className="flex items-end gap-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl w-full max-w-4xl mx-auto">
          <button
            type="button"
            className="shrink-0 p-3 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer flex items-center justify-center"
            onClick={() => fileInputRef.current?.click()}
            title="Прикрепить файл"
          >
            <Paperclip size={20} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
            onChange={handleFileChange}
            className="hidden"
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение..."
            maxLength={2000}
            rows={1}
            className="flex-1 bg-transparent border-none focus:outline-none text-gray-100 placeholder-gray-500 max-h-32 overflow-y-auto resize-none py-2 px-3"
          />
          <button
            type="submit"
            className="shrink-0 p-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 transition-all duration-200 flex items-center justify-center scale-95 hover:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-95"
            disabled={!text.trim() && !mediaFile}
            title="Отправить"
          >
            <Send size={20} />
          </button>
        </div>
      </form>
    </div>
  );
}

export default function ChatsPage() {
  const { user } = useAuth();
  const socket = useSocket();
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [userStatus, setUserStatus] = useState({});
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatMode, setNewChatMode] = useState('personal'); // 'personal' | 'group'
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [burgerOpen, setBurgerOpen] = useState(false);
  const burgerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (burgerRef.current && !burgerRef.current.contains(e.target)) {
        setBurgerOpen(false);
      }
    };
    if (burgerOpen) document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [burgerOpen]);

  const loadChats = () => {
    getChats().then((data) => {
      setChats(data);
      setUserStatus((prev) => {
        const next = { ...prev };
        data.forEach((c) => {
          if (c.otherUser?.id) next[c.otherUser.id] = c.otherUser.status ?? prev[c.otherUser.id];
        });
        return next;
      });
    }).catch(console.error);
  };

  useEffect(() => {
    loadChats();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('receive_message', (message) => {
      const isCurrentChat = selectedChat?.id === message.chatId;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== message.chatId) return c;
          return {
            ...c,
            lastMessage: {
              id: message.id,
              text: message.text,
              createdAt: message.createdAt,
              sender: message.sender,
            },
            unreadCount: isCurrentChat ? 0 : (c.unreadCount || 0) + 1,
            updatedAt: message.createdAt,
          };
        })
      );
      if (isCurrentChat) socket.emit('mark_as_read', { chatId: message.chatId });
    });
    socket.on('user_status', ({ userId, status }) => {
      setUserStatus((s) => ({ ...s, [userId]: status }));
    });
    socket.on('message_pinned', ({ chatId, message, pinned }) => {
      setChats((prev) =>
        prev.map((c) =>
          c.id === chatId ? { ...c, pinnedMessage: pinned ? message : null } : c
        )
      );
      setSelectedChat((c) =>
        c?.id === chatId ? { ...c, pinnedMessage: pinned ? message : null } : c
      );
    });
    socket.on('messages_read', ({ chatId }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.chatId === chatId ? { ...m, isRead: true } : m
        )
      );
    });
    return () => {
      socket.off('receive_message');
      socket.off('user_status');
      socket.off('message_pinned');
      socket.off('messages_read');
    };
  }, [socket, selectedChat?.id]);

  const selectChat = (chat) => {
    setSelectedChat(chat);
    setMessagesLoading(true);
    Promise.all([getChat(chat.id), getMessages(chat.id)])
      .then(([fullChat, msgs]) => {
        setSelectedChat((c) => (c?.id === chat.id ? { ...chat, ...fullChat } : c));
        setMessages(msgs);
        markChatRead(chat.id);
        if (socket) socket.emit('mark_as_read', { chatId: chat.id });
      })
      .catch(console.error)
      .finally(() => setMessagesLoading(false));

    setChats((prev) =>
      prev.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const handlePin = (messageId) => {
    if (!selectedChat) return;
    pinMessage(selectedChat.id, messageId)
      .then(({ pinnedMessage: pm }) => {
        setSelectedChat((c) => (c ? { ...c, pinnedMessage: pm } : c));
        setChats((prev) =>
          prev.map((c) => (c.id === selectedChat.id ? { ...c, pinnedMessage: pm } : c))
        );
      })
      .catch(console.error);
  };

  const handleUnpin = () => {
    if (!selectedChat) return;
    unpinMessage(selectedChat.id)
      .then(() => {
        setSelectedChat((c) => (c ? { ...c, pinnedMessage: null } : c));
        setChats((prev) =>
          prev.map((c) => (c.id === selectedChat.id ? { ...c, pinnedMessage: null } : c))
        );
      })
      .catch(console.error);
  };

  const handleSendMessage = (text, mediaFile = null) => {
    if (!selectedChat) return;
    if (!text?.trim() && !mediaFile) return;
    sendMessage(selectedChat.id, text, mediaFile)
      .then((msg) => {
        setMessages((prev) => [...prev, msg]);
      })
      .catch(console.error);
  };

  const handleNewChat = (otherUser) => {
    setCreating(true);
    createChat(otherUser.id)
      .then((chat) => {
        setChats((prev) => {
          const exists = prev.find((c) => c.id === chat.id);
          if (exists) return prev;
          return [{ ...chat, otherUser, lastMessage: null, unreadCount: 0 }, ...prev];
        });
        selectChat({ ...chat, otherUser });
        setShowNewChat(false);
      })
      .catch(console.error)
      .finally(() => setCreating(false));
  };

  const handleCreateGroup = () => {
    if (!groupName.trim() || selectedUserIds.length === 0) return;
    setCreating(true);
    createGroupChat(groupName.trim(), selectedUserIds)
      .then((chat) => {
        setChats((prev) => {
          const exists = prev.find((c) => c.id === chat.id);
          if (exists) return prev;
          return [{ ...chat, lastMessage: null, unreadCount: 0 }, ...prev];
        });
        selectChat(chat);
        setShowNewChat(false);
        setGroupName('');
        setSelectedUserIds([]);
      })
      .catch(console.error)
      .finally(() => setCreating(false));
  };

  const toggleGroupUser = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const openNewChat = () => {
    setShowNewChat(true);
    setNewChatMode('personal');
    setGroupName('');
    setSelectedUserIds([]);
    getUsers().then(setUsers).catch(console.error);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-[30%] min-w-[260px] max-w-[400px] flex flex-col bg-white/5 backdrop-blur-md border-r border-white/10 shadow-2xl">
        <header className="flex-shrink-0 p-3 border-b border-white/10 flex flex-col gap-2">
          <div className="flex items-center gap-2 relative" ref={burgerRef}>
            <button
              className="flex items-center justify-center w-10 h-10 rounded-lg bg-black/40 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-all flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); setBurgerOpen((o) => !o); }}
              title="Меню"
              aria-label="Меню"
            >
              <Menu size={20} />
            </button>
            {burgerOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-xl py-1 min-w-[160px] shadow-2xl z-50">
                <Link to="/cabinet" onClick={() => setBurgerOpen(false)} className="block px-4 py-2 text-sm text-gray-200 hover:bg-white/10">Профиль</Link>
                <Link to="/channels" onClick={() => setBurgerOpen(false)} className="block px-4 py-2 text-sm text-gray-200 hover:bg-white/10">Каналы</Link>
                <button onClick={() => { openNewChat(); setBurgerOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/10">Новый чат</button>
              </div>
            )}
            <input
              type="search"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
            />
          </div>
          <div className="flex justify-end">
            <button
              className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 hover:scale-105 transition-all duration-300 border border-blue-500/30"
              onClick={openNewChat}
              title="Новый чат"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          </div>
        </header>
        <ChatList
          chats={chats}
          selectedId={selectedChat?.id}
          onSelect={selectChat}
          userStatus={userStatus}
          searchQuery={searchQuery}
        />
      </aside>

      <main className="flex-1 flex min-w-0">
        <ChatWindow
          chat={selectedChat}
          messages={messages}
          onSend={handleSendMessage}
          loading={messagesLoading}
          pinnedMessage={selectedChat?.pinnedMessage}
          onPin={handlePin}
          onUnpin={handleUnpin}
          userStatus={userStatus}
        />
      </main>

      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowNewChat(false)}>
          <div className="w-full max-w-md bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Новый чат</h2>
            <div className="flex gap-2 mb-4">
              <button
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  newChatMode === 'personal'
                    ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                    : 'bg-black/40 text-gray-400 border border-white/10 hover:bg-white/5'
                }`}
                onClick={() => setNewChatMode('personal')}
              >
                Личный
              </button>
              <button
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                  newChatMode === 'group'
                    ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                    : 'bg-black/40 text-gray-400 border border-white/10 hover:bg-white/5'
                }`}
                onClick={() => setNewChatMode('group')}
              >
                Группа
              </button>
            </div>

            {newChatMode === 'personal' ? (
              <div className="max-h-64 overflow-y-auto space-y-1 mb-4">
                {users.map((u) => (
                  <button
                    key={u.id}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/10 transition-colors text-left"
                    onClick={() => handleNewChat(u)}
                    disabled={creating}
                  >
                    <div className="relative w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover" /> : u.username[0]?.toUpperCase()}
                      {userStatus[u.id] === 'online' && <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500" />}
                    </div>
                    <span className="text-gray-200">{u.username}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <label className="block mb-2 text-sm text-gray-400">
                  Название группы
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Введите название"
                    className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
                  />
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors text-left ${
                        selectedUserIds.includes(u.id) ? 'bg-blue-500/20 border border-blue-500/30' : 'hover:bg-white/10'
                      }`}
                      onClick={() => toggleGroupUser(u.id)}
                      disabled={creating}
                    >
                      <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover" /> : u.username[0]?.toUpperCase()}
                      </div>
                      <span className="flex-1 text-gray-200">{u.username}</span>
                      {selectedUserIds.includes(u.id) && <span className="text-blue-400">✓</span>}
                    </button>
                  ))}
                </div>
                <button
                  className="w-full py-3 rounded-xl bg-blue-500/30 text-blue-300 font-medium border border-blue-500/50 hover:bg-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-2"
                  onClick={handleCreateGroup}
                  disabled={creating || !groupName.trim() || selectedUserIds.length === 0}
                >
                  {creating ? 'Создание...' : 'Создать группу'}
                </button>
              </>
            )}

            <button
              className="w-full py-2 rounded-xl bg-black/40 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-200 transition-all"
              onClick={() => setShowNewChat(false)}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
