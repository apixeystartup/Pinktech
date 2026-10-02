/**
 * End-to-end smoke test for the MERN backend - hits the live HTTP server
 * on :4000 with the bootstrap token and exercises every directory +
 * mutation endpoint. Run with `npx tsx scripts/_smoke_api.ts`.
 */

const BASE = process.env.API_BASE || 'http://127.0.0.1:4000';

interface AnyJson { [k: string]: unknown }

async function call(method: string, path: string, opts: { token?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined> } = {}): Promise<AnyJson> {
  const url = new URL(BASE + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: AnyJson;
  try { json = text ? JSON.parse(text) : {}; }
  catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

const failed: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  const flag = ok ? 'PASS' : 'FAIL';
  console.log(`  [${flag}] ${label}${detail ? ' - ' + detail : ''}`);
  if (!ok) failed.push(label);
}

async function main() {
  console.log('\n========== MERN backend smoke test ==========\n');

  console.log('1) Bootstrap');
  const boot = await call('GET', '/api/bootstrap');
  const token = String(boot.token);
  check('bootstrap returns token', !!token);
  check('positions = 134', boot.positions === 134, String(boot.positions));
  check('roles = 9', boot.roles === 9, String(boot.roles));

  console.log('\n2) Reset hierarchy + reload to ensure clean slate');
  await call('POST', '/api/hierarchy/reset', { token });

  console.log('\n3) Stats / filters / roots / health');
  const stats: any = await call('GET', '/api/stats', { token });
  check('stats.total = 134', stats.total === 134, String(stats.total));
  check('stats.roles = 9', stats.roles === 9, String(stats.roles));
  check('stats.max_level >= 5', (stats.max_level ?? 0) >= 5, String(stats.max_level));

  const roots: any = await call('GET', '/api/roots', { token });
  check('at least one root', roots.roots && roots.roots.length >= 1);

  const filters: any = await call('GET', '/api/filters', { token });
  check('filters.zones non-empty', Array.isArray(filters.zones) && filters.zones.length > 0);
  check('filters.roles non-empty', Array.isArray(filters.roles) && filters.roles.length > 0);

  console.log('\n4) List + search + cascading filter');
  const all: any = await call('GET', '/api/employees', { token, query: { limit: 1000 } });
  check('list returns 134 items', all.count === 134, String(all.count));
  const search: any = await call('GET', '/api/employees', { token, query: { q: 'manager', limit: 1000 } });
  check('search hits at least 5', search.count >= 5, String(search.count));
  const eastFilter: any = await call('GET', '/api/filters', { token, query: { zone: 'EAST' } });
  check('EAST zone narrows regions', eastFilter.regions.length > 0 && eastFilter.regions.length < filters.regions.length);

  console.log('\n5) Subtree / ancestry');
  // Pick the largest root - the workbook has multiple top-of-org rows
  // because some REPORTING MANAGER entries reference people not in the sheet.
  let largest: any = null;
  for (const r of roots.roots) {
    const tr: any = await call('GET', `/api/employees/${r.id}/subtree`, { token });
    if (!largest || (tr.root.total_descendants ?? 0) > (largest.total_descendants ?? 0)) {
      largest = tr.root;
    }
  }
  check('largest root has children', (largest?.children?.length ?? 0) > 0);
  check('largest subtree covers most of the org', (largest?.total_descendants ?? 0) > 100, String(largest?.total_descendants));
  const dfs = (n: any): any => (n.children && n.children.length ? dfs(n.children[0]) : n);
  const leaf = dfs(largest);
  const anc: any = await call('GET', `/api/employees/${leaf.id}/ancestry`, { token });
  check('ancestry path non-empty', anc.ancestry.length >= 2);

  console.log('\n6) Roles list');
  const rolesList: any = await call('GET', '/api/roles', { token });
  check('roles list has 9', rolesList.roles.length === 9, String(rolesList.roles.length));
  const bm = rolesList.roles.find((r: any) => r.aliases.includes('BUSINESS MANAGER'));
  check('BM role found', !!bm);

  console.log('\n7) Hierarchy mutations: add + edit manager + reassign + leave + restore');
  const someAbm: any = all.items.find((e: any) => e.role_name?.toLowerCase().includes('area business manager') && !e.is_vacant);
  check('found a filled ABM', !!someAbm);
  const otherAbm: any = all.items.find(
    (e: any) =>
      e.role_name?.toLowerCase().includes('area business manager') &&
      !e.is_vacant &&
      e.id !== someAbm.id,
  );
  check('found a different ABM', !!otherAbm);

  const newPerson: any = await call('POST', '/api/employees', {
    token,
    body: {
      name: 'Smoke Test Recruit',
      emp_id: 'SMOKE001',
      manager_id: someAbm.id,
      role_id: bm.id,
      hq: 'Pune', zone: 'WEST', region: 'WEST', state: 'Maharashtra',
    },
  });
  check('new employee created', newPerson.employee?.name === 'Smoke Test Recruit');
  check('new employee has correct manager', newPerson.employee.manager_id === someAbm.id);

  // Edit role on the new person.
  const otherRole = rolesList.roles.find((r: any) => r.id !== bm.id);
  const edited: any = await call('PUT', `/api/employees/${newPerson.employee.id}`, {
    token,
    body: { role_id: otherRole.id },
  });
  check('role override applied', edited.employee.role_id === otherRole.id);

  // Move to other ABM.
  const moved: any = await call('PUT', `/api/employees/${newPerson.employee.id}`, {
    token,
    body: { manager_id: otherAbm.id },
  });
  check('manager override applied', moved.employee.manager_id === otherAbm.id);

  // Reassign someAbm's reports to otherAbm.
  const reassign: any = await call('POST', `/api/employees/${someAbm.id}/reassign-reports`, {
    token,
    body: { to_id: otherAbm.id },
  });
  check('reassign returns moved count', typeof reassign.moved === 'number');

  // Mark someAbm as left (default reassign-to is their manager).
  const leave: any = await call('POST', `/api/employees/${someAbm.id}/leave`, { token });
  check('leave succeeds', leave.removed === someAbm.id);

  const removed: any = await call('GET', '/api/hierarchy/removed', { token });
  check('removed list has the leaver', removed.items.some((r: any) => r.id === someAbm.id));

  // Restore.
  const restored: any = await call('POST', `/api/employees/${someAbm.id}/restore`, { token });
  check('restore returns employee', restored.employee.id === someAbm.id);

  // Reset hierarchy - should wipe overrides and put us back at 134 active.
  await call('POST', '/api/hierarchy/reset', { token });
  const after: any = await call('GET', '/api/employees', { token, query: { limit: 1000 } });
  check('hierarchy reset back to 134', after.count === 134, String(after.count));

  console.log('\n8) Reload (re-import workbook from disk)');
  const reload: any = await call('POST', '/api/reload', { token });
  check('reload completes', reload.ok === true);
  check('reload preserves 134 rows', reload.rowsParsed === 134);

  console.log('\n========== Summary ==========');
  if (failed.length) {
    console.log(`FAILED: ${failed.length} check(s)`);
    for (const f of failed) console.log('  - ' + f);
    process.exit(1);
  } else {
    console.log('All MERN backend smoke checks PASSED.');
  }
}

main().catch((err) => {
  console.error('SMOKE ERROR:', err);
  process.exit(1);
});
