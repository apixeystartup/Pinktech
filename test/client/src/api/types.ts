/** Shapes returned by the Express API. Mirrors employee.service.ts. */

export interface ManagerView {
  id: string;
  name: string;
  emp_id: string | null;
  designation: string | null;
  role_name: string;
}

export interface RoleView {
  id: string;
  name: string;
  level: number;
  scope: string;
}

export interface Employee {
  id: string;
  emp_id: string | null;
  name: string;
  designation: string | null;
  role_id: string | null;
  role_name: string;
  level: number;
  scope: string;
  hq: string | null;
  zone: string | null;
  region: string | null;
  state: string | null;
  doj: string | null;
  dob: string | null;
  gender: string | null;
  /** Login / primary email (may be synthetic for sheet-only users). */
  email?: string | null;
  /** Official / workbook email when set (`orgContactEmail`). */
  official_email?: string | null;
  /** Preferred display: official email, else login. */
  contact_email?: string | null;
  login_email?: string | null;
  is_vacant: boolean;
  added_manually: boolean;
  manager_id: string | null;
  manager_resolution: string;
  reporting_manager_raw: string | null;
  external_manager: string | null;
  direct_reports: number;
  manager: ManagerView | null;
  role: RoleView | null;
}

export interface SubtreeNode extends Employee {
  children: SubtreeNode[];
  depth: number;
  total_descendants: number;
}

export interface Stats {
  total: number;
  filled: number;
  vacant: number;
  unresolved: number;
  roots: number;
  roles: number;
  max_level: number;
  by_zone: Record<string, number>;
  by_designation: Record<string, number>;
  by_role: Record<string, number>;
  by_level: Record<string, number>;
}

export interface FilterOption { value: string; count: number }
export interface LevelOption { value: number; count: number }
export interface RoleFilterOption {
  value: string; label: string; level: number; scope: string; count: number;
}

export interface FilterFacets {
  zones: FilterOption[];
  regions: FilterOption[];
  states: FilterOption[];
  hqs: FilterOption[];
  designations: FilterOption[];
  roles: RoleFilterOption[];
  levels: LevelOption[];
  max_level: number;
}

export interface Role {
  id: string;
  name: string;
  aliases: string[];
  auto: { level: number; scope: string; detectedAt: string };
  override: { level?: number; scope?: string };
  effectiveLevel: number;
  effectiveScope: string;
  employeeCount: number;
}

export interface RemovedPerson {
  id: string;
  emp_id: string | null;
  name: string;
  designation: string | null;
  role_name: string | null;
  hq: string | null;
  zone: string | null;
  region: string | null;
  state: string | null;
  last_manager_name: string | null;
  direct_reports: number;
  left_at: string;
}

export interface BootstrapResult {
  token: string;
  tenant: { id: string; slug: string; name: string };
  user: { id: string; email: string; roles: string[] };
  imported: boolean;
  positions: number;
  roles: number;
  workbookPath: string | null;
}

export interface Filters {
  q?: string;
  zone?: string;
  region?: string;
  state?: string;
  hq?: string;
  designation?: string;
  role_id?: string;
  level?: string | number;
  manager?: string;
  vacant_only?: boolean;
  filled_only?: boolean;
  strict_geography?: boolean;
  limit?: number;
}
