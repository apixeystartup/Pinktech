import { Schema, model, type Document, type Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  email: string;
  passwordHash: string;
  fullName: string;
  roles: string[];                  // RBAC roles: 'owner' | 'admin' | etc.
  currentPositionId?: Types.ObjectId | null;
  status: 'ACTIVE' | 'INVITED' | 'DISABLED';
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    tenantId:          { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    email:             { type: String, required: true, lowercase: true, trim: true },
    passwordHash:      { type: String, required: true },
    fullName:          { type: String, required: true },
    roles:             { type: [String], default: ['viewer'] },
    currentPositionId: { type: Schema.Types.ObjectId, ref: 'Position', default: null },
    status:            { type: String, enum: ['ACTIVE', 'INVITED', 'DISABLED'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const User = model<IUser>('User', UserSchema);
