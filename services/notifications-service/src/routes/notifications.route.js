const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");
const Notification = require("../models/notification.model");
const adapter = require("../services/notification.adapter");
const serviceAuth = require("../middlewares/serviceAuth");
const ApiError = require("@pink/shared").ApiError;
const {
  getElevatedRecipientIdSet,
  listEligibleRecipients,
  listAllActiveUsers,
  assertRecipientsInTenant,
} = require("../services/notifications.service");

const router = express.Router();

/** Notifications UI: prefer `notification.compose`; `report.view` kept for existing roles. */
const NOTIFICATION_ACCESS = ["notification.compose", "report.view"];

function isTenantAdmin(req) {
  const codes = req.auth?.permissionCodes || [];
  return codes.includes("*") || codes.includes("tenant.manage");
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
  serviceAuth,
  async (req, res, next) => {
    try {
      if (!hasAnyPermission(req, NOTIFICATION_ACCESS)) {
        throw new ApiError(403, "Insufficient permissions");
      }
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
          templateParams: {
            to_email: value.to,
            subject: value.subject || "Notification",
            message: value.message,
          },
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

/** Any signed-in tenant user may read their own inbox. */
router.get("/", serviceAuth, async (req, res, next) => {
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
