import { useState, useRef } from 'react';
import { X, Camera, LogOut, Trash2, UserPlus } from 'lucide-react';
import LeaveConfirmModal from './LeaveConfirmModal';
import {
  updateChannel,
  uploadChannelAvatar,
  removeChannelMember,
  leaveChannel,
} from '../api';

export default function ChannelSettingsModal({ data, onClose, currentUser, onUpdate, userStatus = {} }) {
  const [name, setName] = useState(data?.name || '');
  const [description, setDescription] = useState(data?.description || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const fileInputRef = useRef(null);

  const isAdmin = data?.creatorId === currentUser?.id;
  const members = data?.members || [];

  const handleSave = async () => {
    const updates = {};
    if (name?.trim() !== data?.name) updates.name = name.trim();
    if (description !== (data?.description ?? '')) updates.description = description?.trim() || null;
    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    setError('');
    try {
      const updated = await updateChannel(data.id, updates);
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
      const updated = await uploadChannelAvatar(data.id, file);
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
      await removeChannelMember(data.id, userId);
      onUpdate?.({ ...data, members: members.filter((m) => m.userId !== userId) });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

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

  const handleDelete = async () => {
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

  const leaveTransferMembers = members.filter((m) => m.userId !== currentUser?.id);

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
          <h2 className="text-lg font-semibold text-gray-100">Информация о канале</h2>
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

            <div className="mt-4 w-full text-center space-y-2">
              {isAdmin ? (
                <>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={handleSave}
                    placeholder="Название канала"
                    className="w-full bg-transparent border-none text-xl font-semibold text-gray-100 text-center placeholder-gray-500 focus:outline-none focus:ring-0"
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onBlur={handleSave}
                    placeholder="Описание"
                    rows={2}
                    className="w-full bg-transparent border-none text-sm text-gray-400 text-center placeholder-gray-500 focus:outline-none focus:ring-0 resize-none"
                  />
                </>
              ) : (
                <>
                  <h3 className="text-xl font-semibold text-gray-100">{data?.name || 'Канал'}</h3>
                  {data?.description && (
                    <p className="text-sm text-gray-400">{data.description}</p>
                  )}
                </>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">{members.length} подписчиков</p>
          </div>

          {/* БЛОК Б: ПОДПИСЧИКИ */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium text-gray-400">Подписчики</h4>
              <button
                type="button"
                className="flex items-center gap-1.5 px-2 py-1 text-sm text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                title="Добавить (скоро)"
              >
                <UserPlus size={16} />
                Добавить
              </button>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              {members.map((m) => {
                const status = userStatus[m.userId] ?? m.user?.status ?? 'offline';
                return (
                  <div
                    key={m.userId}
                    className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0"
                  >
                    <div className="relative flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                      {m.user?.avatar ? (
                        <img src={m.user.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-gray-400 font-medium">
                          {m.user?.username?.[0]?.toUpperCase() || '?'}
                        </span>
                      )}
                      {status === 'online' && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-gray-100 font-medium block truncate">
                        {m.user?.username || 'Пользователь'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {m.userId === currentUser?.id
                          ? 'Вы'
                          : m.userId === data?.creatorId
                            ? 'Создатель'
                            : status === 'online'
                              ? 'в сети'
                              : 'не в сети'}
                      </span>
                    </div>
                    {m.userId === data?.creatorId && (
                      <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md flex-shrink-0">
                        Создатель
                      </span>
                    )}
                    {isAdmin && m.userId !== currentUser?.id && m.userId !== data?.creatorId && (
                      <button
                        onClick={() => handleKick(m.userId)}
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
          </div>

          {/* БЛОК В: ОПАСНАЯ ЗОНА */}
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
            {data?.creatorId !== currentUser?.id && (
              <button
                onClick={handleLeave}
                disabled={saving}
                className="flex items-center gap-3 w-full p-4 text-left text-red-400 hover:bg-white/5 transition-colors border-b border-white/5 disabled:opacity-50"
              >
                <LogOut size={20} />
                Отписаться от канала
              </button>
            )}
            {isAdmin && (
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex items-center gap-3 w-full p-4 text-left text-red-400 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <Trash2 size={20} />
                Удалить канал
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
