const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Tenant = require("../models/tenant.model");
const Role = require("../models/role.model");
const ApiError = require("@pink/shared").ApiError;
const { writeAudit } = require("./audit.service");
const notificationAdapter = require("./notification.adapter");

async function createTenant(payload, actor) {
  const existing = await Tenant.findOne({ code: payload.code.toUpperCase() });
  if (existing) {
    throw new ApiError(409, "Tenant code already exists");
  }

  const tenant = await Tenant.create({
    ...payload,
    code: payload.code.toUpperCase(),
  });

  await writeAudit({
    tenantId: null,
    userId: actor?.userId || null,
    action: "TENANT_CREATED",
    metadata: { tenantId: tenant._id, code: tenant.code },
  });

  return tenant;
}

async function listTenants() {
  return Tenant.find().sort({ createdAt: -1 });
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
  if (payload && payload.email === "") {
    delete payload.email;
  }
  const tenant = await Tenant.findByIdAndUpdate(tenantId, payload, { returnDocument: "after" });
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  await writeAudit({
    tenantId: tenant._id,
    userId: actor?.userId || null,
    action: "TENANT_UPDATED",
    metadata: payload,
  });

  return tenant;
}

async function deleteTenant(tenantId, actor) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }
  if (String(actor?.baseTenantId || actor?.tenantId || "") === String(tenantId)) {
    throw new ApiError(400, "Super admin home tenant cannot be deleted");
  }

  await Role.deleteMany({ tenantId });
  await Tenant.deleteOne({ _id: tenantId });

  await writeAudit({
    tenantId: null,
    userId: actor?.userId || null,
    action: "TENANT_DELETED",
    metadata: { tenantId, code: tenant.code, name: tenant.name },
  });
}

async function sendTenantCredentials(tenantId, actor) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }
  if (!tenant.email) {
    throw new ApiError(400, "Tenant has no email address configured");
  }

  const User = mongoose.model("User");
  let adminUser = await User.findOne({ tenantId, email: tenant.email });

  if (!adminUser) {
    const tempPassword = "Admin@" + crypto.randomBytes(3).toString("hex");
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    await User.create({
      tenantId,
      name: tenant.name + " Admin",
      email: tenant.email,
      passwordHash,
      status: "ACTIVE",
      roleIds: [],
    });

    if (tenant.email) {
      try {
        await notificationAdapter.sendEmail({
          to: tenant.email,
          subject: `${tenant.name} — admin account created`,
          html: `Welcome to ${tenant.name}. Email: ${tenant.email}, Password: ${tempPassword}`,
          templateParams: {
            to_email: tenant.email,
            subject: `${tenant.name} — admin account created`,
            tenantName: tenant.name,
            email: tenant.email,
            tempPassword,
          },
        });
      } catch (emailErr) {
        console.error("Failed to send tenant credentials email:", emailErr.message);
      }
    }

    await writeAudit({
      tenantId,
      userId: actor?.userId || null,
      action: "TENANT_CREDENTIALS_SENT",
      metadata: { tenantId, email: tenant.email, created: true },
    });

    return { email: tenant.email, tempPassword, created: true };
  }

  const tempPassword = "Admin@" + crypto.randomBytes(3).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  adminUser.passwordHash = passwordHash;
  adminUser.status = "ACTIVE";
  await adminUser.save();

  if (tenant.email) {
    try {
      await notificationAdapter.sendEmail({
        to: tenant.email,
        subject: `${tenant.name} — password reset`,
        html: `Password reset for ${tenant.name}. Email: ${tenant.email}, Password: ${tempPassword}`,
        templateParams: {
          to_email: tenant.email,
          subject: `${tenant.name} — password reset`,
          tenantName: tenant.name,
          email: tenant.email,
          tempPassword,
        },
      });
    } catch (emailErr) {
      console.error("Failed to send tenant credentials email:", emailErr.message);
    }
  }

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "TENANT_CREDENTIALS_SENT",
    metadata: { tenantId, email: tenant.email, created: false },
  });

  return { email: tenant.email, tempPassword, created: false };
}

async function resetTenantCredentials(tenantId, actor) {
  return sendTenantCredentials(tenantId, actor);
}

module.exports = {
  createTenant,
  listTenants,
  getCurrentTenant,
  updateTenant,
  deleteTenant,
  sendTenantCredentials,
  resetTenantCredentials,
};
