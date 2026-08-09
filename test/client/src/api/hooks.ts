/** TanStack Query hooks for every backend endpoint we use. */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { api } from './client';
import type {
  Employee,
  FilterFacets,
  Filters,
  RemovedPerson,
  Role,
  Stats,
  SubtreeNode,
} from './types';

// -------- Reads --------

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => api<Stats>('GET', '/api/stats'),
    staleTime: 5_000,
  });
}

export function useFilters(criteria: Filters) {
  return useQuery({
    queryKey: ['filters', criteria],
    queryFn: () =>
      api<FilterFacets>('GET', '/api/filters', {
        query: criteria as Record<string, string | number | boolean | undefined>,
      }),
    staleTime: 5_000,
  });
}

export function useEmployees(criteria: Filters) {
  return useQuery({
    queryKey: ['employees', criteria],
    queryFn: () =>
      api<{ count: number; items: Employee[] }>('GET', '/api/employees', {
        query: { ...criteria, limit: criteria.limit ?? 1000 },
      }),
    staleTime: 5_000,
  });
}

export function useEmployee(
  key: string | null,
  opts?: Partial<UseQueryOptions<{ employee: Employee }>>,
) {
  return useQuery({
    queryKey: ['employee', key],
    queryFn: () => api<{ employee: Employee }>('GET', `/api/employees/${key}`),
    enabled: !!key,
    staleTime: 5_000,
    ...opts,
  });
}

export function useSubtree(key: string | null) {
  return useQuery({
    queryKey: ['subtree', key],
    queryFn: () => api<{ root: SubtreeNode }>('GET', `/api/employees/${key}/subtree`),
    enabled: !!key,
    staleTime: 5_000,
  });
}

export function useAncestry(key: string | null) {
  return useQuery({
    queryKey: ['ancestry', key],
    queryFn: () => api<{ ancestry: Employee[] }>('GET', `/api/employees/${key}/ancestry`),
    enabled: !!key,
    staleTime: 5_000,
  });
}

export function useRoots() {
  return useQuery({
    queryKey: ['roots'],
    queryFn: () => api<{ roots: Employee[] }>('GET', '/api/roots'),
    staleTime: 5_000,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => api<{ roles: Role[] }>('GET', '/api/roles'),
    staleTime: 5_000,
  });
}

export function useRemoved() {
  return useQuery({
    queryKey: ['removed'],
    queryFn: () =>
      api<{ count: number; items: RemovedPerson[] }>('GET', '/api/hierarchy/removed'),
    staleTime: 1_000,
  });
}

// -------- Cache invalidation helper --------

export function useRefreshAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['employees'] });
    qc.invalidateQueries({ queryKey: ['employee'] });
    qc.invalidateQueries({ queryKey: ['subtree'] });
    qc.invalidateQueries({ queryKey: ['ancestry'] });
    qc.invalidateQueries({ queryKey: ['roots'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
    qc.invalidateQueries({ queryKey: ['filters'] });
    qc.invalidateQueries({ queryKey: ['roles'] });
    qc.invalidateQueries({ queryKey: ['removed'] });
  };
}

// -------- Mutations --------

export function useSetManager() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: { id: string; manager_id: string | null }) =>
      api<{ employee: Employee }>('PUT', `/api/employees/${vars.id}`, {
        body: { manager_id: vars.manager_id },
      }),
    onSuccess: () => refresh(),
  });
}

export function useSetRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: { id: string; role_id: string }) =>
      api<{ employee: Employee }>('PUT', `/api/employees/${vars.id}`, {
        body: { role_id: vars.role_id },
      }),
    onSuccess: () => refresh(),
  });
}

export function useSetEmployeeContactEmail() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: { id: string; contact_email: string | null }) =>
      api<{ employee: Employee }>('PUT', `/api/employees/${vars.id}`, {
        body: { contact_email: vars.contact_email },
      }),
    onSuccess: () => refresh(),
  });
}

export function useReassignReports() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: { from_id: string; to_id: string; report_ids?: string[] }) =>
      api('POST', `/api/employees/${vars.from_id}/reassign-reports`, {
        body: { to_id: vars.to_id, report_ids: vars.report_ids },
      }),
    onSuccess: () => refresh(),
  });
}

export function useMarkLeft() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: { id: string; reassign_to?: string | null }) =>
      api('POST', `/api/employees/${vars.id}/leave`, {
        body: { reassign_to: vars.reassign_to ?? null },
      }),
    onSuccess: () => refresh(),
  });
}

export function useRestore() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: { id: string }) =>
      api<{ employee: Employee }>('POST', `/api/employees/${vars.id}/restore`),
    onSuccess: () => refresh(),
  });
}

export interface AddEmployeePayload {
  name: string;
  emp_id?: string | null;
  /** Sets login email and official email when set (login must be unique per tenant). */
  contact_email?: string | null;
  designation?: string | null;
  role_id?: string | null;
  manager_id?: string | null;
  hq?: string | null;
  zone?: string | null;
  region?: string | null;
  state?: string | null;
  doj?: string | null;
  dob?: string | null;
  gender?: string | null;
}

export function useAddEmployee() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (payload: AddEmployeePayload) =>
      api<{ employee: Employee }>('POST', '/api/employees', { body: payload }),
    onSuccess: () => refresh(),
  });
}

export function useReplacePerson() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: { id: string; payload: AddEmployeePayload }) =>
      api('POST', `/api/employees/${vars.id}/replace`, { body: vars.payload }),
    onSuccess: () => refresh(),
  });
}

export function useResetHierarchy() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api('POST', '/api/hierarchy/reset'),
    onSuccess: () => refresh(),
  });
}

export function useUpdateRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      name?: string;
      aliases?: string[];
      override?: { level?: number | null; scope?: string | null };
      clear_overrides?: boolean;
    }) => {
      const { id, ...body } = vars;
      return api<{ role: Role }>('PUT', `/api/roles/${id}`, { body });
    },
    onSuccess: () => refresh(),
  });
}

export function useResetRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ role: Role }>('POST', `/api/roles/${id}/reset`),
    onSuccess: () => refresh(),
  });
}

export function useCreateRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (vars: { name: string; aliases?: string[] }) =>
      api<{ role: Role }>('POST', '/api/roles', { body: vars }),
    onSuccess: () => refresh(),
  });
}

export function useResetAllRoles() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api('POST', '/api/roles/reset-all'),
    onSuccess: () => refresh(),
  });
}

export function useAutoDetectRoles() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api('POST', '/api/roles/auto-detect'),
    onSuccess: () => refresh(),
  });
}

export function useReload() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: () => api('POST', '/api/reload'),
    onSuccess: () => refresh(),
  });
}

export function useUploadWorkbook() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api('POST', '/api/imports', { formData: fd });
    },
    onSuccess: () => refresh(),
  });
}
