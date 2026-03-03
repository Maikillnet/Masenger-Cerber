import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Type, Trash2, X, MoreVertical, Smile } from 'lucide-react';
import MediaPicker from './MediaPicker';

const PRESET_COLORS = [
  { hex: '#ffffff', label: 'Белый' },
  { hex: '#000000', label: 'Чёрный' },
  { hex: '#ef4444', label: 'Красный' },
  { hex: '#3b82f6', label: 'Синий' },
  { hex: '#eab308', label: 'Жёлтый' },
];

export default function StoryPreviewModal({ file, onClose, onConfirm }) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [storyText, setStoryText] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [isEditingText, setIsEditingText] = useState(false);
  const [textPosition, setTextPosition] = useState({ x: 50, y: 50 }); // в процентах
  const [stickers, setStickers] = useState([]); // [{ id, url, x, y }] — x,y в процентах
  const [isDragging, setIsDragging] = useState(false);
  const [draggingStickerIndex, setDraggingStickerIndex] = useState(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const textInputRef = useRef(null);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const draggingStickerIndexRef = useRef(null);

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);
  useEffect(() => {
    draggingStickerIndexRef.current = draggingStickerIndex;
  }, [draggingStickerIndex]);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (isEditingText) {
      textInputRef.current?.focus();
    }
  }, [isEditingText]);


  const handlePointerDown = useCallback((e) => {
    if (isEditingText) return;
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [isEditingText]);

  const handlePointerMove = useCallback((e) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let newX = ((e.clientX - rect.left) / rect.width) * 100;
    let newY = ((e.clientY - rect.top) / rect.height) * 100;
    setTextPosition({
      x: Math.max(0, Math.min(newX, 100)),
      y: Math.max(0, Math.min(newY, 100)),
    });
  }, []);

  const handlePointerUp = useCallback((e) => {
    isDraggingRef.current = false;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleStickerPointerDown = useCallback((index, e) => {
    if (isEditingText) return;
    e.preventDefault();
    e.stopPropagation();
    setDraggingStickerIndex(index);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [isEditingText]);

  const handleStickerPointerMove = useCallback((e) => {
    const idx = draggingStickerIndexRef.current;
    if (idx == null || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let newX = ((e.clientX - rect.left) / rect.width) * 100;
    let newY = ((e.clientY - rect.top) / rect.height) * 100;
    setStickers((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], x: Math.max(0, Math.min(newX, 100)), y: Math.max(0, Math.min(newY, 100)) };
      return next;
    });
  }, []);

  const handleStickerPointerUp = useCallback((e) => {
    setDraggingStickerIndex(null);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  const handleConfirm = async () => {
    if (!file || isUploading) return;
    setIsUploading(true);
    try {
      let textOverlay = null;
      if (storyText.trim()) {
        textOverlay = {
          caption: storyText.trim(),
          settings: { x: textPosition.x, y: textPosition.y, color: textColor },
        };
      }
      const mediaSettings = stickers.length > 0
        ? { stickers: stickers.map((s) => ({ url: s.url, x: s.x, y: s.y })) }
        : null;
      await onConfirm(file, textOverlay, mediaSettings);
      onClose?.();
    } catch (err) {
      alert(err?.message || 'Ошибка загрузки');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) onClose?.();
  };

  const handleClearText = () => {
    setStoryText('');
    setIsEditingText(false);
  };

  const handleClearStickers = () => {
    setStickers([]);
  };

  if (!file) return null;

  const isVideo = file.type?.startsWith('video/');
  return (
    <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
      <div className="absolute inset-0" onClick={handleClose} aria-hidden="true" />
      <div
        ref={containerRef}
        className="relative w-full max-w-sm aspect-[9/16] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        {previewUrl && (
          <>
            <div className="relative w-full h-full">
              {isVideo ? (
                <video
                  src={previewUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="object-cover w-full h-full"
                />
              ) : (
                <img src={previewUrl} alt="" className="object-cover w-full h-full" />
              )}

              {/* Выпадающее меню в правом верхнем углу */}
              <div className="absolute top-4 right-4 z-50">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                  className="bg-black/50 backdrop-blur-md p-3 rounded-full text-white hover:bg-black/70 transition"
                  aria-label="Меню"
                >
                  <MoreVertical className="w-5 h-5" />
                </button>

                {showMediaPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMediaPicker(false)} aria-hidden="true" />
                    <div className="absolute right-0 bottom-full mb-2 z-50">
                      <MediaPicker
                        stickersOnly
                        onSelect={(item) => {
                          if (item.type === 'sticker') {
                            setStickers((prev) => [
                              ...prev,
                              { id: crypto.randomUUID(), url: item.url, x: 50, y: 50 },
                            ]);
                            setShowMediaPicker(false);
                          }
                        }}
                      />
                    </div>
                  </>
                )}
                {isMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-fade-in">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingText(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition text-sm text-left"
                    >
                      <Type className="w-4 h-4 text-blue-400" /> Добавить текст
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMediaPicker(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/10 transition text-sm text-left"
                    >
                      <Smile className="w-4 h-4 text-blue-400" /> Добавить стикер
                    </button>
                  </div>
                )}
              </div>

              {/* Режим ввода: затемнённый фон, textarea по центру, кнопка Готово */}
              {isEditingText && (
                <div className="absolute inset-0 z-[55] bg-black/60 flex flex-col">
                  <div className="flex-1 flex items-center justify-center p-4">
                    <textarea
                      ref={textInputRef}
                      value={storyText}
                      onChange={(e) => setStoryText(e.target.value)}
                      placeholder="Введите текст..."
                      className="w-full max-w-[84%] min-h-[80px] text-center bg-transparent border-none outline-none font-bold text-2xl md:text-3xl placeholder-white/50 resize-none overflow-hidden"
                      style={{
                        color: textColor,
                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                      }}
                      rows={3}
                    />
                  </div>
                  <div className="p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-center gap-2">
                      {PRESET_COLORS.map(({ hex }) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => setTextColor(hex)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${
                            textColor === hex ? 'border-white scale-110' : 'border-white/30 hover:border-white/60'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={hex}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEditingText(false)}
                      className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
                    >
                      Готово
                    </button>
                  </div>
                </div>
              )}

              {/* Режим просмотра: перетаскиваемый текст */}
              {!isEditingText && storyText && (
                <div
                  id="draggable-text"
                  className="absolute z-[60] cursor-grab active:cursor-grabbing select-none text-center font-bold text-2xl md:text-3xl break-words max-w-[200px]"
                  style={{
                    left: `${textPosition.x}%`,
                    top: `${textPosition.y}%`,
                    transform: 'translate(-50%, -50%)',
                    color: textColor,
                    textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.5)',
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {storyText}
                </div>
              )}

              {/* Перетаскиваемые стикеры */}
              {!isEditingText && stickers.map((sticker, index) => (
                <div
                  key={sticker.id}
                  className="absolute z-[60] cursor-grab active:cursor-grabbing select-none w-16 h-16 flex items-center justify-center"
                  style={{
                    left: `${sticker.x}%`,
                    top: `${sticker.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onPointerDown={(e) => handleStickerPointerDown(index, e)}
                  onPointerMove={handleStickerPointerMove}
                  onPointerUp={handleStickerPointerUp}
                >
                  <img src={sticker.url} alt="" className="w-full h-full object-contain pointer-events-none" />
                </div>
              ))}
            </div>

            {/* Панель очистки текста и стикеров (когда есть и не редактируется) */}
            {!isEditingText && (storyText || stickers.length > 0) && (
              <div className="absolute bottom-20 left-4 right-4 flex items-center justify-center gap-2">
                {storyText && (
                  <button
                    type="button"
                    onClick={handleClearText}
                    className="p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-red-400 hover:bg-red-500/20 transition-all"
                    title="Очистить текст"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
                {stickers.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearStickers}
                    className="p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 text-red-400 hover:bg-red-500/20 transition-all"
                    title="Очистить стикеры"
                  >
                    <Trash2 size={20} />
                  </button>
                )}
              </div>
            )}

            {/* Нижние кнопки: Отмена и Отправить */}
            <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isUploading}
                className="flex-1 py-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 text-gray-200 font-medium hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <X size={18} />
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isUploading}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-md"
              >
                {isUploading ? (
                  'Отправка...'
                ) : (
                  <>
                    <Send size={18} />
                    Отправить
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
