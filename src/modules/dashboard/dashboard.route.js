const express = require("express");
const authMiddleware = require("../../middlewares/auth.middleware");
const { getStats } = require("./dashboard.controller");

const router = express.Router();

router.get("/stats", authMiddleware, getStats);

module.exports = router;
