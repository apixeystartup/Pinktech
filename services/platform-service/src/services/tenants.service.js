const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const Tenant = require("../models/tenant.model");
const User = require("../models/user.model");
const ApiError = require("@pink/shared").ApiError;
const { writeAudit } = require("./audit.service");
const { notificationAdapter, isPlatformTenant, PLATFORM_TENANT_CODES } = require("@pink/shared");

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

// Pinktech (the platform tenant, code PINKTECH in new databases and PLATFORM in
// older ones) is the platform itself, not one of the customer tenants the
// workspace manages, so it is never listed as a tenant.
async function listTenants() {
  return Tenant.find({ code: { $nin: PLATFORM_TENANT_CODES } }).sort({ createdAt: -1 });
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

/**
 * A tenant admin maintains their own organization's profile fields used across
 * templates (Party 1). Only contact fields are writable here — name, code,
 * plan and status stay with the super admin. Tenant admins always address
 * their own tenant (the gateway forbids overrides for them); a super admin
 * addresses whichever tenant is in context.
 */
async function updateOwnTenantProfile(tenantId, payload, actor) {
  if (!actor?.isAdmin) {
    throw new ApiError(403, "Only administrators can update the organization profile");
  }
  const allowed = {};
  for (const key of ["email", "address", "phone", "registrationNumber"]) {
    if (payload[key] !== undefined) allowed[key] = payload[key];
  }
  if (!Object.keys(allowed).length) {
    throw new ApiError(422, "Nothing to update");
  }
  if (allowed.email === "") delete allowed.email;
  const tenant = await Tenant.findByIdAndUpdate(tenantId, allowed, { returnDocument: "after" });
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  await writeAudit({
    tenantId: tenant._id,
    userId: actor?.userId || null,
    action: "TENANT_PROFILE_UPDATED",
    metadata: allowed,
  });

  return tenant;
}

async function updateTenant(tenantId, payload, actor) {
  if (payload && payload.email === "") {
    delete payload.email;
  }
  const current = await Tenant.findById(tenantId);
  if (!current) {
    throw new ApiError(404, "Tenant not found");
  }
  // The platform tenant powers super-admin auth for every tenant. Suspending it
  // locks the whole workspace out, so it can never be taken down.
  if (isPlatformTenant(current) && payload?.status && payload.status !== "ACTIVE") {
    throw new ApiError(400, "The platform tenant cannot be suspended");
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

async function assignTenantAccount(tenantId, userId, actor) {
  const targetId = String(userId || "").trim();
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw new ApiError(400, "Invalid employee");
  }

  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  const employee = await User.findOne({ _id: targetId });
  if (!employee) {
    throw new ApiError(404, "Employee not found");
  }
  if (String(employee.tenantId) !== String(tenantId)) {
    throw new ApiError(400, "Employee does not belong to this tenant");
  }
  if (!employee.email) {
    throw new ApiError(400, "Employee has no email address");
  }

  // 1. Credentials reach the employee's own mailbox first, so the account is
  //    usable before the tenant starts pointing at it.
  const tempPassword = "Admin@" + crypto.randomBytes(3).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 10);
  employee.passwordHash = passwordHash;
  employee.status = "ACTIVE";
  await employee.save();

  try {
    await notificationAdapter.sendEmail({
      to: employee.email,
      subject: `${tenant.name} — admin account assigned`,
      html: `Hi ${employee.name || "there"}, you are now the admin for ${tenant.name}. Email: ${employee.email}, Password: ${tempPassword}`,
      templateParams: {
        to_email: employee.email,
        subject: `${tenant.name} — admin account assigned`,
        tenantName: tenant.name,
        name: employee.name || "",
        email: employee.email,
        tempPassword,
      },
    });
  } catch (emailErr) {
    console.error("Failed to send assigned admin credentials email:", emailErr.message);
  }

  // 2. Only then repoint the tenant admin email at the employee.
  const previousEmail = tenant.email || "";
  tenant.email = employee.email;
  tenant.adminUserId = employee._id;
  await tenant.save();

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "TENANT_ADMIN_ASSIGNED",
    metadata: {
      tenantId,
      adminUserId: employee._id,
      email: employee.email,
      previousEmail,
    },
  });

  return tenant;
}

