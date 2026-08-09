const bcrypt = require("bcrypt");
const env = require("../config/env");
const { connectMongo } = require("../db/mongoose");
const Permission = require("../models/permission.model");
const Role = require("../models/role.model");
const Tenant = require("../models/tenant.model");
const User = require("../models/user.model");
const permissionCatalog = require("../common/constants/permissions");

async function seed() {
  await connectMongo();

  const platformTenant = await Tenant.findOneAndUpdate(
    { code: "PLATFORM" },
    { name: "Platform", code: "PLATFORM", status: "ACTIVE", plan: "enterprise" },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  const permissionDocs = [];
  for (const item of permissionCatalog) {
    const permission = await Permission.findOneAndUpdate(
      { code: item.code },
      item,
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    permissionDocs.push(permission);
  }

  const superRole = await Role.findOneAndUpdate(
    { tenantId: platformTenant._id, name: "Super Admin" },
    {
      tenantId: platformTenant._id,
      name: "Super Admin",
      type: "SYSTEM",
      permissionIds: permissionDocs.map((doc) => doc._id),
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, 12);
  await User.findOneAndUpdate(
    { tenantId: platformTenant._id, email: env.SUPER_ADMIN_EMAIL.toLowerCase() },
    {
      tenantId: platformTenant._id,
      name: env.SUPER_ADMIN_NAME,
      email: env.SUPER_ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      status: "ACTIVE",
      roleIds: [superRole._id],
      otpVerified: true,
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  process.exit(0);
}

seed().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});
