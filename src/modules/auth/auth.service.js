const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../../models/user.model");
const Tenant = require("../../models/tenant.model");
const RefreshToken = require("../../models/refreshToken.model");
const Role = require("../../models/role.model");
const ApiError = require("../../common/errors/ApiError");
const env = require("../../config/env");
const { signAccessToken, signRefreshToken } = require("../../services/token.service");
const { writeAudit } = require("../../services/audit.service");
const notificationAdapter = require("../notifications/notification.adapter");

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

function generateInvitationCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

function isSyntheticOrgEmail(addr) {
  const e = String(addr || "").toLowerCase();
  return (
    e.endsWith("@org-sheet.pink") ||
    e.endsWith("@import.local") ||
    e.endsWith("@tenant.pink.local")
  );
}

/** Prefer real workbook / official address for SMTP; fall back to login email. */
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
  <h3>Step 1 — Verify OTP</h3>
  <ol>
    <li>Open the app sign-in page: <a href="${escHtml(loginUrl)}">${escHtml(loginUrl)}</a></li>
    <li>Choose <strong>Verify</strong> (or open <a href="${escHtml(verifyUrl)}">Verify OTP</a>).</li>
    <li>Enter your <strong>email</strong> (${safeEmail}) and the <strong>OTP</strong> above, then submit.</li>
  </ol>
  <p>You can also paste your <strong>invite token</strong> on the Verify page instead of email: <code style="word-break:break-all">${safeToken}</code></p>
  <h3>Step 2 — Invitation code (after OTP)</h3>
  <p>Right after OTP verification succeeds, we email you an <strong>invitation code</strong>.</p>
  <h3>Step 3 — Set password</h3>
  <ol>
    <li>On sign-in, open <strong>Set password</strong>.</li>
    <li>Enter your email, the invitation code from the second email, your new password, and confirm it.</li>
  </ol>
  <p>If links look plain, copy them into your browser. This invite expires in 48 hours; the OTP expires in 10 minutes.</p>
`;
}

function buildInvitationCodeEmail({ tenantName, invitationCode, loginEmail }) {
  const loginUrl = publicAppPath("/login");
  const setPasswordUrl = publicAppPath("/set-password");
  const safeTenant = escHtml(tenantName);
  const safeCode = escHtml(invitationCode);
  const safeEmail = escHtml(loginEmail);
  return `
  <p>Your OTP was verified for <strong>${safeTenant}</strong>.</p>
  <p><strong>Invitation code:</strong> <code style="font-size:1.2em">${safeCode}</code></p>
  <p><strong>Email to use:</strong> ${safeEmail}</p>
  <h3>Next — set your password</h3>
  <ol>
    <li>Open <a href="${escHtml(loginUrl)}">Sign in</a> and choose <strong>Set password</strong> (or go to <a href="${escHtml(setPasswordUrl)}">Set password</a>).</li>
    <li>Enter this email, the invitation code above, your new password, and confirm.</li>
  </ol>
