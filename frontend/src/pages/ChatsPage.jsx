import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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

function ChatList({ chats, selectedId, onSelect, userStatus }) {
  return (
    <div className="chat-list">
      {chats.length === 0 ? (
        <p className="chat-list-empty">Нет чатов. Начните новый диалог.</p>
      ) : (
        chats.map((chat) => {
          const other = chat.otherUser;
          const name = other?.username || chat.name || 'Чат';
          const avatar = other?.avatar;
          const status = userStatus[other?.id] ?? other?.status ?? 'offline';
          return (
            <button
              key={chat.id}
              className={`chat-list-item ${selectedId === chat.id ? 'active' : ''}`}
              onClick={() => onSelect(chat)}
            >
              <div className="chat-list-avatar">
                {avatar ? (
                  <img src={avatar} alt="" />
                ) : (
                  <span>{name[0]?.toUpperCase() || '?'}</span>
                )}
                {status === 'online' && <span className="status-dot online" />}
              </div>
              <div className="chat-list-info">
                <div className="chat-list-row">
                  <span className="chat-list-name">{name}</span>
                  {chat.lastMessage && (
                    <span className="chat-list-time">{formatTime(chat.lastMessage.createdAt)}</span>
                  )}
                </div>
                <div className="chat-list-preview">
                  {chat.lastMessage?.text
                    ? chat.lastMessage.text.slice(0, 40) + (chat.lastMessage.text.length > 40 ? '…' : '')
                    : 'Нет сообщений'}
                </div>
              </div>
              {chat.unreadCount > 0 && (
                <span className="chat-list-unread">{chat.unreadCount}</span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

function ChatWindow({ chat, messages, onSend, loading, pinnedMessage, onPin, onUnpin }) {
  const [text, setText] = useState('');
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({});
  const [menuMsg, setMenuMsg] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  const scrollToMessage = (msgId) => {
    const el = messageRefs.current[msgId] || document.getElementById(`msg-${msgId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleMessageContextMenu = (e, msg) => {
    e.preventDefault();
    setMenuMsg(msg);
  };

  if (!chat) {
    return (
      <div className="chat-window empty">
        <p>Выберите чат или начните новый диалог</p>
      </div>
    );
  }

  const name = chat.otherUser?.username || chat.name || 'Чат';

  return (
    <div className="chat-window">
      <header className="chat-window-header">
        <div className="chat-window-title">{name}</div>
      </header>

      {pinnedMessage && (
        <button
          className="pinned-banner"
          onClick={() => scrollToMessage(pinnedMessage.id)}
        >
          <span className="pinned-icon">📌</span>
          <div className="pinned-content">
            <span className="pinned-sender">{pinnedMessage.sender?.username}</span>
            <span className="pinned-text">{pinnedMessage.text}</span>
          </div>
        </button>
      )}

      <div className="chat-messages">
        {loading ? (
          <div className="chat-loading">Загрузка...</div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              ref={(el) => { messageRefs.current[msg.id] = el; }}
              className={`chat-message ${msg.senderId === user?.id ? 'own' : 'other'}`}
              onContextMenu={(e) => handleMessageContextMenu(e, msg)}
            >
              <div className="chat-message-bubble">
                <div className="chat-message-text">{msg.text}</div>
                <div className="chat-message-time">
                  {new Date(msg.createdAt).toLocaleTimeString('ru', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {menuMsg && (
        <div
          className="context-menu-overlay"
          onClick={() => setMenuMsg(null)}
        >
          <div className="context-menu" onClick={(e) => e.stopPropagation()}>
            {pinnedMessage?.id === menuMsg.id ? (
              <button onClick={() => { onUnpin(); setMenuMsg(null); }}>
                Открепить
              </button>
            ) : (
              <button onClick={() => { onPin(menuMsg.id); setMenuMsg(null); }}>
                Закрепить
              </button>
            )}
          </div>
        </div>
      )}

      <form className="chat-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение..."
          maxLength={2000}
        />
        <button type="submit" disabled={!text.trim()}>
          Отправить
        </button>
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
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      setChats((prev) =>
        prev.map((c) => {
          if (c.id !== message.chatId) return c;
          const isCurrent = selectedChat?.id === message.chatId;
          return {
            ...c,
            lastMessage: {
              id: message.id,
              text: message.text,
              createdAt: message.createdAt,
              sender: message.sender,
            },
            unreadCount: isCurrent ? 0 : (c.unreadCount || 0) + 1,
            updatedAt: message.createdAt,
          };
        })
      );
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
    return () => {
      socket.off('receive_message');
      socket.off('user_status');
      socket.off('message_pinned');
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

  const handleSendMessage = (text) => {
    if (!selectedChat) return;
    sendMessage(selectedChat.id, text)
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
    <div className="chats-page">
      <aside className="chats-sidebar">
        <header className="chats-sidebar-header">
          <h1>Мессенджер</h1>
          <div className="chats-sidebar-actions">
            <button className="btn-new-chat" onClick={openNewChat} title="Новый чат">
              +
            </button>
            <Link to="/channels" className="btn-cabinet">Каналы</Link>
            <Link to="/cabinet" className="btn-cabinet">Профиль</Link>
          </div>
        </header>
        <ChatList
          chats={chats}
          selectedId={selectedChat?.id}
          onSelect={selectChat}
          userStatus={userStatus}
        />
      </aside>

      <main className="chats-main">
        <ChatWindow
          chat={selectedChat}
          messages={messages}
          onSend={handleSendMessage}
          loading={messagesLoading}
          pinnedMessage={selectedChat?.pinnedMessage}
          onPin={handlePin}
          onUnpin={handleUnpin}
        />
      </main>

      {showNewChat && (
        <div className="modal-overlay" onClick={() => setShowNewChat(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Новый чат</h2>
            <div className="modal-tabs">
              <button
                className={newChatMode === 'personal' ? 'active' : ''}
                onClick={() => setNewChatMode('personal')}
              >
                Личный
              </button>
              <button
                className={newChatMode === 'group' ? 'active' : ''}
                onClick={() => setNewChatMode('group')}
              >
                Группа
              </button>
            </div>

            {newChatMode === 'personal' ? (
              <div className="users-list">
                {users.map((u) => (
                  <button
                    key={u.id}
                    className="user-item"
                    onClick={() => handleNewChat(u)}
                    disabled={creating}
                  >
                    <div className="user-item-avatar">
                      {u.avatar ? <img src={u.avatar} alt="" /> : u.username[0]?.toUpperCase()}
                    </div>
                    <span>{u.username}</span>
                    {userStatus[u.id] === 'online' && <span className="status-dot online" />}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <label className="modal-label">
                  Название группы
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Введите название"
                  />
                </label>
                <div className="users-list">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      className={`user-item ${selectedUserIds.includes(u.id) ? 'selected' : ''}`}
                      onClick={() => toggleGroupUser(u.id)}
                      disabled={creating}
                    >
                      <div className="user-item-avatar">
                        {u.avatar ? <img src={u.avatar} alt="" /> : u.username[0]?.toUpperCase()}
                      </div>
                      <span>{u.username}</span>
                      {selectedUserIds.includes(u.id) && <span className="check">✓</span>}
                    </button>
                  ))}
                </div>
                <button
                  className="btn-create-group"
                  onClick={handleCreateGroup}
                  disabled={creating || !groupName.trim() || selectedUserIds.length === 0}
                >
                  {creating ? 'Создание...' : 'Создать группу'}
                </button>
              </>
            )}

            <button className="btn-close" onClick={() => setShowNewChat(false)}>
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
