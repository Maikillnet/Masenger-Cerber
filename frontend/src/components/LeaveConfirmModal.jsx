import { useState, useEffect } from 'react';

export default function LeaveConfirmModal({
  isOpen,
  onClose,
  onConfirmTransfer,
  onConfirmDelete,
  members,
  loading = false,
}) {
  const [selectedUserId, setSelectedUserId] = useState('');

  useEffect(() => {
    if (isOpen) setSelectedUserId('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTransfer = () => {
    if (selectedUserId) {
      onConfirmTransfer?.(selectedUserId);
      setSelectedUserId('');
    }
  };

  const handleDelete = () => {
    onConfirmDelete?.();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !loading && onClose?.()}
        aria-hidden="true"
      />
      <div
        className="relative bg-slate-900/95 backdrop-blur-3xl border border-red-500/20 rounded-3xl p-6 shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-gray-200 text-sm leading-relaxed mb-4">
          Вы являетесь создателем/единственным админом. Чтобы покинуть чат, выберите нового владельца
          или удалите чат навсегда.
        </p>

        <div className="mb-4">
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/30 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 0.75rem center',
              backgroundSize: '1.25rem',
              paddingRight: '2.5rem',
            }}
          >
            <option value="" className="bg-slate-800 text-gray-100">
              Выберите участника...
            </option>
            {members.map((m) => (
              <option
                key={m.userId}
                value={m.userId}
                className="bg-slate-800 text-gray-100"
              >
                {m.user?.username || 'Пользователь'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="w-full py-3 rounded-2xl bg-red-500/20 text-red-400 font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
          >
            Удалить чат навсегда
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={!selectedUserId || loading}
            className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Выполняется...' : 'Передать права и выйти'}
          </button>
        </div>
      </div>
    </div>
  );
}
