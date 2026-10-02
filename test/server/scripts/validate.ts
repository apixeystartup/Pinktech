/**
 * Track B end-to-end validation.
 *
 * Spins up an in-memory MongoDB (no service required), imports
 * ``SAMPLE ORG (1).xlsx`` into one tenant, asserts the same 9 roles and
 * sensible levels Track A produces, then imports the same workbook into a
 * second tenant and verifies cross-tenant isolation (each tenant sees its
 * own 9 roles; queries don't leak).
 */

import path from 'path';
import fs from 'fs';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Tenant } from '../src/models/Tenant';
import { Role } from '../src/models/Role';
import { Position } from '../src/models/Position';
import { runImport } from '../src/services/import';
import { effectiveLevel, effectiveScope } from '../src/services/role-engine';

const WORKBOOK = path.resolve(__dirname, '..', '..', 'SAMPLE ORG (1).xlsx');

const failed: string[] = [];
function check(label: string, ok: boolean, detail = ''): void {
  const flag = ok ? 'PASS' : 'FAIL';
  console.log(`  [${flag}] ${label}${detail ? ' - ' + detail : ''}`);
  if (!ok) failed.push(label);
}

async function importAs(tenantId: Types.ObjectId, filename: string) {
  const buffer = fs.readFileSync(WORKBOOK);
  return runImport({ tenantId, filename, buffer });
}

async function main() {
  console.log('\n========== Track B validation ==========\n');
  if (!fs.existsSync(WORKBOOK)) {
    throw new Error(`workbook not found at ${WORKBOOK}`);
  }

  console.log('Booting in-memory MongoDB...');
  const mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());

  try {
    const tenantA = await Tenant.create({ name: 'Tenant A', slug: 'tenant-a' });
    const tenantB = await Tenant.create({ name: 'Tenant B', slug: 'tenant-b' });

    console.log('\n1) Import workbook into Tenant A');
    const sumA = await importAs(tenantA._id, 'SAMPLE ORG (1).xlsx');
    console.log(
      `   parsed=${sumA.rowsParsed} positions=${sumA.positionsCreated} ` +
      `roles=${sumA.rolesDiscovered} max_level=${sumA.maxLevel} ` +
      `errors=${sumA.errorCount}`
    );
    check('9 roles auto-detected for Tenant A', sumA.rolesDiscovered === 9);
    check('all 134 rows parsed', sumA.rowsParsed === 134);
    check('134 positions created', sumA.positionsCreated === 134);

    console.log('\n2) Levels match the role-graph topology (parity with Track A)');
    const rolesA = await Role.find({ tenantId: tenantA._id });
    const find = (alias: string) => rolesA.find((r) => r.aliases.includes(alias));
    const gm  = find('GENERAL MANAGER');
    const sm  = find('SALES MANAGER');
    const zbm = find('ZONAL BUSINESS MANAGER');
    const rbm = find('REGIONAL BUSINESS MANAGER');
    const drbm= find('DEPUTY REGIONAL BUSINESS MANAGER');
    const abm = find('AREA BUSINESS MANAGER');
    const srabm = find('SENIOR AREA BUSINESS MANAGER');
    const bm  = find('BUSINESS MANAGER');
    const tbm = find('TRAINEE BUSINESS MANAGER');
    check('GM is highest', gm !== undefined && effectiveLevel(gm) === Math.max(...rolesA.map(effectiveLevel)));
    check('SM > ZBM',      sm !== undefined && zbm !== undefined && effectiveLevel(sm) > effectiveLevel(zbm));
    check('ZBM > RBM',     zbm !== undefined && rbm !== undefined && effectiveLevel(zbm) > effectiveLevel(rbm));
    check('RBM > ABM',     rbm !== undefined && abm !== undefined && effectiveLevel(rbm) > effectiveLevel(abm));
    check('ABM > BM',      abm !== undefined && bm !== undefined && effectiveLevel(abm) > effectiveLevel(bm));
    check('BM == TBM',     bm !== undefined && tbm !== undefined && effectiveLevel(bm) === effectiveLevel(tbm));
    check('ABM == SrABM',  abm !== undefined && srabm !== undefined && effectiveLevel(abm) === effectiveLevel(srabm));
    if (drbm) check('DRBM scope is ZONE', effectiveScope(drbm) === 'ZONE');
    if (gm)   check('GM scope is ALL_INDIA', effectiveScope(gm) === 'ALL_INDIA');
    if (bm)   check('BM scope is HQ', effectiveScope(bm) === 'HQ');

    console.log('\n3) Import same workbook into Tenant B (isolation)');
    const sumB = await importAs(tenantB._id, 'SAMPLE ORG (1).xlsx');
    check('9 roles for Tenant B', sumB.rolesDiscovered === 9);

    const rolesA2 = await Role.find({ tenantId: tenantA._id });
    const rolesB2 = await Role.find({ tenantId: tenantB._id });
    const positionsA = await Position.countDocuments({ tenantId: tenantA._id });
    const positionsB = await Position.countDocuments({ tenantId: tenantB._id });
    check('Tenant A still has 9 roles after Tenant B import', rolesA2.length === 9);
    check('Tenant B has 9 roles', rolesB2.length === 9);
    check('Tenant A still has 134 positions', positionsA === 134);
    check('Tenant B has 134 positions', positionsB === 134);

    const idsA = new Set(rolesA2.map((r) => String(r._id)));
    const idsB = new Set(rolesB2.map((r) => String(r._id)));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    check('No role _id leaks across tenants', overlap.length === 0);

    console.log('\n4) Re-detect on Tenant A preserves role count');
    const { runFor } = await import('../src/services/role-engine');
    const after = await runFor(tenantA._id);
    check('still 9 roles after re-detect', after.roles === 9);

    console.log('\n5) Cross-tenant query is impossible');
    const rolesACross = await Role.find({ tenantId: tenantB._id, _id: { $in: [...idsA] } });
    check(
      'Tenant B query for Tenant A role ids returns nothing',
      rolesACross.length === 0,
    );

    console.log('\n========== Summary ==========');
    if (failed.length) {
      console.log(`FAILED: ${failed.length} check(s)`);
      for (const f of failed) console.log('  - ' + f);
      process.exitCode = 1;
    } else {
      console.log('All Track B validation checks PASSED.');
    }
  } finally {
    await mongoose.disconnect();
    await mem.stop();
  }
}

main().catch((err) => {
  console.error('VALIDATION ERROR:', err);
  process.exit(1);
});
