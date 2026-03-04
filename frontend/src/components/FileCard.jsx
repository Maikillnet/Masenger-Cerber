import { FileText, Download, FileSpreadsheet, FileArchive } from 'lucide-react';

export function getFileNameFromUrl(url) {
  if (!url || typeof url !== 'string') return 'Файл';
  const parts = url.split('/');
  const name = parts[parts.length - 1] || 'Файл';
  return decodeURIComponent(name);
}

export function getFriendlyFileName(rawName) {
  if (!rawName || rawName === 'Файл') return 'Документ';
  const ext = rawName.split('.').pop()?.toLowerCase() || '';
  const nameWithoutExt = rawName.slice(0, -(ext.length + 1));
  const isUuidLike = /^[a-f0-9-]{30,}$/i.test(nameWithoutExt.replace(/-/g, ''));
  if (isUuidLike && nameWithoutExt.length > 25) {
    const labels = { docx: 'Документ Word', doc: 'Документ Word', xlsx: 'Таблица Excel', xls: 'Таблица Excel', pptx: 'Презентация', ppt: 'Презентация', pdf: 'PDF документ', zip: 'Архив', rar: 'Архив', '7z': 'Архив', txt: 'Текстовый файл', csv: 'Таблица', rtf: 'Документ' };
    return (labels[ext] || 'Файл') + (ext ? ` .${ext}` : '');
  }
  return rawName.length > 40 ? rawName.slice(0, 37) + '…' : rawName;
}

function getFileIconAndColor(ext) {
  const e = (ext || '').toLowerCase();
  if (['zip', 'rar', '7z'].includes(e)) return { Icon: FileArchive, iconColor: 'text-amber-400', accent: 'border-l-amber-400/80' };
  if (['xlsx', 'xls', 'csv'].includes(e)) return { Icon: FileSpreadsheet, iconColor: 'text-emerald-400', accent: 'border-l-emerald-400/80' };
  if (e === 'pdf') return { Icon: FileText, iconColor: 'text-rose-400', accent: 'border-l-rose-400/80' };
  if (['docx', 'doc', 'rtf'].includes(e)) return { Icon: FileText, iconColor: 'text-blue-300', accent: 'border-l-blue-300' };
  if (['pptx', 'ppt'].includes(e)) return { Icon: FileText, iconColor: 'text-orange-400', accent: 'border-l-orange-400/80' };
  return { Icon: FileText, iconColor: 'text-slate-400', accent: 'border-l-slate-400/60' };
}

export function FileCard({ url, className = '', isOwn }) {
  const rawName = getFileNameFromUrl(url);
  const displayName = getFriendlyFileName(rawName);
  const ext = rawName.split('.').pop()?.toLowerCase() || '';
  const { Icon, iconColor, accent } = getFileIconAndColor(ext);

  const bgBase = isOwn ? 'bg-white/25 hover:bg-white/35' : 'bg-white/15 hover:bg-white/25';
  const textPrimary = isOwn ? 'text-white' : 'text-gray-100';
  const textSecondary = isOwn ? 'text-blue-100/90' : 'text-gray-400';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={rawName}
      className={`group flex items-center gap-3 w-full min-w-0 max-w-full rounded-xl border-l-4 ${accent} border border-white/10 ${bgBase} backdrop-blur-sm transition-all duration-200 shadow-sm hover:shadow-md ${className}`}
    >
      <div className={`flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-lg bg-white/10 ${iconColor} ring-1 ring-white/10 group-hover:ring-white/20 transition-all`}>
        <Icon size={24} strokeWidth={1.5} className="sm:w-6 sm:h-6 drop-shadow-sm" />
      </div>
      <div className="flex-1 min-w-0 py-3 pl-0 pr-4">
        <p className={`font-semibold truncate text-sm sm:text-base tracking-tight ${textPrimary} group-hover:brightness-110 transition-all`}>{displayName}</p>
        <p className={`text-xs mt-0.5 truncate ${textSecondary}`}>{ext ? `.${ext}` : ''} • Скачать</p>
      </div>
      <div className="flex-shrink-0 pl-2 pr-4 py-3 opacity-60 group-hover:opacity-100 transition-opacity">
        <Download size={18} className={isOwn ? 'text-blue-300' : 'text-gray-400'} />
      </div>
    </a>
  );
}
