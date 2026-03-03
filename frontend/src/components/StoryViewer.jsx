import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const STORY_DURATION_MS = 5000;

export default function StoryViewer({ users, initialUserIndex = 0, onClose }) {
  const [currentUserIndex, setCurrentUserIndex] = useState(initialUserIndex);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setCurrentUserIndex(initialUserIndex);
    setCurrentStoryIndex(0);
    setProgress(0);
  }, [initialUserIndex]);
  const timerRef = useRef(null);
  const videoRef = useRef(null);

  const currentUser = users[currentUserIndex];
  const stories = currentUser?.stories || [];
  const currentStory = stories[currentStoryIndex];

  const goNext = () => {
    if (currentStoryIndex < stories.length - 1) {
      setCurrentStoryIndex((i) => i + 1);
      setProgress(0);
    } else if (currentUserIndex < users.length - 1) {
      setCurrentUserIndex((i) => i + 1);
      setCurrentStoryIndex(0);
      setProgress(0);
    } else {
      onClose?.();
    }
  };

  const goPrev = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((i) => i - 1);
      setProgress(0);
    } else if (currentUserIndex > 0) {
      const prevUser = users[currentUserIndex - 1];
      const prevStories = prevUser?.stories || [];
      setCurrentUserIndex((i) => i - 1);
      setCurrentStoryIndex(prevStories.length - 1);
      setProgress(0);
    }
  };

  useEffect(() => {
    if (!currentStory) return;

    const isVideo = currentStory.mediaType === 'video';

    if (isVideo) {
      const video = videoRef.current;
      if (!video) return;

      const handleEnded = () => {
        goNext();
      };

      video.addEventListener('ended', handleEnded);
      return () => video.removeEventListener('ended', handleEnded);
    }

    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min((elapsed / STORY_DURATION_MS) * 100, 100);
      setProgress(p);
      if (p >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
        goNext();
      }
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentUserIndex, currentStoryIndex, currentStory?.id]);

  useEffect(() => {
    if (currentStory) {
      const seen = JSON.parse(localStorage.getItem('seenStories') || '[]');
      if (!seen.includes(currentStory.id)) {
        seen.push(currentStory.id);
        localStorage.setItem('seenStories', JSON.stringify(seen));
        window.dispatchEvent(new Event('story_viewed'));
      }
    }
  }, [currentStory]);

  const goNextRef = useRef(goNext);
  const goPrevRef = useRef(goPrev);
  goNextRef.current = goNext;
  goPrevRef.current = goPrev;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowRight') goNextRef.current();
      if (e.key === 'ArrowLeft') goPrevRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!currentUser || !currentStory) {
      onClose?.();
    }
  }, [currentUser, currentStory, onClose]);

  if (!currentUser || !currentStory) {
    return null;
  }

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч`;
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-md flex items-center justify-center"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const half = rect.width / 2;
        if (x < half) goPrev();
        else goNext();
      }}
    >
      <div className="relative w-full max-w-[400px] h-[85vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl mx-4">
        {/* Progress bars */}
        <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
          {stories.map((_, i) => (
            <div
              key={i}
              className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
            >
              <div
                className="h-full bg-white transition-all duration-75 ease-linear"
                style={{
                  width: i < currentStoryIndex ? '100%' : i === currentStoryIndex ? `${progress}%` : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-3 pt-12 bg-gradient-to-b from-black/60 to-transparent">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/30 flex-shrink-0 bg-slate-700">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="w-full h-full flex items-center justify-center text-white font-medium">
                  {currentUser.username?.[0]?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-white truncate">{currentUser.username || 'Пользователь'}</p>
              <p className="text-xs text-white/70">{formatTime(currentStory.createdAt)}</p>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onClose?.(); }}
            className="p-2 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors flex-shrink-0"
            aria-label="Закрыть"
          >
            <X size={24} />
          </button>
        </div>

        {/* Media */}
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {currentStory.mediaType === 'video' ? (
            <video
              ref={videoRef}
              src={currentStory.mediaUrl}
              autoPlay
              playsInline
              muted={false}
              className="w-full h-full object-cover"
            />
          ) : (
            <img
              src={currentStory.mediaUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Текстовая подпись (оверлей) */}
        {currentStory.caption && (() => {
          const ts = currentStory.textSettings;
          const parsed = !ts ? {} : typeof ts === 'string' ? (() => { try { return JSON.parse(ts); } catch { return {}; } })() : ts;
          return (
            <div
              className="absolute z-50 pointer-events-none select-none text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
              style={{
                left: `${parsed.x ?? 50}%`,
                top: `${parsed.y ?? 50}%`,
                transform: 'translate(-50%, -50%)',
                color: parsed.color || '#ffffff',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                width: '80%',
                wordWrap: 'break-word',
              }}
            >
              {currentStory.caption}
            </div>
          );
        })()}

        {/* Стикеры поверх истории */}
        {currentStory.mediaSettings?.stickers?.length > 0 && (
          <>
            {currentStory.mediaSettings.stickers.map((sticker, i) => (
              <div
                key={i}
                className="absolute z-50 pointer-events-none w-16 h-16 flex items-center justify-center"
                style={{
                  left: `${sticker.x ?? 50}%`,
                  top: `${sticker.y ?? 50}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <img src={sticker.url} alt="" className="w-full h-full object-contain drop-shadow-lg" />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
