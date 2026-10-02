/** Small helpers shared by every component. */

export function initials(name?: string | null): string {
  if (!name) return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || '').join('') || '?';
}

export function scopeLabel(scope?: string | null): string {
  if (!scope) return '';
  return scope.replace(/_/g, ' ');
}

export function scopeClass(scope?: string | null): string {
  switch (scope) {
    case 'ALL_INDIA': return 'tag scope-all-india';
    case 'ZONE':      return 'tag scope-zone';
    case 'REGION':    return 'tag scope-region';
    case 'AREA':      return 'tag scope-area';
    case 'HQ':
    default:          return 'tag scope-hq';
  }
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value;
}
