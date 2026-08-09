import { create } from 'zustand';
export const useUi = create((set) => ({
    tab: 'org-tree',
    setTab: (tab) => set({ tab }),
    selectedId: null,
    setSelected: (selectedId) => set({ selectedId }),
    filters: {},
    setFilters: (filters) => set({ filters }),
    patchFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
    clearFilters: () => set({ filters: {} }),
    expandedRoles: new Set(),
    toggleRoleExpansion: (id) => set((s) => {
        const next = new Set(s.expandedRoles);
        if (next.has(id))
            next.delete(id);
        else
            next.add(id);
        return { expandedRoles: next };
    }),
    dialog: { kind: 'none' },
    openDialog: (dialog) => set({ dialog }),
    closeDialog: () => set({ dialog: { kind: 'none' } }),
}));
