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
    .select("empCode name designationOverride hq area region zone reportingManagerRaw orgContactEmail")
    .sort({ orgRowNumber: 1 })
    .lean();

  if (!users.length) return null;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Org");

  ws.addRow(["Employee", "Employee Designation", "Email ID", "HQ", "Area", "Region", "Zone", "Reporting Manager", "Employee Code"]);

  for (const u of users) {
    ws.addRow([
      u.name || "",
      u.designationOverride || "",
      u.orgContactEmail || "",
      u.hq || "",
      u.area || "",
      u.region || "",
      u.zone || "",
      u.reportingManagerRaw || "",
      u.empCode || "",
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
