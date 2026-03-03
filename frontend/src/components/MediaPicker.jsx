import { useState, useEffect } from 'react';
import { getStickers } from '../api';

const POPULAR_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘',
  '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
  '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
  '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥺', '😎', '🤓', '🧐', '😕', '😟', '🙁',
  '😮', '😯', '😲', '😳', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓',
  '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻',
  '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '❤️', '🧡', '💛', '💚',
  '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '👍', '👎',
  '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️',
  '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '👀',
  '👁️', '👅', '👄', '💋', '🔥', '⭐', '🌟', '✨', '💫', '🌈', '☀️', '🌙', '🎉', '🎊', '🎈', '🎁',
  '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🎯', '🎮', '🃏', '🎲', '♠️', '♥️', '♦️', '♣️',
];

export default function MediaPicker({ onSelect, className = '', emojiOnly = false, stickersOnly = false }) {
  const [activeTab, setActiveTab] = useState(stickersOnly ? 'stickers' : 'emoji');
  const [packs, setPacks] = useState([]);
  const [selectedPackIndex, setSelectedPackIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'stickers') {
      setLoading(true);
      getStickers()
        .then(setPacks)
        .catch(() => setPacks([]))
        .finally(() => setLoading(false));
    }
  }, [activeTab]);

  useEffect(() => {
    if (packs.length > 0 && selectedPackIndex >= packs.length) {
      setSelectedPackIndex(0);
    }
  }, [packs.length, selectedPackIndex]);

  const currentPack = packs[selectedPackIndex];
  const stickers = currentPack?.stickers || [];

  return (
    <div
      className={`flex flex-col rounded-2xl overflow-hidden bg-slate-900/95 backdrop-blur-xl border border-white/10 shadow-2xl ${className}`}
      style={{ minWidth: 280, maxWidth: 360, height: 320 }}
    >
      {/* Tabs */}
      {!emojiOnly && !stickersOnly && (
        <div className="flex border-b border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab('emoji')}
            className={`flex-1 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'emoji'
                ? 'bg-white/10 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Emoji
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('stickers')}
            className={`flex-1 py-2.5 text-sm font-medium transition-all ${
              activeTab === 'stickers'
                ? 'bg-white/10 text-white border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            Stickers
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {activeTab === 'emoji' && (
          <div className="flex-1 overflow-y-auto p-3">
            <div className="grid grid-cols-8 gap-1">
              {POPULAR_EMOJIS.map((emoji, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect?.({ type: 'emoji', value: emoji });
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-xl hover:bg-white/15 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'stickers' && (
          <>
            <div className="flex-1 overflow-y-auto p-3 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Загрузка...
                </div>
              ) : stickers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  {packs.length === 0 ? 'Нет стикеров' : 'Пустой пак'}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {stickers.map((sticker) => (
                    <button
                      key={sticker.id}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect?.({ type: 'sticker', url: sticker.url });
                      }}
                      className="aspect-square p-1 rounded-xl hover:bg-white/15 transition-colors flex items-center justify-center"
                    >
                      <img
                        src={sticker.url}
                        alt=""
                        className="w-full h-full object-contain max-w-[64px] max-h-[64px]"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Pack icons strip */}
            {packs.length > 0 && (
              <div className="flex gap-1 p-2 border-t border-white/10 overflow-x-auto no-scrollbar bg-black/20">
                {packs.map((pack, i) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => setSelectedPackIndex(i)}
                    className={`shrink-0 w-10 h-10 rounded-xl overflow-hidden transition-all ${
                      selectedPackIndex === i
                        ? 'ring-2 ring-blue-500 scale-110'
                        : 'opacity-70 hover:opacity-100 hover:scale-105'
                    }`}
                  >
                    <img
                      src={pack.iconUrl}
                      alt={pack.name}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
