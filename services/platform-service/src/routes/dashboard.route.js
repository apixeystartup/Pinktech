const express = require("express");
const controller = require("../controllers/dashboard.controller");

const router = express.Router();

router.get("/stats", controller.getStats);
router.get("/tenants/:tenantId/employees", controller.getTenantEmployees);
router.get("/tenants/:tenantId/doctors", controller.getTenantDoctors);

module.exports = router;
