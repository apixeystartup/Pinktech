const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");
const Notification = require("../../models/notification.model");
const adapter = require("./notification.adapter");
const authMiddleware = require("../../middlewares/auth.middleware");
const tenantMiddleware = require("../../middlewares/tenant.middleware");
const permissionMiddleware = require("../../middlewares/permission.middleware");
const ApiError = require("../../common/errors/ApiError");
const {
  getElevatedRecipientIdSet,
  listEligibleRecipients,
  listAllActiveUsers,
  assertRecipientsInTenant,
} = require("./notifications.service");

const router = express.Router();

/** Notifications UI: prefer `notification.compose`; `report.view` kept for existing roles. */
const NOTIFICATION_ACCESS = ["notification.compose", "report.view"];

function isTenantAdmin(req) {
  return (req.auth?.permissionCodes || []).includes("tenant.manage");
}

router.get(
  "/recipients/elevated",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware(NOTIFICATION_ACCESS),
  async (req, res, next) => {
    try {
      const users = await listEligibleRecipients(req.tenantId);
      res.status(200).json({
        scope: "elevated",
        description:
          "Leadership and tenant administrators (by hierarchy depth and tenant.manage roles). Employees may only message this set.",
        users,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/recipients/all",
  authMiddleware,
  tenantMiddleware,
  permissionMiddleware(NOTIFICATION_ACCESS),
  async (req, res, next) => {
    try {
      if (!isTenantAdmin(req)) {
        throw new ApiError(403, "Only tenant administrators can list all employees for messaging.");
      }
      const users = await listAllActiveUsers(req.tenantId);
      res.status(200).json({ scope: "all", users });
    } catch (error) {
      next(error);
    }
  }
);

router.post("/", authMiddleware, tenantMiddleware, permissionMiddleware(NOTIFICATION_ACCESS), async (req, res, next) => {
  try {
    const schema = Joi.object({
      recipientUserIds: Joi.array()
        .items(Joi.string().hex().length(24))
        .min(1)
        .required(),
      channel: Joi.string().valid("EMAIL", "SMS", "WHATSAPP", "IN_APP").required(),
      message: Joi.string().required(),
      eventType: Joi.string().required(),
      to: Joi.string().allow(null, "").default(null),
      subject: Joi.string().allow("").default(""),
    });
    const { error, value } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      throw new ApiError(422, "Validation failed", error.details);
    }

    const uniqueIds = [...new Set(value.recipientUserIds)];
    const recipientObjectIds = uniqueIds.map((id) => new mongoose.Types.ObjectId(id));
    const ok = await assertRecipientsInTenant(req.tenantId, recipientObjectIds);
    if (!ok) {
      throw new ApiError(422, "One or more recipients are invalid or inactive in this tenant.");
    }

    const admin = isTenantAdmin(req);
    if (!admin) {
      const allowed = await getElevatedRecipientIdSet(req.tenantId);
      for (const id of uniqueIds) {
        if (!allowed.has(String(id))) {
          throw new ApiError(
            403,
            "You can only send notifications to leadership (top org levels) and tenant administrators."
          );
        }
      }
    }

    const fromUserId = req.auth.userId ? new mongoose.Types.ObjectId(req.auth.userId) : null;
    const created = [];

    for (const recipientUserId of recipientObjectIds) {
      const notification = await Notification.create({
        tenantId: req.tenantId,
        userId: recipientUserId,
        fromUserId,
        recipientUserId,
        channel: value.channel,
        message: value.message,
        eventType: value.eventType,
        status: "PENDING",
        subject: value.subject || "",
      });

      if (value.channel === "EMAIL" && value.to) {
        await adapter.sendEmail({
          to: value.to,
          subject: value.subject || "Notification",
          html: value.message,
        });
      }

      notification.status = "SENT";
      await notification.save();
      created.push(notification);
    }

    res.status(201).json(created.length === 1 ? created[0] : created);
  } catch (error) {
    next(error);
  }
});

/** Any signed-in tenant user may read their own inbox (needed for form-approval tasks without compose permission). */
router.get("/", authMiddleware, tenantMiddleware, async (req, res, next) => {
  try {
    const filter = isTenantAdmin(req)
      ? { tenantId: req.tenantId }
      : {
          tenantId: req.tenantId,
          $or: [{ recipientUserId: req.auth.userId }, { fromUserId: req.auth.userId }],
        };

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .populate("fromUserId", "name email")
      .populate("recipientUserId", "name email")
      .limit(500);

    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
