import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Couples a User to a Position over a time range. A user may hold a
 * succession of positions; we keep the full history so audit / org-chart
 * "as of" queries work later. ``endedAt: null`` means "currently held".
 */
export interface IAssignment extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  positionId: Types.ObjectId;
  startedAt: Date;
  endedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const AssignmentSchema = new Schema<IAssignment>(
  {
    tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant',   required: true, index: true },
    userId:     { type: Schema.Types.ObjectId, ref: 'User',     required: true, index: true },
    positionId: { type: Schema.Types.ObjectId, ref: 'Position', required: true, index: true },
    startedAt:  { type: Date, default: Date.now },
    endedAt:    { type: Date, default: null },
  },
  { timestamps: true }
);

AssignmentSchema.index({ tenantId: 1, userId: 1, endedAt: 1 });
AssignmentSchema.index({ tenantId: 1, positionId: 1, endedAt: 1 });

export const Assignment = model<IAssignment>('Assignment', AssignmentSchema);
