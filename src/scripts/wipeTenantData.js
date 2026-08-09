/**
 * Delete all application data for one tenant (users, roles, org, imports, etc.).
 * Does NOT delete the Tenant document itself.
 *
 * Usage:
 *   node src/scripts/wipeTenantData.js --code=PINK --i-understand
 *   node src/scripts/wipeTenantData.js --name="Pink tech" --i-understand
 */

const { connectMongo } = require("../db/mongoose");
const Tenant = require("../models/tenant.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const Position = require("../models/position.model");
const Assignment = require("../models/assignment.model");
const Import = require("../models/import.model");
const ImportError = require("../models/importError.model");
const RefreshToken = require("../models/refreshToken.model");
const Notification = require("../models/notification.model");
const KycRecord = require("../models/kycRecord.model");
const Document = require("../models/document.model");
const Signature = require("../models/signature.model");
const ExternalUser = require("../models/externalUser.model");
const Approval = require("../models/approval.model");
const Workflow = require("../models/workflow.model");
const Form = require("../models/form.model");
const FormSubmission = require("../models/formSubmission.model");
const PublicFormToken = require("../models/publicFormToken.model");
const AuditLog = require("../models/auditLog.model");

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const out = { understand: false, code: null, name: null };
  for (const a of argv) {
    if (a === "--i-understand") out.understand = true;
    else if (a.startsWith("--code=")) out.code = a.slice("--code=".length).trim();
    else if (a.startsWith("--name=")) out.name = a.slice("--name=".length).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function resolveTenant({ code, name }) {
  if (code) {
    const t = await Tenant.findOne({ code: code.toUpperCase() });
    if (t) return t;
  }
  if (name) {
    const t = await Tenant.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i") });
    if (t) return t;
    const loose = await Tenant.findOne({ name: new RegExp(escapeRegex(name), "i") });
    if (loose) return loose;
  }
  return null;
}

async function wipeTenant(tenantId) {
  const tid = tenantId;
  const counts = {};

  const importIds = await Import.find({ tenantId: tid }).distinct("_id");
  counts.importErrors = (await ImportError.deleteMany({ importId: { $in: importIds } })).deletedCount;
  counts.imports = (await Import.deleteMany({ tenantId: tid })).deletedCount;

  counts.formSubmissions = (await FormSubmission.deleteMany({ tenantId: tid })).deletedCount;
  counts.forms = (await Form.deleteMany({ tenantId: tid })).deletedCount;

  counts.workflows = (await Workflow.deleteMany({ tenantId: tid })).deletedCount;
  counts.approvals = (await Approval.deleteMany({ tenantId: tid })).deletedCount;
  counts.documents = (await Document.deleteMany({ tenantId: tid })).deletedCount;
  counts.signatures = (await Signature.deleteMany({ tenantId: tid })).deletedCount;
  counts.kycRecords = (await KycRecord.deleteMany({ tenantId: tid })).deletedCount;
  counts.externalUsers = (await ExternalUser.deleteMany({ tenantId: tid })).deletedCount;
  counts.notifications = (await Notification.deleteMany({ tenantId: tid })).deletedCount;
  counts.refreshTokens = (await RefreshToken.deleteMany({ tenantId: tid })).deletedCount;
  counts.publicFormTokens = (await PublicFormToken.deleteMany({ tenantId: tid })).deletedCount;

  counts.assignments = (await Assignment.deleteMany({ tenantId: tid })).deletedCount;
  counts.users = (await User.deleteMany({ tenantId: tid })).deletedCount;
  counts.positions = (await Position.deleteMany({ tenantId: tid })).deletedCount;
  counts.roles = (await Role.deleteMany({ tenantId: tid })).deletedCount;
  counts.auditLogs = (await AuditLog.deleteMany({ tenantId: tid })).deletedCount;

  return counts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.understand) {
    console.error("Refusing: re-run with --i-understand to confirm destructive delete.");
    process.exit(1);
  }
  if (!args.code && !args.name) {
    console.error("Pass --code=TENANTCODE and/or --name=\"Tenant Name\".");
    process.exit(1);
  }

  await connectMongo();
  const tenant = await resolveTenant(args);
  if (!tenant) {
    console.error("Tenant not found. Existing tenants:");
    const all = await Tenant.find({}, { name: 1, code: 1 }).lean();
    for (const t of all) console.error(`  ${t.code} — ${t.name}`);
    process.exit(1);
  }

  console.log(`Wiping all data for tenant: ${tenant.name} (${tenant.code}) [${tenant._id}]`);
  const counts = await wipeTenant(tenant._id);
  console.log("Deleted counts:", counts);
  console.log("Done. Tenant row preserved; re-seed users/roles or use super-admin to access this tenant.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
