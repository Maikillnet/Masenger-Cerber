/**
 * ChannelSettingsModal — настройки канала.
 * Паттерн «Черновик» (Draft): props.data — эталон; черновики; запросы только по «Сохранить».
 * Права: creatorId === currentUser — инпуты, фото, toggle, удалить. Read-only — текст, «Покинуть».
 * hideMembers: создатель всегда видит список; обычный — заглушка при data.hideMembers === true.
 * Опасная зона: Leave, Delete — вне черновика. Создатель при Leave → requireTransfer → LeaveConfirmModal.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, LogOut, Trash2, Loader2 } from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import LeaveConfirmModal from './LeaveConfirmModal';
import { updateChannel, uploadChannelAvatar, leaveChannel, deleteChannel, getChannel } from '../api';

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
        checked ? 'bg-blue-500' : 'bg-white/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function ChannelSettingsModal({ data, onClose, currentUser, onUpdate, userStatus = {} }) {
  // Черновики (локальный стейт редактирования)
  const [draftName, setDraftName] = useState(data?.name || '');
  const [draftDescription, setDraftDescription] = useState(data?.description || '');
  const [draftHideMembers, setDraftHideMembers] = useState(data?.hideMembers ?? false);

  // Стейты фоторедактора: imageSrc (base64), croppedFile (File для отправки), avatarPreview (URL для показа)
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [croppedFile, setCroppedFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  // UI: saving блокирует интерфейс, hasChanges — вычисляемое
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDraftName(data?.name || '');
    setDraftDescription(data?.description || '');
    setDraftHideMembers(data?.hideMembers ?? false);
    setAvatarPreview(null);
    setCroppedFile(null);
  }, [data?.name, data?.description, data?.hideMembers, data?.id]);

  const isAdmin = data?.creatorId === currentUser?.id;
  const members = data?.members || [];
  const memberCount = data?._count?.members ?? members.length;
  const leaveTransferMembers = members.filter((m) => m.userId !== currentUser?.id);
  const showMembersList = isAdmin ? !draftHideMembers : !(data?.hideMembers ?? false);

  // Фоторедактор: 4 этапа (без отправки на сервер до «Сохранить»)
  // 1. Выбор файла → 2. FileReader → imageSrc → 3. Оверлей Cropper (round) → 4. Применение → croppedFile, avatarPreview
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImageSrc(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const onCropComplete = useCallback((_, croppedAreaPx) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const handleApplyCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    try {
      const file = await getCroppedImg(imageSrc, croppedAreaPixels);
      setCroppedFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setImageSrc(null);
    } catch (e) {
      setError(e.message || 'Ошибка обрезки');
    }
  };

  const hasChanges = draftName.trim() !== (data?.name || '') ||
                     draftDescription !== (data?.description ?? '') ||
                     draftHideMembers !== (data?.hideMembers ?? false) ||
                     !!croppedFile;

  // handleSaveAll: единое сохранение в строгой последовательности (один try/catch)
  // 1. setSaving(true) → 2. updatedData → 3. Шаг 1 (Текст) → 4. Шаг 2 (Фото) → 5. onUpdate(updatedData) один раз → 6. setSaving(false)
  const handleSaveAll = async () => {
    if (!hasChanges || !data?.id) return;
    const nameStr = String(draftName ?? '').trim();
    const nameChanged = nameStr !== (data?.name || '');
    if (nameChanged && !nameStr) {
      setError('Укажите название канала');
      return;
    }

    setSaving(true);
    setError('');
    try {
      let updatedData = { ...data };

      const textPayload = {};
      if (nameStr !== (data?.name || '')) textPayload.name = nameStr;
      if (draftDescription !== (data?.description ?? '')) textPayload.description = (draftDescription ?? '').slice(0, 200).trim() || null;
      if (draftHideMembers !== (data?.hideMembers ?? false)) textPayload.hideMembers = draftHideMembers;

      if (Object.keys(textPayload).length > 0) {
        const updateRes = await updateChannel(data.id, textPayload);
        updatedData = { ...updatedData, ...updateRes };
      }

      if (croppedFile) {
        const avatarRes = await uploadChannelAvatar(data.id, croppedFile);
        updatedData = { ...updatedData, ...avatarRes };
        setCroppedFile(null);
        setAvatarPreview(null);
      }

      const fresh = await getChannel(data.id);
      onUpdate?.({ ...updatedData, ...fresh });
    } catch (e) {
      setError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  // Опасная зона: не под паттерн «Черновик», выполняются сразу с подтверждением
  const handleLeave = async () => {
    if (!confirm('Вы уверены, что хотите отписаться от канала?')) return;
    setSaving(true);
    setError('');
    try {
      await leaveChannel(data.id);
      onClose?.({ left: true });
    } catch (e) {
      if (e.requireTransfer || (e.status === 400 && e.message?.includes('Требуется передача'))) {
        setShowLeaveConfirm(true);
      } else {
        setError(e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  // Создатель: бэкенд вернул requireTransfer → LeaveConfirmModal (передать права или удалить)
  const handleLeaveConfirmTransfer = async (transferToUserId) => {
    setSaving(true);
    setError('');
    try {
      await leaveChannel(data.id, { transferToUserId });
      setShowLeaveConfirm(false);
      onClose?.({ left: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLeaveConfirmDelete = async () => {
    setSaving(true);
    setError('');
    try {
      await leaveChannel(data.id, { deleteChannel: true });
      setShowLeaveConfirm(false);
      onClose?.({ deleted: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Удаление канала — вне черновика, с confirm
  const handleDelete = async () => {
    if (!confirm('Удалить канал? Это действие нельзя отменить.')) return;
    setSaving(true);
    setError('');
    try {
      await deleteChannel(data.id);
      onClose?.({ deleted: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const displayAvatar = avatarPreview || data?.avatar;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      <LeaveConfirmModal
        isOpen={showLeaveConfirm}
        onClose={() => setShowLeaveConfirm(false)}
        onConfirmTransfer={handleLeaveConfirmTransfer}
        onConfirmDelete={handleLeaveConfirmDelete}
        members={leaveTransferMembers}
        loading={saving}
      />

      {imageSrc && (
        <div className="absolute inset-0 z-[60] bg-black flex flex-col animate-fade-in">
          <div className="relative flex-1 min-h-0">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              minZoom={1}
              maxZoom={3}
            />
          </div>
          <div className="p-6 bg-[#131313] border-t border-white/10 space-y-4">
            <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-blue-500" />
            <div className="flex gap-3">
              <button onClick={() => setImageSrc(null)} className="flex-1 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors">Отмена</button>
              <button onClick={handleApplyCrop} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors">Применить</button>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-[#111]/90 backdrop-blur-3xl transition-opacity" onClick={() => onClose?.()} aria-hidden="true" />

      <div className="relative w-full max-w-[400px] h-full bg-[#111] backdrop-blur-3xl border-l border-white/10 shadow-2xl flex flex-col animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
        <header className="flex-shrink-0 p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Настройки канала</h2>
          <button onClick={() => onClose?.()} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"><X size={20} /></button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 no-scrollbar pb-24">
          {error && <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">{error}</div>}

          <div className="flex flex-col items-center">
            <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-white/10 shadow-xl mx-auto bg-white/5 flex items-center justify-center">
              {displayAvatar ? (
                <img src={displayAvatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-gray-400">{data?.name?.[0]?.toUpperCase() || '?'}</span>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            {isAdmin && (
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={saving} className="mt-3 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-blue-400 hover:bg-blue-500/20 transition-all text-sm font-medium disabled:opacity-50">
                Изменить фото
              </button>
            )}
            <div className="mt-4 w-full">
              {isAdmin ? (
                <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Название канала" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-lg font-semibold text-gray-100 text-center focus:border-blue-500/50 outline-none transition-colors placeholder-gray-500" />
              ) : (
                <h3 className="text-xl font-semibold text-gray-100 text-center">{data?.name || 'Канал'}</h3>
              )}
              <p className="text-sm text-gray-500 mt-1 text-center">{memberCount} подписчиков</p>
            </div>
          </div>

          {!isAdmin && (data?.description ?? '') && (
            <p className="text-sm text-gray-400 text-center px-4">{data.description}</p>
          )}

          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-3">Подписчики ({memberCount})</h4>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {!showMembersList ? (
                <p className="p-4 text-sm text-gray-500 text-center">
                  {isAdmin ? 'Подписчики скрыты. Отключите тумблер и сохраните, чтобы показать снова.' : 'Список подписчиков скрыт администратором'}
                </p>
              ) : members.length === 0 ? (
                <p className="p-4 text-sm text-gray-500 text-center">Нет подписчиков</p>
              ) : (
                members.map((m) => (
                  <div key={m.userId} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
                      {m.user?.avatar ? (
                        <img src={m.user.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 font-medium">{m.user?.username?.[0]?.toUpperCase() || '?'}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-100 font-medium block truncate">{m.user?.username || 'Пользователь'}</span>
                      <span className="text-xs text-gray-500">{m.userId === currentUser?.id ? 'Вы' : m.role === 'admin' ? 'Админ' : 'Подписчик'}</span>
                    </div>
                    {m.role === 'admin' && (
                      <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md flex-shrink-0">Админ</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-400 mb-2 block">Описание канала</span>
                <textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value.slice(0, 200))} rows={3} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all resize-none" placeholder="О чем этот канал..." />
                <span className="text-xs text-gray-500 mt-1 block">{draftDescription.length}/200</span>
              </label>
              <div className="flex items-center justify-between gap-4 py-2 border-t border-white/5">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-200 block">Скрыть подписчиков</span>
                  {memberCount <= 1 ? (
                    <span className="text-[11px] text-gray-500">На вас никто не подписан, нечего скрывать</span>
                  ) : (
                    <span className="text-[11px] text-gray-500">Только вы будете видеть список</span>
                  )}
                </div>
                {memberCount <= 1 ? (
                  <span className="text-sm text-gray-500">—</span>
                ) : (
                  <Toggle checked={draftHideMembers} onChange={(v) => setDraftHideMembers(v)} disabled={saving} />
                )}
              </div>
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col mt-6">
            <div className="px-4 py-2 border-b border-white/5 bg-red-500/5">
              <span className="text-xs font-medium text-red-400">Опасная зона</span>
            </div>
            <button onClick={handleLeave} disabled={saving} className="flex items-center gap-3 p-4 text-left text-red-400 hover:bg-white/5 border-b border-white/5 disabled:opacity-50">
              <LogOut size={20} /> Покинуть канал
            </button>
            {isAdmin && (
              <button onClick={handleDelete} disabled={saving} className="flex items-center gap-3 p-4 text-left text-red-400 hover:bg-white/5 disabled:opacity-50">
                <Trash2 size={20} /> Удалить канал
              </button>
            )}
          </div>
        </div>

        {hasChanges && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-[#111] backdrop-blur-xl border-t border-white/10 animate-fade-in flex-shrink-0">
            <button onClick={handleSaveAll} disabled={saving} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {saving && <Loader2 size={20} className="animate-spin flex-shrink-0" />}
              {saving ? 'Сохранение...' : 'Сохранить изменения'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
