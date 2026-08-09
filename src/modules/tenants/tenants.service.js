const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const Tenant = require("../../models/tenant.model");
const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const Position = require("../../models/position.model");
const Assignment = require("../../models/assignment.model");
const Import = require("../../models/import.model");
const ImportError = require("../../models/importError.model");
const env = require("../../config/env");
const ApiError = require("../../common/errors/ApiError");
const { writeAudit } = require("../../services/audit.service");
const { sendEmail } = require("../notifications/notification.adapter");

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  const bytes = crypto.randomBytes(12);
  for (let i = 0; i < 12; i++) {
    pass += chars[bytes[i] % chars.length];
  }
  return pass;
}

function generateEmpCode(name) {
  const clean = (name || "").replace(/[^a-zA-Z]/g, "").toUpperCase();
  const prefix = clean.slice(0, 2) || "AD";
  const num = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}${num}`;
}

function buildTenantAdminEmail({ tenantName, email, password, empCode, loginUrl }) {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #0f172a;">
      <div style="background: linear-gradient(135deg, #4f46e5, #0891b2); padding: 28px; border-radius: 14px 14px 0 0; text-align: center;">
        <h1 style="color: #fff; font-size: 1.4rem; margin: 0; letter-spacing: -0.02em;">Approve.io</h1>
        <p style="color: rgba(255,255,255,0.8); font-size: 0.85rem; margin: 6px 0 0;">Tenant Admin Credentials</p>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; padding: 28px; border-radius: 0 0 14px 14px;">
        <p style="font-size: 0.95rem; line-height: 1.6; margin: 0 0 16px;">
          A new tenant <strong>${tenantName}</strong> has been created on Approve.io. Your admin credentials are:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.9rem;">
          <tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Email</td><td style="padding: 8px 12px;">${email}</td></tr>
          <tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Employee ID</td><td style="padding: 8px 12px; font-family: monospace;">${empCode}</td></tr>
          <tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Password</td><td style="padding: 8px 12px; font-family: monospace; background: #fef3c7; border-radius: 4px;">${password}</td></tr>
        </table>
        <p style="font-size: 0.85rem; color: #64748b; margin: 16px 0 0;">
          Use your email or Employee ID to sign in. You will be prompted to change your password after first login.
        </p>
        <div style="text-align: center; margin: 24px 0 8px;">
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 28px; background: linear-gradient(155deg, #6366f1, #4f46e5, #0e7490); color: #fff; text-decoration: none; border-radius: 999px; font-weight: 600; font-size: 0.9rem;">Sign in to Approve.io</a>
        </div>
      </div>
      <p style="font-size: 0.75rem; color: #94a3b8; text-align: center; margin-top: 16px;">
        This is an automated message from Approve.io. Do not share these credentials.
      </p>
    </div>
  `;
}

function buildResendCredsEmail({ tenantName, email, password, empCode, loginUrl }) {
  return buildTenantAdminEmail({ tenantName, email, password, empCode, loginUrl });
}

async function createTenant(payload, actor) {
  const existing = await Tenant.findOne({ code: payload.code.toUpperCase() });
  if (existing) {
    throw new ApiError(409, "Tenant code already exists");
  }

  const tenant = await Tenant.create({
    name: payload.name,
    code: payload.code.toUpperCase(),
    adminEmail: payload.adminEmail,
    plan: payload.plan,
    status: payload.status,
  });

  const empCode = generateEmpCode(payload.name);
  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);

  const Permission = require("../../models/permission.model");
  const permissionCatalog = require("../../common/constants/permissions");
  const permDocs = [];
  for (const item of permissionCatalog) {
    const doc = await Permission.findOneAndUpdate({ code: item.code }, item, {
      upsert: true, returnDocument: "after", setDefaultsOnInsert: true,
    });
    permDocs.push(doc);
  }

  const adminRole = await Role.findOneAndUpdate(
    { tenantId: tenant._id, name: "Tenant Admin" },
    { tenantId: tenant._id, name: "Tenant Admin", type: "SYSTEM", permissionIds: permDocs.map((d) => d._id) },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  await User.create({
    tenantId: tenant._id,
    name: `${payload.name} Admin`,
    email: payload.adminEmail.toLowerCase(),
    empCode,
    passwordHash,
    status: "ACTIVE",
    roleIds: [adminRole._id],
  });

  const loginUrl = env.APP_PUBLIC_URL || "http://localhost:5173/login";
  const html = buildTenantAdminEmail({
    tenantName: payload.name,
    email: payload.adminEmail,
    password,
    empCode,
    loginUrl,
  });

  let emailSent = false;
  let emailError = null;
  try {
    await sendEmail({
      to: payload.adminEmail,
      subject: `Approve.io — Admin credentials for ${payload.name}`,
      html,
    });
    emailSent = true;
  } catch (err) {
    emailError = err.message || "Email send failed";
    console.error("Failed to send tenant admin credentials email:", err);
  }

  await writeAudit({
    tenantId: null,
    userId: actor?.userId || null,
    action: "TENANT_CREATED",
    metadata: { tenantId: tenant._id, code: tenant.code, adminEmail: payload.adminEmail },
  });

  return {
    ...tenant.toObject(),
    credentials: {
      email: payload.adminEmail,
      empCode,
      password,
      emailSent,
      emailError,
    },
  };
}

