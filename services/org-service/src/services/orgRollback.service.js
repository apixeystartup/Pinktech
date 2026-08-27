const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const User = require("../models/user.model");

const ROLLBACK_DIR = path.join(process.cwd(), "storage", "rollbacks");

function rollbackPath(tenantId) {
  return path.join(ROLLBACK_DIR, `${tenantId}.xlsx`);
}

async function saveRollback(tenantId) {
  fs.mkdirSync(ROLLBACK_DIR, { recursive: true });

  const users = await User.find({ tenantId, orgFromWorkbook: true, orgLeftAt: null })
    .select("empCode name designationOverride phone hq zone region state orgRowNumber orgSno doj dob gender reportingManagerRaw orgContactEmail")
    .sort({ orgRowNumber: 1 })
    .lean();

  if (!users.length) return null;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Org");

  ws.addRow(["S NO", "EMP CODE", "NAME OF THE EMPLOYEES", "DESIGNATION", "REPORTING MANAGER", "EMAIL ID", "PHONE NUMBER", "ZONE", "REGION", "STATE", "HQ"]);

  for (const u of users) {
    ws.addRow([
      u.orgSno || "",
      u.empCode || "",
      u.name || "",
      u.designationOverride || "",
      u.reportingManagerRaw || "",
      u.orgContactEmail || "",
      u.phone || "",
      u.zone || "",
      u.region || "",
      u.state || "",
      u.hq || "",
    ]);
  }

  const filePath = rollbackPath(tenantId);
  await wb.xlsx.writeFile(filePath);
  return { filePath, employeeCount: users.length };
}

async function loadRollback(tenantId) {
  const filePath = rollbackPath(tenantId);
  if (!fs.existsSync(filePath)) return null;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  return { filePath, workbook: wb };
}

async function deleteRollback(tenantId) {
  const filePath = rollbackPath(tenantId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function hasRollback(tenantId) {
  return fs.existsSync(rollbackPath(tenantId));
}

module.exports = { saveRollback, loadRollback, deleteRollback, hasRollback, rollbackPath };
