const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const Tenant = require("../models/tenant.model");
const Role = require("../models/role.model");
const RefreshToken = require("../models/refreshToken.model");
const Notification = require("../models/notification.model");
require("../models/permission.model");
const ApiError = require("@pink/shared").ApiError;
const { isPlatformTenant } = require("@pink/shared");
const env = require("../config/env");
const { signAccessToken, signRefreshToken } = require("./token.service");
const { writeAudit } = require("../services/audit.service");
const { notificationAdapter } = require("@pink/shared");
const {
  assertTenantAdminCanAssignRoles,
  assertTenantAdminCanManageAccount,
} = require("./accountAccess.service");

function generateOtpCode() {
  if (env.NODE_ENV !== "production" && env.DEV_OTP) {
    return env.DEV_OTP;
  }
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicAppPath(suffixPath) {
  const base = (env.APP_PUBLIC_URL || "").replace(/\/$/, "");
  const p = suffixPath.startsWith("/") ? suffixPath : `/${suffixPath}`;
  return base ? `${base}${p}` : p;
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isSyntheticOrgEmail(addr) {
  const e = String(addr || "").toLowerCase();
  return (
    e.endsWith("@org-sheet.pink") ||
    e.endsWith("@import.local") ||
    e.endsWith("@tenant.pink.local")
  );
}

function inviteDeliveryEmail(user) {
  const o = user.orgContactEmail ? String(user.orgContactEmail).toLowerCase().trim() : "";
  const login = user.email ? String(user.email).toLowerCase().trim() : "";
  if (o && !isSyntheticOrgEmail(o)) return o;
  if (login && !isSyntheticOrgEmail(login)) return login;
  return o || login;
}

function buildInitialInviteEmail({ tenantName, otpCode, inviteToken, loginEmail }) {
  const verifyUrl = publicAppPath("/verify-otp");
  const loginUrl = publicAppPath("/login");
  const safeTenant = escHtml(tenantName);
  const safeOtp = escHtml(otpCode);
  const safeEmail = escHtml(loginEmail);
  const safeToken = escHtml(inviteToken);
  return `
  <p>You have been invited to join <strong>${safeTenant}</strong>.</p>
  <p><strong>Your one-time password (OTP):</strong> ${safeOtp}</p>
  <p><strong>Sign-in email:</strong> ${safeEmail}</p>
  <h3>Steps to get started</h3>
  <ol>
    <li>Open the app sign-in page: <a href="${escHtml(loginUrl)}">${escHtml(loginUrl)}</a></li>
    <li>Choose <strong>Verify invite OTP</strong> (or open <a href="${escHtml(verifyUrl)}">Verify OTP</a>).</li>
    <li>Enter your <strong>email</strong> (${safeEmail}) and the <strong>OTP</strong> above, then submit.</li>
    <li>After OTP verification, you'll be redirected to <strong>set your password</strong>.</li>
  </ol>
  <p>You can also paste your <strong>invite token</strong> on the Verify page instead of email: <code style="word-break:break-all">${safeToken}</code></p>
  <p>This invite expires in 48 hours; the OTP expires in 10 minutes.</p>
`;
}

async function resolvePermissionCodes(_tenantId, _roleIds = [], _userEmail) {
  // Access control disabled: every user receives all permissions.
  return ["*"];
}

// Access control is disabled, so permission codes cannot distinguish a platform
// super admin from a tenant admin. Classify the account from its roles and
// tenant ownership instead: only Pinktech (the PLATFORM tenant) has a super
// admin — the SYSTEM role it owns applies to every tenant. An org admin is the
// tenant's designated admin (adminUserId / contact email) or carries an
// "…Admin" role; no individual tenant ever gets its own super admin.
async function resolveAccountRole(user, tenant) {
  const roleIds = user?.roleIds || [];
  const roles = roleIds.length
    ? await Role.find({ _id: { $in: roleIds }, tenantId: user.tenantId }).select("name type").lean()
    : [];
  if (isPlatformTenant(tenant) && roles.some((r) => r.type === "SYSTEM")) return "super_admin";

  const tenantEmail = String(tenant?.email || "").toLowerCase().trim();
  const userEmail = String(user?.email || "").toLowerCase().trim();
  const isTenantAdmin =
    (tenant?.adminUserId && String(tenant.adminUserId) === String(user?._id)) ||
    (tenantEmail && tenantEmail === userEmail) ||
    roles.some((r) => /admin/i.test(r.name || ""));
  return isTenantAdmin ? "tenant_admin" : "employee";
}

async function login({ email, password }) {
  const normalizedLogin = String(email).toLowerCase().trim();
  // Passwords copied out of emails/clients often pick up stray surrounding
  // whitespace, which bcrypt would then reject even though the visible text
  // matches. System-issued passwords never contain edge spaces, and every
  // password-setting flow below trims the same way, so trimming here is safe.
  const cleanPassword = String(password ?? "").trim();
  // Email is unique per tenant, not globally: the same address can belong to a
  // user in several tenants, each with its own password. Resolve every
  // candidate and pick the one whose password matches, instead of binding the
  // login to whichever record findOne() happens to return first.
  const candidates = await User.find({
    $or: [{ email: normalizedLogin }, { orgContactEmail: normalizedLogin }],
  }).select("+passwordHash");
  if (!candidates.length) {
    await writeAudit({
      tenantId: null,
      userId: null,
      action: "AUTH_LOGIN",
      status: "ERROR",
      errorMessage: "Invalid credentials",
      metadata: { email: normalizedLogin },
    });
    throw new ApiError(401, "Invalid credentials");
  }

  const now = new Date();
  let user = null;
  let tenant = null;

  for (const candidate of candidates) {
    if (candidate.lockUntil && candidate.lockUntil > now) continue;
    if (candidate.status === "LOCKED" && (!candidate.lockUntil || candidate.lockUntil <= now)) {
      candidate.status = "ACTIVE";
      candidate.loginAttempts = 0;
      candidate.lockUntil = null;
      await candidate.save();
    }
    if (candidate.status !== "ACTIVE") continue;
    const candidateTenant = await Tenant.findById(candidate.tenantId);
    if (!candidateTenant || candidateTenant.status !== "ACTIVE") continue;
    const isValid = await bcrypt.compare(cleanPassword, candidate.passwordHash || "");
    if (isValid) {
      user = candidate;
      tenant = candidateTenant;
      break;
    }
  }

  if (!user) {
    // Nothing authenticated. Fall back to the first record so lockout
    // accounting and the specific status errors behave as before.
    const target = candidates[0];
    const targetTenant = await Tenant.findById(target.tenantId);
    const failAudit = async (message) => {
      await writeAudit({
        tenantId: target.tenantId,
        userId: target._id,
        action: "AUTH_LOGIN",
        status: "ERROR",
        errorMessage: message,
        metadata: { email: normalizedLogin },
      });
    };
    if (!targetTenant || targetTenant.status !== "ACTIVE") {
      await failAudit("Tenant is inactive");
      throw new ApiError(403, "Tenant is inactive");
    }
    if (target.lockUntil && target.lockUntil > now) {
      await failAudit("Account temporarily locked due to failed login attempts");
      throw new ApiError(423, "Account temporarily locked after repeated failed login attempts.", {
        unlockAt: target.lockUntil,
        remainingSeconds: Math.max(0, Math.ceil((target.lockUntil.getTime() - now.getTime()) / 1000)),
      });
    }
    if (target.status !== "ACTIVE" || target.status === "DISABLED") {
      await failAudit("Account is not active");
      throw new ApiError(403, "Account is not active");
    }
    target.loginAttempts = (target.loginAttempts || 0) + 1;
    if (target.loginAttempts >= 5) {
      target.status = "LOCKED";
      target.lockUntil = new Date(now.getTime() + 15 * 60 * 1000);
      await target.save();
      await failAudit("Account temporarily locked due to failed login attempts");
      throw new ApiError(423, "Account temporarily locked after 5 failed attempts.", {
        unlockAt: target.lockUntil,
        remainingSeconds: 15 * 60,
      });
    }
    await target.save();
    await failAudit("Invalid credentials");
    const remainingAttempts = Math.max(0, 5 - target.loginAttempts);
    throw new ApiError(401, "Invalid credentials.", { remainingAttempts });
  }

  const payload = {
    userId: user._id,
    tenantId: user.tenantId,
    roleIds: user.roleIds,
    positionId: user.currentPositionId,
    permissionCodes: await resolvePermissionCodes(user.tenantId, user.roleIds, user.email),
  };

  user.loginAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save();

  const refreshToken = signRefreshToken(payload);
  await RefreshToken.create({
    userId: user._id,
    tenantId: user.tenantId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  await writeAudit({
    tenantId: user.tenantId,
    userId: user._id,
    action: "AUTH_LOGIN",
    metadata: { email: user.email },
  });

  const accountRole = await resolveAccountRole(user, tenant);

  return {
    accessToken: signAccessToken(payload),
    refreshToken,
    isSuperAdmin: accountRole === "super_admin",
    accountRole,
    user: {
      id: user._id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      orgContactEmail: user.orgContactEmail || null,
      empCode: user.empCode || null,
      designationOverride: user.designationOverride || null,
      roleIds: user.roleIds,
      currentPositionId: user.currentPositionId,
    },
    tenant: {
      _id: tenant._id,
      name: tenant.name,
      logo: tenant.logo || "",
      code: tenant.code,
      status: tenant.status,
    },
    permissionCodes: payload.permissionCodes,
  };
}

async function inviteUser({ tenantId, name, email, empCode = null, roleIds = [], currentPositionId = null, actor = null }) {
  if (!tenantId) {
    throw new ApiError(400, "tenantId required");
  }

  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant || tenant.status !== "ACTIVE") {
    throw new ApiError(403, "Tenant is inactive");
  }

  await assertTenantAdminCanAssignRoles(tenantId, roleIds, actor);

  const normalizedEmail = String(email).toLowerCase().trim();
  const trimmedEmp = empCode ? String(empCode).trim() : null;

  const existing = await User.findOne({
    tenantId,
    $or: [{ email: normalizedEmail }, { orgContactEmail: normalizedEmail }],
  }).select("_id email orgContactEmail empCode roleIds");
  if (existing) {
    await assertTenantAdminCanManageAccount(actor, tenantId, existing, "invite to");
  }

  if (trimmedEmp) {
    const empQ = { tenantId, empCode: trimmedEmp };
    if (existing) empQ._id = { $ne: existing._id };
    else empQ.email = { $ne: normalizedEmail };
    const empDup = await User.findOne(empQ).select("_id").lean();
    if (empDup) {
      throw new ApiError(409, "Employee ID is already used by another person in this tenant");
    }
  }

  const inviteToken = crypto.randomBytes(32).toString("hex");
  const otpCode = generateOtpCode();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  const inviteExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const inviteFields = {
    tenantId,
    name,
    roleIds,
    currentPositionId,
    status: "OTP_PENDING",
    inviteToken,
    inviteExpiry,
    otpCode,
    otpExpiry,
    otpVerified: false,
  };

  let user;
  if (existing) {
    let nextLoginEmail = String(existing.email || "").toLowerCase();
    if (isSyntheticOrgEmail(nextLoginEmail) && !isSyntheticOrgEmail(normalizedEmail)) {
      const clash = await User.findOne({
        tenantId,
        email: normalizedEmail,
        _id: { $ne: existing._id },
      })
        .select("_id")
        .lean();
      if (!clash) {
        nextLoginEmail = normalizedEmail;
      }
    }
    const setDoc = {
      ...inviteFields,
      email: nextLoginEmail,
      ...(trimmedEmp ? { empCode: trimmedEmp } : {}),
    };
    user = await User.findByIdAndUpdate(existing._id, { $set: setDoc }, { new: true });
  } else {
    user = await User.findOneAndUpdate(
      { tenantId, email: normalizedEmail },
      {
        $set: {
          ...inviteFields,
          email: normalizedEmail,
          empCode: trimmedEmp,
        },
        $setOnInsert: { invitedByUserId: actor?.userId || null },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  }

  await writeAudit({
    tenantId,
    userId: actor?.userId || null,
    action: "USER_INVITED",
    metadata: {
      userId: user._id,
      email: user.email,
      matchedInviteAddress: normalizedEmail,
      deliveryEmail: inviteDeliveryEmail(user),
    },
  });

  const tenantName = tenant.name || "your organization";
  const signInHint = inviteDeliveryEmail(user);
  const html = buildInitialInviteEmail({
    tenantName,
    otpCode,
    inviteToken,
    loginEmail: signInHint,
  });

  const deliverTo = signInHint;

  let notificationStatus = "SENT";
  try {
    await notificationAdapter.sendEmail({
      to: deliverTo,
      subject: `${tenantName}: your invite — verify with OTP`,
      html,
      templateParams: {
        to_email: deliverTo,
        subject: `${tenantName}: your invite — verify with OTP`,
        tenantName,
        otpCode,
        inviteToken,
        loginEmail: signInHint,
      },
    });
  } catch {
    notificationStatus = "FAILED";
  }

  return {
    userId: user._id,
    inviteToken,
    otpCode,
    inviteExpiry,
    notificationStatus,
  };
}

async function verifyOtp({ inviteToken, email, otpCode }) {
  const trimmedToken = inviteToken ? String(inviteToken).trim() : "";
  const normalizedEmail = email ? String(email).toLowerCase().trim() : "";

  let user;
  if (trimmedToken) {
    user = await User.findOne({ inviteToken: trimmedToken }).select(
      "+inviteToken +inviteExpiry +otpCode +otpExpiry +invitationCode",
    );
    if (!user) {
      throw new ApiError(400, "Invalid invite token");
    }
    if (!user.inviteExpiry || user.inviteExpiry < new Date()) {
      throw new ApiError(400, "Invite token expired");
    }
  } else if (normalizedEmail) {
    const candidates = await User.find({
      $or: [{ email: normalizedEmail }, { orgContactEmail: normalizedEmail }],
      status: "OTP_PENDING",
    }).select("+inviteToken +inviteExpiry +otpCode +otpExpiry +invitationCode");
    const now = new Date();
    const matches = candidates.filter(
      (u) => u.otpCode === otpCode && u.otpExpiry && u.otpExpiry > now && u.inviteExpiry && u.inviteExpiry > now,
    );
    if (matches.length === 0) {
      throw new ApiError(400, "Invalid email or OTP");
    }
    if (matches.length > 1) {
      throw new ApiError(
        400,
        "Multiple pending invites for this email — open Verify OTP from your invite email and use the invite token",
      );
    }
    user = matches[0];
  } else {
    throw new ApiError(400, "inviteToken or email required");
  }

  if (!user.otpExpiry || user.otpExpiry < new Date()) {
    throw new ApiError(400, "OTP expired");
  }
  if (user.otpCode !== otpCode) {
    throw new ApiError(400, "Invalid OTP");
  }

  user.otpVerified = true;
  user.otpCode = null;
  user.otpExpiry = null;
  await user.save();

  return { message: "OTP verified — you can now set your password", inviteToken: user.inviteToken };
}

async function setPassword({ inviteToken, email, password }) {
  const trimmedToken = inviteToken ? String(inviteToken).trim() : "";
  const normalizedEmail = email ? String(email).toLowerCase().trim() : "";

  let user;
  if (trimmedToken) {
    user = await User.findOne({ inviteToken: trimmedToken }).select(
      "+inviteToken +inviteExpiry",
    );
    if (!user) {
      throw new ApiError(400, "Invalid invite token");
    }
    if (!user.inviteExpiry || user.inviteExpiry < new Date()) {
      throw new ApiError(400, "Invite token expired");
    }
  } else if (normalizedEmail) {
    user = await User.findOne({
      $or: [{ email: normalizedEmail }, { orgContactEmail: normalizedEmail }],
    }).select("+inviteToken +inviteExpiry");
    if (!user) {
      throw new ApiError(400, "Invalid email");
    }
  } else {
    throw new ApiError(400, "Provide inviteToken or email");
  }

  if (!user.otpVerified) {
    throw new ApiError(400, "OTP verification required");
  }

  // Trimmed for the same copy-paste reason as login: what you set is what
  // sign-in compares, so edge whitespace can never lock anyone out.
  const passwordHash = await bcrypt.hash(String(password ?? "").trim(), 12);
  user.passwordHash = passwordHash;
  user.status = "ACTIVE";
  user.inviteToken = null;
  user.inviteExpiry = null;
  user.otpCode = null;
  user.otpExpiry = null;
  await user.save();

  await writeAudit({
    tenantId: user.tenantId,
    userId: user._id,
    action: "AUTH_PASSWORD_SET",
  });

  return { message: "Password set successfully" };
}

async function refresh({ refreshToken }) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new ApiError(401, "Invalid refresh token");
  }

  const savedToken = await RefreshToken.findOne({
    userId: decoded.userId,
    tokenHash: hashToken(refreshToken),
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!savedToken) {
    throw new ApiError(401, "Refresh token not recognized");
  }

  const user = await User.findById(decoded.userId);
  if (!user || user.status !== "ACTIVE") {
    throw new ApiError(401, "User not active");
  }

  savedToken.revokedAt = new Date();
  await savedToken.save();

  const payload = {
    userId: user._id,
    tenantId: user.tenantId,
    roleIds: user.roleIds,
    positionId: user.currentPositionId,
    permissionCodes: await resolvePermissionCodes(user.tenantId, user.roleIds, user.email),
  };

  const nextRefresh = signRefreshToken(payload);
  await RefreshToken.create({
    userId: user._id,
    tenantId: user.tenantId,
    tokenHash: hashToken(nextRefresh),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return {
    accessToken: signAccessToken(payload),
    refreshToken: nextRefresh,
    permissionCodes: payload.permissionCodes,
  };
}

async function resendInvite({ tenantId, email, actor = null }) {
  const normalizedEmail = String(email).toLowerCase().trim();
  const user = await User.findOne({
    tenantId,
    $or: [{ email: normalizedEmail }, { orgContactEmail: normalizedEmail }],
  }).select("name email orgContactEmail roleIds currentPositionId empCode");
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  const result = await inviteUser({
    tenantId,
    name: user.name,
    email: normalizedEmail,
    roleIds: user.roleIds,
    currentPositionId: user.currentPositionId,
    actor,
  });

  return { message: "Invite resent", ...result };
}

async function forgotPassword({ email }) {
  const normalized = String(email).toLowerCase().trim();
  const users = await User.find({
    $or: [{ email: normalized }, { orgContactEmail: normalized }],
  }).select("tenantId name email orgContactEmail empCode passwordResetRequestedAt");
  if (!users.length) {
    throw new ApiError(404, "No account exists for this email address.");
  }

  const requests = [];
  for (const user of users) {
    const tenant = await Tenant.findById(user.tenantId).lean();
    if (!tenant) {
      throw new ApiError(404, "The organization for this account could not be found.");
    }
    let admin = tenant.adminUserId
      ? await User.findById(tenant.adminUserId).select("_id name email").lean()
      : null;
    if (!admin && tenant.email) {
      admin = await User.findOne({ tenantId: user.tenantId, email: tenant.email })
        .select("_id name email")
        .lean();
    }
    if (!admin) {
      throw new ApiError(409, "Your organization does not have an administrator configured. Contact support.");
    }
    requests.push({ user, admin });
  }

  const requestedAt = new Date();
  for (const { user, admin } of requests) {
    const employeeEmail = inviteDeliveryEmail(user);
    user.passwordResetRequestedAt = requestedAt;
    await user.save();

    await Notification.create({
      tenantId: user.tenantId,
      userId: admin._id,
      fromUserId: user._id,
      recipientUserId: admin._id,
      channel: "IN_APP",
      message: `${user.name || "An employee"} (ID: ${user.empCode || "not provided"}, email: ${employeeEmail}) requested password reset credentials.`,
      subject: "Password reset request",
      eventType: "PASSWORD_RESET_REQUEST",
      status: "SENT",
      metadata: {
        employeeUserId: String(user._id),
        employeeId: user.empCode || "",
        employeeEmail,
        requestedAt,
      },
    });

    await writeAudit({
      tenantId: user.tenantId,
      userId: user._id,
      action: "AUTH_PASSWORD_RESET_REQUESTED",
      metadata: { email: employeeEmail, adminUserId: admin._id },
    });
  }
  return { message: "Your password reset request was sent to your organization administrator." };
}

async function getSessionProfile(userId) {
  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }
  const user = await User.findById(userId).lean();
  if (!user || user.status !== "ACTIVE") {
    throw new ApiError(401, "User not active");
  }
  const tenant = await Tenant.findById(user.tenantId).lean();
  if (!tenant || tenant.status !== "ACTIVE") {
    throw new ApiError(403, "Tenant is inactive");
  }
  const accountRole = await resolveAccountRole(user, tenant);
  return {
    isSuperAdmin: accountRole === "super_admin",
    accountRole,
    user: {
      id: user._id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      orgContactEmail: user.orgContactEmail || null,
      empCode: user.empCode || null,
      designationOverride: user.designationOverride || null,
      roleIds: user.roleIds,
      currentPositionId: user.currentPositionId,
    },
    tenant: {
      _id: tenant._id,
      name: tenant.name,
      logo: tenant.logo || "",
      code: tenant.code,
      status: tenant.status,
    },
  };
}

async function resetPassword({ resetToken, password }) {
  const user = await User.findOne({ resetToken }).select("+resetToken +resetExpiry");
  if (!user || !user.resetExpiry || user.resetExpiry < new Date()) {
    throw new ApiError(400, "Invalid or expired reset token");
  }
  user.passwordHash = await bcrypt.hash(String(password ?? "").trim(), 12);
  user.resetToken = null;
  user.resetExpiry = null;
  user.status = "ACTIVE";
  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();

  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });

  await writeAudit({
    tenantId: user.tenantId,
    userId: user._id,
    action: "AUTH_PASSWORD_RESET",
  });
  return { message: "Password reset successful" };
}

module.exports = {
  login,
  inviteUser,
  verifyOtp,
  setPassword,
  refresh,
  resendInvite,
  forgotPassword,
  resetPassword,
  getSessionProfile,
};
