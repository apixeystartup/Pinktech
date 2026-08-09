const express = require("express");
const Permission = require("../../models/permission.model");
const authMiddleware = require("../../middlewares/auth.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");

const router = express.Router();

router.get("/", authMiddleware, permissionMiddleware("role.view"), async (req, res, next) => {
  try {
    const permissions = await Permission.find().sort({ module: 1, label: 1, code: 1 });
    res.status(200).json(permissions);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
