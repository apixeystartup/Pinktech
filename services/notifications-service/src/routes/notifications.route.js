const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");
const Notification = require("../models/notification.model");
const { notificationAdapter } = require("@pink/shared");
const serviceAuth = require("../middlewares/serviceAuth");
const ApiError = require("@pink/shared").ApiError;
const {
  getAccountRole,
  listNotificationRecipients,
  assertRecipientsInScope,
} = require("../services/notifications.service");


const router = express.Router();

/** Notifications UI: prefer `notification.compose`; `report.view` kept for existing roles. */
const NOTIFICATION_ACCESS = ["notification.compose", "report.view"];

function isTenantAdminUser(req) {
  return Boolean(req.auth?.isAdmin || req.auth?.isSuperAdmin) ||
    req.auth?.accountRole === "tenant_admin" ||
    req.auth?.accountRole === "super_admin";
}


function hasAnyPermission(req, codes) {
  const perms = req.auth?.permissionCodes || [];
  if (perms.includes("*")) return true;
  return codes.some((c) => perms.includes(c));
}

router.get(
  "/recipients/elevated",
  serviceAuth,
  async (req, res, next) => {
    try {
      if (!hasAnyPermission(req, NOTIFICATION_ACCESS)) {
        throw new ApiError(403, "Insufficient permissions");
      }
      const users = await listNotificationRecipients(req);
      res.status(200).json({
        scope: "elevated",
        description: "Employees, tenant administrators, and platform super admins available for messaging.",
        users,
      });
    } catch (error) {
      next(error);
    }
  }
);


router.get(
  "/recipients/all",
  serviceAuth,
  async (req, res, next) => {
    try {
      if (!hasAnyPermission(req, NOTIFICATION_ACCESS)) {
        throw new ApiError(403, "Insufficient permissions");
      }
      if (!isTenantAdminUser(req) && (await getAccountRole(req)) !== "super_admin") {
        throw new ApiError(403, "Only tenant administrators can list all employees for messaging.");
      }
      const users = await listNotificationRecipients(req);
      res.status(200).json({ scope: "all", users });
    } catch (error) {
      next(error);
    }
  }
);


router.post("/", serviceAuth, async (req, res, next) => {
  try {
    if (!hasAnyPermission(req, NOTIFICATION_ACCESS)) {
      throw new ApiError(403, "Insufficient permissions");
    }

    const schema = Joi.object({
      recipientUserIds: Joi.array()
        .items(Joi.string().hex().length(24))
        .min(1)
        .required(),
      channel: Joi.string().valid("IN_APP").default("IN_APP"),
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
    const ok = await assertRecipientsInScope(req, recipientObjectIds);
    if (!ok) {
      throw new ApiError(422, "One or more recipients are invalid, inactive, or outside your organization.");
    }

    const fromUserId = req.auth.userId ? new mongoose.Types.ObjectId(req.auth.userId) : null;
    const created = [];

    for (const recipientUserId of recipientObjectIds) {
      const notification = await Notification.create({
        tenantId: req.tenantId,
        userId: recipientUserId,
        fromUserId,
        recipientUserId,
        channel: "IN_APP",
        message: value.message,
        eventType: value.eventType,
        status: "SENT",
        subject: value.subject || "",
      });

      if (value.channel === "EMAIL" && value.to) {
        await notificationAdapter.sendEmail({
          to: value.to,
          subject: value.subject || "Notification",
          html: value.message,
          templateParams: {
            to_email: value.to,
            subject: value.subject || "Notification",
            message: value.message,
          },
        }).catch(() => {});
      }

      created.push(notification);
    }

    res.status(201).json(created.length === 1 ? created[0] : created);
  } catch (error) {
    next(error);
  }
});

router.post("/read", serviceAuth, async (req, res, next) => {
  try {
    const readAt = new Date();
    const result = await Notification.updateMany(
      {
        channel: "IN_APP",
        readAt: null,
        $or: [
          { recipientUserId: req.auth.userId },
          { recipientUserId: null, userId: req.auth.userId },
        ],
      },
      { $set: { readAt } },
    );
    res.status(200).json({ readAt, modifiedCount: result.modifiedCount });
  } catch (error) {
    next(error);
  }
});

router.get("/", serviceAuth, async (req, res, next) => {
  try {
    const isAdmin = isTenantAdminUser(req);
    const filter = isAdmin
      ? {
          $or: [
            { tenantId: req.tenantId },
            { recipientUserId: req.auth.userId },
            { userId: req.auth.userId },
            { fromUserId: req.auth.userId },
          ],
        }
      : {
          $or: [
            { recipientUserId: req.auth.userId },
            { userId: req.auth.userId },
            { fromUserId: req.auth.userId },
          ],
        };

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .populate("fromUserId", "name email")
      .populate("recipientUserId", "name email")
      .limit(1000);

    res.status(200).json(notifications);
  } catch (error) {
    next(error);
  }
});


module.exports = router;