`;
}

async function assignUniqueInvitationCode(user) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generateInvitationCode();
    // eslint-disable-next-line no-await-in-loop
    const clash = await User.findOne({ tenantId: user.tenantId, invitationCode: code })
      .select("_id")
      .lean();
    if (!clash) return code;
  }
  throw new ApiError(500, "Could not allocate invitation code");
}

async function resolvePermissionCodes(tenantId, roleIds = []) {
  if (!roleIds.length) {
    return [];
  }

  const validRoleIds = roleIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (!validRoleIds.length) {
    return [];
  }

  const roles = await Role.find({ tenantId, _id: { $in: validRoleIds } }).populate("permissionIds", "code");
  const codes = new Set();
  for (const role of roles) {
    for (const perm of role.permissionIds || []) {
      if (perm?.code) {
        codes.add(perm.code);
      }
    }
  }
  return Array.from(codes);
}

async function login({ email, password }) {
  const normalizedLogin = String(email).toLowerCase().trim();
  const user = await User.findOne({
    $or: [{ email: normalizedLogin }, { orgContactEmail: normalizedLogin }],
  }).select("+passwordHash");
  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  const tenant = await Tenant.findById(user.tenantId);
  if (!tenant || tenant.status !== "ACTIVE") {
    throw new ApiError(403, "Tenant is inactive");
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    throw new ApiError(423, "Account temporarily locked due to failed login attempts");
  }

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "Account is not active");
  }

  const isValid = await bcrypt.compare(password, user.passwordHash || "");
  if (!isValid) {
    user.loginAttempts = (user.loginAttempts || 0) + 1;
    if (user.loginAttempts >= 5) {
      user.status = "LOCKED";
      user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await user.save();
    throw new ApiError(401, "Invalid credentials");
  }

  const payload = {
    userId: user._id,
    tenantId: user.tenantId,
    roleIds: user.roleIds,
    positionId: user.currentPositionId,
    permissionCodes: await resolvePermissionCodes(user.tenantId, user.roleIds),
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

  return {
    accessToken: signAccessToken(payload),
    refreshToken,
    user: {
      id: user._id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      orgContactEmail: user.orgContactEmail || null,
      empCode: user.empCode || null,
      roleIds: user.roleIds,
      currentPositionId: user.currentPositionId,
    },
    /** Home organization (same as JWT tenant). Lets clients show org name without listing all tenants. */
    tenant: {
      _id: tenant._id,
      name: tenant.name,
      code: tenant.code,
      status: tenant.status,
    },
    permissionCodes: payload.permissionCodes,
  };
}

async function inviteUser({ tenantId, name, email, empCode = null, roleIds = [], currentPositionId = null }) {
  if (!tenantId) {
    throw new ApiError(400, "tenantId required");
  }

  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant || tenant.status !== "ACTIVE") {
    throw new ApiError(403, "Tenant is inactive");
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const trimmedEmp = empCode ? String(empCode).trim() : null;

  const existing = await User.findOne({
    tenantId,
    $or: [{ email: normalizedEmail }, { orgContactEmail: normalizedEmail }],
  }).select("_id email orgContactEmail empCode");

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
    invitationCode: null,
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
        ...inviteFields,
        email: normalizedEmail,
        empCode: trimmedEmp,
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  }

  await writeAudit({
    tenantId,
    action: "USER_INVITED",
    metadata: {
      userId: user._id,
      email: user.email,
      matchedInviteAddress: normalizedEmail,
      deliveryEmail: inviteDeliveryEmail(user),
    },
  });

  const tenantName = tenant.name || "your organization";
  /** Same address we deliver to (prefers fresh `orgContactEmail` from workbook / roster). */
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
    });
  } catch {
    // In development or with placeholder addresses (for example *.import.local),
    // invite records should still be created even if email delivery fails.
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

  const invitationCode = await assignUniqueInvitationCode(user);
  user.otpVerified = true;
  user.invitationCode = invitationCode;
  user.otpCode = null;
  user.otpExpiry = null;
  await user.save();

  const tenant = await Tenant.findById(user.tenantId).lean();
  const tenantName = tenant?.name || "your organization";
  const postOtpDeliver = inviteDeliveryEmail(user);
  try {
    await notificationAdapter.sendEmail({
      to: postOtpDeliver,
      subject: `${tenantName}: invitation code — set your password`,
      html: buildInvitationCodeEmail({
        tenantName,
        invitationCode,
        loginEmail: postOtpDeliver,
      }),
    });
  } catch {
    // Same as initial invite: verification succeeded even if mail fails in dev.
  }

  return { message: "OTP verified — check your email for the invitation code" };
}

async function setPassword({ inviteToken, email, invitationCode, password }) {
  const trimmedToken = inviteToken ? String(inviteToken).trim() : "";
  const normalizedEmail = email ? String(email).toLowerCase().trim() : "";
  const inv =
    invitationCode !== undefined && invitationCode !== null
      ? String(invitationCode).trim().toUpperCase()
      : "";

  let user;
  if (trimmedToken) {
    user = await User.findOne({ inviteToken: trimmedToken }).select(
      "+inviteToken +inviteExpiry +invitationCode",
    );
    if (!user) {
      throw new ApiError(400, "Invalid invite token");
    }
    if (!user.inviteExpiry || user.inviteExpiry < new Date()) {
      throw new ApiError(400, "Invite token expired");
    }
  } else if (normalizedEmail && inv) {
    user = await User.findOne({
      $or: [{ email: normalizedEmail }, { orgContactEmail: normalizedEmail }],
      invitationCode: inv,
    }).select("+inviteToken +inviteExpiry +invitationCode");
    if (!user) {
      throw new ApiError(400, "Invalid email or invitation code");
    }
  } else {
    throw new ApiError(400, "Provide inviteToken or email with invitationCode");
  }

  if (!user.otpVerified) {
    throw new ApiError(400, "OTP verification required");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  user.passwordHash = passwordHash;
  user.status = "ACTIVE";
  user.inviteToken = null;
  user.inviteExpiry = null;
  user.otpCode = null;
  user.otpExpiry = null;
  user.invitationCode = null;
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
    permissionCodes: await resolvePermissionCodes(user.tenantId, user.roleIds),
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

async function resendInvite({ tenantId, email }) {
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
  });

  return { message: "Invite resent", ...result };
}

async function forgotPassword({ email }) {
  const normalized = String(email).toLowerCase().trim();
  const user = await User.findOne({
    $or: [{ email: normalized }, { orgContactEmail: normalized }],
  }).select("+resetToken +resetExpiry");
  if (!user) {
    return { message: "If user exists, reset email has been sent" };
  }

  const resetToken = crypto.randomBytes(24).toString("hex");
  user.resetToken = resetToken;
  user.resetExpiry = new Date(Date.now() + 30 * 60 * 1000);
  await user.save();

  try {
    await notificationAdapter.sendEmail({
      to: inviteDeliveryEmail(user),
      subject: "Reset your password",
      html: `Reset token: ${resetToken}`,
    });
  } catch (err) {
    // Log but don't fail — user still sees the generic success message
  }

  return { message: "If user exists, reset email has been sent" };
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
  return {
    user: {
      id: user._id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      orgContactEmail: user.orgContactEmail || null,
      empCode: user.empCode || null,
      roleIds: user.roleIds,
      currentPositionId: user.currentPositionId,
    },
    tenant: {
      _id: tenant._id,
      name: tenant.name,
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
  user.passwordHash = await bcrypt.hash(password, 12);
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
