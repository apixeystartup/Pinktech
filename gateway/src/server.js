const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const hpp = require("hpp");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const http = require("http");
const crypto = require("crypto");
const env = require("./config/env");
const { logger } = require("@pink/shared");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
// The raw body is kept so the Resend webhook can verify its Svix HMAC signature.
// Re-serialising the parsed JSON would not reproduce the exact bytes Resend signed.
app.use(express.json({ limit: "2mb", verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(hpp());

/**
 * Rate limiting.
 *
 * The origin runs a single 1 GB / 1-vCPU Oracle shape against a MongoDB Atlas
 * Free cluster capped at ~100 operations per second, so a single burst from one
 * client can exhaust the database budget for every other tenant. Limiting here
 * protects the shared bottleneck before any work reaches a service.
 *
 * Authentication endpoints get a much tighter budget because they are the brute
 * force and credential-stuffing surface.
 */
const apiLimiter = rateLimit({
  windowMs: Number(env.RATE_LIMIT_WINDOW_MS || 60 * 1000),
  limit: Number(env.RATE_LIMIT_MAX || 300),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests, please retry shortly" },
});

const authLimiter = rateLimit({
  windowMs: Number(env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  limit: Number(env.AUTH_RATE_LIMIT_MAX || 30),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many attempts, please retry later" },
});

app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/forgot-password", authLimiter);
app.use("/api/v1/auth/reset-password", authLimiter);
app.use("/api/v1/auth/verify-otp", authLimiter);
app.use("/api/v1/auth/set-password", authLimiter);
app.use("/api/v1/auth/resend-invite", authLimiter);
app.use("/api/v1/auth/invite", authLimiter);
app.use("/api/v1/auth", authLimiter);

app.use(apiLimiter);

const userSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, default: "INVITED" },
  roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],
}, { timestamps: true, strict: false });

const roleSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },
  name: { type: String, required: true },
  permissionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Permission" }],
}, { timestamps: true, strict: false });

const permissionSchema = new mongoose.Schema({
  code: { type: String, required: true },
}, { timestamps: true, strict: false });

const tenantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  status: { type: String, default: "ACTIVE" },
}, { timestamps: true, strict: false });

const User = mongoose.model("User", userSchema);
const Role = mongoose.model("Role", roleSchema);
const Permission = mongoose.model("Permission", permissionSchema);
const Tenant = mongoose.model("Tenant", tenantSchema);

const SERVICE_MAP = {
  auth: "http://127.0.0.1:4001",
  platform: "http://127.0.0.1:4002",
  org: "http://127.0.0.1:4003",
  forms: "http://127.0.0.1:4004",
  workflow: "http://127.0.0.1:4005",
  kyc: "http://127.0.0.1:4006",
  documents: "http://127.0.0.1:4007",
  notifications: "http://127.0.0.1:4008",
};

const ROUTE_SERVICE_MAP = [
  { prefix: "/api/v1/auth", service: "auth", servicePath: "/auth" },
  { prefix: "/api/v1/users", service: "auth", servicePath: "/users" },
  { prefix: "/api/v1/tenants", service: "platform", servicePath: "/tenants" },
  { prefix: "/api/v1/roles", service: "platform", servicePath: "/roles" },
  { prefix: "/api/v1/permissions", service: "platform", servicePath: "/permissions" },
  { prefix: "/api/v1/audit", service: "platform", servicePath: "/audit" },
  { prefix: "/api/v1/dashboard", service: "platform", servicePath: "/dashboard" },
  { prefix: "/api/v1/assignments", service: "org", servicePath: "/assignments" },
  { prefix: "/api/v1/positions", service: "org", servicePath: "/positions" },
  { prefix: "/api/v1/org", service: "org", servicePath: "/" },
  { prefix: "/api/v1/forms", service: "forms", servicePath: "/" },
  { prefix: "/api/v1/schema-forms", service: "forms", servicePath: "/schema-forms" },
  { prefix: "/api/v1/workflows", service: "workflow", servicePath: "/" },
  { prefix: "/api/v1/kyc", service: "kyc", servicePath: "/" },
  { prefix: "/api/v1/documents", service: "documents", servicePath: "/documents" },
  { prefix: "/api/v1/signatures", service: "documents", servicePath: "/signatures" },
  { prefix: "/api/v1/notifications", service: "notifications", servicePath: "/" },
  { prefix: "/api/v1/submissions", service: "forms", servicePath: "/submissions" },
  { prefix: "/api/submissions", service: "forms", servicePath: "/submissions" },
  { prefix: "/api/v1/public/forms", service: "forms", servicePath: "/public" },
  { prefix: "/api/v1/public/form", service: "forms", servicePath: "/public" },
  { prefix: "/api/v1/public/schema-dispatch", service: "kyc", servicePath: "/public/schema-dispatch" },
  { prefix: "/api/v1/public/kyc", service: "kyc", servicePath: "/public/kyc" },
];

