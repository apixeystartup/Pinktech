import { Schema, model, type Document, type Types } from 'mongoose';

export type ImportStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface IImport extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  filename: string;
  status: ImportStatus;
  rowsParsed: number;
  rolesDiscovered: number;
  positionsCreated: number;
  errorCount: number;
  startedAt: Date;
  finishedAt?: Date | null;
  startedBy?: Types.ObjectId | null;
  summary?: Record<string, unknown>;
}

const ImportSchema = new Schema<IImport>(
  {
    tenantId:         { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    filename:         { type: String, required: true },
    status:           { type: String, enum: ['PENDING','RUNNING','COMPLETED','FAILED'], default: 'PENDING' },
    rowsParsed:       { type: Number, default: 0 },
    rolesDiscovered:  { type: Number, default: 0 },
    positionsCreated: { type: Number, default: 0 },
    errorCount:       { type: Number, default: 0 },
    startedAt:        { type: Date, default: Date.now },
    finishedAt:       { type: Date, default: null },
    startedBy:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
    summary:          { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Import = model<IImport>('Import', ImportSchema);
