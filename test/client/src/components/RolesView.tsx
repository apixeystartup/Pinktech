import toast from 'react-hot-toast';
import {
  useAutoDetectRoles,
  useCreateRole,
  useResetAllRoles,
  useRoles,
  useUpdateRole,
} from '../api/hooks';
import type { Role } from '../api/types';
import { RolesTable } from './RolesTable';

export function RolesView() {
  const rolesQ = useRoles();
  const create = useCreateRole();
  const autoDetect = useAutoDetectRoles();
  const resetAll = useResetAllRoles();
  const update = useUpdateRole();

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-6 py-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Roles</h2>
          <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-prose">
            Levels and scopes are inferred from the data. Override anything you want;
            click a role's people count to manage members.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            disabled={resetAll.isPending}
            onClick={() => {
              if (
                !confirm(
                  'Reset all roles? Your level/scope overrides and any role renames will be lost.',
                )
              )
                return;
              resetAll.mutate(undefined, {
                onSuccess: () => toast.success('Roles re-detected from scratch'),
                onError: (e: any) => toast.error(e?.message || 'Reset failed'),
              });
            }}
          >
            {resetAll.isPending ? 'Resetting…' : 'Reset all roles'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={autoDetect.isPending}
            onClick={() =>
              autoDetect.mutate(undefined, {
                onSuccess: () => toast.success('Re-ran detection'),
                onError: (e: any) => toast.error(e?.message || 'Detection failed'),
              })
            }
          >
            {autoDetect.isPending ? 'Detecting…' : 'Re-detect from data'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const name = prompt('Role name (e.g. National Sales Head):');
              if (!name) return;
              create.mutate(
                { name, aliases: [name.toUpperCase()] },
                {
                  onSuccess: () => toast.success('Role added'),
                  onError: (e: any) => toast.error(e?.message || 'Add failed'),
                },
              );
            }}
          >
            + Add role
          </button>
        </div>
      </div>
      <RolesTable
        roles={rolesQ.data?.roles ?? []}
        loading={rolesQ.isLoading}
        onSave={(id: string, patch) => {
          update.mutate(
            { id, ...patch },
            {
              onSuccess: () => toast.success('Saved'),
              onError: (e: any) => toast.error(e?.message || 'Save failed'),
            },
          );
        }}
      />
    </section>
  );
}

export type RolePatch = Parameters<ReturnType<typeof useUpdateRole>['mutate']>[0];
export type { Role };
