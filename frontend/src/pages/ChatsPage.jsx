import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Send, Paperclip, User, Check, CheckCheck, Settings, Smile, Play, X, ChevronLeft, ChevronRight, MessageCircle, Eye, LogOut, Pin, Mic, Trash2, Pause, Square, FileText, Download, Forward } from 'lucide-react';
import {
  getChats,
  getChat,
  createChat,
  createGroupChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  markChatRead,
  getUsers,
  pinMessage,
  unpinMessage,
  pinPost,
  unpinPost,
  reactToMessage,
  removeMessageReaction,
  getStoryFeed,
  uploadStory,
  getChannels,
  getChannel,
  getChannelPosts,
  createPost,
  createChannel,
  joinChannel,
  getPostComments,
  addComment,
  reactToPost,
  markPostAsViewed,
  markMessageAsViewed,
  unsubscribeChannel,
} from '../api';


import GroupSettingsModal from '../components/GroupSettingsModal';
import ForwardModal from '../components/ForwardModal';
import ChannelSettingsModal from '../components/ChannelSettingsModal';
import { FileCard, getFriendlyFileName } from '../components/FileCard';
import MediaPicker from '../components/MediaPicker';
import StoryViewer from '../components/StoryViewer';
import StoryPreviewModal from '../components/StoryPreviewModal';
import StoryRing from '../components/StoryRing';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

function formatCommentCount(n) {
  const x = n ?? 0;
  if (x % 10 === 1 && x % 100 !== 11) return `${x} комментарий`;
  if ([2, 3, 4].includes(x % 10) && ![12, 13, 14].includes(x % 100)) return `${x} комментария`;
  return `${x} комментариев`;
}

function formatViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n ?? 0);
}

function formatTime(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800000) return d.toLocaleDateString('ru', { weekday: 'short' });
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' });
}

