const express = require("express");
const env = require("../../config/env");

process.env.PINK_FORM_SUBMISSIONS_PATH = env.PINK_FORM_SUBMISSIONS_PATH;

const router = express.Router();

const modulesRouter = require("./pinkForm/routes/modules");
const submissionsRouter = require("./pinkForm/routes/submissions");
const seedRouter = require("./pinkForm/routes/seed");

router.use("/modules", modulesRouter);
router.use("/submissions", submissionsRouter);
router.use("/seed", seedRouter);

module.exports = router;
