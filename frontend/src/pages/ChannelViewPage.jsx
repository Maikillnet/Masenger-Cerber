import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Paperclip, Send, MessageCircle, Bell, BellOff, X, ArrowLeft, Settings, Smile, LogOut, Pin, ChevronRight, FileText } from 'lucide-react';
import {
  getChannel,
  getChannelPosts,
  createPost,
  reactToPost,
  getPostComments,
  addComment,
  joinChannel,
  unsubscribeChannel,
  pinPost,
  unpinPost,
} from '../api';
import ChannelSettingsModal from '../components/ChannelSettingsModal';
import MediaPicker from '../components/MediaPicker';
import { FileCard } from '../components/FileCard';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

function PostCard({ post, onReact, onCommentClick, onContextMenu }) {
  const mediaUrls = post.mediaUrls || (post.mediaUrl ? [post.mediaUrl] : []);
  const mediaTypes = post.mediaTypes || (post.mediaType ? [post.mediaType] : []);
  const hasMedia = mediaUrls.length > 0;
  const hasImageOrVideo = mediaUrls.some((_, i) => (mediaTypes[i] || 'image') === 'image' || (mediaTypes[i] || '') === 'video');

  const counts = post.reactionCounts || {};
  const userReacted = post.userReacted;
  const reactionEntries = Object.entries(counts).filter(([, c]) => c > 0);

  return (
    <div
      id={`post-${post.id}`}
      className="bg-white/10 backdrop-blur-sm border border-white/5 rounded-2xl rounded-tl-sm shadow-lg overflow-hidden flex flex-col h-auto scroll-mt-4"
      onContextMenu={(e) => onContextMenu?.(e, post)}
    >
      {hasMedia && hasImageOrVideo && (
        <div className={`relative w-full ${mediaUrls.length > 1 ? `grid gap-1 p-2 ${mediaUrls.length === 2 || mediaUrls.length === 4 ? 'grid-cols-2' : 'grid-cols-3'}` : ''}`}>
          {mediaUrls.length === 1 ? (
            mediaTypes[0] === 'video' ? (
              <video src={mediaUrls[0]} controls className="w-full h-auto max-h-[450px] object-contain bg-black/20" />
            ) : (
              <img src={mediaUrls[0]} alt="" className="w-full h-auto max-h-[450px] object-contain bg-black/20" />
            )
          ) : (
            mediaUrls.map((url, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-lg bg-black/20">
                {(mediaTypes[i] || 'image') === 'video' ? (
                  <video src={url} className="w-full h-full object-cover" controls />
                ) : (
                  <img src={url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
            ))
          )}
        </div>
      )}
      <div className={`${hasMedia && hasImageOrVideo ? 'px-4 pb-4 pt-2' : 'p-4'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
            {post.author?.avatar ? (
              <img src={post.author.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              post.author?.username?.[0]?.toUpperCase()
            )}
          </div>
          <div>
            <span className="font-semibold text-gray-100 block max-w-full truncate">{post.author?.username}</span>
            <span className="text-sm text-gray-500">
              {post.forwardedFrom && <span className="text-gray-400">Переслано от: {post.forwardedFrom} • </span>}
              {new Date(post.createdAt).toLocaleString('ru')}
            </span>
          </div>
        </div>

        {post.content && (
          <div className="mb-4 whitespace-pre-wrap break-words min-w-0 text-gray-200 pb-1">{post.content}</div>
        )}

        {mediaUrls.some((_, i) => (mediaTypes[i] || '') === 'audio') && (
          <div className="mb-4 flex flex-col gap-2">
            {mediaUrls.map((url, i) => (mediaTypes[i] || '') === 'audio' ? (
              <audio key={i} src={url} controls className="w-full max-w-md h-10" />
            ) : null)}
          </div>
        )}

        {mediaUrls.some((_, i) => (mediaTypes[i] || '') === 'document') && (
          <div className="mb-4 flex flex-col gap-3 px-4">
            {mediaUrls.map((url, i) => (mediaTypes[i] || '') === 'document' ? (
              <FileCard key={i} url={url} className="w-full" />
            ) : null)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-white/10">
          <span className="text-sm text-gray-500">👁 {post.viewCount ?? 0}</span>
          {reactionEntries.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {reactionEntries.map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(post.id, emoji)}
                  className={`px-2 py-0.5 rounded-full text-sm transition-all border ${
                    userReacted === emoji
                      ? 'bg-blue-500/30 text-blue-300 border-blue-500/50'
                      : 'bg-white/10 backdrop-blur-sm border-white/10 text-gray-300 hover:bg-white/15 hover:text-gray-100'
                  }`}
                  title={emoji}
                >
                  {(emoji.startsWith('/uploads') || emoji.startsWith('http')) ? (
                    <img src={emoji} alt="" className="w-5 h-5 inline object-contain" />
                  ) : (
                    emoji
                  )}
                  {count > 0 && <span className="ml-0.5">{count}</span>}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => onCommentClick(post)}
            className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <MessageCircle size={16} /> Комментарии ({post.commentCount ?? 0})
          </button>
        </div>
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
      if (postId !== post.id || !comment) return;
      setComments((prev) => {
        if (prev.some((c) => c.id === comment.id)) return prev;
        return [...prev, comment];
      });
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
      .then((c) => {
        if (!c?.id) return;
        setComments((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c]));
      })
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
          <div className="mt-2 text-gray-200 text-sm whitespace-pre-wrap break-words min-w-0 pb-1">{post.content}</div>
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
                <p className="text-gray-200 text-sm mt-0.5 whitespace-pre-wrap break-words min-w-0 pb-1">{c.content}</p>
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
  const [mediaFiles, setMediaFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentPost, setCommentPost] = useState(null);
  const [menuPost, setMenuPost] = useState(null);
  const [reactionPost, setReactionPost] = useState(null);
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [joining, setJoining] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const fileInputRef = useRef(null);
  const postsEndRef = useRef(null);

  const isMember = channel?.isMember ?? false;

  useEffect(() => {
    if (posts.length > 0) {
      postsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [posts.length]);

  useEffect(() => {
    if (!id) return;
    getChannel(id)
      .then(setChannel)
      .catch(console.error);
    getChannelPosts(id)
      .then((data) => {
        const raw = Array.isArray(data) ? data : (data?.posts || data?.items || []);
        setPosts([...raw].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)));
      })
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
        return [...prev, post];
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

  useEffect(() => {
    setPinnedIndex(0);
  }, [id]);

  const DOC_EXT = ['pdf', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', '7z', 'rar', 'csv'];
  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'application/pdf', 'application/zip', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'application/rtf', 'text/csv'];
  const getFileType = (file) => {
    const ext = (file?.name || '').toLowerCase().split('.').pop();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
    if (ext === 'mp4') return 'video';
    if (DOC_EXT.includes(ext)) return 'document';
    return file?.type?.startsWith('video') ? 'video' : file?.type?.startsWith('image') ? 'image' : 'document';
  };
  const isAllowed = (file) => DOC_EXT.includes((file?.name || '').toLowerCase().split('.').pop()) || ALLOWED_MIME.includes(file?.type);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const maxSize = 50 * 1024 * 1024;
    const maxPhotos = 20;
    const maxVideos = 8;
    const maxDocs = 10;
    const maxTotal = maxPhotos + maxVideos + maxDocs;
    const valid = files.filter((file) => isAllowed(file) && file.size <= maxSize);
    if (valid.length < files.length) alert('Разрешены: jpg, png, webp, gif, mp4, pdf, zip, doc, docx, xls, xlsx, ppt, pptx, txt, rtf, csv. Максимум 50 МБ.');
    if (valid.length === 0) return;
    setMediaFiles((prev) => {
      const newItems = valid.slice(0, maxTotal - prev.length).map((file) => {
        const type = getFileType(file);
        return { file, url: type === 'document' ? null : URL.createObjectURL(file), type, fileName: file.name };
      });
      const combined = [...prev, ...newItems].slice(0, maxTotal);
      const vc = combined.filter((m) => m.type === 'video').length;
      const pc = combined.filter((m) => m.type === 'image').length;
      const dc = combined.filter((m) => m.type === 'document').length;
      if (vc > maxVideos || pc > maxPhotos || dc > maxDocs) {
        newItems.forEach((m) => m.url && URL.revokeObjectURL(m.url));
        alert('Максимум 20 фото, 8 видео и 10 документов');
        return prev;
      }
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    const current = mediaFiles;
    return () => current.forEach((m) => m?.url && URL.revokeObjectURL(m.url));
  }, [mediaFiles]);

  const removeMediaFile = (index) => {
    setMediaFiles((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return next;
    });
  };

  const clearMedia = () => {
    mediaFiles.forEach((m) => m?.url && URL.revokeObjectURL(m.url));
    setMediaFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCreatePost = (e) => {
    e.preventDefault();
    if (!postText.trim() && mediaFiles.length === 0) return;
    createPost(id, postText.trim(), mediaFiles.map((m) => m.file))
      .then((post) => {
        setPosts((prev) => {
          if (prev.some((p) => p.id === post.id)) return prev;
          return [...prev, post];
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

  const handlePostContextMenu = (e, post) => {
    e.preventDefault();
    setMenuPost({ post, x: e.clientX, y: e.clientY });
  };

  const handlePinPost = (postId) => {
    if (!id) return;
    pinPost(id, postId)
      .then(({ pinnedPosts }) => setChannel((c) => (c ? { ...c, pinnedPosts: pinnedPosts || [] } : c)))
      .catch(console.error);
  };

  const handleUnpinPost = (postId) => {
    if (!id) return;
    unpinPost(id, postId)
      .then(({ pinnedPosts }) => setChannel((c) => (c ? { ...c, pinnedPosts: pinnedPosts || [] } : c)))
      .catch(console.error);
  };

  const scrollToPost = (postId) => {
    document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            <div className="flex items-center gap-1">
              {channel.isMember && (
                <button
                  onClick={async () => {
                    if (!confirm('Отписаться от канала?')) return;
                    try {
                      await unsubscribeChannel(id);
                      navigate('/channels');
                    } catch (e) {
                      console.error(e);
                      alert(e.message || 'Ошибка отписки');
                    }
                  }}
                  className="p-2 rounded-xl text-gray-400 hover:bg-white/10 hover:text-red-400 transition-all"
                  title="Отписаться от канала"
                >
                  <LogOut size={20} />
                </button>
              )}
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-all"
                title="Настройки канала"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>
          <h1 className="text-xl font-semibold text-gray-100">{channel.name}</h1>
          {channel.description && (
            <p className="text-sm text-gray-500 mt-1">{channel.description}</p>
          )}
        </header>

        {(() => {
          const list = channel.pinnedPosts || [];
          if (list.length === 0) return null;
          const idx = Math.min(pinnedIndex, list.length - 1);
          const post = list[idx];
          return (
            <div
              className="flex-shrink-0 mx-3 mt-2 mb-1 px-4 py-2.5 flex items-center gap-2.5 cursor-pointer rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.12] transition-all"
              onClick={() => {
                scrollToPost(post.id);
                setPinnedIndex((i) => (i + 1) % list.length);
              }}
            >
              <Pin size={16} className="flex-shrink-0 text-slate-400" />
              <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                <span className="text-sm font-medium text-slate-300 shrink-0">{post.author?.username}</span>
                <span className="text-slate-500">·</span>
                <span className="text-sm text-slate-400 truncate">{post.content || 'Медиа'}</span>
              </div>
              {list.length > 1 && (
                <span className="text-xs text-slate-500 shrink-0">{idx + 1}/{list.length}</span>
              )}
              <ChevronRight size={16} className="flex-shrink-0 text-slate-500" />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleUnpinPost(post.id); }}
                className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors"
                title="Открепить"
              >
                <X size={18} />
              </button>
            </div>
          );
        })()}

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
                  onReact={handleReact}
                  onCommentClick={(p) => setCommentPost(p)}
                  onContextMenu={handlePostContextMenu}
                />
              ))}
              <div ref={postsEndRef} />
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
              {mediaFiles.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-3 mb-2 no-scrollbar">
                  {mediaFiles.map((item, i) => (
                    <div key={i} className="relative flex-shrink-0">
                      {item.type === 'document' ? (
                        <div className="h-16 w-24 rounded-lg bg-white/10 border border-white/10 flex flex-col items-center justify-center gap-0.5 p-1.5">
                          <FileText size={24} className="text-blue-400" />
                          <span className="text-[10px] text-gray-300 truncate max-w-full" title={item.fileName}>{item.fileName}</span>
                        </div>
                      ) : item.type === 'video' ? (
                        <video src={item.url} className="h-16 w-16 rounded-lg object-cover" muted />
                      ) : (
                        <img src={item.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                      )}
                      <button type="button" className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-xs hover:bg-black/70" onClick={() => removeMediaFile(i)} aria-label="Удалить">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-2 shadow-2xl w-full max-w-4xl mx-auto">
                <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/rtf,text/csv,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.csv" onChange={handleFileChange} className="hidden" />
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
                  disabled={!postText.trim() && mediaFiles.length === 0}
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

      {reactionPost && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setReactionPost(null)}
        >
          <div
            className="absolute z-50"
            onClick={(e) => e.stopPropagation()}
            style={{ left: reactionPost.x, top: reactionPost.y }}
          >
            <MediaPicker
              onSelect={(item) => {
                const value = item.value || item.url;
                if (value) {
                  handleReact(reactionPost.post.id, value);
                  setReactionPost(null);
                }
              }}
            />
          </div>
        </div>
      )}

      {menuPost && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenuPost(null)}
        >
          <div
            className="absolute bg-white/10 backdrop-blur-md border border-white/10 rounded-xl px-2 py-1 shadow-2xl min-w-[160px]"
            onClick={(e) => e.stopPropagation()}
            style={{ left: menuPost.x, top: menuPost.y }}
          >
            {channel?.isAdmin && (
              (channel.pinnedPosts || []).some((pp) => pp?.id === menuPost.post?.id) ? (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                  onClick={() => { handleUnpinPost(menuPost.post?.id); setMenuPost(null); }}
                >
                  <Pin size={16} /> Открепить
                </button>
              ) : (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                  onClick={() => { handlePinPost(menuPost.post?.id); setMenuPost(null); }}
                >
                  <Pin size={16} /> Закрепить
                </button>
              )
            )}
            <button
              className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
              onClick={() => {
                setReactionPost({ post: menuPost.post, x: menuPost.x, y: menuPost.y });
                setMenuPost(null);
              }}
            >
              <Smile size={16} /> Добавить реакцию
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
