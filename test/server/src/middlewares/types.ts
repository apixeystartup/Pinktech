import type { Request } from 'express';
import type { Types } from 'mongoose';
import type { PermissionKey } from '../config/rbac';

/** What auth + tenant middleware attach to the request. */
export interface AuthContext {
  userId: Types.ObjectId;
  tenantId: Types.ObjectId;
  roles: string[];
  permissions: Set<PermissionKey>;
  email: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}
