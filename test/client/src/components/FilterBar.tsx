import { useFilters } from '../api/hooks';
import { useUi } from '../store/ui';
import type { Filters } from '../api/types';

const FIELDS: Array<{ key: keyof Filters; label: string; facet: string }> = [
  { key: 'zone', label: 'Zone', facet: 'zones' },
  { key: 'region', label: 'Region', facet: 'regions' },
  { key: 'state', label: 'State', facet: 'states' },
  { key: 'hq', label: 'HQ', facet: 'hqs' },
];

export function FilterBar() {
  const filters = useUi((s) => s.filters);
  const patchFilters = useUi((s) => s.patchFilters);
  const clearFilters = useUi((s) => s.clearFilters);
  const { data } = useFilters(filters);

  return (
    <div className="px-5 py-4 border-b border-slate-100 space-y-3">
      <input
        type="text"
        className="filter-select w-full"
        placeholder="Search by name, EMP ID, email, designation…"
        value={filters.q || ''}
        onChange={(e) => patchFilters({ q: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => {
          const opts = (data as any)?.[f.facet] as Array<{ value: string; count: number }> | undefined;
          return (
            <select
              key={f.key}
              className="filter-select"
              value={(filters[f.key] as string) || ''}
              onChange={(e) => patchFilters({ [f.key]: e.target.value || undefined } as Partial<Filters>)}
            >
              <option value="">All {f.label}s</option>
              {opts?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.value} ({o.count})
                </option>
              ))}
            </select>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select
          className="filter-select"
          value={filters.role_id || ''}
          onChange={(e) => patchFilters({ role_id: e.target.value || undefined })}
        >
          <option value="">All Roles</option>
          {data?.roles.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label} · L{r.level} ({r.count})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.level !== undefined ? String(filters.level) : ''}
          onChange={(e) => patchFilters({ level: e.target.value ? Number(e.target.value) : undefined })}
        >
          <option value="">All Levels</option>
          {data?.levels.map((l) => (
            <option key={l.value} value={l.value}>
              Level {l.value} ({l.count})
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1 text-xs">
        <label className="flex items-center gap-2 text-slate-600">
          <input
            type="checkbox"
            checked={!!filters.vacant_only}
            onChange={(e) => patchFilters({ vacant_only: e.target.checked, filled_only: false })}
          />
          Vacant only
        </label>
        <label className="flex items-center gap-2 text-slate-600">
          <input
            type="checkbox"
            checked={!!filters.filled_only}
            onChange={(e) => patchFilters({ filled_only: e.target.checked, vacant_only: false })}
          />
          Filled only
        </label>
        <button
          type="button"
          className="text-pink-700 font-medium"
          onClick={clearFilters}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}
