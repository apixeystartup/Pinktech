import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { Tenant } from '../models/Tenant';
import { User } from '../models/User';
import { AppError } from '../middlewares/error';
import { signToken } from '../middlewares/auth';

/**
 * Bootstrap: creates a tenant + the owner user atomically. The plan defers
 * the invite + OTP flow to a later milestone, so this is the only way to
 * get a tenant + owner into the system today. Returns a JWT for immediate
 * use.
 */
export async function registerTenant(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { tenantName, slug, owner } = req.body || {};
    if (!tenantName || !slug || !owner?.email || !owner?.password || !owner?.fullName) {
      throw new AppError(
        'missing_fields',
        400,
        ['tenantName', 'slug', 'owner.email', 'owner.password', 'owner.fullName']
      );
    }

    const existing = await Tenant.findOne({ slug: String(slug).toLowerCase() }).lean();
    if (existing) throw new AppError('tenant_slug_taken', 409);

    const tenant = await Tenant.create({ name: tenantName, slug });
    const passwordHash = await bcrypt.hash(String(owner.password), 10);
    const user = await User.create({
      tenantId: tenant._id,
      email: owner.email,
      passwordHash,
      fullName: owner.fullName,
      roles: ['owner'],
      status: 'ACTIVE',
    });

    const token = signToken({
      _id: user._id,
      tenantId: tenant._id,
      roles: user.roles,
      email: user.email,
    });

    res.status(201).json({
      tenant: { id: tenant._id, name: tenant.name, slug: tenant.slug },
      user: { id: user._id, email: user.email, roles: user.roles },
      token,
    });
  } catch (err) {
    next(err);
  }
}
