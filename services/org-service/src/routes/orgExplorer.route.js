const express = require("express");
const permissionMiddleware = require("../middlewares/permission.middleware");
const { orgAdminMiddleware, superAdminMiddleware } = require("../middlewares/orgAdmin.middleware");
const upload = require("../middlewares/upload");
const orgExplorerReadMiddleware = require("../middlewares/orgExplorerRead.middleware");
const controller = require("../services/orgExplorer.controller");

const router = express.Router();

// Reads are available to everyone (an employee's snapshot is scoped to their own
// team by the controller). Day-to-day writes — adding and editing people,
// imports, reload — are open to an org admin: the platform super admin or the
// tenant's own admin, which the gateway keeps inside its own tenant. The
// platform-wide sweeps and the role catalog need `superAdminMiddleware`.
const canWriteOrg = [permissionMiddleware("user.update"), orgAdminMiddleware];
const canWriteRoles = [permissionMiddleware("role.assign"), superAdminMiddleware];
const platformOnly = [permissionMiddleware("user.update"), superAdminMiddleware];

router.get("/stats", orgExplorerReadMiddleware, controller.getStats);
router.get("/filters", orgExplorerReadMiddleware, controller.getFilters);
router.get("/roots", orgExplorerReadMiddleware, controller.getRoots);
router.get("/hierarchy/removed", orgExplorerReadMiddleware, controller.getRemoved);
router.post("/hierarchy/reset", platformOnly, controller.postHierarchyReset);

router.get("/tree", orgExplorerReadMiddleware, controller.getFilteredTree);
router.get("/employees", orgExplorerReadMiddleware, controller.listEmployees);
router.post("/employees", canWriteOrg, controller.postEmployee);
router.get("/employees/:key", orgExplorerReadMiddleware, controller.getEmployee);
router.put("/employees/:key", canWriteOrg, controller.putEmployee);
router.get("/employees/:key/subtree", orgExplorerReadMiddleware, controller.getSubtree);
router.get("/employees/:key/ancestry", orgExplorerReadMiddleware, controller.getAncestry);
router.post("/employees/:key/leave", canWriteOrg, controller.postLeave);
router.post("/employees/:key/restore", canWriteOrg, controller.postRestore);
router.post("/employees/:key/replace", canWriteOrg, controller.postReplace);
router.post("/employees/:key/reassign-reports", canWriteOrg, controller.postReassign);

router.post("/roles/auto-detect", canWriteRoles, controller.postAutoDetect);
router.post("/roles/reset-all", canWriteRoles, controller.postResetAllRoles);
router.post("/roles/merge", canWriteRoles, controller.postMergeRoles);
router.get("/roles", permissionMiddleware("role.view"), controller.listRoles);
router.post("/roles", canWriteRoles, controller.postRoleCreate);
router.get("/roles/:id", permissionMiddleware("role.view"), controller.getRole);
router.put("/roles/:id", canWriteRoles, controller.putRole);
router.post("/roles/:id/reset", canWriteRoles, controller.postRoleReset);

router.post("/reload", canWriteOrg, controller.postReload);
router.post("/imports", canWriteOrg, upload.single("file"), controller.postOrgWorkbookImport);
router.post("/rollback", platformOnly, controller.postRollback);
router.get("/rollback/status", permissionMiddleware("user.update"), controller.getRollbackStatus);

module.exports = router;
