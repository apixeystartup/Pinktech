const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const upload = require("../../middlewares/upload.middleware");
const orgExplorerReadMiddleware = require("../../middlewares/orgExplorerRead.middleware");
const controller = require("./orgExplorer.controller");

const router = express.Router();

router.use(authMiddleware, tenantMiddleware);

router.get("/stats", orgExplorerReadMiddleware, controller.getStats);
router.get("/filters", orgExplorerReadMiddleware, controller.getFilters);
router.get("/roots", orgExplorerReadMiddleware, controller.getRoots);
router.get("/hierarchy/removed", orgExplorerReadMiddleware, controller.getRemoved);
router.post("/hierarchy/reset", permissionMiddleware("user.update"), controller.postHierarchyReset);

router.get("/employees", orgExplorerReadMiddleware, controller.listEmployees);
router.post("/employees", permissionMiddleware("user.update"), controller.postEmployee);
router.get("/employees/:key", orgExplorerReadMiddleware, controller.getEmployee);
router.put("/employees/:key", permissionMiddleware("user.update"), controller.putEmployee);
router.get("/employees/:key/subtree", orgExplorerReadMiddleware, controller.getSubtree);
router.get("/employees/:key/ancestry", orgExplorerReadMiddleware, controller.getAncestry);
router.post("/employees/:key/leave", permissionMiddleware("user.update"), controller.postLeave);
router.post("/employees/:key/restore", permissionMiddleware("user.update"), controller.postRestore);
router.post("/employees/:key/replace", permissionMiddleware("user.update"), controller.postReplace);
router.post("/employees/:key/reassign-reports", permissionMiddleware("user.update"), controller.postReassign);

router.post("/roles/auto-detect", permissionMiddleware("role.assign"), controller.postAutoDetect);
router.post("/roles/reset-all", permissionMiddleware("role.assign"), controller.postResetAllRoles);
router.post("/roles/merge", permissionMiddleware("role.assign"), controller.postMergeRoles);
router.get("/roles", permissionMiddleware("role.view"), controller.listRoles);
router.post("/roles", permissionMiddleware("role.assign"), controller.postRoleCreate);
router.get("/roles/:id", permissionMiddleware("role.view"), controller.getRole);
router.put("/roles/:id", permissionMiddleware("role.assign"), controller.putRole);
router.post("/roles/:id/reset", permissionMiddleware("role.assign"), controller.postRoleReset);

router.post("/reload", permissionMiddleware("user.update"), controller.postReload);
router.post("/imports", permissionMiddleware("user.update"), upload.single("file"), controller.postOrgWorkbookImport);

module.exports = router;
