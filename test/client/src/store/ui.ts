import { create } from 'zustand';
import type { AddEmployeePayload } from '../api/hooks';
import type { Filters } from '../api/types';

export type Tab = 'org-tree' | 'org-explorer' | 'roles';

export type DialogState =
  | { kind: 'none' }
  | {
      kind: 'picker';
      title: string;
      subtitle?: string;
      preFilterRoleId?: string | null;
      excludeIds?: string[];
      onPick: (id: string | null) => void;
    }
  | { kind: 'role-change'; subjectId: string }
  | { kind: 'leave'; subjectId: string }
  | { kind: 'add-employee'; defaults: AddEmployeePayload }
  | { kind: 'replace'; subjectId: string }
  | { kind: 'edit-employee-email'; subjectId: string; initialEmail?: string | null }
  | { kind: 'removed-list' };

interface UiStore {
  tab: Tab;
  setTab: (t: Tab) => void;

  selectedId: string | null;
  setSelected: (id: string | null) => void;

  filters: Filters;
  setFilters: (f: Filters) => void;
  patchFilters: (f: Partial<Filters>) => void;
  clearFilters: () => void;

  expandedRoles: Set<string>;
  toggleRoleExpansion: (id: string) => void;

  dialog: DialogState;
  openDialog: (d: DialogState) => void;
  closeDialog: () => void;
}

export const useUi = create<UiStore>((set) => ({
  tab: 'org-tree',
  setTab: (tab) => set({ tab }),

  selectedId: null,
  setSelected: (selectedId) => set({ selectedId }),

  filters: {},
  setFilters: (filters) => set({ filters }),
  patchFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  clearFilters: () => set({ filters: {} }),

  expandedRoles: new Set<string>(),
  toggleRoleExpansion: (id) =>
    set((s) => {
      const next = new Set(s.expandedRoles);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedRoles: next };
    }),

  dialog: { kind: 'none' },
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: { kind: 'none' } }),
}));
