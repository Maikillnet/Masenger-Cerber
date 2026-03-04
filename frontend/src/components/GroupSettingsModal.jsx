/**
 * GroupSettingsModal — настройки группы.
 * Паттерн «Черновик» (Draft): props.data — эталон; черновики; запросы только по «Сохранить».
 * Права: isAdmin — инпуты, фото, toggle, список, добавить, kick, удалить. Read-only — текст, «Покинуть».
 * hideMembers: админ всегда видит список; обычный — заглушка при data.hideMembers === true.
 * Опасная зона: Kick, Leave, Delete — вне черновика, выполняются сразу с подтверждением.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, LogOut, Trash2, UserPlus, Check, Loader2 } from 'lucide-react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import LeaveConfirmModal from './LeaveConfirmModal';
import {
  updateGroupSettings,
  uploadGroupAvatar,
  removeGroupMember,
  leaveGroup,
  deleteGroup,
  getUsers,
  addGroupMembers,
  getChat,
} from '../api';

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

export default function GroupSettingsModal({ data, onClose, currentUser, onUpdate, userStatus = {} }) {
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
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const fileInputRef = useRef(null);

  const isAdmin = data?.isAdmin ?? data?.userChats?.find((uc) => uc.userId === currentUser?.id)?.role === 'admin' ?? data?.creatorId === currentUser?.id;
  const participants = data?.userChats || [];
  const leaveTransferMembers = participants.filter((p) => p.userId !== currentUser?.id);
  const showMembersList = isAdmin || !(data?.hideMembers ?? false);

  useEffect(() => {
    setDraftName(data?.name || '');
    setDraftDescription(data?.description || '');
    setDraftHideMembers(data?.hideMembers ?? false);
    setAvatarPreview(null);
    setCroppedFile(null);
  }, [data?.name, data?.description, data?.hideMembers, data?.id]);

  useEffect(() => {
    if (showAddMembers) {
      getUsers().then(setAllUsers).catch(() => setAllUsers([]));
      setSelectedUserIds([]);
    }
  }, [showAddMembers]);

  const availableUsers = allUsers.filter((u) => !participants.some((p) => p.userId === u.id));

  // Фоторедактор: 4 этапа (без отправки на сервер до «Сохранить»)
  // 1. Выбор файла: <input type="file"> → handleFileChange
  // 2. Чтение: FileReader.readAsDataURL → imageSrc (base64)
  // 3. Оверлей: imageSrc не пустой → полноэкранный Cropper (cropShape="round")
  // 4. Применение: Canvas → croppedFile (File), URL.createObjectURL → avatarPreview, кроппер закрывается
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

  // handleSaveAll: единое сохранение в строгой последовательности (один try/catch, без гонки состояний)
  // 1. setSaving(true) — блокировка UI
  // 2. updatedData = { ...data }
  // 3. Шаг 1 (Текст): PUT name/description/hideMembers → await → влить в updatedData
  // 4. Шаг 2 (Фото): POST FormData аватар → await → влить в updatedData
  // 5. Шаг 3 (UI): onUpdate(updatedData) один раз в конце
  // 6. finally: setSaving(false)
  const handleSaveAll = async () => {
    if (!hasChanges) return;
    const nameStr = String(draftName ?? '').trim();
    const nameChanged = nameStr !== (data?.name || '');
    if (nameChanged && !nameStr) {
      setError('Укажите название группы');
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
        await updateGroupSettings(data.id, textPayload);
      }

      if (croppedFile) {
        const avatarRes = await uploadGroupAvatar(data.id, croppedFile);
        updatedData = { ...updatedData, ...avatarRes };
        setCroppedFile(null);
        setAvatarPreview(null);
      }

      const fresh = await getChat(data.id);
      onUpdate?.({ ...updatedData, ...fresh });
    } catch (e) {
      setError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAddMembers = async () => {
    if (selectedUserIds.length === 0) return;
    setAddLoading(true);
    setError('');
    try {
      const { userChats } = await addGroupMembers(data.id, selectedUserIds);
      onUpdate?.({ ...data, userChats });
      setShowAddMembers(false);
      setSelectedUserIds([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setAddLoading(false);
    }
  };

  // Опасная зона: не под паттерн «Черновик», выполняются сразу с подтверждением
  const handleKick = async (userId) => {
    setSaving(true);
    setError('');
    try {
      await removeGroupMember(data.id, userId);
      onUpdate?.({ ...data, userChats: participants.filter((uc) => uc.userId !== userId) });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm('Вы уверены, что хотите выйти из группы?')) return;
    setSaving(true);
    setError('');
    try {
      await leaveGroup(data.id);
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

  const handleLeaveConfirmTransfer = async (transferToUserId) => {
    setSaving(true);
    setError('');
    try {
      await leaveGroup(data.id, { transferToUserId });
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
      await leaveGroup(data.id, { deleteChat: true });
      setShowLeaveConfirm(false);
      onClose?.({ deleted: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Удаление группы — вне черновика, с confirm
  const handleDelete = async () => {
    if (!confirm('Удалить группу? Это действие нельзя отменить.')) return;
    setSaving(true);
    setError('');
    try {
      await deleteGroup(data.id);
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
          <h2 className="text-lg font-semibold text-gray-100">Настройки группы</h2>
          <button onClick={() => onClose?.()} className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"><X size={20} /></button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6 no-scrollbar pb-24">
          {error && <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">{error}</div>}

          <div className="flex flex-col items-center">
            <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-white/10 shadow-xl mx-auto bg-white/5 flex items-center justify-center">
              {displayAvatar ? (
                <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
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
                <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Название группы" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-lg font-semibold text-gray-100 text-center focus:border-blue-500/50 outline-none transition-colors placeholder-gray-500" />
              ) : (
                <h3 className="text-xl font-semibold text-gray-100 text-center">{data?.name || 'Группа'}</h3>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{data?.participantCount ?? participants.length} участников</p>
          </div>

          {!isAdmin && (data?.description ?? '') && (
            <p className="text-sm text-gray-400 text-center px-4">{data.description}</p>
          )}

          {isAdmin && (
            <div className="space-y-4 bg-white/5 border border-white/10 rounded-2xl p-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-400 mb-2 block">Описание группы</span>
                <textarea value={draftDescription} onChange={(e) => setDraftDescription(e.target.value.slice(0, 200))} rows={3} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500/50 transition-all resize-none" placeholder="О чем эта группа..." />
                <span className="text-xs text-gray-500 mt-1 block">{draftDescription.length}/200</span>
              </label>
              <div className="flex items-center justify-between gap-4 py-2 border-t border-white/5">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-200 block">Скрыть участников</span>
                  <span className="text-[11px] text-gray-500">Обычные пользователи не увидят список</span>
                </div>
                <Toggle checked={draftHideMembers} onChange={(v) => setDraftHideMembers(v)} disabled={saving} />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-400">Участники ({participants.length})</h4>
              {isAdmin && !showAddMembers && (
                <button onClick={() => setShowAddMembers(true)} className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"><UserPlus size={16} /> Добавить</button>
              )}
              {isAdmin && showAddMembers && (
                <button onClick={() => setShowAddMembers(false)} className="text-sm text-gray-400 hover:text-white">Отмена</button>
              )}
            </div>

            {showAddMembers ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="max-h-48 overflow-y-auto p-2">
                  {availableUsers.length === 0 ? (
                    <p className="text-sm text-gray-500 p-3">Нет пользователей для добавления</p>
                  ) : (
                    availableUsers.map((u) => (
                      <label key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors">
                        <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {u.avatar ? <img src={u.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400 text-sm font-medium">{u.username?.[0]?.toUpperCase() || '?'}</span>}
                        </div>
                        <span className="flex-1 text-gray-100 text-sm truncate">{u.username || 'Пользователь'}</span>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selectedUserIds.includes(u.id) ? 'bg-blue-500 border-blue-500 text-white' : 'border-white/30'}`}>
                          {selectedUserIds.includes(u.id) && <Check size={14} strokeWidth={3} />}
                        </div>
                        <input type="checkbox" checked={selectedUserIds.includes(u.id)} onChange={() => toggleUserSelection(u.id)} className="sr-only" />
                      </label>
                    ))
                  )}
                </div>
                <div className="p-3 border-t border-white/10 flex gap-2">
                  <button onClick={() => setShowAddMembers(false)} className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all text-sm font-medium">Отмена</button>
                  <button onClick={handleAddMembers} disabled={selectedUserIds.length === 0 || addLoading} className="flex-1 py-2.5 rounded-xl bg-blue-500/80 hover:bg-blue-500 text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-blue-500/50">
                    {addLoading ? 'Добавление...' : `Добавить (${selectedUserIds.length})`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                {!showMembersList ? (
                  <p className="p-4 text-sm text-gray-500 text-center">Список участников скрыт администратором ({data?.participantCount ?? participants.length} участников)</p>
                ) : (
                  participants.map((uc) => {
                    const status = userStatus[uc.userId] ?? uc.user?.status ?? 'offline';
                    return (
                      <div key={uc.userId} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
                          {uc.user?.avatar ? <img src={uc.user.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-gray-400 font-medium">{uc.user?.username?.[0]?.toUpperCase() || '?'}</span>}
                          {status === 'online' && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-gray-100 font-medium block truncate">{uc.user?.username || 'Пользователь'}</span>
                          <span className="text-xs text-gray-500">{uc.userId === currentUser?.id ? 'Вы' : status === 'online' ? 'в сети' : 'не в сети'}</span>
                        </div>
                        {uc.role === 'admin' && <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md flex-shrink-0">Админ</span>}
                        {isAdmin && uc.userId !== currentUser?.id && (
                          <button onClick={() => handleKick(uc.userId)} disabled={saving} className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50 flex-shrink-0" title="Исключить"><Trash2 size={18} /></button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-white/5 bg-red-500/5">
              <span className="text-xs font-medium text-red-400">Опасная зона</span>
            </div>
            <button onClick={handleLeave} disabled={saving} className="flex items-center gap-3 p-4 text-left text-red-400 hover:bg-white/5 border-b border-white/5 disabled:opacity-50"><LogOut size={20} /> Покинуть группу</button>
            {isAdmin && <button onClick={handleDelete} disabled={saving} className="flex items-center gap-3 p-4 text-left text-red-400 hover:bg-white/5 disabled:opacity-50"><Trash2 size={20} /> Удалить группу</button>}
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