function formatAudioTime(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, '0')}`;
}

const DOCUMENT_EXTENSIONS = ['pdf', 'zip', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', '7z', 'rar', 'csv'];
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4',
  'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
  'application/pdf', 'application/zip', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'application/rtf', 'application/x-7z-compressed', 'application/x-rar-compressed',
  'text/csv',
];

function getFileType(file) {
  const ext = (file?.name || '').toLowerCase().split('.').pop();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (ext === 'mp4') return 'video';
  if (['webm', 'mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
  if (file?.type?.startsWith('video')) return 'video';
  if (file?.type?.startsWith('image')) return 'image';
  if (file?.type?.startsWith('audio')) return 'audio';
  return 'document';
}

function isFileAllowed(file) {
  const ext = (file?.name || '').toLowerCase().split('.').pop();
  const allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm', 'mp3', 'wav', 'ogg', 'm4a', ...DOCUMENT_EXTENSIONS];
  if (allowedExts.includes(ext)) return true;
  if (ALLOWED_MIME_TYPES.includes(file?.type)) return true;
  return false;
}

function PostWithViewTracking({ post, user, children }) {
  const postRef = useRef(null);
  const [hasViewed, setHasViewed] = useState(false);

  useEffect(() => {
    if (!postRef.current || hasViewed || post.authorId === user?.id) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          markPostAsViewed(post.id).catch(console.error);
          setHasViewed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(postRef.current);
    return () => observer.disconnect();
  }, [post.id, post.authorId, user?.id, hasViewed]);

  return <div ref={postRef}>{children}</div>;
}

function VoiceMessagePlayer({ src, isOwn, timestamp, isRead, editedAt, className = '', fullWidth }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform] = useState(() => {
    const bars = [];
    const count = fullWidth ? 80 : 40;
    for (let i = 0; i < count; i++) {
      bars.push(0.3 + Math.random() * 0.7);
    }
    return bars;
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    if (audio.duration) setDuration(audio.duration);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play();
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className={`flex items-center gap-3 py-2 px-3 rounded-2xl ${fullWidth ? 'w-full min-w-0' : 'min-w-[200px] max-w-[300px]'} ${isOwn ? 'bg-blue-600/90' : 'bg-white/10'} ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={togglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
          isOwn ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-white/20 hover:bg-white/30 text-gray-100'
        }`}
      >
        {isPlaying ? (
          <Pause size={18} className="fill-current" />
        ) : (
          <Play size={18} className="fill-current ml-0.5" />
        )}
      </button>
      <span className={`font-mono text-sm tabular-nums min-w-[2.5rem] ${isOwn ? 'text-white/90' : 'text-gray-200'}`}>
        {formatAudioTime(isPlaying ? currentTime : (duration > 0 ? duration : currentTime))}
      </span>
      <div className="flex-1 flex items-end gap-[2px] h-6 min-w-0 overflow-hidden">
        {waveform.map((h, i) => (
          <div
            key={i}
            className={`flex-1 min-w-[2px] max-w-[6px] rounded-full transition-colors duration-150 ${
              (i + 1) / waveform.length <= progress
                ? isOwn ? 'bg-white/90' : 'bg-blue-400/90'
                : isOwn ? 'bg-white/35' : 'bg-white/25'
            }`}
            style={{ height: `${Math.max(4, h * 24)}px` }}
          />
        ))}
      </div>
      <div className={`flex items-center gap-0.5 text-[10px] opacity-70 flex-shrink-0 ${isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
        <span>{timestamp}</span>
        {editedAt && <span>(изм.)</span>}
        {isOwn && (isRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
      </div>
    </div>
  );
}

function MediaGrid({ urls, types, className = '', onMediaClick, isOwn }) {
  const items = (urls || []).map((url, i) => ({ url, type: (types || [])[i] || 'image' }));
  const mediaItems = items.filter((it) => it.type === 'image' || it.type === 'video');
  const documentItems = items.filter((it) => it.type === 'document');

  const renderDocumentLink = (item, idx) => (
    <FileCard key={idx} url={item.url} className="flex-shrink-0 w-full" isOwn={isOwn} />
  );

  const renderCell = (item, idx, cellClass = '') => (
    <div
      key={idx}
      role="button"
      tabIndex={0}
      onClick={() => onMediaClick?.(idx)}
      onKeyDown={(e) => e.key === 'Enter' && onMediaClick?.(idx)}
      className={`relative overflow-hidden bg-black/10 cursor-pointer hover:opacity-90 transition-opacity ${cellClass}`}
    >
      {item.type === 'image' ? (
        <img src={item.url} alt="" className="w-full h-full object-cover" />
      ) : (
        <>
          <video src={item.url} controls className="w-full h-full object-cover" onClick={(e) => e.stopPropagation()} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-6 h-6 text-white fill-white" />
            </div>
          </div>
        </>
      )}
    </div>
  );

  const firstImageUrl = mediaItems.find((m) => m.type === 'image')?.url;
  const gridContent = (() => {
    if (mediaItems.length === 2) {
      return (
        <div className="grid grid-cols-2 gap-1 rounded-2xl overflow-hidden">
          {mediaItems.map((item, i) => renderCell(item, i, 'aspect-square'))}
        </div>
      );
    }
    if (mediaItems.length === 3) {
      return (
        <div className="grid grid-cols-2 gap-1 rounded-2xl overflow-hidden">
          <div className="col-span-2 aspect-[16/10]">{renderCell(mediaItems[0], 0, 'w-full h-full')}</div>
          {mediaItems.slice(1).map((item, i) => renderCell(item, i + 1, 'aspect-square'))}
        </div>
      );
    }
    if (mediaItems.length === 4) {
      return (
        <div className="grid grid-cols-2 gap-1 rounded-2xl overflow-hidden">
          {mediaItems.map((item, i) => renderCell(item, i, 'aspect-square'))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
        {mediaItems.map((item, i) => renderCell(item, i, 'aspect-square'))}
      </div>
    );
  })();

  if (mediaItems.length === 1) {
    const item = mediaItems[0];
    const isImage = item.type === 'image';
    return (
      <div className={`space-y-2 ${className}`}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onMediaClick?.(0)}
          onKeyDown={(e) => e.key === 'Enter' && onMediaClick?.(0)}
          className="rounded-2xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
        >
          <div className="relative w-full bg-black/20 flex items-center justify-center min-h-[200px]">
            {isImage && (
              <div
                className="absolute inset-0 z-0 scale-125 blur-3xl opacity-60"
                style={{
                  backgroundImage: `url(${item.url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
            )}
            {isImage ? (
              <img src={item.url} alt="" className="relative z-10 max-w-full h-auto max-h-[450px] object-contain shadow-xl" />
            ) : (
              <div className="relative z-10 max-h-[450px]" onClick={(e) => e.stopPropagation()}>
                <video src={item.url} controls className="max-w-full h-auto max-h-[450px] object-contain shadow-xl" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
                    <Play className="w-8 h-8 text-white fill-white" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        {documentItems.length > 0 && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 px-4">
            {documentItems.map((item, i) => renderDocumentLink(item, i))}
          </div>
        )}
      </div>
    );
  }

  if (mediaItems.length >= 2) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        {firstImageUrl && (
          <div
            className="absolute inset-0 z-0 scale-125 blur-3xl opacity-40"
            style={{
              backgroundImage: `url(${firstImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        )}
        <div className="relative z-10 space-y-2">
          {gridContent}
          {documentItems.length > 0 && (
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2 px-4">
              {documentItems.map((item, i) => renderDocumentLink(item, i))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (documentItems.length > 0 && mediaItems.length === 0) {
    return (
      <div className={`flex flex-col gap-3 p-4 px-6 rounded-t-2xl ${className}`}>
        {documentItems.map((item, i) => renderDocumentLink(item, i))}
      </div>
    );
  }

  return null;
}

function ChatList({ chats, selectedId, onSelect, userStatus, searchQuery, chatFilter }) {
  if (chatFilter === 'channels') return null;
  let filtered = chatFilter === 'personal'
    ? chats.filter((c) => !c.isGroup)
    : chatFilter === 'group'
      ? chats.filter((c) => c.isGroup)
      : chats;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((chat) => {
      const name = chat.otherUser?.username || chat.name || '';
      const preview = chat.lastMessage?.content ?? chat.lastMessage?.text ?? '';
      return name.toLowerCase().includes(q) || preview.toLowerCase().includes(q);
    });
  }

  const sorted = [...filtered].sort((a, b) => {
    const timeA = a.lastMessage?.createdAt || a.updatedAt || 0;
    const timeB = b.lastMessage?.createdAt || b.updatedAt || 0;
    return new Date(timeB) - new Date(timeA);
  });

  const emptyMessage = searchQuery.trim()
    ? 'Ничего не найдено'
    : chatFilter === 'personal'
      ? 'Нет личных чатов. Начните новый диалог.'
      : chatFilter === 'group'
        ? 'Нет групповых чатов. Создайте группу.'
        : 'Нет чатов. Начните новый диалог.';

  return (
    <div className="flex-1 overflow-y-auto">
      {sorted.length === 0 ? (
        <p className="p-8 text-center text-gray-500">{emptyMessage}</p>
      ) : (
        sorted.map((chat) => {
          const other = chat?.otherUser;
          const name = other?.username || chat?.name || 'Чат';
          const avatar = other?.avatar ?? chat?.avatar;
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
                  {(() => {
                    const txt = chat.lastMessage?.content ?? chat.lastMessage?.text ?? '';
                    return txt ? txt.slice(0, 40) + (txt.length > 40 ? '…' : '') : 'Нет сообщений';
                  })()}
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

function ChannelList({ channels, selectedId, onSelect, searchQuery }) {
  let filtered = channels;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = channels.filter((ch) => {
      const name = ch.name || '';
      const desc = ch.description || '';
      return name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
    });
  }
  const sorted = [...filtered].sort((a, b) => {
    const ta = a.updatedAt || a.createdAt || 0;
    const tb = b.updatedAt || b.createdAt || 0;
    return new Date(tb) - new Date(ta);
  });

  return (
    <div className="flex-1 overflow-y-auto">
      {sorted.length === 0 ? (
        <p className="p-8 text-center text-gray-500">Нет каналов</p>
      ) : (
        sorted.filter((ch) => ch?.id).map((ch) => (
          <button
            key={ch.id}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-200 border-b border-white/5 hover:bg-white/5 ${
              selectedId === ch.id ? 'bg-white/10' : ''
            }`}
            onClick={() => onSelect(ch)}
          >
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden">
              {ch?.avatar ? (
                <img src={ch.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-medium">{(ch?.name ?? '?')[0]?.toUpperCase() || '?'}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium text-gray-100 truncate block">{ch.name}</span>
              <span className="text-sm text-gray-500 truncate block">
                {ch._count?.members ?? 0} подписчиков
              </span>
            </div>
          </button>
        ))
      )}
    </div>
  );
}

function PostCommentsInline({ post, socket, onClose }) {
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
    <div className="mt-3 pt-3 border-t border-white/10">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-300">Комментарии</span>
        <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300 text-sm">Свернуть</button>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-3 mb-3">
        {loading ? (
          <p className="text-gray-500 text-sm">Загрузка...</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-blue-500/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {c.author?.avatar ? (
                  <img src={c.author.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs">{c.author?.username?.[0]?.toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-400">{c.author?.username}</span>
                <p className="text-gray-200 text-sm">{c.content}</p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Написать комментарий..."
          className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500/50"
        />
        <button type="submit" disabled={!text.trim()} className="px-3 py-2 rounded-xl bg-blue-500/20 text-blue-400 text-sm hover:bg-blue-500/30 disabled:opacity-50">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

function ChatWindow({ chat, channel, messages, posts, postsLoading, onSend, onEdit, onDelete, onAddReaction, onRemoveReaction, onSendPost, onPostReact, onJoinChannel, onUnsubscribeChannel, loading, loadingMore, hasMore, onLoadMore, pinnedMessages, pinnedPosts, onPin, onUnpin, onPinPost, onUnpinPost, userStatus, typingUser, socket, onUpdateChat, onUpdateChannel, onCloseSettings, onCloseChannel, onOpenMediaViewer, onMessageSent }) {
  const [text, setText] = useState('');
  const [mediaFiles, setMediaFiles] = useState([]); // [{ file, url, type }]
  const [showSettings, setShowSettings] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [reactionMsg, setReactionMsg] = useState(null); // { msg, x, y } для выбора реакции
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({});
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputContainerRef = useRef(null);
  const [menuMsg, setMenuMsg] = useState(null);
  const [menuPost, setMenuPost] = useState(null);
  const [reactionPost, setReactionPost] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [pendingVoiceFile, setPendingVoiceFile] = useState(null);
  const [pendingVoiceDuration, setPendingVoiceDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const typingEndTimerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const channelRef = useRef(channel);
  const textRef = useRef(text);
  const mediaFilesRef = useRef([]);
  const voiceIntentRef = useRef('send'); // 'stop' | 'send'
  const recordingTimeRef = useRef(0);
  const { user } = useAuth();

  useEffect(() => {
    channelRef.current = channel;
    textRef.current = text;
    mediaFilesRef.current = mediaFiles;
  }, [channel, text, mediaFiles]);

  const messagesContainerRef = useRef(null);
  const postsEndRef = useRef(null);
  useEffect(() => {
    if (!onLoadMore || !hasMore || loading || loadingMore) return;
    const sentinel = loadMoreRef.current;
    const container = messagesContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { threshold: 0, root: container, rootMargin: '100px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loading, loadingMore, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (chat) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat?.id]);

  useEffect(() => {
    setExpandedPostId(null);
  }, [channel?.id]);

  useEffect(() => {
    setPinnedIndex(0);
  }, [chat?.id, channel?.id]);

  useEffect(() => {
    if (channel?.id && posts.length > 0) {
      postsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [channel?.id, posts.length]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, [text]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    if (!socket || !chat?.id) return;
    socket.emit('typing_start', { chatId: chat.id });
    if (typingEndTimerRef.current) clearTimeout(typingEndTimerRef.current);
    typingEndTimerRef.current = setTimeout(() => {
      socket.emit('typing_end', { chatId: chat.id });
      typingEndTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (typingEndTimerRef.current) clearTimeout(typingEndTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const current = mediaFiles;
    return () => {
      current.forEach((m) => m?.url && URL.revokeObjectURL(m.url));
    };
  }, [mediaFiles]);

  const formatRecordingTime = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const startRecording = async () => {
    if (!chat?.id && !channel?.id) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const streamToStop = recordingStreamRef.current;
        if (streamToStop) {
          streamToStop.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
        }
        if (audioChunksRef.current.length === 0) return;
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000) return;
        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
        const intent = voiceIntentRef.current;
        if (intent === 'stop') {
          setPendingVoiceFile(file);
          setPendingVoiceDuration(recordingTimeRef.current);
          return;
        }
        const ch = channelRef.current;
        const textToSend = (ch?.id ? textRef.current : '').trim();
        const extraFiles = (mediaFilesRef.current || []).map((m) => m.file).filter(Boolean);
        const allFiles = [file, ...extraFiles];
        try {
          if (ch?.id) {
            const p = onSendPost?.(textToSend, allFiles);
            if (p && typeof p.then === 'function') p.then(() => { setText(''); clearMedia(); });
          } else if (chat?.id) {
            const msg = await sendMessage(chat.id, textToSend || '', allFiles, replyTo?.id);
            onMessageSent?.(msg);
            setReplyTo(null);
            setText('');
            clearMedia();
            setTimeout(scrollToBottom, 100);
          }
        } catch (err) {
          console.error('Ошибка отправки голосового сообщения:', err);
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
        recordingTimeRef.current += 1;
      }, 1000);
    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
      alert('Не удалось получить доступ к микрофону.');
    }
  };

  const stopRecordingOnly = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      voiceIntentRef.current = 'stop';
      mediaRecorderRef.current.stop();
      const streamToStop = recordingStreamRef.current;
      if (streamToStop) {
        streamToStop.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      voiceIntentRef.current = 'send';
      mediaRecorderRef.current.stop();
      const streamToStop = recordingStreamRef.current;
      if (streamToStop) {
        streamToStop.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
  };

  const sendPendingVoice = async () => {
    if (!pendingVoiceFile) return;
    const textToSend = text.trim();
    const file = pendingVoiceFile;
    const extraFiles = mediaFiles.map((m) => m.file).filter(Boolean);
    const allFiles = [file, ...extraFiles];
    setPendingVoiceFile(null);
    setPendingVoiceDuration(0);
    setText('');
    clearMedia();
    try {
      if (channel?.id) {
        const p = onSendPost?.(textToSend, allFiles);
        if (p && typeof p.then === 'function') p.then(() => {});
      } else if (chat?.id) {
        const msg = await sendMessage(chat.id, textToSend || '', allFiles, replyTo?.id);
        onMessageSent?.(msg);
        setReplyTo(null);
        setTimeout(scrollToBottom, 100);
      }
    } catch (err) {
      console.error('Ошибка отправки голосового:', err);
      setPendingVoiceFile(file);
    }
  };

  const cancelPendingVoice = () => {
    setPendingVoiceFile(null);
    setPendingVoiceDuration(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.stop();
      audioChunksRef.current = [];
      const streamToStop = recordingStreamRef.current;
      if (streamToStop) {
        streamToStop.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setRecordingTime(0);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pendingVoiceFile) {
      sendPendingVoice();
      return;
    }
    if (!text.trim() && mediaFiles.length === 0) return;
    if (channel) {
      onSendPost?.(text.trim(), mediaFiles.map((m) => m.file));
      setText('');
      clearMedia();
    } else {
      if (socket && chat?.id) socket.emit('typing_end', { chatId: chat.id });
      if (typingEndTimerRef.current) clearTimeout(typingEndTimerRef.current);
      onSend(text.trim(), mediaFiles.map((m) => m.file), replyTo?.id);
      setText('');
      setReplyTo(null);
      clearMedia();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (pendingVoiceFile) {
        sendPendingVoice();
        return;
      }
      if (text.trim() || mediaFiles.length > 0) {
        if (channel) {
          onSendPost?.(text.trim(), mediaFiles.map((m) => m.file));
          setText('');
          clearMedia();
        } else {
          onSend(text.trim(), mediaFiles.map((m) => m.file), replyTo?.id);
          setText('');
          setReplyTo(null);
          clearMedia();
        }
      }
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const maxSize = 50 * 1024 * 1024; // 50 МБ для документов
    const valid = files.filter((file) => {
      if (!isFileAllowed(file)) return false;
      if (file.size > maxSize) return false;
      return true;
    });
    if (valid.length < files.length) {
      alert('Разрешены: jpg, png, webp, gif, mp4, webm, mp3, wav, ogg, m4a, pdf, zip, doc, docx, xls, xlsx, ppt, pptx, txt, rtf, 7z, rar, csv. Максимум 50 МБ на файл.');
    }
    if (valid.length === 0) return;
    const maxPhotos = 20;
    const maxVideos = 8;
    const maxDocuments = 10;
    const maxTotal = maxPhotos + maxVideos + maxDocuments;
    if (files.length + mediaFiles.length > maxTotal) {
      alert('Максимум 20 фото, 8 видео и 10 документов');
      return;
    }
    setMediaFiles((prev) => {
      const newItems = valid.slice(0, maxTotal - prev.length).map((file) => {
        const type = getFileType(file);
        const url = type === 'document' ? null : URL.createObjectURL(file);
        return { file, url, type, fileName: file.name };
      });
      const combined = [...prev, ...newItems].slice(0, maxTotal);
      const videoCount = combined.filter((m) => m.type === 'video').length;
      const photoCount = combined.filter((m) => m.type === 'image').length;
      const docCount = combined.filter((m) => m.type === 'document').length;
      if (videoCount > maxVideos) {
        newItems.forEach((m) => m.url && URL.revokeObjectURL(m.url));
        alert('Максимум 8 видео в одном сообщении');
        return prev;
      }
      if (photoCount > maxPhotos) {
        newItems.forEach((m) => m.url && URL.revokeObjectURL(m.url));
        alert('Максимум 20 фото в одном сообщении');
        return prev;
      }
      if (docCount > maxDocuments) {
        newItems.forEach((m) => m.url && URL.revokeObjectURL(m.url));
        alert('Максимум 10 документов в одном сообщении');
        return prev;
      }
      return combined;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMediaFile = (index) => {
    setMediaFiles((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1)[0];
      if (removed?.url) URL.revokeObjectURL(removed.url);
      return next;
    });
  };

  const clearMedia = () => {
    mediaFiles.forEach((m) => m.url && URL.revokeObjectURL(m.url));
    setMediaFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const scrollToMessage = (msgId) => {
    const id = String(msgId || '');
    const el = id.startsWith('post-')
      ? document.getElementById(id)
      : messageRefs.current[msgId] || document.getElementById(`msg-${msgId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleMessageContextMenu = (e, msg) => {
    e.preventDefault();
    setMenuMsg({ msg, x: e.clientX, y: e.clientY });
  };

  const handlePostContextMenu = (e, post) => {
    e.preventDefault();
    setMenuPost({ post, x: e.clientX, y: e.clientY });
  };

  const handleEmojiSelect = useCallback((emoji) => {
    const char = emoji?.value ?? emoji?.native ?? (typeof emoji === 'string' ? emoji : '');
    if (char) setText((prev) => (prev || '') + char);
  }, []);

  const handleStickerSend = useCallback((stickerUrl) => {
    if (!stickerUrl || !onSend) return;
    onSend('', null, replyTo?.id, stickerUrl);
    setShowMediaPicker(false);
    setReplyTo(null);
  }, [onSend, replyTo?.id]);

  if (!chat && !channel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white/5 backdrop-blur-md border-l border-white/10">
        <p className="text-gray-500">Выберите чат или канал</p>
      </div>
    );
  }

  const isChannelMode = !!channel;
  const name = isChannelMode ? (channel?.name ?? 'Канал') : (chat?.otherUser?.username || chat?.name || 'Чат');
  const avatar = isChannelMode ? channel?.avatar : chat?.otherUser?.avatar;
  const status = isChannelMode
    ? `${channel._count?.members ?? 0} подписчиков`
    : typingUser
      ? 'Печатает...'
      : chat?.isGroup
        ? `${chat.participantCount ?? 0} участников`
        : (userStatus[chat?.otherUser?.id] === 'online' ? 'в сети' : 'не в сети');

  return (
    <div className="flex-1 flex flex-col bg-white/5 backdrop-blur-md border-l border-white/10 shadow-2xl min-w-0">
      <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
        <div className="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center overflow-hidden flex-shrink-0">
          {(avatar ?? chat?.avatar) ? (
            <img src={avatar ?? chat?.avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-white font-medium">{(name ?? '?')[0]?.toUpperCase() || '?'}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-100 truncate">{name}</div>
          <div className="text-sm text-gray-500 truncate">{status}</div>
        </div>
        {(chat?.isGroup || channel) && (
          <>
            {channel?.isMember && (
              <button
                onClick={async () => {
                  if (!confirm('Отписаться от канала?')) return;
                  try {
                    await onUnsubscribeChannel?.();
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
            {((chat?.isGroup) || (channel && channel.isMember)) && (
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 rounded-xl text-gray-400 hover:bg-white/10 transition-all"
                title={channel ? 'Настройки канала' : 'Настройки группы'}
              >
                <Settings size={20} />
              </button>
            )}
          </>
        )}
      </header>

      {/* Закреплённые сообщения — стеклянная полоска + крестик открепить */}
      {!channel && (() => {
        const list = pinnedMessages || [];
        if (list.length === 0) return null;
        const idx = Math.min(pinnedIndex, list.length - 1);
        const pm = list[idx];
        return (
          <div
            className="sticky top-0 z-40 mx-3 mt-2 mb-1 px-4 py-2.5 flex items-center gap-2.5 cursor-pointer rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.12] transition-all"
            onClick={() => {
              scrollToMessage(pm.id);
              setPinnedIndex((i) => (i + 1) % list.length);
            }}
          >
            <Pin size={16} className="flex-shrink-0 text-slate-400" />
            <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
              <span className="text-sm font-medium text-slate-300 shrink-0">{pm.sender?.username}</span>
              <span className="text-slate-500">·</span>
              <span className="text-sm text-slate-400 truncate">{(pm.content ?? pm.text) || 'Медиа'}</span>
            </div>
            {list.length > 1 && (
              <span className="text-xs text-slate-500 shrink-0">{idx + 1}/{list.length}</span>
            )}
            <ChevronRight size={16} className="flex-shrink-0 text-slate-500" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onUnpin?.(pm.id); }}
              className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors"
              title="Открепить"
            >
              <X size={18} />
            </button>
          </div>
        );
      })()}

      {/* Закреплённые посты — стеклянная полоска + крестик открепить */}
      {channel && (() => {
        const list = pinnedPosts || [];
        if (list.length === 0) return null;
        const idx = Math.min(pinnedIndex, list.length - 1);
        const post = list[idx];
        return (
          <div
            className="sticky top-0 z-40 mx-3 mt-2 mb-1 px-4 py-2.5 flex items-center gap-2.5 cursor-pointer rounded-xl bg-white/[0.08] backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.12] transition-all"
            onClick={() => {
              scrollToMessage(`post-${post.id}`);
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
              onClick={(e) => { e.stopPropagation(); onUnpinPost?.(post.id); }}
              className="p-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors"
              title="Открепить"
            >
              <X size={18} />
            </button>
          </div>
        );
      })()}

      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 pb-8 md:pb-10 space-y-3 flex flex-col w-full">
        {isChannelMode && channel ? (
          postsLoading ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">Загрузка...</div>
          ) : !Array.isArray(posts) ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">Ошибка загрузки</div>
          ) : posts.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">Пока нет постов</div>
          ) : (
            <div className="flex flex-col gap-6 w-full max-w-[680px] mx-auto">
              {posts.map((post) => {
                if (!post?.id) return null;
                const mediaUrls = post.mediaUrls || (post.mediaUrl ? [post.mediaUrl] : []);
                const mediaTypes = post.mediaTypes || (post.mediaType ? [post.mediaType] : []);
                const isStickerPost = mediaUrls.length > 0 && mediaTypes.some((t) => t === 'sticker');
                const audioItems = (mediaUrls || []).map((url, i) => ({ url, type: (mediaTypes || [])[i] })).filter((it) => it.type === 'audio');
                const stickerUrls = isStickerPost ? mediaUrls.filter((_, i) => (mediaTypes[i] || '') === 'sticker') : [];
                const stickerList = isStickerPost ? (stickerUrls.length ? stickerUrls : mediaUrls) : [];
                const stickerCount = stickerList.length;
                const hasOnlyStickers = isStickerPost && !post.content;
                const counts = post.reactionCounts || {};
                const userReacted = post.userReacted;
                const isExpanded = expandedPostId === post.id;
                return (
                  <PostWithViewTracking key={post.id} post={post} user={user}>
                    <div id={`post-${post.id}`} className="w-full flex justify-center scroll-mt-4">
                      <div
                        className={`w-full max-w-[100%] rounded-2xl overflow-hidden ${hasOnlyStickers ? '' : 'bg-white/10 backdrop-blur-sm border border-white/5'} shadow-xl`}
                        onContextMenu={(e) => handlePostContextMenu(e, post)}
                      >
                      {mediaUrls.length > 0 && (
                        <div className="relative w-full">
                          {isStickerPost ? (
                            <div
                              className={`p-2 flex justify-center ${
                                stickerCount === 1
                                  ? 'w-40 h-40 sm:w-48 sm:h-48 mx-auto'
                                  : stickerCount <= 4
                                    ? 'grid grid-cols-2 gap-2 w-fit mx-auto'
                                    : 'grid grid-cols-3 gap-1 w-fit mx-auto'
                              }`}
                            >
                              {stickerList.map((url, idx) => (
                                <img key={idx} src={url} alt="" className="w-full h-auto aspect-square object-contain transition-transform hover:scale-105 cursor-pointer" onClick={() => onOpenMediaViewer?.(mediaUrls, mediaTypes, mediaUrls.indexOf(url), post.author?.username)} />
                              ))}
                            </div>
                          ) : (
                            <>
                              <MediaGrid urls={mediaUrls} types={mediaTypes} className="rounded-t-2xl" onMediaClick={(idx) => onOpenMediaViewer?.(mediaUrls, mediaTypes, idx, post.author?.username)} isOwn={post.authorId === user?.id} />
                              {audioItems.length > 0 && (
                                <div className="px-4 py-3 flex flex-col gap-2 w-full">
                                  {audioItems.map((item, i) => (
                                    <VoiceMessagePlayer
                                      key={i}
                                      src={item.url}
                                      isOwn={post.authorId === user?.id}
                                      timestamp={new Date(post.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                                      fullWidth
                                    />
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      <div className="p-4">
                        {post.forwardedFrom && (
                          <div className="text-xs text-gray-500 mb-2">Переслано от: {post.forwardedFrom}</div>
                        )}
                        {post.content && (
                          <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-gray-200 mb-4">{post.content}</div>
                        )}
                        {channel && !channel.isMember && (
                          <div className="flex items-center gap-2 mb-4">
                            <span className="text-sm text-gray-400">{channel?.name}</span>
                            <button
                              onClick={onJoinChannel}
                              className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                            >
                              Подписаться
                            </button>
                          </div>
                        )}
                        {Object.entries(counts).filter(([, c]) => c > 0).length > 0 && (
                          <div className={`flex flex-wrap items-center gap-1 mb-3 w-fit max-w-full min-w-0`}>
                            {Object.entries(counts)
                              .filter(([, c]) => c > 0)
                              .map(([emoji, count]) => (
                                <button
                                  key={emoji}
                                  onClick={() => onPostReact?.(post.id, emoji)}
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
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => setExpandedPostId((p) => (p === post.id ? null : post.id))}
                            className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <MessageCircle size={16} />
                            {formatCommentCount(post.commentCount)}
                            <ChevronRight size={16} className={isExpanded ? 'rotate-90' : ''} />
                          </button>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Eye size={14} />
                              {formatViews(post.viewCount ?? post._count?.views ?? 0)}
                            </span>
                            <span>{new Date(post.createdAt).toLocaleString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        {isExpanded && (
                          <PostCommentsInline post={post} socket={socket} onClose={() => setExpandedPostId(null)} />
                        )}
                      </div>
                    </div>
                    </div>
                  </PostWithViewTracking>
                );
              })}
              <div ref={postsEndRef} />
            </div>
          )
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">Загрузка...</div>
        ) : (
          <>
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-2">
                {loadingMore ? (
                  <span className="text-sm text-gray-500">Загрузка...</span>
                ) : (
                  <span className="text-sm text-gray-500">↑ Подгрузить ещё</span>
                )}
              </div>
            )}
            {messages.map((msg) => {
            if (msg.isSystem) {
              return (
                <div key={msg.id} className="flex justify-center py-2 w-full">
                  <span className="text-sm text-gray-500 px-3 py-1 rounded-lg bg-white/5">
                    {msg.text ?? msg.content}
                  </span>
                </div>
              );
            }
            const isOwn = msg.senderId === user?.id;
            const mediaUrls = msg.mediaUrls || (msg.mediaUrl ? [msg.mediaUrl] : []);
            const mediaTypes = msg.mediaTypes || (msg.mediaType ? [msg.mediaType] : []);
            const isSticker = mediaUrls.length > 0 && mediaTypes.some((t) => t === 'sticker') && !msg.isDeleted;
            const stickerUrls = isSticker ? mediaUrls.filter((_, i) => (mediaTypes[i] || '') === 'sticker') : [];
            const stickerList = isSticker ? (stickerUrls.length ? stickerUrls : mediaUrls) : [];
            const stickerCount = stickerList.length;
            const hasMedia = mediaUrls.length > 0 && !msg.isDeleted;
            const hasText = !!(msg.content || msg.text) && !msg.isDeleted;
            const showTextBlock = hasText || msg.replyTo || msg.isDeleted;
            const showSenderHeader = chat?.isGroup && !isOwn && msg?.sender;
            return (
              <div
                key={msg.id}
                id={`msg-${msg.id}`}
                ref={(el) => { messageRefs.current[msg.id] = el; }}
                className={`flex w-full flex-shrink-0 ${isOwn ? 'justify-end' : 'justify-start'}`}
                onContextMenu={(e) => handleMessageContextMenu(e, msg)}
              >
                {showSenderHeader ? (
                  <div className="flex gap-2.5 items-start max-w-[95%] min-w-0">
                    <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-white/10 border border-white/5 flex items-center justify-center">
                      {msg.sender?.avatar ? (
                        <img src={msg.sender.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-medium text-gray-400">{msg.sender?.username?.[0]?.toUpperCase() || '?'}</span>
                      )}
                    </div>
                    <div className="flex flex-col min-w-[200px] max-w-full">
                      <span className="text-[13px] font-medium text-blue-400 mb-0.5 max-w-full truncate block">{msg.sender?.username || 'Пользователь'}</span>
                      {msg.forwardedFrom && (
                        <div className="text-[11px] flex items-center gap-1 mb-1 font-medium text-gray-400">
                          <Forward size={12} /> Переслано от: {msg.forwardedFrom}
                        </div>
                      )}
                      {isSticker ? (
                  <div className={`relative flex flex-col w-fit max-w-[85%] sm:max-w-[35%] min-w-0 overflow-hidden ${isOwn ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                    <div
                      className={`relative grid ${
                        stickerCount === 1
                          ? 'w-40 h-40 sm:w-48 sm:h-48'
                          : stickerCount <= 4
                            ? 'grid-cols-2 gap-2'
                            : 'grid-cols-3 gap-1'
                      }`}
                    >
                      {stickerList.map((url, idx) => (
                        <img key={idx} src={url} alt="" className="w-full h-auto aspect-square object-contain transition-transform hover:scale-105" />
                      ))}
                      <div className="absolute bottom-1 right-1 bg-black/30 backdrop-blur-md px-1.5 py-0.5 rounded-full text-[10px] text-white flex items-center gap-1 select-none pointer-events-none">
                        <span>{new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.editedAt && <span>(изм.)</span>}
                        {isOwn && !msg.isDeleted && (msg.isRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
                      </div>
                    </div>
                    {msg.replyTo && (
                      <div className={`mt-1.5 border-l-2 pl-2 opacity-80 text-[15px] leading-snug w-fit ${isOwn ? 'border-blue-300/50' : 'border-white/20'}`}>
                        <span className="font-medium">{msg.replyTo.sender?.username}</span>
                        <p className="truncate">{msg.replyTo.isDeleted ? 'Сообщение удалено' : (msg.replyTo.content ?? msg.replyTo.text)}</p>
                      </div>
                    )}
                    {hasText && (
                      <div className="mt-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-gray-100 text-[15px] leading-snug whitespace-pre-wrap break-words min-w-0 w-fit max-w-full pb-1">
                        {msg.content ?? msg.text}
                      </div>
                    )}
                    {(() => {
                      const seen = new Set();
                      const deduped = (msg.reactions || []).filter((r) => {
                        const key = `${r.userId}|${(r.emoji || '').trim()}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      const groups = deduped.reduce((acc, r) => {
                        const e = (r.emoji || '').trim() || r.emoji || '';
                        const k = e || `_${r.id || r.userId}`;
                        if (!acc[k]) acc[k] = { emoji: r.emoji || e, count: 0, userReacted: false };
                        acc[k].count++;
                        if (r.userId === user?.id) acc[k].userReacted = true;
                        return acc;
                      }, {});
                      const list = Object.values(groups);
                      if (list.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 mt-1 w-fit max-w-full min-w-0">
                          {list.map((g) => (
                            <button
                              key={g.emoji}
                              type="button"
                              onClick={() => g.userReacted ? onRemoveReaction?.(chat.id, msg.id, g.emoji) : onAddReaction?.(chat.id, msg.id, g.emoji)}
                              className={`px-2 py-0.5 rounded-lg text-sm border transition-colors flex items-center gap-1 shrink-0 ${
                                g.userReacted
                                  ? 'bg-blue-500/30 border-blue-500/50 text-white'
                                  : 'bg-white/10 border-white/10 text-gray-200 hover:bg-white/20'
                              }`}
                            >
                              {g.emoji.startsWith('/uploads') ? (
                                <img src={g.emoji} alt="" className="w-6 h-6 object-contain" />
                              ) : (
                                <span>{g.emoji}</span>
                              )}
                              {g.count > 1 && <span>{g.count}</span>}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                <div
                  className={`flex flex-col rounded-2xl shadow-lg relative w-fit ${hasMedia && !isSticker ? 'max-w-[min(420px,90%)]' : 'max-w-[360px]'} h-auto ${hasMedia && !isSticker ? 'overflow-visible' : 'overflow-hidden'} ${isOwn ? 'ml-auto' : 'mr-auto'} ${
                    isOwn
                      ? 'bg-blue-600/80 backdrop-blur-sm rounded-tr-sm text-white'
                      : 'bg-white/10 backdrop-blur-sm border border-white/5 rounded-tl-sm text-gray-100'
                  } p-0`}
                >
                  {msg.forwardedFrom && (
                    <div className={`text-[11px] flex items-center gap-1 mb-1 font-medium px-3 pt-2 ${msg.senderId === user?.id ? 'text-blue-200' : 'text-gray-400'}`}>
                      <Forward size={12} /> Переслано от: {msg.forwardedFrom}
                    </div>
                  )}
                  {hasMedia && !isSticker && (
                    <div className={`relative flex flex-col gap-2 ${mediaUrls.length === 1 && !hasText && !msg.replyTo ? 'w-fit max-w-full' : 'w-full'}`}>
                      {(mediaUrls || []).map((url, idx) => {
                        const isAudio =
                          (url && /\.(webm|mp3|wav|ogg|m4a)$/i.test(url)) ||
                          mediaTypes?.[idx] === 'audio' ||
                          mediaTypes?.[idx] === 'voice';
                        if (isAudio) {
                          return (
                            <VoiceMessagePlayer
                              key={idx}
                              src={url}
                              isOwn={isOwn}
                              timestamp={new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                              isRead={msg.isRead}
                              editedAt={msg.editedAt}
                            />
                          );
                        }
                        return null;
                      })}
                      <MediaGrid urls={mediaUrls} types={mediaTypes} className={mediaUrls.length === 1 && !hasText && !msg.replyTo ? '' : 'w-full'} onMediaClick={(idx) => onOpenMediaViewer?.(mediaUrls, mediaTypes, idx, msg.sender?.username)} isOwn={isOwn} />
                      {!hasText && !msg.replyTo && !(mediaUrls || []).every((url, i) => (url && /\.(webm|mp3|wav|ogg|m4a)$/i.test(url)) || mediaTypes?.[i] === 'audio' || mediaTypes?.[i] === 'voice') && (
                        <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full text-white opacity-100 flex items-center gap-1 select-none pointer-events-none text-[10px]">
                          <span>{new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.editedAt && <span>(изм.)</span>}
                          {isOwn && (msg.isRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
                        </div>
                      )}
                    </div>
                  )}
                  {showTextBlock ? (
                    <div className={`px-3 pt-2 pb-8 min-w-[240px] max-w-full ${hasMedia ? 'bg-inherit' : ''} space-y-1 relative overflow-visible`}>
                      {msg.replyTo && (
                        <div className={`mb-1 border-l-2 pl-2 opacity-80 text-[15px] leading-snug min-w-0 ${isOwn ? 'border-blue-300/50' : 'border-white/20'}`}>
                          <span className="font-medium truncate block max-w-full">{msg.replyTo.sender?.username}</span>
                          <p className="truncate">{msg.replyTo.isDeleted ? 'Сообщение удалено' : (msg.replyTo.content ?? msg.replyTo.text)}</p>
                        </div>
                      )}
                      {msg.isDeleted ? (
                        <div className="italic opacity-70 text-[15px] leading-snug">Сообщение удалено</div>
                      ) : (
                        (msg.content || msg.text) && (
                          <div className="text-[15px] leading-snug text-gray-100 whitespace-pre-wrap break-words min-w-[240px] pb-1">
                            {msg.content ?? msg.text}
                          </div>
                        )
                      )}
                      {(() => {
                        const seen = new Set();
                        const deduped = (msg.reactions || []).filter((r) => {
                          const key = `${r.userId}|${(r.emoji || '').trim()}`;
                          if (seen.has(key)) return false;
                          seen.add(key);
                          return true;
                        });
                        const groups = deduped.reduce((acc, r) => {
                          const e = (r.emoji || '').trim() || r.emoji || '';
                          const k = e || `_${r.id || r.userId}`;
                          if (!acc[k]) acc[k] = { emoji: r.emoji || e, count: 0, userReacted: false };
                          acc[k].count++;
                          if (r.userId === user?.id) acc[k].userReacted = true;
                          return acc;
                        }, {});
                        const list = Object.values(groups);
                        if (list.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-1 w-fit max-w-full min-w-0">
                            {list.map((g) => (
                              <button
                                key={g.emoji}
                                type="button"
                                onClick={() => g.userReacted ? onRemoveReaction?.(chat.id, msg.id, g.emoji) : onAddReaction?.(chat.id, msg.id, g.emoji)}
                                className={`px-2 py-0.5 rounded-lg text-sm border transition-colors flex items-center gap-1 shrink-0 ${
                                  g.userReacted
                                    ? 'bg-blue-500/30 border-blue-500/50 text-white'
                                    : 'bg-white/10 border-white/10 text-gray-200 hover:bg-white/20'
                                }`}
                              >
                                {g.emoji.startsWith('/uploads') ? (
                                  <img src={g.emoji} alt="" className="w-6 h-6 object-contain" />
                                ) : (
                                  <span>{g.emoji}</span>
                                )}
                                {g.count > 1 && <span>{g.count}</span>}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                      <div className={`absolute bottom-1 right-2 flex items-center gap-1 select-none pointer-events-none opacity-60 text-[10px] ${isOwn ? 'text-blue-200' : 'text-gray-500'}`}>
                        <span>{new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.editedAt && <span>(изм.)</span>}
                        {isOwn && !msg.isDeleted && (msg.isRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
                      </div>
                    </div>
                  ) : (() => {
                    const seen = new Set();
                    const deduped = (msg.reactions || []).filter((r) => {
                      const key = `${r.userId}|${(r.emoji || '').trim()}`;
                      if (seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    });
                    const groups = deduped.reduce((acc, r) => {
                      const e = (r.emoji || '').trim() || r.emoji || '';
                      const k = e || `_${r.id || r.userId}`;
                      if (!acc[k]) acc[k] = { emoji: r.emoji || e, count: 0, userReacted: false };
                      acc[k].count++;
                      if (r.userId === user?.id) acc[k].userReacted = true;
                      return acc;
                    }, {});
                    const list = Object.values(groups);
                    if (list.length === 0) return null;
                    return (
                      <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1 w-fit max-w-full min-w-0">
                        {list.map((g) => (
                          <button
                            key={g.emoji}
                            type="button"
                            onClick={() => g.userReacted ? onRemoveReaction?.(chat.id, msg.id, g.emoji) : onAddReaction?.(chat.id, msg.id, g.emoji)}
                            className={`px-2 py-0.5 rounded-lg text-sm border transition-colors flex items-center gap-1 shrink-0 ${
                              g.userReacted
                                ? 'bg-blue-500/30 border-blue-500/50 text-white'
                                : 'bg-white/10 border-white/10 text-gray-200 hover:bg-white/20'
                            }`}
                          >
                            {g.emoji.startsWith('/uploads') ? (
                              <img src={g.emoji} alt="" className="w-6 h-6 object-contain" />
                            ) : (
                              <span>{g.emoji}</span>
                            )}
                            {g.count > 1 && <span>{g.count}</span>}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                )}
                    </div>
                  </div>
                ) : isSticker ? (
                  <div className={`relative flex flex-col w-fit max-w-[85%] sm:max-w-[35%] min-w-0 overflow-hidden ${isOwn ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                    <div className={`relative grid ${stickerCount === 1 ? 'w-40 h-40 sm:w-48 sm:h-48' : stickerCount <= 4 ? 'grid-cols-2 gap-2' : 'grid-cols-3 gap-1'}`}>
                      {stickerList.map((url, idx) => (
                        <img key={idx} src={url} alt="" className="w-full h-auto aspect-square object-contain transition-transform hover:scale-105" />
                      ))}
                      <div className="absolute bottom-1 right-1 bg-black/30 backdrop-blur-md px-1.5 py-0.5 rounded-full text-[10px] text-white flex items-center gap-1 select-none pointer-events-none">
                        <span>{new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                        {msg.editedAt && <span>(изм.)</span>}
                        {isOwn && !msg.isDeleted && (msg.isRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
                      </div>
                    </div>
                    {msg.replyTo && (
                      <div className={`mt-1.5 border-l-2 pl-2 opacity-80 text-[15px] leading-snug w-fit ${isOwn ? 'border-blue-300/50' : 'border-white/20'}`}>
                        <span className="font-medium">{msg.replyTo.sender?.username}</span>
                        <p className="truncate">{msg.replyTo.isDeleted ? 'Сообщение удалено' : (msg.replyTo.content ?? msg.replyTo.text)}</p>
                      </div>
                    )}
                    {hasText && (
                      <div className="mt-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/10 text-gray-100 text-[15px] leading-snug whitespace-pre-wrap break-words min-w-0 w-fit max-w-full pb-1">
                        {msg.content ?? msg.text}
                      </div>
                    )}
                    {(() => {
                      const seen = new Set();
                      const deduped = (msg.reactions || []).filter((r) => {
                        const key = `${r.userId}|${(r.emoji || '').trim()}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      const groups = deduped.reduce((acc, r) => {
                        const e = (r.emoji || '').trim() || r.emoji || '';
                        const k = e || `_${r.id || r.userId}`;
                        if (!acc[k]) acc[k] = { emoji: r.emoji || e, count: 0, userReacted: false };
                        acc[k].count++;
                        if (r.userId === user?.id) acc[k].userReacted = true;
                        return acc;
                      }, {});
                      const list = Object.values(groups);
                      if (list.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 mt-1 w-fit max-w-full min-w-0">
                          {list.map((g) => (
                            <button key={g.emoji} type="button" onClick={() => g.userReacted ? onRemoveReaction?.(chat.id, msg.id, g.emoji) : onAddReaction?.(chat.id, msg.id, g.emoji)} className={`px-2 py-0.5 rounded-lg text-sm border transition-colors flex items-center gap-1 shrink-0 ${g.userReacted ? 'bg-blue-500/30 border-blue-500/50 text-white' : 'bg-white/10 border-white/10 text-gray-200 hover:bg-white/20'}`}>
                              {g.emoji.startsWith('/uploads') ? <img src={g.emoji} alt="" className="w-6 h-6 object-contain" /> : <span>{g.emoji}</span>}
                              {g.count > 1 && <span>{g.count}</span>}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className={`flex flex-col rounded-2xl shadow-lg relative w-fit ${hasMedia && !isSticker ? 'max-w-[min(420px,90%)]' : 'max-w-[360px]'} h-auto ${hasMedia && !isSticker ? 'overflow-visible' : 'overflow-hidden'} ${isOwn ? 'ml-auto' : 'mr-auto'} ${isOwn ? 'bg-blue-600/80 backdrop-blur-sm rounded-tr-sm text-white' : 'bg-white/10 backdrop-blur-sm border border-white/5 rounded-tl-sm text-gray-100'} p-0`}>
                    {hasMedia && !isSticker && (
                      <div className={`relative flex flex-col gap-2 ${mediaUrls.length === 1 && !hasText && !msg.replyTo ? 'w-fit max-w-full' : 'w-full'}`}>
                        {(mediaUrls || []).map((url, idx) => {
                          const isAudio =
                            (url && /\.(webm|mp3|wav|ogg|m4a)$/i.test(url)) ||
                            mediaTypes?.[idx] === 'audio' ||
                            mediaTypes?.[idx] === 'voice';
                          if (isAudio) {
                            return (
                              <VoiceMessagePlayer
                                key={idx}
                                src={url}
                                isOwn={isOwn}
                                timestamp={new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                                isRead={msg.isRead}
                                editedAt={msg.editedAt}
                              />
                            );
                          }
                          return null;
                        })}
                        <MediaGrid urls={mediaUrls} types={mediaTypes} className={mediaUrls.length === 1 && !hasText && !msg.replyTo ? '' : 'w-full'} onMediaClick={(idx) => onOpenMediaViewer?.(mediaUrls, mediaTypes, idx, msg.sender?.username)} isOwn={isOwn} />
                        {!hasText && !msg.replyTo && !(mediaUrls || []).every((url, i) => (url && /\.(webm|mp3|wav|ogg|m4a)$/i.test(url)) || mediaTypes?.[i] === 'audio' || mediaTypes?.[i] === 'voice') && (
                          <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full text-white opacity-100 flex items-center gap-1 select-none pointer-events-none text-[10px]">
                            <span>{new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                            {msg.editedAt && <span>(изм.)</span>}
                            {isOwn && (msg.isRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
                          </div>
                        )}
                      </div>
                    )}
                    {showTextBlock ? (
                      <div className={`px-3 pt-2 pb-8 min-w-[240px] max-w-full ${hasMedia ? 'bg-inherit' : ''} space-y-1 relative overflow-visible`}>
                        {msg.replyTo && (
                          <div className={`mb-1 border-l-2 pl-2 opacity-80 text-[15px] leading-snug ${isOwn ? 'border-blue-300/50' : 'border-white/20'}`}>
                            <span className="font-medium">{msg.replyTo.sender?.username}</span>
                            <p className="truncate">{msg.replyTo.isDeleted ? 'Сообщение удалено' : (msg.replyTo.content ?? msg.replyTo.text)}</p>
                          </div>
                        )}
                        {msg.isDeleted ? (
                          <div className="italic opacity-70 text-[15px] leading-snug">Сообщение удалено</div>
                        ) : (msg.content || msg.text) && (
                          <div className="text-[15px] leading-snug text-gray-100 whitespace-pre-wrap break-words min-w-[240px] pb-1">{msg.content ?? msg.text}</div>
                        )}
                        {(() => {
                          const seen = new Set();
                          const deduped = (msg.reactions || []).filter((r) => {
                            const key = `${r.userId}|${(r.emoji || '').trim()}`;
                            if (seen.has(key)) return false;
                            seen.add(key);
                            return true;
                          });
                          const groups = deduped.reduce((acc, r) => {
                            const e = (r.emoji || '').trim() || r.emoji || '';
                            const k = e || `_${r.id || r.userId}`;
                            if (!acc[k]) acc[k] = { emoji: r.emoji || e, count: 0, userReacted: false };
                            acc[k].count++;
                            if (r.userId === user?.id) acc[k].userReacted = true;
                            return acc;
                          }, {});
                          const list = Object.values(groups);
                          if (list.length === 0) return null;
                          return (
                            <div className="flex flex-wrap gap-1 w-fit max-w-full min-w-0">
                              {list.map((g) => (
                                <button key={g.emoji} type="button" onClick={() => g.userReacted ? onRemoveReaction?.(chat.id, msg.id, g.emoji) : onAddReaction?.(chat.id, msg.id, g.emoji)} className={`px-2 py-0.5 rounded-lg text-sm border transition-colors flex items-center gap-1 shrink-0 ${g.userReacted ? 'bg-blue-500/30 border-blue-500/50 text-white' : 'bg-white/10 border-white/10 text-gray-200 hover:bg-white/20'}`}>
                                  {g.emoji.startsWith('/uploads') ? <img src={g.emoji} alt="" className="w-6 h-6 object-contain" /> : <span>{g.emoji}</span>}
                                  {g.count > 1 && <span>{g.count}</span>}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                        <div className={`absolute bottom-1 right-2 flex items-center gap-1 select-none pointer-events-none opacity-60 text-[10px] ${isOwn ? 'text-blue-200' : 'text-gray-500'}`}>
                          <span>{new Date(msg.createdAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.editedAt && <span>(изм.)</span>}
                          {isOwn && !msg.isDeleted && (msg.isRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />)}
                        </div>
                      </div>
                    ) : (() => {
                      const seen = new Set();
                      const deduped = (msg.reactions || []).filter((r) => {
                        const key = `${r.userId}|${(r.emoji || '').trim()}`;
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                      });
                      const groups = deduped.reduce((acc, r) => {
                        const e = (r.emoji || '').trim() || r.emoji || '';
                        const k = e || `_${r.id || r.userId}`;
                        if (!acc[k]) acc[k] = { emoji: r.emoji || e, count: 0, userReacted: false };
                        acc[k].count++;
                        if (r.userId === user?.id) acc[k].userReacted = true;
                        return acc;
                      }, {});
                      const list = Object.values(groups);
                      if (list.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 px-2 pb-2 pt-1 w-fit max-w-full min-w-0">
                          {list.map((g) => (
                            <button key={g.emoji} type="button" onClick={() => g.userReacted ? onRemoveReaction?.(chat.id, msg.id, g.emoji) : onAddReaction?.(chat.id, msg.id, g.emoji)} className={`px-2 py-0.5 rounded-lg text-sm border transition-colors flex items-center gap-1 shrink-0 ${g.userReacted ? 'bg-blue-500/30 border-blue-500/50 text-white' : 'bg-white/10 border-white/10 text-gray-200 hover:bg-white/20'}`}>
                              {g.emoji.startsWith('/uploads') ? <img src={g.emoji} alt="" className="w-6 h-6 object-contain" /> : <span>{g.emoji}</span>}
                              {g.count > 1 && <span>{g.count}</span>}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {reactionMsg && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setReactionMsg(null)}
        >
          <div
            className="absolute z-50"
            onClick={(e) => e.stopPropagation()}
            style={{ left: reactionMsg.x, top: reactionMsg.y }}
          >
            <MediaPicker
              onSelect={(item) => {
                if (onAddReaction && chat?.id) {
                  if (item.type === 'emoji') {
                    onAddReaction(chat.id, reactionMsg.msg.id, item.value);
                    setReactionMsg(null);
                  } else if (item.type === 'sticker' && item.url) {
                    onAddReaction(chat.id, reactionMsg.msg.id, item.url);
                    setReactionMsg(null);
                  }
                }
              }}
            />
          </div>
        </div>
      )}

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
                if (value && onPostReact) {
                  onPostReact(reactionPost.post.id, value);
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
              (pinnedPosts || []).some((pp) => pp?.id === menuPost.post?.id) ? (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                  onClick={() => { onUnpinPost(menuPost.post?.id); setMenuPost(null); }}
                >
                  <Pin size={16} /> Открепить
                </button>
              ) : (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
                  onClick={() => { onPinPost(menuPost.post?.id); setMenuPost(null); }}
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

      {menuMsg && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setMenuMsg(null)}
        >
          <div
            className="absolute bg-white/10 backdrop-blur-md border border-white/10 rounded-xl px-2 py-1 shadow-2xl min-w-[160px]"
            onClick={(e) => e.stopPropagation()}
            style={{ left: menuMsg.x, top: menuMsg.y }}
          >
            <button
              className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
              onClick={() => { setReplyTo(menuMsg.msg); setMenuMsg(null); }}
            >
              Ответить
            </button>
            <button
              className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
              onClick={() => { setReactionMsg({ msg: menuMsg.msg, x: menuMsg.x, y: menuMsg.y }); setMenuMsg(null); }}
            >
              Добавить реакцию
            </button>
            {menuMsg.msg?.senderId === user?.id && !menuMsg.msg?.isDeleted && (
              <>
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
                  onClick={() => { setEditingMsg(menuMsg.msg); setMenuMsg(null); }}
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/10 rounded-lg transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(menuMsg.msg?.id);
                    setTimeout(() => setMenuMsg(null), 0);
                  }}
                >
                  Удалить
                </button>
              </>
            )}
            {(!chat?.isGroup || chat?.isAdmin) && (
              (pinnedMessages || []).some((pm) => pm?.id === menuMsg.msg?.id) ? (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
                  onClick={() => { onUnpin(menuMsg.msg?.id); setMenuMsg(null); }}
                >
                  Открепить
                </button>
              ) : (
                <>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
                    onClick={() => { onPin(menuMsg.msg?.id, 'personal'); setMenuMsg(null); }}
                  >
                    Закрепить у себя
                  </button>
                  <button
                    className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
                    onClick={() => { onPin(menuMsg.msg?.id, 'all'); setMenuMsg(null); }}
                  >
                    Закрепить у всех
                  </button>
                </>
              )
            )}
          </div>
        </div>
      )}

      {showSettings && chat && (
        <GroupSettingsModal
          data={chat}
          currentUser={user}
          userStatus={userStatus}
          onClose={(opts) => {
            setShowSettings(false);
            if (opts?.left || opts?.deleted) onCloseSettings?.(opts);
          }}
          onUpdate={(updated) => {
            onUpdateChat?.(updated);
          }}
        />
      )}
      {showSettings && channel && (
        <ChannelSettingsModal
          data={channel}
          currentUser={user}
          onClose={(opts) => {
            setShowSettings(false);
            if (opts?.left || opts?.deleted) onCloseChannel?.(opts);
          }}
          onUpdate={(updated) => {
            onUpdateChannel?.(updated);
          }}
        />
      )}
      {editingMsg && !channel && (
        <div className="flex-shrink-0 mx-4 mb-2 p-3 rounded-xl bg-white/10 border border-white/10 flex items-center gap-2">
          <span className="text-sm text-gray-500">Редактирование:</span>
          <input
            type="text"
            defaultValue={editingMsg.content ?? editingMsg.text}
            className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const val = e.target.value.trim();
                if (val) onEdit(editingMsg.id, val);
                setEditingMsg(null);
              }
              if (e.key === 'Escape') setEditingMsg(null);
            }}
            autoFocus
          />
          <button
            type="button"
            className="text-gray-400 hover:text-white text-sm"
            onClick={() => setEditingMsg(null)}
          >
            Отмена
          </button>
        </div>
      )}

      {replyTo && !channel && (
        <div className="flex-shrink-0 mx-4 mb-2 p-3 rounded-xl bg-white/10 border-l-4 border-blue-500/50 flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-xs text-blue-400 font-medium">{replyTo.sender?.username}</span>
            <p className="text-sm text-gray-300 truncate">{replyTo.isDeleted ? 'Сообщение удалено' : (replyTo.content ?? replyTo.text)}</p>
          </div>
          <button type="button" className="text-gray-400 hover:text-white ml-2" onClick={() => setReplyTo(null)}>×</button>
        </div>
      )}

      {channel && !channel.isMember ? (
        <div className="flex-shrink-0 p-4 pb-6 md:pb-8">
          <button
            type="button"
            onClick={onJoinChannel}
            className="w-full py-3 rounded-2xl bg-blue-600/80 hover:bg-blue-500/80 backdrop-blur-sm text-white font-medium border border-blue-500/30 transition-all"
          >
            Подписаться
          </button>
        </div>
      ) : channel && channel.isMember && !(channel.creatorId === user?.id || channel.isAdmin || channel.canPost) ? (
        <div className="flex-shrink-0 p-4 pb-6 md:pb-8">
          <div className="flex items-center justify-center py-3 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 text-gray-500 text-sm">
            Вы не можете отправлять сообщения в этот канал
          </div>
        </div>
      ) : (
      <form className="flex-shrink-0 p-4 pb-6 md:pb-8" onSubmit={handleSubmit}>
        {mediaFiles.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-3 mb-2 no-scrollbar">
            {mediaFiles.map((item, i) => (
              <div key={i} className="relative flex-shrink-0">
                {item.type === 'document' ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border border-blue-500/30 min-w-[140px]">
                    <div className="w-10 h-10 rounded-lg bg-black/20 flex items-center justify-center flex-shrink-0">
                      <FileText size={20} className="text-blue-400" />
                    </div>
                    <span className="text-xs text-gray-200 truncate max-w-[90px]" title={item.fileName}>{getFriendlyFileName(item.fileName || 'Файл')}</span>
                  </div>
                ) : item.type === 'video' ? (
                  <video src={item.url} className="h-16 w-16 rounded-lg object-cover" muted />
                ) : (
                  <img src={item.url} alt="" className="h-16 w-16 rounded-lg object-cover" />
                )}
                <button
                  type="button"
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/50 text-white flex items-center justify-center text-xs hover:bg-black/70 transition-colors"
                  onClick={() => removeMediaFile(i)}
                  aria-label="Удалить"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div ref={inputContainerRef} className="relative flex items-end gap-2 bg-white/10 backdrop-blur-2xl border border-white/20 rounded-[28px] p-2 shadow-2xl w-full max-w-5xl mx-auto transition-all duration-300">
          {showMediaPicker && (
            <>
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setShowMediaPicker(false)}
                aria-hidden="true"
                style={{ backgroundColor: 'transparent' }}
              />
              <div
                className="absolute bottom-full left-2 mb-2 z-[110]"
                onClick={(e) => e.stopPropagation()}
              >
                <MediaPicker
                  onSelect={(item) => {
                    if (!item) return;
                    if (item.type === 'emoji') {
                      handleEmojiSelect(item);
                    } else if (item.type === 'sticker' && item.url) {
                      handleStickerSend(item.url);
                    }
                  }}
                />
              </div>
            </>
          )}
          <button
            type="button"
            className="shrink-0 p-3 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer flex items-center justify-center"
            onClick={() => fileInputRef.current?.click()}
            title="Прикрепить файл"
          >
            <Paperclip size={20} />
          </button>
          <button
            type="button"
            className="shrink-0 p-3 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer flex items-center justify-center"
            onClick={() => setShowMediaPicker((v) => !v)}
            title="Эмодзи и стикеры"
          >
            <Smile size={20} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,audio/webm,audio/mp3,audio/mpeg,application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,application/rtf,text/csv,.pdf,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.csv,.7z,.rar"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {pendingVoiceFile && (
              <div className="flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 rounded-2xl px-4 py-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Mic size={20} className="text-blue-400 shrink-0" />
                <span className="text-blue-300 font-mono text-sm">{formatRecordingTime(pendingVoiceDuration)}</span>
                <span className="flex-1 text-sm text-gray-300">Голосовое записано</span>
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancelPendingVoice(); }} className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors" title="Удалить"> <X size={18} /> </button>
              </div>
            )}
            {isRecording && (
              <div className="flex items-center justify-between bg-black/40 border border-red-500/30 rounded-2xl px-4 py-2 h-[52px] shadow-inner shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                  <span className="text-red-400 font-mono text-lg">{formatRecordingTime(recordingTime)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); stopRecordingOnly(); }} className="text-gray-400 hover:text-emerald-400 p-2 rounded-lg hover:bg-emerald-500/10 transition-colors" title="Остановить запись">
                    <Square size={18} className="fill-current" />
                  </button>
                  <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); cancelRecording(); }} className="text-gray-400 hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors" title="Отменить">
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={isRecording ? (channel ? 'Добавить текст к голосовому...' : 'Добавить текст...') : (channel ? 'Написать пост...' : 'Сообщение...')}
              maxLength={2000}
              rows={1}
              className="flex-1 w-full min-w-0 bg-transparent border-none focus:outline-none text-gray-100 placeholder-gray-500 max-h-32 overflow-y-auto resize-none py-2 px-3"
            />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (pendingVoiceFile) sendPendingVoice();
              else if (isRecording) stopRecordingAndSend();
              else if (text.trim().length > 0 || mediaFiles.length > 0) handleSubmit(e);
              else startRecording();
            }}
            className={`shrink-0 p-3 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
              isRecording || pendingVoiceFile || text.trim().length > 0 || mediaFiles.length > 0
                ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30 scale-95 hover:scale-100'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/30 scale-95 hover:scale-100'
            }`}
            title={pendingVoiceFile ? 'Отправить' : isRecording ? 'Отправить сразу' : text.trim().length > 0 || mediaFiles.length > 0 ? 'Отправить' : 'Записать голосовое'}
          >
            {pendingVoiceFile || isRecording || text.trim().length > 0 || mediaFiles.length > 0 ? (
              <Send size={22} className="shrink-0" />
            ) : (
              <Mic size={24} />
            )}
          </button>
        </div>
      </form>
      )}
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
  const [chatFilter, setChatFilter] = useState('personal'); // 'personal' | 'group' | 'channels'
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [typingUser, setTypingUser] = useState(null);
  const [storyFeed, setStoryFeed] = useState([]);
  const storyFileInputRef = useRef(null);
  const [storyViewer, setStoryViewer] = useState(null); // { initialUserIndex }
  const [selectedStoryFile, setSelectedStoryFile] = useState(null);
  const [, setForceRender] = useState(0);
  const [viewerData, setViewerData] = useState({ isOpen: false, images: [], types: [], index: 0 });
  const [forwardData, setForwardData] = useState(null);

  const openViewer = (images, types, index = 0, forwardedFrom = null) => {
    setViewerData({ isOpen: true, images: images || [], types: types || [], index, forwardedFrom });
  };

  const closeViewer = () => {
    setViewerData((prev) => ({ ...prev, isOpen: false }));
  };

  const nextMedia = (e) => {
    e?.stopPropagation();
    setViewerData((prev) => ({ ...prev, index: (prev.index + 1) % prev.images.length }));
  };

  const prevMedia = (e) => {
    e?.stopPropagation();
    setViewerData((prev) => ({ ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length }));
  };

  const handleViewerDownload = async (e) => {
    e?.stopPropagation();
    const imageUrl = viewerData.images[viewerData.index];
    if (!imageUrl) return;
    const mediaType = viewerData.types[viewerData.index] || 'image';
    const ext = mediaType === 'video' ? 'mp4' : 'jpg';
    const fileName = `photo_${Date.now()}.${ext}`;
    const fullUrl = imageUrl.startsWith('http') || imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')
      ? imageUrl
      : (window.location.origin + (imageUrl.startsWith('/') ? '' : '/') + imageUrl);
    try {
      const response = await fetch(fullUrl);
      if (!response.ok) throw new Error('Fetch failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Ошибка при скачивании файла:', error);
      alert('Не удалось скачать файл. Попробуйте еще раз.');
    }
  };

  const handleViewerForward = (e) => {
    e?.stopPropagation();
    const url = viewerData.images[viewerData.index];
    if (!url) return;
    const sourceName = selectedChannel ? selectedChannel.name : (selectedChat?.isGroup ? selectedChat.name : selectedChat?.otherUser?.username);
    closeViewer();
    setForwardData({ mediaUrl: url, mediaUrls: viewerData.images, forwardedFrom: sourceName || null });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!viewerData.isOpen) return;
      if (e.key === 'Escape') closeViewer();
      if (e.key === 'ArrowRight') nextMedia();
      if (e.key === 'ArrowLeft') prevMedia();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerData.isOpen]);

  useEffect(() => {
    const handleView = () => setForceRender((prev) => prev + 1);
    window.addEventListener('story_viewed', handleView);
    return () => window.removeEventListener('story_viewed', handleView);
  }, []);

  useEffect(() => {
    if (forwardData && channels.length === 0) getChannels().then(setChannels).catch(console.error);
  }, [forwardData]);

  const handleConfirmStoryUpload = async (file, textOverlay, mediaSettings) => {
    await uploadStory(file, textOverlay, mediaSettings);
    setSelectedStoryFile(null);
    loadStoryFeed();
  };

  const loadStoryFeed = () => {
    getStoryFeed().then(setStoryFeed).catch(console.error);
  };

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
    loadStoryFeed();
  }, []);

  useEffect(() => {
    if (chatFilter === 'channels') {
      getChannels().then(setChannels).catch(console.error);
    }
  }, [chatFilter]);

  useEffect(() => {
    if (!socket) return;
    if (selectedChat) socket.emit('join_chat', selectedChat.id);
    return () => {
      if (selectedChat) socket.emit('leave_chat', selectedChat.id);
    };
  }, [socket, selectedChat?.id]);

  useEffect(() => {
    if (!socket) return;
    if (selectedChannel) socket.emit('join_channel', selectedChannel.id);
    return () => {
      if (selectedChannel) socket.emit('leave_channel', selectedChannel.id);
    };
  }, [socket, selectedChannel?.id]);

  useEffect(() => {
    if (!selectedChat) setTypingUser(null);
  }, [selectedChat?.id]);

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
              text: message.content ?? message.text,
              content: message.content ?? message.text,
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
    socket.on('message_pinned', ({ chatId, pinnedMessages }) => {
      const list = pinnedMessages || [];
      setChats((prev) =>
        prev.map((c) => (c.id === chatId ? { ...c, pinnedMessages: list } : c))
      );
      setSelectedChat((c) => (c?.id === chatId ? { ...c, pinnedMessages: list } : c));
    });
    socket.on('messages_read', ({ chatId, readBy, readAt }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.chatId !== chatId) return m;
          if (readAt && readBy !== user?.id) {
            const msgTime = new Date(m.createdAt).getTime();
            const readTime = new Date(readAt).getTime();
            if (m.senderId === user?.id && msgTime <= readTime) return { ...m, isRead: true };
          }
          if (!readAt) return { ...m, isRead: true };
          return m;
        })
      );
    });
    socket.on('typing_start', ({ chatId, userId }) => {
      if (chatId === selectedChat?.id && userId !== user?.id) setTypingUser(userId);
    });
    socket.on('typing_end', ({ chatId }) => {
      if (chatId === selectedChat?.id) setTypingUser(null);
    });
    socket.on('message_edited', (updated) => {
      if (updated.chatId === selectedChat?.id) {
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      }
    });
    socket.on('message_deleted', (updated) => {
      if (updated.chatId === selectedChat?.id) {
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      }
    });
    socket.on('message_reaction', (updated) => {
      if (updated.chatId === selectedChat?.id) {
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      }
    });
    socket.on('message_reaction_updated', (payload) => {
      if (payload.chatId !== selectedChat?.id) return;
      const { messageId, reaction, type } = payload;
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = m.reactions || [];
          if (type === 'added' && reaction) {
            const emojiNorm = (reaction.emoji || '').trim();
            const alreadyExists = reactions.some(
              (r) =>
                r.id === reaction.id ||
                (r.userId === reaction.userId && ((r.emoji || '').trim() === emojiNorm || r.emoji === reaction.emoji))
            );
            if (alreadyExists) return m;
            return { ...m, reactions: [...reactions, reaction] };
          }
          if (type === 'removed' && reaction) {
            const emojiNorm = (reaction.emoji || '').trim();
            return {
              ...m,
              reactions: reactions.filter(
                (r) =>
                  !(
                    r.userId === reaction.userId &&
                    ((r.emoji || '').trim() === emojiNorm || r.emoji === reaction.emoji || r.emoji === reaction.emoji?.trim())
                  )
              ),
            };
          }
          return m;
        })
      );
    });
    socket.on('new_story', () => {
      getStoryFeed().then(setStoryFeed).catch(console.error);
    });
    return () => {
      socket.off('receive_message');
      socket.off('user_status');
      socket.off('message_pinned');
      socket.off('messages_read');
      socket.off('typing_start');
      socket.off('typing_end');
      socket.off('message_edited');
      socket.off('message_deleted');
      socket.off('message_reaction');
      socket.off('message_reaction_updated');
      socket.off('new_story');
    };
  }, [socket, selectedChat?.id, user?.id]);

  useEffect(() => {
    if (!socket || !selectedChannel?.id) return;
    const onNewPost = (post) => {
      if (post.channelId !== selectedChannel.id) return;
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
    };
    socket.on('new_post', onNewPost);
    socket.on('post_reaction', onPostReaction);
    socket.on('new_comment', onNewComment);
    return () => {
      socket.off('new_post', onNewPost);
      socket.off('post_reaction', onPostReaction);
      socket.off('new_comment', onNewComment);
    };
  }, [socket, selectedChannel?.id]);

  const [messagesNextCursor, setMessagesNextCursor] = useState(null);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const selectChat = (chat) => {
    setSelectedChannel(null);
    setSelectedChat(chat);
    setMessagesLoading(true);
    setMessagesNextCursor(null);
    setMessagesHasMore(false);
    Promise.all([getChat(chat.id), getMessages(chat.id)])
      .then(([fullChat, data]) => {
        setSelectedChat((c) => (c?.id === chat.id ? { ...chat, ...fullChat } : c));
        setMessages(data.messages || data);
        setMessagesNextCursor(data.nextCursor || null);
        setMessagesHasMore(data.hasMore || false);
        markChatRead(chat.id);
        if (socket) socket.emit('mark_as_read', { chatId: chat.id });
      })
      .catch(console.error)
      .finally(() => setMessagesLoading(false));

    setChats((prev) =>
      prev.map((c) => (c.id === chat.id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const loadingChannelIdRef = useRef(null);
  const selectChannel = (ch) => {
    if (!ch?.id) return;
    setSelectedChat(null);
    setSelectedChannel(ch);
    setPosts([]);
    setPostsLoading(true);
    loadingChannelIdRef.current = ch.id;
    getChannel(ch.id)
      .then((full) => setSelectedChannel((prev) => (prev?.id === ch.id ? { ...ch, ...full } : prev)))
      .catch((e) => { console.error(e); loadingChannelIdRef.current = null; });
    getChannelPosts(ch.id)
      .then((data) => {
        const raw = Array.isArray(data) ? data : (data?.posts || data?.items || []);
        const newPosts = [...raw].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        setPosts((prev) => (loadingChannelIdRef.current === ch.id ? newPosts : prev));
      })
      .catch((e) => { console.error(e); })
      .finally(() => {
        if (loadingChannelIdRef.current === ch.id) setPostsLoading(false);
      });
  };

  const loadMoreMessages = () => {
    if (!selectedChat || !messagesNextCursor || loadingMore) return;
    setLoadingMore(true);
    getMessages(selectedChat.id, messagesNextCursor)
      .then((data) => {
        const newMsgs = data.messages || [];
        setMessages((prev) => [...newMsgs, ...prev]);
        setMessagesNextCursor(data.nextCursor || null);
        setMessagesHasMore(data.hasMore || false);
      })
      .catch(console.error)
      .finally(() => setLoadingMore(false));
  };

  const handlePin = (messageId, visibility = 'all') => {
    if (!selectedChat) return;
    pinMessage(selectedChat.id, messageId, visibility)
      .then(({ pinnedMessages }) => {
        const list = pinnedMessages || [];
        setSelectedChat((c) => (c ? { ...c, pinnedMessages: list } : c));
        setChats((prev) =>
          prev.map((c) => (c.id === selectedChat.id ? { ...c, pinnedMessages: list } : c))
        );
      })
      .catch((e) => alert(e.message || 'Ошибка закрепления'));
  };

  const handleEditMessage = (messageId, text) => {
    if (!selectedChat) return;
    editMessage(selectedChat.id, messageId, text)
      .then((updated) => {
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      })
      .catch(console.error);
  };

  const handleDeleteMessage = (messageId) => {
    if (!selectedChat) return;
    deleteMessage(selectedChat.id, messageId)
      .then((updated) => {
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      })
      .catch(console.error);
  };

  const handleUnpin = (messageId) => {
    if (!selectedChat) return;
    unpinMessage(selectedChat.id, messageId)
      .then(({ pinnedMessages }) => {
        const list = pinnedMessages || [];
        setSelectedChat((c) => (c ? { ...c, pinnedMessages: list } : c));
        setChats((prev) =>
          prev.map((c) => (c.id === selectedChat.id ? { ...c, pinnedMessages: list } : c))
        );
      })
      .catch(console.error);
  };

  const handlePinPost = (postId) => {
    if (!selectedChannel) return;
    pinPost(selectedChannel.id, postId)
      .then(({ pinnedPosts }) => {
        setSelectedChannel((c) => (c ? { ...c, pinnedPosts: pinnedPosts || [] } : c));
        setChannels((prev) =>
          prev.map((c) => (c.id === selectedChannel.id ? { ...c, pinnedPosts: pinnedPosts || [] } : c))
        );
      })
      .catch(console.error);
  };

  const handleUnpinPost = (postId) => {
    if (!selectedChannel) return;
    unpinPost(selectedChannel.id, postId)
      .then(({ pinnedPosts }) => {
        setSelectedChannel((c) => (c ? { ...c, pinnedPosts: pinnedPosts || [] } : c));
        setChannels((prev) =>
          prev.map((c) => (c.id === selectedChannel.id ? { ...c, pinnedPosts: pinnedPosts || [] } : c))
        );
      })
      .catch(console.error);
  };

  const handleSendMessage = (text, mediaFiles = null, replyToId = null, stickerUrl = null) => {
    if (!selectedChat) return;
    const hasMedia = Array.isArray(mediaFiles) ? mediaFiles.length > 0 : !!mediaFiles;
    if (!text?.trim() && !hasMedia && !stickerUrl) return;
    sendMessage(selectedChat.id, text, mediaFiles, replyToId, stickerUrl)
      .then((msg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      })
      .catch(console.error);
  };

  const handleAddReaction = (chatId, messageId, emoji) => {
    reactToMessage(chatId, messageId, emoji)
      .then((data) => {
        if (selectedChat?.id !== chatId) return;
        if (data?.removed) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    reactions: (m.reactions || []).filter(
                      (r) => !(r.userId === user?.id && (r.emoji === emoji || r.emoji === emoji?.trim()))
                    ),
                  }
                : m
            )
          );
        } else if (data?.id) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== messageId) return m;
              const reactions = m.reactions || [];
              const exists = reactions.some(
                (r) => r.id === data.id || (r.userId === data.userId && (r.emoji === data.emoji || r.emoji === (data.emoji || '').trim()))
              );
              if (exists) return m;
              return { ...m, reactions: [...reactions, { ...data, userId: data.userId }] };
            })
          );
        }
      })
      .catch(console.error);
  };

  const handleRemoveReaction = (chatId, messageId, emoji) => {
    removeMessageReaction(chatId, messageId, emoji)
      .then(() => {
        if (selectedChat?.id === chatId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    reactions: (m.reactions || []).filter(
                      (r) => !(r.userId === user?.id && (r.emoji === emoji || r.emoji === emoji?.trim()))
                    ),
                  }
                : m
            )
          );
        }
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
      {storyViewer !== null && storyFeed.length > 0 && (
        <StoryViewer
          users={storyFeed}
          initialUserIndex={storyViewer.initialUserIndex}
          onClose={() => setStoryViewer(null)}
        />
      )}
      <aside className="w-[30%] min-w-[260px] max-w-[400px] flex flex-col bg-white/5 backdrop-blur-md border-r border-white/10 shadow-2xl">
        <header className="flex-shrink-0 h-auto p-3 border-b border-white/10 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Link
              to="/cabinet"
              className="flex items-center justify-center w-10 h-10 rounded-full overflow-hidden bg-black/40 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-all flex-shrink-0"
              title="Профиль"
              aria-label="Профиль"
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full object-cover" />
              ) : user?.username ? (
                <span className="text-sm font-medium text-gray-200">{user.username[0].toUpperCase()}</span>
              ) : (
                <User size={20} />
              )}
            </Link>
            <input
              type="search"
              placeholder="Поиск..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all text-sm"
            />
          </div>

          <div className="flex items-center gap-3 px-3 py-4 overflow-x-auto no-scrollbar border-b border-white/5">
            <button
              type="button"
              onClick={() => storyFileInputRef.current?.click()}
              className="flex flex-col items-center gap-1 cursor-pointer group shrink-0"
            >
              <div className="relative w-16 h-16 rounded-full flex items-center justify-center border-2 border-dashed border-gray-600 group-hover:border-blue-500 group-hover:bg-blue-500/10 transition-all duration-300 bg-slate-800/50">
                <Plus className="w-6 h-6 text-gray-400 group-hover:text-blue-400" />
              </div>
              <span className="text-xs text-gray-400 group-hover:text-blue-400 font-medium">Добавить</span>
            </button>
            <input
              ref={storyFileInputRef}
              type="file"
              accept="image/*,video/mp4"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSelectedStoryFile(file);
                e.target.value = '';
              }}
            />
            {storyFeed.findIndex((u) => u.id === user?.id) >= 0 && (() => {
              const myUser = storyFeed.find((u) => u.id === user?.id);
              return (
                <button
                  type="button"
                  onClick={() => {
                    const myIdx = storyFeed.findIndex((u) => u.id === user?.id);
                    if (myIdx >= 0) setStoryViewer({ initialUserIndex: myIdx });
                  }}
                  className="flex-shrink-0 flex flex-col items-center gap-1.5 cursor-pointer"
                >
                  <StoryRing
                    user={myUser}
                    onClick={() => {
                      const myIdx = storyFeed.findIndex((u) => u.id === user?.id);
                      if (myIdx >= 0) setStoryViewer({ initialUserIndex: myIdx });
                    }}
                  />
                  <span className="text-xs text-gray-500 truncate max-w-[56px]">Моя история</span>
                </button>
              );
            })()}
            {storyFeed.filter((u) => u.id !== user?.id).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  const idx = storyFeed.findIndex((x) => x.id === u.id);
                  if (idx >= 0) setStoryViewer({ initialUserIndex: idx });
                }}
                className="flex-shrink-0 flex flex-col items-center gap-1.5 cursor-pointer"
              >
                <StoryRing
                  user={u}
                  onClick={() => {
                    const idx = storyFeed.findIndex((x) => x.id === u.id);
                    if (idx >= 0) setStoryViewer({ initialUserIndex: idx });
                  }}
                />
                <span className="text-xs text-gray-500 truncate max-w-[56px]">{u.username || 'Пользователь'}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-black/20 backdrop-blur-md rounded-2xl border border-white/5 overflow-x-auto no-scrollbar flex-1 min-w-0">
              <button
                onClick={() => { setChatFilter('personal'); setSelectedChannel(null); }}
                className={`px-4 py-2 rounded-[14px] text-xs font-medium transition-all duration-300 whitespace-nowrap flex-shrink-0 ${
                  chatFilter === 'personal'
                    ? 'bg-blue-600/50 text-white shadow-lg shadow-blue-500/10'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                Личные
              </button>
              <button
                onClick={() => { setChatFilter('group'); setSelectedChannel(null); }}
                className={`px-4 py-2 rounded-[14px] text-xs font-medium transition-all duration-300 whitespace-nowrap flex-shrink-0 ${
                  chatFilter === 'group'
                    ? 'bg-blue-600/50 text-white shadow-lg shadow-blue-500/10'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                Группы
              </button>
              <button
                onClick={() => { setChatFilter('channels'); setSelectedChat(null); }}
                className={`px-4 py-2 rounded-[14px] text-xs font-medium transition-all duration-300 whitespace-nowrap flex-shrink-0 ${
                  chatFilter === 'channels'
                    ? 'bg-blue-600/50 text-white shadow-lg shadow-blue-500/10'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                Каналы
              </button>
            </div>
            <button
              className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 hover:scale-105 transition-all duration-300 border border-blue-500/30 flex-shrink-0"
              onClick={chatFilter === 'channels' ? () => setShowCreateChannel(true) : openNewChat}
              title={chatFilter === 'channels' ? 'Создать канал' : 'Новый чат'}
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
          </div>
        </header>
        {chatFilter === 'channels' ? (
          <ChannelList
            channels={channels}
            selectedId={selectedChannel?.id}
            onSelect={selectChannel}
            searchQuery={searchQuery}
          />
        ) : (
          <ChatList
            chats={chats}
            selectedId={selectedChat?.id}
            onSelect={selectChat}
            userStatus={userStatus}
            searchQuery={searchQuery}
            chatFilter={chatFilter}
          />
        )}
      </aside>

        <main className="flex-1 flex min-w-0 bg-gradient-to-br from-slate-950 via-slate-900/95 to-slate-950">
        <ChatWindow
          chat={selectedChat}
          channel={selectedChannel}
          messages={messages}
          posts={posts}
          postsLoading={postsLoading}
          onSend={handleSendMessage}
          onMessageSent={(msg) => setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))}
          onEdit={handleEditMessage}
          onDelete={handleDeleteMessage}
          onAddReaction={handleAddReaction}
          onRemoveReaction={handleRemoveReaction}
          onSendPost={(text, mediaFiles) => {
            if (!selectedChannel) return;
            return createPost(selectedChannel.id, text, mediaFiles)
              .then((post) => {
                setPosts((prev) => (prev.some((p) => p.id === post.id) ? prev : [...prev, post]));
              })
              .catch((err) => { console.error(err); throw err; });
          }}
          onPostReact={(postId, emoji) => {
            reactToPost(postId, emoji)
              .then(({ reactionCounts, userReacted }) => {
                setPosts((prev) =>
                  prev.map((p) => (p.id === postId ? { ...p, reactionCounts, userReacted } : p))
                );
              })
              .catch(console.error);
          }}
          onJoinChannel={async () => {
            if (!selectedChannel) return;
            try {
              await joinChannel(selectedChannel.id);
              setSelectedChannel((prev) => (prev ? { ...prev, isMember: true } : prev));
              setChannels((prev) =>
                prev.map((c) => (c.id === selectedChannel.id ? { ...c, isMember: true } : c))
              );
            } catch (e) {
              console.error(e);
            }
          }}
          loading={messagesLoading}
          loadingMore={loadingMore}
          hasMore={messagesHasMore}
          onLoadMore={loadMoreMessages}
          pinnedMessages={selectedChat?.pinnedMessages ?? (selectedChat?.pinnedMessage ? [selectedChat.pinnedMessage] : [])}
          pinnedPosts={selectedChannel?.pinnedPosts ?? []}
          onPin={handlePin}
          onUnpin={handleUnpin}
          onPinPost={handlePinPost}
          onUnpinPost={handleUnpinPost}
          userStatus={userStatus}
          typingUser={typingUser}
          socket={socket}
          onUpdateChat={(updated) => {
            setSelectedChat((prev) => (prev?.id === updated?.id ? { ...prev, ...updated } : prev));
            setChats((prev) => prev.map((c) => (c.id === updated?.id ? { ...c, ...updated } : c)));
          }}
          onUpdateChannel={(updated) => {
            setSelectedChannel((prev) => (prev?.id === updated?.id ? { ...prev, ...updated } : prev));
            setChannels((prev) => prev.map((c) => (c.id === updated?.id ? { ...c, ...updated } : c)));
          }}
          onCloseSettings={(opts) => {
            if (opts?.left || opts?.deleted) {
              setSelectedChat(null);
              getChats().then(setChats);
            }
          }}
          onCloseChannel={(opts) => {
            if (opts?.left || opts?.deleted) {
              setSelectedChannel(null);
              getChannels().then(setChannels);
            }
          }}
          onUnsubscribeChannel={async () => {
            if (!selectedChannel) return;
            await unsubscribeChannel(selectedChannel.id);
            setSelectedChannel(null);
            getChannels().then(setChannels);
          }}
          onOpenMediaViewer={openViewer}
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

      {showCreateChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateChannel(false)}>
          <div className="w-full max-w-md bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-gray-100 mb-4">Создать канал</h2>
            <label className="block mb-2 text-sm text-gray-400">
              Название
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="Название канала"
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </label>
            <label className="block mb-4 text-sm text-gray-400">
              Описание (необязательно)
              <textarea
                value={channelDescription}
                onChange={(e) => setChannelDescription(e.target.value)}
                placeholder="Описание канала"
                rows={3}
                className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 resize-none"
              />
            </label>
            <button
              className="w-full py-3 rounded-xl bg-blue-500/30 text-blue-300 font-medium border border-blue-500/50 hover:bg-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-2"
              onClick={async () => {
                if (!channelName.trim()) return;
                setCreating(true);
                try {
                  const ch = await createChannel(channelName.trim(), channelDescription.trim());
                  const chWithMembership = { ...ch, isMember: true, isAdmin: true, _count: { members: 1, posts: 0 } };
                  setChannels((prev) => [chWithMembership, ...prev]);
                  setShowCreateChannel(false);
                  setChannelName('');
                  setChannelDescription('');
                  selectChannel(chWithMembership);
                } catch (e) {
                  console.error(e);
                } finally {
                  setCreating(false);
                }
              }}
              disabled={creating || !channelName.trim()}
            >
              {creating ? 'Создание...' : 'Создать'}
            </button>
            <button
              className="w-full py-2 rounded-xl bg-black/40 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-gray-200 transition-all"
              onClick={() => setShowCreateChannel(false)}
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {selectedStoryFile && (
        <StoryPreviewModal
          file={selectedStoryFile}
          onClose={() => setSelectedStoryFile(null)}
          onConfirm={handleConfirmStoryUpload}
        />
      )}

      {viewerData.isOpen && viewerData.images.length > 0 && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200"
          onClick={closeViewer}
        >
          <button
            type="button"
            onClick={handleViewerForward}
            className="absolute top-5 right-20 p-2 rounded-full bg-black/50 hover:bg-white/10 text-white z-[210] transition-all backdrop-blur-md border border-white/10"
            title="Переслать"
          >
            <Forward size={24} />
          </button>
          <div className="absolute top-4 right-4 z-[210] flex items-center gap-3">

            <button
              type="button"
              onClick={handleViewerDownload}
              className="p-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white hover:bg-white/20 transition-all shadow-lg"
              title="Скачать"
            >
              <Download size={20} />
            </button>
            <button
              type="button"
              onClick={closeViewer}
              className="p-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white hover:bg-red-500/80 transition-all shadow-lg"
              title="Закрыть"
            >
              <X size={20} />
            </button>
          </div>

          {viewerData.images.length > 1 && (
            <button
              type="button"
              onClick={prevMedia}
              className="absolute left-4 p-3 rounded-full bg-white/5 hover:bg-white/10 text-white z-[210] transition-all"
              aria-label="Назад"
            >
              <ChevronLeft size={40} />
            </button>
          )}

          <div
            className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {(viewerData.types[viewerData.index] || 'image') === 'video' ? (
              <video
                src={viewerData.images[viewerData.index]}
                controls
                autoPlay
                className="max-w-full max-h-[90vh] object-contain shadow-2xl rounded-sm"
              />
            ) : (
              <img
                src={viewerData.images[viewerData.index]}
                alt=""
                className="max-w-full max-h-[90vh] object-contain shadow-2xl rounded-sm"
              />
            )}
          </div>

          {viewerData.images.length > 1 && (
            <button
              type="button"
              onClick={nextMedia}
              className="absolute right-4 p-3 rounded-full bg-white/5 hover:bg-white/10 text-white z-[210] transition-all"
              aria-label="Вперёд"
            >
              <ChevronRight size={40} />
            </button>
          )}

          {viewerData.images.length > 1 && (
            <div className="absolute bottom-10 text-white/60 text-sm font-medium px-4 py-2 bg-white/5 rounded-full">
              {viewerData.index + 1} / {viewerData.images.length}
            </div>
          )}
        </div>
      )}

      <ForwardModal
        isOpen={!!forwardData}
        forwardData={forwardData}
        onClose={() => setForwardData(null)}
        chats={chats}
        channels={channels}
        currentUser={user}
      />
    </div>
  );
}