function resolveRoute(path) {
  for (const route of ROUTE_SERVICE_MAP) {
    if (path.startsWith(route.prefix)) {
      return route;
    }
  }
  return null;
}

const agent = new http.Agent({ keepAlive: false, maxSockets: 10 });

function proxyRequest(targetUrl, path, req, res) {
  const url = new URL(path, targetUrl);

  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["keep-alive"];

  if (req.headers["x-auth-user-id"]) {
    headers["x-auth-user-id"] = req.headers["x-auth-user-id"];
  }
  if (req.headers["x-auth-tenant-id"]) {
    headers["x-auth-tenant-id"] = req.headers["x-auth-tenant-id"];
  }
  if (req.headers["x-auth-base-tenant-id"]) {
    headers["x-auth-base-tenant-id"] = req.headers["x-auth-base-tenant-id"];
  }
  if (req.headers["x-auth-permission-codes"]) {
    headers["x-auth-permission-codes"] = req.headers["x-auth-permission-codes"];
  }
  if (req.headers["x-auth-role-ids"]) {
    headers["x-auth-role-ids"] = req.headers["x-auth-role-ids"];
  }

  const options = {
    hostname: url.hostname,
    port: url.port,
    path: url.pathname + url.search,
    method: req.method,
    headers,
    agent,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    logger.error({ err, targetUrl, path }, "Proxy error");
    if (!res.headersSent) {
      res.status(502).json({ message: "Service unavailable", error: err.message, targetUrl, path });
    }
  });

  proxyReq.setTimeout(15000, () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ message: "Service timeout" });
    }
  });

  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    const ct = req.headers["content-type"] || "";
    if (ct.includes("application/json")) {
      const body = JSON.stringify(req.body || {});
      proxyReq.setHeader("content-length", Buffer.byteLength(body));
      proxyReq.write(body);
      proxyReq.end();
    } else {
      req.on("data", (chunk) => proxyReq.write(chunk));
      req.on("end", () => proxyReq.end());
    }
  } else {
    proxyReq.end();
  }
}

async function authMiddleware(req, res, next) {
  const publicPaths = [
    "/api/v1/auth/login",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/refresh",
    "/api/v1/auth/verify-otp",
    "/api/v1/auth/set-password",
    "/api/v1/public/",
  ];

  for (const p of publicPaths) {
    if (req.path.startsWith(p)) {
      return next();
    }
  }

  const isPublicSubmissionPdf = ["/api/submissions/", "/api/v1/submissions/"].some(
    (p) => req.path.startsWith(p) && req.path.endsWith("/pdf")
  );
  if (isPublicSubmissionPdf) {
    return next();
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Missing access token" });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    const user = await User.findById(decoded.userId).select("status tenantId roleIds email");
    if (!user || user.status !== "ACTIVE") {
      return res.status(401).json({ message: "User not active" });
    }
    const tenant = await Tenant.findById(decoded.tenantId);
    if (!tenant || tenant.status !== "ACTIVE") {
      return res.status(403).json({ message: "Tenant is inactive" });
    }

    const roles = await Role.find({
      _id: { $in: decoded.roleIds || [] },
      tenantId: decoded.tenantId,
    }).populate("permissionIds");

    let permissionCodes = [...new Set(roles.flatMap((role) => role.permissionIds.map((p) => p.code)))];

    if (user.email === "superadmin@example.com") {
      permissionCodes = ["*"];
    }

    const requestedTenantId = req.headers["x-tenant-id"];
    let effectiveTenantId = String(decoded.tenantId);
    let effectivePermissionCodes = permissionCodes;

    if (requestedTenantId && String(requestedTenantId) !== String(decoded.tenantId)) {
      if (!permissionCodes.includes("*") && !permissionCodes.includes("tenant.manage")) {
        return res.status(403).json({ message: "Tenant override is restricted to super admins" });
      }
      const targetTenant = await Tenant.findById(requestedTenantId);
      if (!targetTenant || targetTenant.status !== "ACTIVE") {
        return res.status(403).json({ message: "Target tenant is inactive" });
      }
      effectiveTenantId = String(requestedTenantId);
      effectivePermissionCodes = ["*"];
    }

    req.headers["x-auth-user-id"] = String(decoded.userId);
    req.headers["x-auth-tenant-id"] = effectiveTenantId;
    req.headers["x-auth-base-tenant-id"] = String(decoded.tenantId);
    req.headers["x-auth-role-ids"] = JSON.stringify(decoded.roleIds || []);
    req.headers["x-auth-permission-codes"] = JSON.stringify(effectivePermissionCodes);

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired access token" });
  }
}