async function unassignTenantAccount(tenantId, userId, actor) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) {
    throw new ApiError(404, "Tenant not found");
  }

  const currentAdminId = tenant.adminUserId ? String(tenant.adminUserId) : "";
  const currentEmail = tenant.email || "";
  if (!currentAdminId && !currentEmail) {
    throw new ApiError(400, "Tenant admin account is already vacant");
  }

  const targetId = String(userId || "").trim();
  if (targetId) {
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      throw new ApiError(400, "Invalid employee");
    }
    const employee = await User.findOne({ _id: targetId });
    if (!employee) {
      throw new ApiError(404, "Employee not found");
    }
    if (String(employee.tenantId) !== String(tenantId)) {
      throw new ApiError(400, "Employee does not belong to this tenant");
    }
    const isCurrentAdmin = currentAdminId
      ? targetId === currentAdminId
      : employee.email === currentEmail;
    if (!isCurrentAdmin) {
      throw new ApiError(400, "Selected employee is not the current tenant admin");
    }
  }

  const previousEmail = currentEmail;
  const previousAdminUserId = currentAdminId || null;
  tenant.email = "";
  tenant.adminUserId = null;
  await tenant.save();

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "TENANT_ADMIN_UNASSIGNED",
    metadata: { tenantId, previousAdminUserId, previousEmail },
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
  // The platform tenant powers super-admin auth for every tenant. Deleting it
  // would strand every account, so it can never be removed through the API.
  if (isPlatformTenant(tenant)) {
    throw new ApiError(400, "The platform tenant cannot be deleted");
  }

  // Deleting a tenant removes everything that belongs to it, in every tab.
  // Previously only roles were removed, leaving orphaned users whose tenant no
  // longer exists — their logins then failed with "Tenant is inactive" and
  // their rows polluted cross-tenant lookups. The sweep below covers every
  // tenant-scoped collection directly by tenantId, then follows the two
  // indirect links (submissions via their module, import errors via their
  // import). Audit history, the permission catalog, and mail counters are
  // global and are intentionally kept.
  const tidStr = String(tenantId);
  const tid = mongoose.Types.ObjectId.isValid(tidStr)
    ? new mongoose.Types.ObjectId(tidStr)
    : tidStr;
  const tenantKey = { $in: Array.from(new Set([tid, tidStr])) };
  const db = mongoose.connection.db;

  const moduleIds = await db
    .collection("modules")
    .find({ tenantId: tenantKey }, { projection: { _id: 1 } })
    .toArray()
    .then((rows) => rows.map((r) => r._id))
    .catch(() => []);
  const importIds = await db
    .collection("imports")
    .find({ tenantId: tenantKey }, { projection: { _id: 1 } })
    .toArray()
    .then((rows) => rows.map((r) => r._id))
    .catch(() => []);

  const directCollections = [
    "users",
    "roles",
    "assignments",
    "positions",
    "externalusers",
    "notifications",
    "imports",
    "refreshtokens",
    "publicformtokens",
    "documents",
    "workflows",
    "forms",
    "formtemplates",
    "formsubmissions",
    "kycrecords",
    "modules",
    "signatures",
    "approvals",
    "schemaformdispatches",
    "pinkform_audit_logs",
  ];
  for (const name of directCollections) {
    try {
      await db.collection(name).deleteMany({ tenantId: tenantKey });
    } catch {
      // Collection may not exist in this database; anything tenant-scoped
      // that does exist is matched by the tenantId filter above.
    }
  }
  if (moduleIds.length) {
    try {
      await db.collection("submissions").deleteMany({ moduleId: { $in: moduleIds } });
    } catch {
      // No submissions collection in this database; nothing linked to clean.
    }
  }
  if (importIds.length) {
    try {
      await db.collection("importerrors").deleteMany({ importId: { $in: importIds } });
    } catch {
      // No importerrors collection in this database; nothing linked to clean.
    }
  }
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
  updateOwnTenantProfile,
  assignTenantAccount,
  unassignTenantAccount,
  deleteTenant,
  sendTenantCredentials,
  resetTenantCredentials,
};
