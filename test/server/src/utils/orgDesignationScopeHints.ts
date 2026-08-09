import type { IRole } from '../models/Role';
import { norm } from './norm';

function normalizedNameAndAliases(role: IRole): string[] {
  const parts: string[] = [];
  if (role.name) parts.push(norm(role.name));
  for (const a of role.aliases || []) {
    if (a) parts.push(norm(a));
  }
  return parts.filter(Boolean);
}

export function isGeographicManagerRole(role: IRole): boolean {
  const markers = ['zonal manager', 'regional manager', 'area manager', 'business manager'];
  return normalizedNameAndAliases(role).some((n) => markers.some((m) => n.includes(m)));
}

const NATIONAL_EXACT = new Set(['accounts', 'administration', 'adminstration']);
const NATIONAL_ABBR = new Set(['vp', 'nsm', 'gm', 'mm', 'pm']);

export function isNationalOrgScopeRole(role: IRole): boolean {
  if (isGeographicManagerRole(role)) return false;

  const parts = normalizedNameAndAliases(role);
  for (const n of parts) {
    if (NATIONAL_EXACT.has(n)) return true;
    if (n.includes('vice president') || n.includes('national sales')) return true;
    if (/\bgeneral manager\b/.test(n)) return true;
    const toks = n.split(/[^a-z0-9]+/).filter(Boolean);
    for (const t of toks) {
      if (NATIONAL_ABBR.has(t)) return true;
    }
  }

  return false;
}
