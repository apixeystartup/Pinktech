import { Schema, model, type Document, type Types } from 'mongoose';

export interface IAuditLog extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId?: Types.ObjectId | null;
  action: string;                   // e.g. "role.update", "import.create"
  entity: { kind: string; id?: string };
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    userId:   { type: Schema.Types.ObjectId, ref: 'User',   default: null },
    action:   { type: String, required: true, index: true },
    entity:   {
      kind: { type: String, required: true },
      id:   { type: String },
    },
    before:   { type: Schema.Types.Mixed },
    after:    { type: Schema.Types.Mixed },
    meta:     { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AuditLogSchema.index({ tenantId: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
