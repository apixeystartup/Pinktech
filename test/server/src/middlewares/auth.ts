import jwt, { type JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import type { Response, NextFunction } from 'express';
import { env } from '../config/env';
import { permissionsFor } from '../config/rbac';
import { User } from '../models/User';
import type { AuthedRequest } from './types';

interface AppJwtPayload extends JwtPayload {
  uid: string;
  tid: string;
  roles?: string[];
  email?: string;
}

export async function authMiddleware(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (!m) {
    res.status(401).json({ error: 'unauthenticated' });
    return;
  }

  let payload: AppJwtPayload;
  try {
    payload = jwt.verify(m[1], env.jwtSecret) as AppJwtPayload;
  } catch {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  // Re-fetch the user so a disabled / deleted account is rejected immediately.
  const user = await User.findById(payload.uid).lean();
  if (!user || user.status !== 'ACTIVE') {
    res.status(401).json({ error: 'user_inactive' });
    return;
  }

  req.auth = {
    userId: new Types.ObjectId(String(user._id)),
    tenantId: new Types.ObjectId(String(user.tenantId)),
    roles: user.roles,
    permissions: permissionsFor(user.roles),
    email: user.email,
  };
  next();
}

export function signToken(user: {
  _id: Types.ObjectId | string;
  tenantId: Types.ObjectId | string;
  roles: string[];
  email: string;
}): string {
  return jwt.sign(
    {
      uid: String(user._id),
      tid: String(user.tenantId),
      roles: user.roles,
      email: user.email,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn } as jwt.SignOptions
  );
}
