const bcrypt = require("bcrypt");
const { connectMongo } = require("../db/mongoose");
const permissionCatalog = require("../common/constants/permissions");
const Tenant = require("../models/tenant.model");
const Permission = require("../models/permission.model");
const Role = require("../models/role.model");
const Position = require("../models/position.model");
const User = require("../models/user.model");
const Assignment = require("../models/assignment.model");
const Workflow = require("../models/workflow.model");
const Form = require("../models/form.model");

async function ensurePermissions() {
  const docs = [];
  for (const item of permissionCatalog) {
    const doc = await Permission.findOneAndUpdate({ code: item.code }, item, {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    });
    docs.push(doc);
  }
  return docs;
}

async function seed() {
  await connectMongo();
  const permissions = await ensurePermissions();

  const tenant = await Tenant.findOneAndUpdate(
    { code: "DEMO" },
    { name: "Demo Tenant", code: "DEMO", plan: "enterprise", status: "ACTIVE" },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  await Position.deleteMany({ tenantId: tenant._id });

  const allPermissionIds = permissions.map((p) => p._id);
  const roleConfigs = [
    { name: "Tenant Admin", codes: allPermissionIds },
    {
      name: "Level 1 Manager",
      codes: permissions
        .filter((p) =>
          ["workflow.submit", "workflow.approve", "employee.view", "form.view", "kyc.manage", "list.users"].includes(p.code),
        )
        .map((p) => p._id),
    },
    { name: "Level 2 Approver", codes: permissions.filter((p) => ["workflow.approve", "workflow.return", "report.view", "audit.view"].includes(p.code)).map((p) => p._id) },
  ];

  const roles = {};
  for (const cfg of roleConfigs) {
    roles[cfg.name] = await Role.findOneAndUpdate(
      { tenantId: tenant._id, name: cfg.name },
      { tenantId: tenant._id, name: cfg.name, type: cfg.name === "Tenant Admin" ? "SYSTEM" : "CUSTOM", permissionIds: cfg.codes },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  }

  const rootPosition = await Position.findOneAndUpdate(
    { tenantId: tenant._id, title: "CEO" },
    { tenantId: tenant._id, title: "CEO", levelName: "L0", parentPositionId: null, status: "ACTIVE" },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  const level1 = await Position.findOneAndUpdate(
    { tenantId: tenant._id, title: "Operations Manager" },
    { tenantId: tenant._id, title: "Operations Manager", levelName: "L1", parentPositionId: rootPosition._id, status: "ACTIVE" },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  const level2 = await Position.findOneAndUpdate(
    { tenantId: tenant._id, title: "Compliance Lead" },
    { tenantId: tenant._id, title: "Compliance Lead", levelName: "L2", parentPositionId: level1._id, status: "ACTIVE" },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  const pwd = await bcrypt.hash("ChangeMe123!", 12);
  const usersSeed = [
    { empCode: "DEMO-001", name: "Demo Admin", email: "admin@demo.com", roleName: "Tenant Admin", positionId: rootPosition._id },
    { empCode: "DEMO-010", name: "Demo L1", email: "l1@demo.com", roleName: "Level 1 Manager", positionId: level1._id },
    { empCode: "DEMO-020", name: "Demo L2", email: "l2@demo.com", roleName: "Level 2 Approver", positionId: level2._id },
    { empCode: "DEMO-100", name: "Demo Staff A", email: "staff1@demo.com", roleName: "Level 1 Manager", positionId: level1._id },
    { empCode: "DEMO-101", name: "Demo Staff B", email: "staff2@demo.com", roleName: "Level 1 Manager", positionId: level2._id },
  ];

  const users = [];
  for (const u of usersSeed) {
    const user = await User.findOneAndUpdate(
      { tenantId: tenant._id, email: u.email },
      {
        tenantId: tenant._id,
        empCode: u.empCode,
        name: u.name,
        email: u.email,
        status: "ACTIVE",
        otpVerified: true,
        passwordHash: pwd,
        roleIds: [roles[u.roleName]._id],
        currentPositionId: u.positionId,
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
    users.push(user);
  }

  for (const u of users) {
    await Assignment.findOneAndUpdate(
      { tenantId: tenant._id, userId: u._id, isCurrent: true },
      { tenantId: tenant._id, userId: u._id, positionId: u.currentPositionId, isCurrent: true, activeTo: null },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  }

  const workflow = await Workflow.findOneAndUpdate(
    { tenantId: tenant._id, name: "Employee Onboarding Approval" },
    {
      tenantId: tenant._id,
      name: "Employee Onboarding Approval",
      steps: [
        { order: 1, positionId: level1._id },
        { order: 2, positionId: level2._id },
      ],
      status: "ACTIVE",
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  await Form.findOneAndUpdate(
    { tenantId: tenant._id, title: "Onboarding Intake" },
    {
      tenantId: tenant._id,
      title: "Onboarding Intake",
      workflowId: workflow._id,
      status: "PUBLISHED",
      schema: {
        fields: [
          { key: "fullName", type: "text", label: "Full Name", required: true },
          { key: "email", type: "email", label: "Email", required: true },
          { key: "department", type: "text", label: "Department", required: true },
        ],
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  console.log("Demo seed complete.");
  console.log("Tenant: DEMO");
  console.log("Users: admin@demo.com, l1@demo.com, l2@demo.com, staff1@demo.com, staff2@demo.com");
  console.log("Password: ChangeMe123!");
  process.exit(0);
}

seed().catch((error) => {
  console.error("Demo seed failed", error);
  process.exit(1);
});
