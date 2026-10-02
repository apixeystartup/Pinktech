import { useEmployees } from '../api/hooks';
import { useUi } from '../store/ui';
import { classNames, initials, scopeClass, scopeLabel } from '../utils/format';
import type { Employee } from '../api/types';

export function DirectoryList() {
  const filters = useUi((s) => s.filters);
  const selectedId = useUi((s) => s.selectedId);
  const setSelected = useUi((s) => s.setSelected);
  const { data, isLoading } = useEmployees(filters);

  return (
    <div>
      <div className="px-5 py-3 text-xs font-medium text-slate-500 sticky top-0 bg-white border-b border-slate-100 z-[1]">
        {isLoading ? 'Loading…' : `${data?.count ?? 0} people`}
      </div>
      <div className="divide-y divide-slate-100">
        {data?.items.map((emp) => (
          <DirectoryCard
            key={emp.id}
            emp={emp}
            selected={emp.id === selectedId}
            onSelect={() => setSelected(emp.id)}
          />
        ))}
      </div>
    </div>
  );
}

function DirectoryCard({
  emp,
  selected,
  onSelect,
}: {
  emp: Employee;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={classNames('dir-card', selected && 'selected')}
      onClick={onSelect}
    >
      <div className={classNames('dir-avatar', emp.is_vacant && 'vacant')}>
        {emp.is_vacant ? 'V' : initials(emp.name)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="dir-name truncate">{emp.name}</div>
        <div className="dir-meta truncate">
          {emp.role_name || emp.designation || 'Unspecified'}
          {emp.emp_id ? ` · ${emp.emp_id}` : ''}
        </div>
        <div className="dir-tags">
          <span className="tag level">L{emp.level}</span>
          {emp.role_name && (
            <span className={scopeClass(emp.scope)}>{scopeLabel(emp.scope)}</span>
          )}
          {emp.zone && <span className="tag zone">{emp.zone}</span>}
          {emp.is_vacant && <span className="tag vacant">Vacant</span>}
          {emp.added_manually && <span className="tag reports">Added</span>}
          {emp.direct_reports > 0 && (
            <span className="tag reports">{emp.direct_reports} reports</span>
          )}
          {emp.external_manager && <span className="tag ext">External boss</span>}
        </div>
      </div>
    </div>
  );
}