async function listTenants(tenantId) {
  const tenant = await Tenant.findById(tenantId).select("code").lean();
  if (tenant?.code === "PLATFORM") {
    return Tenant.find().sort({ createdAt: -1 });
  }
  return Tenant.find({ _id: tenantId }).sort({ createdAt: -1 });
}

async function getCurrentTenant(tenantId) {
  if (!tenantId || !mongoose.Types.ObjectId.isValid(String(tenantId))) {
    throw new ApiError(400, "Invalid tenant context");
  }
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }
  return tenant;
}

async function updateTenant(tenantId, payload, actor) {
  const tenantBefore = await Tenant.findById(tenantId);
  if (!tenantBefore) {
    throw new ApiError(404, "Tenant not found");
  }

  const tenant = await Tenant.findByIdAndUpdate(tenantId, payload, { returnDocument: "after" });

  if (payload.adminEmail && tenantBefore.adminEmail) {
    const oldEmail = String(tenantBefore.adminEmail).toLowerCase().trim();
    const newEmail = String(payload.adminEmail).toLowerCase().trim();
    if (oldEmail !== newEmail) {
      const adminUser = await User.findOne({ tenantId, email: oldEmail });
      if (adminUser) {
        adminUser.email = newEmail;
        await adminUser.save();
      }
    }
  }

  await writeAudit({
    tenantId: tenant._id,
    userId: actor?.userId || null,
    action: "TENANT_UPDATED",
    metadata: payload,
  });

  return tenant;
}

async function sendTenantCredentials(tenantId, actor) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }
  if (!tenant.adminEmail) {
    throw new ApiError(400, "No admin email set for this tenant. Edit the tenant to add an admin email first.");
  }

  const user = await User.findOne({ tenantId: tenant._id, email: tenant.adminEmail.toLowerCase() });
  if (!user) {
    throw new ApiError(404, "Admin user not found for this tenant");
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 12);
  user.passwordHash = passwordHash;
  user.status = "ACTIVE";
  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  const loginUrl = env.APP_PUBLIC_URL || "http://localhost:5173/login";
  const html = buildResendCredsEmail({
    tenantName: tenant.name,
    email: tenant.adminEmail,
    password,
    empCode: user.empCode,
    loginUrl,
  });

  let emailSent = false;
  let emailError = null;
  try {
    await sendEmail({
      to: tenant.adminEmail,
      subject: `Approve.io — Your credentials for ${tenant.name}`,
      html,
    });
    emailSent = true;
  } catch (err) {
    emailError = err.message || "Email send failed";
    console.error("Failed to send tenant credentials email:", err);
  }

  await writeAudit({
    tenantId: tenant._id,
    userId: actor?.userId || null,
    action: "TENANT_CREDENTIALS_SENT",
    metadata: { tenantId: tenant._id, email: tenant.adminEmail, emailSent },
  });

  return { success: true, email: tenant.adminEmail, password, empCode: user.empCode, emailSent, emailError };
}

async function deleteTenant(tenantId, actor) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }
  if (String(actor?.baseTenantId || actor?.tenantId || "") === String(tenantId)) {
    throw new ApiError(400, "Super admin home tenant cannot be deleted");
  }

  const importIds = (await Import.find({ tenantId }, { _id: 1 })).map((row) => row._id);
  await Promise.all([
    User.deleteMany({ tenantId }),
    Role.deleteMany({ tenantId }),
    Position.deleteMany({ tenantId }),
    Assignment.deleteMany({ tenantId }),
    Import.deleteMany({ tenantId }),
  ]);
  if (importIds.length) {
    await ImportError.deleteMany({ importId: { $in: importIds } });
  }

  await Tenant.deleteOne({ _id: tenantId });

  await writeAudit({
    tenantId: null,
    userId: actor?.userId || null,
    action: "TENANT_DELETED",
    metadata: { tenantId, code: tenant.code, name: tenant.name },
  });
}

module.exports = {
  createTenant,
  listTenants,
  getCurrentTenant,
  updateTenant,
  sendTenantCredentials,
  deleteTenant,
};
