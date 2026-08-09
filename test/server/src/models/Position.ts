import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * One row from the org workbook AND/OR the live mutation state for that
 * person. We intentionally keep the workbook row and the user-mutation
 * layer in a single document - it's denormalised but it makes both
 * re-imports (preserve customisations) and live mutations (single write)
 * dead simple.
 *
 *   originalParentPositionId / originalRoleId capture the value derived
 *   from the workbook at import time, so a "Reset hierarchy" can copy
 *   them back without re-parsing the workbook.
 *
 *   leftAt = null while the person is active; set to a Date when the
 *   user marks them as "left". They stay in the collection so a Restore
 *   can flip leftAt back to null.
 */

export type PositionStatus = 'ACTIVE' | 'VACANT' | 'INACTIVE';

export interface IPosition extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;

  // Identity (copied from the workbook row, preserved across re-imports).
  empId: string | null;
  name: string;
  designation: string | null;
  rowNumber: number | null;
  sno: number | null;

  // Geographic columns.
  hq: string | null;
  zone: string | null;
  region: string | null;
  state: string | null;

  // Personal columns.
  doj: string | null;
  dob: string | null;
  gender: string | null;

  // Hierarchy + role pointers (mutable - drive the live tree).
  roleId: Types.ObjectId | null;
  parentPositionId: Types.ObjectId | null;

  // Pristine values from the most recent workbook import. Used by
  // "Reset hierarchy" to undo every user override.
  originalParentPositionId: Types.ObjectId | null;
  originalRoleId: Types.ObjectId | null;
  reportingManagerRaw: string | null;

  // State flags.
  status: PositionStatus;
  isVacant: boolean;
  addedManually: boolean;
  leftAt: Date | null;
  managerOverride: boolean;
  roleOverride: boolean;
  managerResolution: string;

  createdAt: Date;
  updatedAt: Date;
}

const PositionSchema = new Schema<IPosition>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },

    empId:       { type: String, default: null, index: true },
    name:        { type: String, required: true },
    designation: { type: String, default: null },
    rowNumber:   { type: Number, default: null },
    sno:         { type: Number, default: null },

    hq:     { type: String, default: null },
    zone:   { type: String, default: null },
    region: { type: String, default: null },
    state:  { type: String, default: null },

    doj:    { type: String, default: null },
    dob:    { type: String, default: null },
    gender: { type: String, default: null },

    roleId:           { type: Schema.Types.ObjectId, ref: 'Role',     default: null, index: true },
    parentPositionId: { type: Schema.Types.ObjectId, ref: 'Position', default: null, index: true },

    originalParentPositionId: { type: Schema.Types.ObjectId, ref: 'Position', default: null },
    originalRoleId:           { type: Schema.Types.ObjectId, ref: 'Role',     default: null },
    reportingManagerRaw:      { type: String, default: null },

    status: { type: String, enum: ['ACTIVE', 'VACANT', 'INACTIVE'], default: 'ACTIVE' },
    isVacant:           { type: Boolean, default: false },
    addedManually:      { type: Boolean, default: false },
    leftAt:             { type: Date, default: null, index: true },
    managerOverride:    { type: Boolean, default: false },
    roleOverride:       { type: Boolean, default: false },
    managerResolution:  { type: String, default: 'unresolved' },
  },
  { timestamps: true }
);

PositionSchema.index({ tenantId: 1, parentPositionId: 1 });
PositionSchema.index({ tenantId: 1, empId: 1 });
PositionSchema.index({ tenantId: 1, leftAt: 1 });

export const Position = model<IPosition>('Position', PositionSchema);
