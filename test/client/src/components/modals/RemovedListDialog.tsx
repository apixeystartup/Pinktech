import toast from 'react-hot-toast';
import { useRemoved, useRestore } from '../../api/hooks';
import { useUi } from '../../store/ui';
import { Dialog } from './Dialog';
import { initials } from '../../utils/format';

export function RemovedListDialog() {
  const closeDialog = useUi((s) => s.closeDialog);
  const { data, isLoading } = useRemoved();
  const restore = useRestore();

  return (
    <Dialog
      large
      title="People marked as left"
      subtitle="Restore brings them back with their last manager and role intact."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={closeDialog}>Done</button>
        </>
      }
    >
      {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      {!isLoading && (data?.items.length ?? 0) === 0 && (
        <div className="text-sm text-slate-500">Nobody is currently marked as left.</div>
      )}
      <div className="removed-list">
        {data?.items.map((p) => (
          <div key={p.id} className="removed-row">
            <div className="removed-avatar">{initials(p.name)}</div>
            <div className="flex-1 min-w-0">
              <div className="removed-name truncate">{p.name}</div>
              <div className="removed-meta truncate">
                {p.role_name || p.designation || 'Unspecified'}
                {p.emp_id ? ` · ${p.emp_id}` : ''}
                {p.zone ? ` · ${p.zone}` : ''}
              </div>
              {p.last_manager_name && (
                <div className="removed-mgr truncate">Last reported to {p.last_manager_name}</div>
              )}
              <div className="removed-tags">
                {p.direct_reports > 0 && (
                  <span className="tag reports">{p.direct_reports} reports were waiting</span>
                )}
              </div>
            </div>
            <button
              type="button"
              className="btn-primary removed-restore-btn"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(
                  { id: p.id },
                  {
                    onSuccess: () => toast.success(`${p.name} restored`),
                    onError: (e: any) => toast.error(e?.message || 'Restore failed'),
                  },
                )
              }
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
