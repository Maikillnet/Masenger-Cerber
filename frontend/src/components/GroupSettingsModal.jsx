import { useState, useRef, useEffect, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { X, LogOut, Trash2, UserPlus, Check } from 'lucide-react';
import LeaveConfirmModal from './LeaveConfirmModal';
import getCroppedImg from '../utils/cropImage';
import {
  updateGroupSettings,
  uploadGroupAvatar,
  removeGroupMember,
  leaveGroup,
  deleteGroup,
  getUsers,
  addGroupMembers,
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
  const [draft, setDraft] = useState({
    name: data?.name || '',
    description: data?.description || '',
    hideMembers: data?.hideMembers ?? false,
  });
  const [avatarFile, setAvatarFile] = useState(null);
  const [croppedAvatar, setCroppedAvatar] = useState(null);
  const [preview, setPreview] = useState(data?.avatar || null);

  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDraft({
      name: data?.name || '',
      description: data?.description || '',
      hideMembers: data?.hideMembers ?? false,
    });
    setPreview(data?.avatar || null);
    setCroppedAvatar(null);
  }, [data?.name, data?.description, data?.hideMembers, data?.avatar, data?.id]);

  const isAdmin =
    data?.isAdmin ??
    data?.userChats?.find((uc) => uc.userId === currentUser?.id)?.role === 'admin' ??
    data?.creatorId === currentUser?.id;
  const participants = data?.userChats || [];

  useEffect(() => {
    if (showAddMembers) {
      getUsers()
        .then(setAllUsers)
        .catch(() => setAllUsers([]));
      setSelectedUserIds([]);
    }
  }, [showAddMembers]);

  const availableUsers = allUsers.filter((u) => !participants.some((p) => p.userId === u.id));

  const onCropComplete = useCallback((_, croppedAreaPx) => {
    setCroppedAreaPixels(croppedAreaPx);
  }, []);

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (avatarFile) URL.revokeObjectURL(avatarFile);
    const url = URL.createObjectURL(file);
    setAvatarFile(url);
    setShowCropper(true);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    e.target.value = '';
  };

  const handleApplyCrop = async () => {
    if (!avatarFile || !croppedAreaPixels) return;
    try {
      const file = await getCroppedImg(avatarFile, croppedAreaPixels);
      setCroppedAvatar(file);
      setPreview(URL.createObjectURL(file));
      setShowCropper(false);
      URL.revokeObjectURL(avatarFile);
      setAvatarFile(null);
    } catch (err) {
      setError(err.message || 'Ошибка обрезки');
    }
  };

  const handleCancelCrop = () => {
    setShowCropper(false);
    if (avatarFile) {
      URL.revokeObjectURL(avatarFile);
      setAvatarFile(null);
    }
  };

  const draftDiffers =
    draft.name !== (data?.name || '') ||
    draft.description !== (data?.description ?? '') ||
    draft.hideMembers !== (data?.hideMembers ?? false);
  const hasChanges = draftDiffers || !!croppedAvatar;

  const handleSaveAll = async () => {
    if (!hasChanges) return;
    setSaving(true);
    setError('');
    try {
      if (croppedAvatar) {
        const updated = await uploadGroupAvatar(data.id, croppedAvatar);
        onUpdate?.({ ...data, ...updated });
        setCroppedAvatar(null);
        setPreview(data?.avatar || null);
      }

      if (draftDiffers) {
        const payload = {};
        const nameStr = String(draft.name ?? '').trim();
        const dataNameStr = String(data?.name ?? '').trim();
        if (nameStr && nameStr !== dataNameStr) payload.name = nameStr;
        if (String(draft.description ?? '') !== String(data?.description ?? ''))
          payload.description = (draft.description ?? '').slice(0, 200).trim() || null;
        if (Boolean(draft.hideMembers) !== Boolean(data?.hideMembers ?? false))
          payload.hideMembers = Boolean(draft.hideMembers);

        if (Object.keys(payload).length > 0) {
          const updated = await updateGroupSettings(data.id, payload);
          onUpdate?.({ ...data, ...updated });
        }
      }
    } catch (e) {
      setError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
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
      setError(e.message || 'Ошибка добавления');
    } finally {
      setAddLoading(false);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

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

  const leaveTransferMembers = participants.filter((p) => p.userId !== currentUser?.id);

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

  const showMembersList = isAdmin || !draft.hideMembers;

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
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
        onClick={() => onClose?.()}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-[400px] h-full bg-[#1a1a1a]/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex-shrink-0 p-4 border-b border-white/10 flex items-center justify-between bg-[#1a1a1a]/95 backdrop-blur-2xl">
          <h2 className="text-lg font-semibold text-gray-100">Информация о группе</h2>
          <button
            onClick={() => onClose?.()}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* КРОППЕР — полноэкранный оверлей внутри модалки */}
          {showCropper && avatarFile && (
            <div className="fixed inset-0 z-[55] flex flex-col bg-slate-900/95 backdrop-blur-xl">
              <div className="flex-1 relative min-h-0">
                <Cropper
                  image={avatarFile}
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
              <div className="p-4 border-t border-white/10 bg-white/5 backdrop-blur-md space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">Масштаб</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1 h-2 rounded-full bg-white/10 accent-blue-500"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCancelCrop}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all text-sm font-medium"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyCrop}
                    className="flex-1 py-2.5 rounded-xl bg-blue-500/80 hover:bg-blue-500 text-white font-medium text-sm transition-all"
                  >
                    Применить обрезку
                  </button>
                </div>
              </div>
            </div>
          )}

          {!showCropper && (
            <>
              {/* БЛОК: ПРОФИЛЬ */}
              <div className="flex flex-col items-center">
                <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-blue-500 shadow-xl mx-auto bg-white/10 flex items-center justify-center flex-shrink-0">
                  {preview ? (
                    <img src={preview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-4xl font-bold text-gray-400">
                      {draft.name?.[0]?.toUpperCase() || data?.name?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleAvatarSelect}
                />
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={saving}
                    className="mt-3 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/30 transition-all text-sm font-medium disabled:opacity-50"
                  >
                    Изменить фото
                  </button>
                )}

                <div className="mt-4 w-full text-center">
                  {isAdmin ? (
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Название группы"
                      className="w-full bg-black/40 border border-white/20 text-white text-xl font-semibold text-center placeholder-gray-400 focus:outline-none focus:border-blue-500 rounded-xl px-4 py-2"
                    />
                  ) : (
                    <h3 className="text-xl font-semibold text-gray-100">{data?.name || 'Группа'}</h3>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {data?.participantCount ?? participants.length} участников
                </p>
              </div>

              {/* БЛОК: ОПИСАНИЕ И НАСТРОЙКИ */}
              {isAdmin && (
                <div className="space-y-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-400 mb-2 block">
                      Описание группы
                    </span>
                    <textarea
                      value={draft.description}
                      onChange={(e) =>
                        setDraft((p) => ({ ...p, description: e.target.value.slice(0, 200) }))
                      }
                      placeholder="Краткое описание группы..."
                      rows={3}
                      className="w-full bg-black/40 border border-white/20 text-white rounded-xl px-4 py-3 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-all resize-none"
                    />
                    <span className="text-xs text-gray-500 mt-1 block">
                      {draft.description.length}/200
                    </span>
                  </label>
                  <div className="flex items-center justify-between gap-4 py-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-300 block">
                        Скрыть список участников
                      </span>
                      <span className="text-xs text-gray-500">
                        Обычные пользователи не увидят этот список
                      </span>
                    </div>
                    <Toggle
                      checked={draft.hideMembers}
                      onChange={(v) => setDraft((p) => ({ ...p, hideMembers: v }))}
                      disabled={saving}
                    />
                  </div>
                </div>
              )}

              {/* КНОПКА СОХРАНЕНИЯ */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={!hasChanges || saving}
                  className="w-full py-3.5 rounded-2xl bg-blue-500/80 hover:bg-blue-500 text-white font-semibold text-base transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-blue-500/50 shadow-lg"
                >
                  {saving ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
              )}

              {/* БЛОК: УЧАСТНИКИ */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-400">Участники</h4>
                  {isAdmin && !showAddMembers && (
                    <button
                      type="button"
                      onClick={() => setShowAddMembers(true)}
                      className="flex items-center gap-1.5 px-2 py-1 text-sm text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                    >
                      <UserPlus size={16} />
                      Добавить участника
                    </button>
                  )}
                  {isAdmin && showAddMembers && (
                    <button
                      type="button"
                      onClick={() => setShowAddMembers(false)}
                      className="text-sm text-gray-400 hover:text-white"
                    >
                      Отмена
                    </button>
                  )}
                </div>
                {showAddMembers ? (
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
                    <div className="max-h-48 overflow-y-auto p-2">
                      {availableUsers.length === 0 ? (
                        <p className="text-sm text-gray-500 p-3">Нет пользователей для добавления</p>
                      ) : (
                        availableUsers.map((u) => (
                          <label
                            key={u.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer transition-colors"
                          >
                            <div className="relative flex-shrink-0 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                              {u.avatar ? (
                                <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-gray-400 text-sm font-medium">
                                  {u.username?.[0]?.toUpperCase() || '?'}
                                </span>
                              )}
                            </div>
                            <span className="flex-1 text-gray-100 text-sm truncate">
                              {u.username || 'Пользователь'}
                            </span>
                            <div
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                selectedUserIds.includes(u.id)
                                  ? 'bg-blue-500 border-blue-500 text-white'
                                  : 'border-white/30'
                              }`}
                            >
                              {selectedUserIds.includes(u.id) && <Check size={14} strokeWidth={3} />}
                            </div>
                            <input
                              type="checkbox"
                              checked={selectedUserIds.includes(u.id)}
                              onChange={() => toggleUserSelection(u.id)}
                              className="sr-only"
                            />
                          </label>
                        ))
                      )}
                    </div>
                    <div className="p-3 border-t border-white/10 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddMembers(false)}
                        className="flex-1 py-2.5 rounded-xl bg-white/5 backdrop-blur-md border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white transition-all text-sm font-medium"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={handleAddMembers}
                        disabled={selectedUserIds.length === 0 || addLoading}
                        className="flex-1 py-2.5 rounded-xl bg-blue-500/80 hover:bg-blue-500 text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-blue-500/50"
                      >
                        {addLoading ? 'Добавление...' : `Добавить (${selectedUserIds.length})`}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden">
                    {!showMembersList ? (
                      <p className="p-4 text-sm text-gray-500 text-center">
                        Список участников скрыт администратором (
                        {data?.participantCount ?? participants.length} участников)
                      </p>
                    ) : (
                      participants.map((uc) => {
                        const status =
                          userStatus[uc.userId] ?? uc.user?.status ?? 'offline';
                        return (
                          <div
                            key={uc.userId}
                            className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0"
                          >
                            <div className="relative flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                              {uc.user?.avatar ? (
                                <img
                                  src={uc.user.avatar}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-gray-400 font-medium">
                                  {uc.user?.username?.[0]?.toUpperCase() || '?'}
                                </span>
                              )}
                              {status === 'online' && (
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-gray-100 font-medium block truncate">
                                {uc.user?.username || 'Пользователь'}
                              </span>
                              <span className="text-xs text-gray-500">
                                {uc.userId === currentUser?.id
                                  ? 'Вы'
                                  : status === 'online'
                                    ? 'в сети'
                                    : 'не в сети'}
                              </span>
                            </div>
                            {uc.role === 'admin' && (
                              <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md flex-shrink-0">
                                Админ
                              </span>
                            )}
                            {isAdmin && uc.userId !== currentUser?.id && (
                              <button
                                onClick={() => handleKick(uc.userId)}
                                disabled={saving}
                                className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50 flex-shrink-0"
                                title="Исключить"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* ОПАСНАЯ ЗОНА */}
              <div className="rounded-2xl overflow-hidden border border-red-500/20 bg-red-500/5 backdrop-blur-md">
                <div className="px-4 py-2 border-b border-red-500/20 bg-red-500/10">
                  <span className="text-sm font-medium text-red-400">Опасная зона</span>
                </div>
                <div className="flex flex-col">
                  <button
                    onClick={handleLeave}
                    disabled={saving}
                    className="flex items-center gap-3 w-full p-4 text-left text-red-400 hover:bg-red-500/10 transition-colors border-b border-red-500/10 last:border-0 disabled:opacity-50"
                  >
                    <LogOut size={20} />
                    Покинуть группу
                  </button>
                  {isAdmin && (
                    <button
                      onClick={handleDelete}
                      disabled={saving}
                      className="flex items-center gap-3 w-full p-4 text-left text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={20} />
                      Удалить группу
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
