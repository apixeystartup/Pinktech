import { useState } from 'react';
import { useSubtree, useRoots } from '../api/hooks';
import { useUi } from '../store/ui';
import type { SubtreeNode } from '../api/types';
import { classNames, initials, scopeClass, scopeLabel } from '../utils/format';

export function OrgTree() {
  const selectedId = useUi((s) => s.selectedId);
  const setSelected = useUi((s) => s.setSelected);
  const subQ = useSubtree(selectedId);
  const rootsQ = useRoots();

  if (!selectedId) {
    return (
      <div className="text-sm text-slate-500">
        <p className="mb-2">Tip: click anyone in the directory to focus their team.</p>
        {rootsQ.data && rootsQ.data.roots.length > 0 && (
          <>
            <p className="mb-2">Top of org:</p>
            <ul className="space-y-1">
              {rootsQ.data.roots.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="ancestry-link"
                    onClick={() => setSelected(r.id)}
                  >
                    {r.name} — {r.role_name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  if (subQ.isLoading) return <div className="text-sm text-slate-500">Loading tree…</div>;
  if (!subQ.data) return null;

  return (
    <ul className="org-tree">
      <TreeLi node={subQ.data.root} />
    </ul>
  );
}

function TreeLi({ node }: { node: SubtreeNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const setSelected = useUi((s) => s.setSelected);
  const selectedId = useUi((s) => s.selectedId);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <li className={classNames(collapsed && 'collapsed')}>
      <div className={classNames('node', node.is_vacant && 'vacant', node.id === selectedId && 'selected')}>
        <div
          className={classNames('node-toggle', !hasChildren && 'empty')}
          onClick={() => hasChildren && setCollapsed((c) => !c)}
          title={hasChildren ? (collapsed ? 'Expand' : 'Collapse') : ''}
        />
        <div className="node-body" onClick={() => setSelected(node.id)}>
          <div className="flex items-start gap-2">
            <div className={classNames('dir-avatar', node.is_vacant && 'vacant')} style={{ width: 32, height: 32, fontSize: 11 }}>
              {node.is_vacant ? 'V' : initials(node.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="node-name truncate">{node.name}</div>
              <div className="node-meta truncate">
                {node.role_name || node.designation || 'Unspecified'}
                {node.emp_id ? ` · ${node.emp_id}` : ''}
              </div>
              <div className="node-tags">
                <span className="tag level">L{node.level}</span>
                <span className={scopeClass(node.scope)}>{scopeLabel(node.scope)}</span>
                {node.zone && <span className="tag zone">{node.zone}</span>}
                {node.is_vacant && <span className="tag vacant">Vacant</span>}
                {node.added_manually && <span className="tag reports">Added</span>}
                {node.children.length > 0 && (
                  <span className="tag reports">
                    {node.children.length} reports · {node.total_descendants} total
                  </span>
                )}
                {node.external_manager && <span className="tag ext">External boss</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
      {hasChildren && (
        <ul>
          {node.children.map((c) => (
            <TreeLi key={c.id} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}
