import { Types } from 'mongoose';
import { Import, type IImport } from '../models/Import';
import { Position } from '../models/Position';
import { parseXlsxBuffer } from './xlsx-parser';
import { buildPositions } from './position-builder';
import { runFor } from './role-engine';

export interface ImportResult {
  importId: Types.ObjectId;
  status: IImport['status'];
  rowsParsed: number;
  positionsCreated: number;
  rolesDiscovered: number;
  errorCount: number;
  maxLevel: number;
  scopes: Record<string, number>;
}

/**
 * End-to-end Excel import for a tenant:
 *
 *   1. parse the workbook into ParsedRow[]
 *   2. wipe the tenant's existing Positions (a re-import is a fresh load)
 *   3. build Positions + resolve parentPositionId from manager names
 *   4. run the role engine to assign role_id, levels, scopes
 *   5. update the Import record with stats
 */
export async function runImport(opts: {
  tenantId: Types.ObjectId;
  filename: string;
  buffer: Buffer;
  startedBy?: Types.ObjectId | null;
}): Promise<ImportResult> {
  const { tenantId, filename, buffer, startedBy } = opts;

  const importDoc = await Import.create({
    tenantId,
    filename,
    status: 'RUNNING',
    startedBy: startedBy || null,
  });

  try {
    const rows = await parseXlsxBuffer(buffer);

    // Re-imports replace the tenant's positions. We keep historical
    // Assignments untouched - only the seat tree gets rebuilt.
    await Position.deleteMany({ tenantId });

    const { positions, errorCount } = await buildPositions(
      { tenantId, importId: importDoc._id },
      rows,
    );

    const summary = await runFor(tenantId);

    importDoc.status = 'COMPLETED';
    importDoc.rowsParsed = rows.length;
    importDoc.positionsCreated = positions.length;
    importDoc.rolesDiscovered = summary.roles;
    importDoc.errorCount = errorCount;
    importDoc.finishedAt = new Date();
    importDoc.summary = {
      maxLevel: summary.maxLevel,
      scopes: summary.scopes,
      createdRoles: summary.createdRoles,
    };
    await importDoc.save();

    return {
      importId: importDoc._id,
      status: importDoc.status,
      rowsParsed: rows.length,
      positionsCreated: positions.length,
      rolesDiscovered: summary.roles,
      errorCount,
      maxLevel: summary.maxLevel,
      scopes: summary.scopes,
    };
  } catch (err) {
    importDoc.status = 'FAILED';
    importDoc.finishedAt = new Date();
    importDoc.summary = {
      error: err instanceof Error ? err.message : String(err),
    };
    await importDoc.save();
    throw err;
  }
}
