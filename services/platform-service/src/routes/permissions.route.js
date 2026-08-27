const express = require("express");
const Permission = require("../models/permission.model");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const permissions = await Permission.find().sort({ module: 1, label: 1, code: 1 });
    res.status(200).json(permissions);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
