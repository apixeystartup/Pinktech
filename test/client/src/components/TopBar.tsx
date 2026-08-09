import { useRef } from 'react';
import toast from 'react-hot-toast';
import { useReload, useStats, useRemoved, useUploadWorkbook } from '../api/hooks';
import { useUi } from '../store/ui';
import { classNames } from '../utils/format';

export function TopBar() {
  const { data: stats } = useStats();
  const { data: removed } = useRemoved();
  const { tab, setTab, openDialog } = useUi();
  const reload = useReload();
  const upload = useUploadWorkbook();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onUpload = (file: File) => {
    upload.mutate(file, {
      onSuccess: (res: unknown) => {
        const sum = (res as { summary?: { emailsApplied?: number; emailsParsedFromWorkbook?: number } })?.summary;
        const applied = sum?.emailsApplied;
        const parsed = sum?.emailsParsedFromWorkbook;
        toast.success(
          typeof applied === 'number'
            ? `Imported ${file.name} — ${applied} row(s) updated with email${
                typeof parsed === 'number' ? ` (${parsed} valid in sheet)` : ''
              }`
            : `Imported ${file.name}`,
        );
      },
      onError: (e: any) => toast.error(`Upload failed: ${e?.message || e}`),
    });
  };

  const onReload = () => {
    reload.mutate(undefined, {
      onSuccess: () => toast.success('Workbook reloaded'),
      onError: (e: any) => toast.error(`Reload failed: ${e?.message || e}`),
    });
  };

  const removedCount = removed?.count ?? 0;

  return (
    <header className="border-b border-pink-100 bg-white px-6 sm:px-8 py-4 flex items-center justify-between gap-6 flex-wrap">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-pink-700 grid place-items-center text-white font-bold text-lg">
          N
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900 tracking-tight">NUTRIMAX Org Explorer</h1>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {stats
              ? `${stats.total} people · ${stats.roles} roles · ${stats.max_level} levels`
              : 'loading…'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="stat-pill stat-filled">{stats?.filled ?? '—'} filled</span>
        <span className="stat-pill stat-vacant">{stats?.vacant ?? '—'} vacant</span>
        <span className="stat-pill stat-roles">{stats?.roles ?? '—'} roles</span>
        <span className="stat-pill stat-levels">L{stats?.max_level ?? '—'}</span>
        {removedCount > 0 && (
          <button
            type="button"
            className="stat-pill stat-removed"
            onClick={() => openDialog({ kind: 'removed-list' })}
            title="People marked as left - click to restore"
          >
            {removedCount} removed
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 flex-wrap">
          <button
            type="button"
            className={classNames('tab-btn', tab === 'org-tree' && 'active')}
            onClick={() => setTab('org-tree')}
          >
            Org tree
          </button>
          <button
            type="button"
            className={classNames('tab-btn', tab === 'org-explorer' && 'active')}
            onClick={() => setTab('org-explorer')}
          >
            Org explorer
          </button>
          <button
            type="button"
            className={classNames('tab-btn', tab === 'roles' && 'active')}
            onClick={() => setTab('roles')}
          >
            Roles
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={() => fileInputRef.current?.click()}
          disabled={upload.isPending}
        >
          {upload.isPending ? 'Uploading…' : 'Upload xlsx'}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={onReload}
          disabled={reload.isPending}
        >
          {reload.isPending ? 'Reloading…' : 'Reload'}
        </button>
      </div>
    </header>
  );
}
