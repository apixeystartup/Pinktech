import { Schema, model, type Document, type Types } from 'mongoose';

export type Scope = 'ALL_INDIA' | 'ZONE' | 'REGION' | 'AREA' | 'HQ';
export const SCOPES: readonly Scope[] = ['ALL_INDIA', 'ZONE', 'REGION', 'AREA', 'HQ'];

export interface IRoleAuto {
  level: number;
  scope: Scope;
  detectedAt: Date;
}

export interface IRoleOverride {
  level?: number;
  scope?: Scope;
}

export interface IRole extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  name: string;
  aliases: string[];
  auto: IRoleAuto;
  override?: IRoleOverride;
  employeeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    name:     { type: String, required: true },
    aliases:  { type: [String], default: [], index: true },
    auto: {
      level:      { type: Number, required: true, default: 1 },
      scope:      { type: String, enum: SCOPES, required: true, default: 'HQ' },
      detectedAt: { type: Date, default: Date.now },
    },
    override: {
      level: { type: Number, default: undefined },
      scope: { type: String, enum: SCOPES, default: undefined },
    },
    employeeCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One role name per tenant.
RoleSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const Role = model<IRole>('Role', RoleSchema);

// Effective level / scope helpers (override > auto).
export function effectiveLevel(role: Pick<IRole, 'auto' | 'override'>): number {
  return role.override?.level ?? role.auto.level;
}
export function effectiveScope(role: Pick<IRole, 'auto' | 'override'>): Scope {
  return role.override?.scope ?? role.auto.scope;
}
