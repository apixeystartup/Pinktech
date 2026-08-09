# Pink SaaS Backend

Production-oriented backend foundation for a multi-tenant SaaS platform using Node.js, Express, MongoDB, and Mongoose.

## Implemented in this phase

- Modular monolith project structure from the approved architecture plan
- Secure Express baseline (Helmet, CORS, rate limit, sanitization, compression)
- MongoDB connection bootstrap
- Invite-only auth foundation (`login`, `verify-otp`, `set-password`, `invite`)
- Tenant-aware user/role/permission/position/assignment core models
- Audit log model and audit write service
- Queue foundation with BullMQ + Redis
- OpenAPI docs endpoint scaffold at `/api/docs`
- Super admin + permission seed script

## Quick start

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:
   - `npm install`
3. Seed platform super admin:
   - `npm run seed:super-admin`
4. Start API:
   - `npm run dev`

## Current API base

- `/api/v1/health`
- `/api/v1/auth/login`
- `/api/v1/auth/verify-otp`
- `/api/v1/auth/set-password`
- `/api/v1/auth/invite`
- `/api/v1/users/invite` (protected example path)
