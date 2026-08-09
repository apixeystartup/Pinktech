const express = require("express");
const Joi = require("joi");
const Workflow = require("../../models/workflow.model");
const FormSubmission = require("../../models/formSubmission.model");
const Approval = require("../../models/approval.model");
const ApiError = require("../../common/errors/ApiError");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const { writeAudit } = require("../../services/audit.service");

const router = express.Router();

const createWorkflowSchema = Joi.object({
  name: Joi.string().required(),
  steps: Joi.array()
    .items(
      Joi.object({
        order: Joi.number().required(),
        positionId: Joi.string().required(),
        onTimeoutEscalateToPositionId: Joi.string().allow(null).default(null),
      })
    )
    .min(1)
    .required(),
});

router.post("/", authMiddleware, tenantMiddleware, permissionMiddleware("workflow.submit"), async (req, res, next) => {
  try {
    const { error, value } = createWorkflowSchema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ApiError(422, "Validation failed", error.details);
    }
    const workflow = await Workflow.create({
      tenantId: req.tenantId,
      name: value.name,
      steps: value.steps,
    });
    await writeAudit({
      tenantId: req.tenantId,
      userId: req.auth.userId,
      action: "WORKFLOW_CREATED",
      metadata: { workflowId: workflow._id },
    });
    res.status(201).json(workflow);
  } catch (err) {
    next(err);
  }
});

router.get("/", authMiddleware, tenantMiddleware, permissionMiddleware(["workflow.submit", "workflow.status"]), async (req, res, next) => {
  try {
    const workflows = await Workflow.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    res.status(200).json(workflows);
  } catch (error) {
    next(error);
  }
});

router.post("/submissions", authMiddleware, tenantMiddleware, permissionMiddleware("workflow.submit"), async (req, res, next) => {
  try {
    const schema = Joi.object({
      formId: Joi.string().required(),
      submitterType: Joi.string().valid("INTERNAL", "EXTERNAL").default("INTERNAL"),
      data: Joi.object().default({}),
      workflowId: Joi.string().required(),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ApiError(422, "Validation failed", error.details);
    }

    const workflow = await Workflow.findOne({ _id: value.workflowId, tenantId: req.tenantId, status: "ACTIVE" });
    if (!workflow) {
      throw new ApiError(404, "Workflow not found");
    }

    const submission = await FormSubmission.create({
      tenantId: req.tenantId,
      formId: value.formId,
      submittedBy: req.auth.userId,
      submitterType: value.submitterType,
      data: value.data,
      status: "PENDING",
      currentStep: 0,
      currentApproverPositionId: workflow.steps[0]?.positionId || null,
    });
    res.status(201).json(submission);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/approvals/:submissionId/action",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware(["workflow.approve", "workflow.reject"]),
  async (req, res, next) => {
    try {
      const schema = Joi.object({
        action: Joi.string().valid("APPROVE", "REJECT", "RETURN", "ESCALATE").required(),
        remarks: Joi.string().allow("").default(""),
      });
      const { error, value } = schema.validate(req.body, { abortEarly: false });
      if (error) {
        throw new ApiError(422, "Validation failed", error.details);
      }

      const submission = await FormSubmission.findOne({ _id: req.params.submissionId, tenantId: req.tenantId });
      if (!submission) {
        throw new ApiError(404, "Submission not found");
      }

      await Approval.create({
        tenantId: req.tenantId,
        submissionId: submission._id,
        actedBy: req.auth.userId,
        action: value.action,
        remarks: value.remarks,
      });

      if (value.action === "REJECT") {
        submission.status = "REJECTED";
      } else if (value.action === "RETURN") {
        submission.status = "RETURNED";
      } else {
        submission.currentStep += 1;
        submission.status = value.action === "ESCALATE" ? "IN_PROGRESS" : "IN_PROGRESS";
      }

      await submission.save();
      res.status(200).json(submission);
    } catch (error) {
      next(error);
    }
  }
);

router.get("/submissions/:submissionId", authMiddleware, tenantMiddleware, permissionMiddleware("workflow.submit"), async (req, res, next) => {
  try {
    const submission = await FormSubmission.findOne({ _id: req.params.submissionId, tenantId: req.tenantId });
    if (!submission) {
      throw new ApiError(404, "Submission not found");
    }
    const approvals = await Approval.find({ tenantId: req.tenantId, submissionId: submission._id }).sort({ createdAt: 1 });
    res.status(200).json({ submission, approvals });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
