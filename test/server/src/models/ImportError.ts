import { Schema, model, type Document, type Types } from 'mongoose';

export interface IImportError extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  importId: Types.ObjectId;
  row: number;
  field?: string;
  code: string;          // 'manager_unresolved' | 'duplicate_emp_id' | ...
  message: string;
  raw?: Record<string, unknown>;
  createdAt: Date;
}

const ImportErrorSchema = new Schema<IImportError>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    importId: { type: Schema.Types.ObjectId, ref: 'Import', required: true, index: true },
    row:      { type: Number, required: true },
    field:    { type: String },
    code:     { type: String, required: true },
    message:  { type: String, required: true },
    raw:      { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const ImportError = model<IImportError>('ImportError', ImportErrorSchema);
