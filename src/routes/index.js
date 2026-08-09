const express = require("express");
const authRoutes = require("../modules/auth/auth.route");
const userRoutes = require("../modules/users/users.route");
const tenantRoutes = require("../modules/tenants/tenants.route");
const roleRoutes = require("../modules/roles/roles.route");
const permissionRoutes = require("../modules/permissions/permissions.route");
const positionRoutes = require("../modules/positions/positions.route");
const assignmentRoutes = require("../modules/assignments/assignments.route");
const workflowRoutes = require("../modules/workflows/workflows.route");
const formsRoutes = require("../modules/forms/forms.route");
const kycRoutes = require("../modules/kyc/kyc.route");
const signaturesRoutes = require("../modules/signatures/signatures.route");
const documentsRoutes = require("../modules/documents/documents.route");
const notificationsRoutes = require("../modules/notifications/notifications.route");
const importsRoutes = require("../modules/imports/imports.route");
const auditRoutes = require("../modules/audit/audit.route");
const publicRoutes = require("../modules/public/public.route");
const schemaFormsRoutes = require("../modules/schema-forms/schema-forms.route");
const orgExplorerRoutes = require("../modules/org-explorer/orgExplorer.route");
const dashboardRoutes = require("../modules/dashboard/dashboard.route");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", service: "pink-api" });
});

router.post("/health/smtp", async (req, res) => {
  const { verifySmtpConnection } = require("../modules/notifications/notification.adapter");
  const env = require("../config/env");
  const ok = await verifySmtpConnection();
  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "fail",
    emailMode: env.EMAIL_MODE,
    smtpHost: env.SMTP_HOST || "(not set)",
    smtpPort: env.SMTP_PORT,
    smtpUser: env.SMTP_USER ? "***" + env.SMTP_USER.slice(-4) : "(not set)",
  });
});

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/tenants", tenantRoutes);
router.use("/roles", roleRoutes);
router.use("/permissions", permissionRoutes);
router.use("/positions", positionRoutes);
router.use("/assignments", assignmentRoutes);
router.use("/workflows", workflowRoutes);
router.use("/forms", formsRoutes);
router.use("/kyc", kycRoutes);
router.use("/signatures", signaturesRoutes);
router.use("/documents", documentsRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/imports", importsRoutes);
router.use("/audit", auditRoutes);
router.use("/public", publicRoutes);
router.use("/schema-forms", schemaFormsRoutes);
router.use("/org", orgExplorerRoutes);
router.use("/dashboard", dashboardRoutes);

module.exports = router;
