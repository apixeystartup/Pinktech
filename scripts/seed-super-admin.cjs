const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

const Tenant = require(path.join(root, "services/auth-service/src/models/tenant.model"));
const User = require(path.join(root, "services/auth-service/src/models/user.model"));
const Role = require(path.join(root, "services/auth-service/src/models/role.model"));
const Permission = require(path.join(root, "services/platform-service/src/models/permission.model"));
const permissions = require(path.join(root, "services/platform-service/src/services/permissionCatalog"));

async function seed() {
  const email = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SUPER_ADMIN_PASSWORD || "");
  const name = process.env.SUPER_ADMIN_NAME || "Platform Super Admin";

  if (!email || !password || password.length < 8) {
    throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in .env.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const tenant = await Tenant.findOneAndUpdate(
    { code: "PINKTECH" },
    { $setOnInsert: { name: "PinkTech", code: "PINKTECH", email, plan: "enterprise", status: "ACTIVE" } },
    { upsert: true, new: true },
  );

  const permissionDocs = await Promise.all(
    permissions.map((permission) =>
      Permission.findOneAndUpdate(
        { code: permission.code },
        { $set: permission },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ),
    ),
  );

  const role = await Role.findOneAndUpdate(
    { tenantId: tenant._id, name: "Super Admin" },
    { $set: { type: "SYSTEM", permissionIds: permissionDocs.map((permission) => permission._id) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.findOneAndUpdate(
    { tenantId: tenant._id, email },
    { $set: { name, passwordHash, status: "ACTIVE", roleIds: [role._id] } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  console.log(`[seed] Super admin ready: ${user.email}`);
  console.log(`[seed] Tenant: ${tenant.code}; permissions: ${permissionDocs.length}; role: ${role.name}`);
}

seed()
  .catch((error) => {
    console.error(`[seed] Failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) {
      await mongoose.disconnect();
    }
  });