/**
 * Resend delivery webhook (Svix-signed).
 *
 * Registered after the rate limiters but before authMiddleware: Resend carries no
 * user session and must never be challenged for a token, while bursts should still
 * be throttled. Authenticity comes from the Svix HMAC over the raw body rather than
 * a shared secret in the URL, so an attacker cannot forge delivery events.
 *
 * Without this, a provider accepting a message is indistinguishable from a provider
 * delivering it: the SMTP path only ever reports the handoff, never the verdict.
 */
const RESEND_WEBHOOK_SECRET = env.RESEND_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET;
const WEBHOOK_TOLERANCE_SEC = 300;

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifySvixSignature(req) {
  const id = req.get("svix-id");
  const timestamp = req.get("svix-timestamp");
  const header = req.get("svix-signature");
  if (!id || !timestamp || !header) return "missing svix headers";

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SEC) return "timestamp outside tolerance";

  const secret = Buffer.from(String(RESEND_WEBHOOK_SECRET).replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${id}.${timestamp}.${req.rawBody || Buffer.alloc(0)}`)
    .digest("base64");

  const matched = String(header)
    .split(" ")
    .some((part) => part.startsWith("v1,") && safeEqual(part.slice(3), expected));

  return matched ? null : "signature mismatch";
}

app.post("/api/v1/webhooks/resend", (req, res) => {
  if (!RESEND_WEBHOOK_SECRET) {
    logger.warn("[EMAIL] webhook hit but RESEND_WEBHOOK_SECRET is not configured");
    return res.status(503).json({ message: "Webhook not configured" });
  }

  const problem = verifySvixSignature(req);
  if (problem) {
    logger.warn("[EMAIL] rejected Resend webhook: " + problem);
    return res.status(400).json({ message: "Invalid signature" });
  }

  const type = req.body?.type || "unknown";
  const to = Array.isArray(req.body?.to) ? req.body.to.join(",") : req.body?.to || "";
  const reason = req.body?.bounce?.message || req.body?.complaint?.message || "";

  // Delivered/bounced/complained are the only events that prove an outcome.
  logger.info(
    "[EMAIL] webhook " + type + " to=" + to + (reason ? " reason=" + reason : ""),
  );

  return res.status(200).json({ received: true });
});

app.use(authMiddleware);

app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok", service: "gateway" });
});

app.all("/api/v1/{*path}", (req, res) => {
  const route = resolveRoute(req.originalUrl);
  if (!route) {
    return res.status(404).json({ message: "Route not found" });
  }

  const target = SERVICE_MAP[route.service];
  if (!target) {
    return res.status(502).json({ message: "Service unavailable" });
  }

  const remaining = req.originalUrl.split("?")[0].slice(route.prefix.length) || "";
  const servicePath = (route.servicePath === "/" ? "" : route.servicePath) + remaining;
  const queryStr = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const finalPath = (servicePath || "/") + queryStr;

  logger.info({ from: req.path, to: `${target}${finalPath}`, method: req.method }, "Proxying request");
  proxyRequest(target, finalPath, req, res);
});

app.all("/api/{*path}", (req, res) => {
  const route = resolveRoute(req.originalUrl);
  if (!route) {
    return res.status(404).json({ message: "Route not found" });
  }

  const target = SERVICE_MAP[route.service];
  if (!target) {
    return res.status(502).json({ message: "Service unavailable" });
  }

  const remaining = req.originalUrl.split("?")[0].slice(route.prefix.length) || "";
  const servicePath = (route.servicePath === "/" ? "" : route.servicePath) + remaining;
  const queryStr = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  const finalPath = (servicePath || "/") + queryStr;

  logger.info({ from: req.path, to: `${target}${finalPath}`, method: req.method }, "Proxying request");
  proxyRequest(target, finalPath, req, res);
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, req, res, _next) => {
  logger.error({ err }, "Unhandled gateway error");
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
});

async function bootstrap() {
  await mongoose.connect(env.MONGO_URI, { maxPoolSize: Number(env.MONGO_MAX_POOL_SIZE || 20) });
  logger.info("MongoDB connected (gateway)");

  const server = app.listen(env.PORT, () => {
    logger.info(`API Gateway listening on port ${env.PORT}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully.`);
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((error) => {
  logger.error({ error }, "Gateway boot failure");
  process.exit(1);
});
