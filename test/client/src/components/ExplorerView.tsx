import { useUi } from '../store/ui';
import { DetailPanel } from './DetailPanel';
import { FilterBar } from './FilterBar';
import { DirectoryList } from './DirectoryList';
import { OrgTree } from './OrgTree';

export type ExplorerViewVariant = 'tree' | 'explorer';

function DirectoryColumn() {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-0 min-h-0 h-full">
      <div className="org-explorer-panel-head px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Directory</h2>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Search, filters, and the employee list.
        </p>
      </div>
      <FilterBar />
      <DirectoryList />
    </section>
  );
}

interface ExplorerViewProps {
  variant: ExplorerViewVariant;
}

export function ExplorerView({ variant }: ExplorerViewProps) {
  const selectedId = useUi((s) => s.selectedId);

  const gridCols =
    variant === 'tree'
      ? 'minmax(260px, 340px) minmax(0, 1fr)'
      : 'minmax(260px, 340px) minmax(280px, min(520px, 52vw))';

  return (
    <div
      className="grid gap-4 lg:gap-5 items-stretch org-explorer-grid w-full min-w-0"
      style={{ gridTemplateColumns: gridCols }}
    >
      <DirectoryColumn />
      {variant === 'tree' ? (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-0 min-h-0 h-full">
          <div className="org-explorer-panel-head px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
              {selectedId ? 'Org tree' : 'Pick someone to see their team'}
            </h2>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-prose">
              Click someone in the list or expand nodes in the tree to explore reporting lines. Use the Org explorer tab
              for profile and actions.
            </p>
          </div>
          <div className="p-5 sm:p-6 min-h-0 flex-1">
            <OrgTree />
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-w-0 min-h-0 h-full org-explorer-detail">
          <div className="org-explorer-panel-head px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Profile</h2>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Select someone in the directory to view their record, role, and actions.
            </p>
          </div>
          <div className="min-h-0 flex-1 flex flex-col">
            <DetailPanel />
          </div>
        </section>
      )}
    </div>
  );
}
