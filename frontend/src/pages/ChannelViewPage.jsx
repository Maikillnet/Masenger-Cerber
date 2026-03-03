import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Paperclip, Send, MessageCircle, Bell, BellOff, X, ArrowLeft, Settings } from 'lucide-react';
import {
  getChannel,
  getChannelPosts,
  createPost,
  reactToPost,
  getPostComments,
  addComment,
  joinChannel,
} from '../api';
import ChannelSettingsModal from '../components/ChannelSettingsModal';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function PostCard({ post, currentUserId, onReact, onCommentClick }) {
  const counts = post.reactionCounts || {};
  const userReacted = post.userReacted;

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/5 rounded-2xl rounded-tl-sm shadow-lg p-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
          {post.author?.avatar ? (
            <img src={post.author.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            post.author?.username?.[0]?.toUpperCase()
          )}
        </div>
        <div>
          <span className="font-semibold text-gray-100 block">{post.author?.username}</span>
          <span className="text-sm text-gray-500">{new Date(post.createdAt).toLocaleString('ru')}</span>
        </div>
      </div>

      {post.content && (
        <div className="mb-4 whitespace-pre-wrap break-words text-gray-200">{post.content}</div>
      )}

      {post.mediaUrl && (
        <div className="mb-4">
          {post.mediaType === 'image' && (
            <img src={post.mediaUrl} alt="" className="max-h-80 rounded-xl object-contain" />
          )}
          {post.mediaType === 'video' && (
            <video src={post.mediaUrl} controls className="max-h-80 rounded-xl" />
          )}
          {post.mediaType === 'document' && (
            <a href={post.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline flex items-center gap-1">
              <Paperclip size={14} /> Открыть файл
            </a>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-white/10">
        <span className="text-sm text-gray-500">👁 {post.viewCount ?? 0}</span>
        <div className="flex gap-1 flex-wrap">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(post.id, emoji)}
              className={`px-2 py-1 rounded-lg text-sm transition-all ${
                userReacted === emoji
                  ? 'bg-blue-500/30 text-blue-300'
                  : 'bg-transparent text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
              title={emoji}
            >
              {emoji}{counts[emoji] ? ` ${counts[emoji]}` : ''}
            </button>
          ))}
        </div>
        <button
          onClick={() => onCommentClick(post)}
          className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          <MessageCircle size={16} /> Комментарии ({post.commentCount ?? 0})
        </button>
      </div>
    </div>
  );
}

function CommentThread({ post, onClose, socket }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const endRef = useRef(null);

  useEffect(() => {
    getPostComments(post.id)
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [post.id]);

  useEffect(() => {
    if (!socket) return;
    const handler = ({ postId, comment }) => {
      if (postId === post.id) setComments((prev) => [...prev, comment]);
    };
    socket.on('new_comment', handler);
    return () => socket.off('new_comment', handler);
  }, [socket, post.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    addComment(post.id, text.trim())
      .then((c) => setComments((prev) => [...prev, c]))
      .catch(console.error);
    setText('');
  };

  return (
    <div className="flex flex-col h-full bg-white/5 backdrop-blur-md">
      <header className="flex-shrink-0 flex justify-between items-center px-4 py-3 border-b border-white/10">
        <h3 className="font-semibold text-gray-100">Комментарии</h3>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-all"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 p-3 rounded-xl bg-white/10 border border-white/5">
          <strong className="text-blue-400">{post.author?.username}</strong>
          <span className="text-sm text-gray-500"> — {new Date(post.createdAt).toLocaleString('ru')}</span>
          <div className="mt-2 text-gray-200 text-sm">{post.content}</div>
        </div>
        {loading ? (
          <p className="text-gray-500">Загрузка...</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-blue-500/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {c.author?.avatar ? (
                  <img src={c.author.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  c.author?.username?.[0]?.toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-100 text-sm">{c.author?.username}</span>
                <p className="text-gray-200 text-sm mt-0.5">{c.content}</p>
                <span className="text-xs text-gray-500">{new Date(c.createdAt).toLocaleString('ru')}</span>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t border-white/10">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Написать комментарий..."
          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 hover:scale-105 transition-all duration-300 border border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

export default function ChannelViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socket = useSocket();
  const [channel, setChannel] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postText, setPostText] = useState('');
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaPreview, setMediaPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commentPost, setCommentPost] = useState(null);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [joining, setJoining] = useState(false);
  const fileInputRef = useRef(null);

  const isMember = channel?.isMember ?? false;

  useEffect(() => {
    if (!id) return;
    getChannel(id)
      .then(setChannel)
      .catch(console.error);
    getChannelPosts(id)
      .then(setPosts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!socket || !id) return;
    socket.emit('join_channel', id);

    const onNewPost = (post) => {
      if (post.channelId !== id) return;
      setPosts((prev) => {
        if (prev.some((p) => p.id === post.id)) return prev;
        return [post, ...prev];
      });
    };

    const onPostReaction = ({ postId, reactionCounts }) => {
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, reactionCounts } : p))
      );
    };

    const onNewComment = ({ postId }) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
        )
      );
      setCommentPost((p) =>
        p?.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
      );
    };

    socket.on('new_post', onNewPost);
    socket.on('post_reaction', onPostReaction);
    socket.on('new_comment', onNewComment);

    return () => {
      socket.emit('leave_channel', id);
      socket.off('new_post', onNewPost);
      socket.off('post_reaction', onPostReaction);
      socket.off('new_comment', onNewComment);
    };
  }, [socket, id]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
    if (!allowed.includes(file.type)) {
      alert('Разрешены: jpg, png, webp, mp4');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      alert('Максимум 20 МБ');
      return;
    }
    setMediaFile(file);
    const url = URL.createObjectURL(file);
    setMediaPreview({ url, type: file.type.startsWith('video') ? 'video' : 'image' });
  };

  const clearMedia = () => {
    if (mediaPreview?.url) URL.revokeObjectURL(mediaPreview.url);
    setMediaFile(null);
    setMediaPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreatePost = (e) => {
    e.preventDefault();
    if (!postText.trim() && !mediaFile) return;
    createPost(id, postText.trim(), mediaFile)
      .then((post) => {
        setPosts((prev) => {
          if (prev.some((p) => p.id === post.id)) return prev;
          return [post, ...prev];
        });
        setPostText('');
        clearMedia();
      })
      .catch(console.error);
  };

  const handleReact = (postId, emoji) => {
    reactToPost(postId, emoji)
      .then(({ reactionCounts, userReacted }) => {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, reactionCounts, userReacted } : p
          )
        );
      })
      .catch(console.error);
  };

  if (!channel) return (
    <div className="h-screen flex items-center justify-center text-gray-500 bg-gradient-to-br from-slate-950 via-gray-900 to-slate-950">
      Загрузка...
    </div>
  );

  const isAdmin = channel.isAdmin;

  return (
    <div className={`flex h-screen overflow-hidden ${commentPost ? 'comments-open' : ''}`}>
      {showSettings && (
        <ChannelSettingsModal
          data={channel}
          currentUser={user}
          onClose={(opts) => {
            setShowSettings(false);
            if (opts?.left || opts?.deleted) navigate('/channels');
          }}
          onUpdate={(updated) => setChannel((prev) => (prev?.id === updated?.id ? { ...prev, ...updated } : prev))}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0 bg-white/5 backdrop-blur-md border-r border-white/10 shadow-2xl">
        <header className="flex-shrink-0 p-4 border-b border-white/10">
          <div className="flex items-center justify-between gap-2 mb-2">
            <Link to="/channels" className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300">
              <ArrowLeft size={16} /> Каналы
            </Link>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-all"
              title="Настройки канала"
            >
              <Settings size={20} />
            </button>
          </div>
          <h1 className="text-xl font-semibold text-gray-100">{channel.name}</h1>
          {channel.description && (
            <p className="text-sm text-gray-500 mt-1">{channel.description}</p>
          )}
        </header>

        <div className="flex-1 overflow-y-auto p-6 pb-8 md:pb-10 flex justify-center">
          {loading ? (
            <p className="text-gray-500">Загрузка постов...</p>
          ) : posts.length === 0 ? (
            <p className="text-gray-500">Пока нет постов</p>
          ) : (
            <div className="w-full max-w-[680px] flex flex-col gap-4">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={user?.id}
                  onReact={handleReact}
                  onCommentClick={(p) => setCommentPost(p)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 p-4 pb-6 md:pb-8">
          {!isMember ? (
            <button
              type="button"
              onClick={async () => {
                setJoining(true);
                try {
                  await joinChannel(id);
                  setChannel((prev) => (prev ? { ...prev, isMember: true } : prev));
                } catch (e) {
                  console.error(e);
                } finally {
                  setJoining(false);
                }
              }}
              disabled={joining}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {joining ? 'Подписка...' : 'Подписаться на канал'}
            </button>
          ) : isAdmin ? (
            <form onSubmit={handleCreatePost} className="flex flex-col gap-3">
              {mediaPreview && (
                <div className="relative inline-block ml-2">
                  {mediaPreview.type === 'image' ? (
                    <img src={mediaPreview.url} alt="" className="max-h-20 rounded-xl object-cover shadow-lg" />
                  ) : (
                    <video src={mediaPreview.url} controls className="max-h-20 rounded-xl shadow-lg" />
                  )}
                  <button type="button" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70" onClick={clearMedia}>
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl w-full max-w-4xl mx-auto">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={handleFileChange} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 p-3 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer flex items-center justify-center"
                  title="Прикрепить"
                >
                  <Paperclip size={20} />
                </button>
                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="Написать пост..."
                  rows={2}
                  className="flex-1 bg-transparent border-none focus:outline-none text-gray-100 placeholder-gray-500 max-h-32 overflow-y-auto resize-none py-2 px-3"
                />
                <button
                  type="submit"
                  disabled={!postText.trim() && !mediaFile}
                  className="shrink-0 p-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/30 transition-all duration-200 flex items-center justify-center scale-95 hover:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-95"
                >
                  <Send size={20} />
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl w-full max-w-4xl mx-auto">
              <button
                type="button"
                className="flex-1 py-2.5 text-sm rounded-2xl text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => posts.length > 0 && setCommentPost(posts[0])}
                disabled={posts.length === 0}
              >
                Обсудить
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm transition-all duration-200 ${
                  muted
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
                onClick={() => setMuted((m) => !m)}
              >
                {muted ? <Bell size={18} /> : <BellOff size={18} />}
                {muted ? 'Включить уведомления' : 'Выключить уведомления'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`flex-shrink-0 overflow-hidden transition-all duration-300 border-l border-white/10 bg-white/5 backdrop-blur-md shadow-2xl ${commentPost ? 'w-[380px] min-w-[320px] flex flex-col' : 'w-0'}`}>
        {commentPost && (
          <CommentThread
            post={commentPost}
            onClose={() => setCommentPost(null)}
            socket={socket}
          />
        )}
      </div>
    </div>
  );
}
