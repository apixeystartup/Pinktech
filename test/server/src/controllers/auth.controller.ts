import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { AppError } from '../middlewares/error';
import { signToken } from '../middlewares/auth';

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenantSlug, email, password } = req.body || {};
    if (!tenantSlug || !email || !password) {
      throw new AppError('missing_fields', 400, ['tenantSlug', 'email', 'password']);
    }
    const tenant = await Tenant.findOne({ slug: String(tenantSlug).toLowerCase() }).lean();
    if (!tenant) throw new AppError('invalid_credentials', 401);

    const user = await User.findOne({ tenantId: tenant._id, email: String(email).toLowerCase() });
    if (!user || user.status !== 'ACTIVE') throw new AppError('invalid_credentials', 401);

    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) throw new AppError('invalid_credentials', 401);

    const token = signToken({
      _id: user._id,
      tenantId: user.tenantId,
      roles: user.roles,
      email: user.email,
    });
    res.json({
      token,
      user: { id: user._id, email: user.email, roles: user.roles, fullName: user.fullName },
      tenant: { id: tenant._id, slug: tenant.slug, name: tenant.name },
    });
  } catch (err) {
    next(err);
  }
}
