import { useState, useRef, useEffect } from 'react';
import { X, Camera, LogOut, Trash2, UserPlus, Check } from 'lucide-react';
import LeaveConfirmModal from './LeaveConfirmModal';
import {
  updateGroupName,
  uploadGroupAvatar,
  removeGroupMember,
  leaveGroup,
  deleteGroup,
  getUsers,
  addGroupMembers,
} from '../api';

export default function GroupSettingsModal({ data, onClose, currentUser, onUpdate, userStatus = {} }) {
  const [name, setName] = useState(data?.name || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const fileInputRef = useRef(null);

  const isAdmin = data?.userChats?.find((uc) => uc.userId === currentUser?.id)?.role === 'admin';
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

  const handleSaveName = async () => {
    if (!name.trim() || name === data?.name) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateGroupName(data.id, name);
      onUpdate?.(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarClick = () => {
    if (isAdmin) fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const updated = await uploadGroupAvatar(data.id, file);
      onUpdate?.(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
      e.target.value = '';
    }
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
        className="relative w-full max-w-[400px] h-full bg-slate-900/95 backdrop-blur-3xl border-l border-white/10 shadow-2xl flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex-shrink-0 p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
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

          {/* БЛОК А: ПРОФИЛЬ */}
          <div className="flex flex-col items-center">
            <div
              className={`relative w-24 h-24 rounded-full overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0 ${
                isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-blue-500/50 transition-all' : ''
              }`}
              onClick={handleAvatarClick}
            >
              {data?.avatar ? (
                <img src={data.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-gray-400">
                  {data?.name?.[0]?.toUpperCase() || '?'}
                </span>
              )}
              {isAdmin && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 hover:opacity-100 transition-opacity">
                  <Camera size={28} className="text-white" />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />

            <div className="mt-4 w-full text-center">
              {isAdmin ? (
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={handleSaveName}
                  placeholder="Название группы"
                  className="w-full bg-transparent border-none text-xl font-semibold text-gray-100 text-center placeholder-gray-500 focus:outline-none focus:ring-0"
                />
              ) : (
                <h3 className="text-xl font-semibold text-gray-100">{data?.name || 'Группа'}</h3>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{participants.length} участников</p>
          </div>

          {/* БЛОК Б: УЧАСТНИКИ */}
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
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
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
                <div className="p-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleAddMembers}
                    disabled={selectedUserIds.length === 0 || addLoading}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addLoading ? 'Добавление...' : `Добавить (${selectedUserIds.length})`}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {participants.map((uc) => {
                const status = userStatus[uc.userId] ?? uc.user?.status ?? 'offline';
                return (
                  <div
                    key={uc.userId}
                    className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0"
                  >
                    <div className="relative flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                      {uc.user?.avatar ? (
                        <img src={uc.user.avatar} alt="" className="w-full h-full object-cover" />
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
              })}
              </div>
            )}
          </div>

          {/* БЛОК В: ОПАСНАЯ ЗОНА */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
            <button
              onClick={handleLeave}
              disabled={saving}
              className="flex items-center gap-3 w-full p-4 text-left text-red-400 hover:bg-white/5 transition-colors border-b border-white/5 disabled:opacity-50"
            >
              <LogOut size={20} />
              Покинуть группу
            </button>
            {isAdmin && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-3 w-full p-4 text-left text-red-400 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <Trash2 size={20} />
                Удалить группу
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
