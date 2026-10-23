const express = require("express");
const Joi = require("joi");
const mongoose = require("mongoose");
const Notification = require("../models/notification.model");
const { notificationAdapter } = require("@pink/shared");
const serviceAuth = require("../middlewares/serviceAuth");
const ApiError = require("@pink/shared").ApiError;
const { getUserIdsWithTenantManage } = require("../services/notifications.service");


const router = express.Router();

/** Notifications UI: prefer `notification.compose`; `report.view` kept for existing roles. */
const NOTIFICATION_ACCESS = ["notification.compose", "report.view"];

function isTenantAdminUser(req) {
  const codes = req.auth?.permissionCodes || [];
  const role = req.auth?.accountRole;
  const isSuper = req.auth?.isSuperAdmin;
  return codes.includes("*") || codes.includes("tenant.manage") || role === "tenant_admin" || role === "super_admin" || isSuper;
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
      // Allow admins and employees to see both leadership and admins so they can
      // reach super admins/tenant admins as requested.
      const users = await listAllActiveUsers(req.tenantId);
      res.status(200).json({
        scope: "elevated",
        description: "All active employees available for messaging.",
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
      if (!isTenantAdminUser(req)) {
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
    const ok = await assertRecipientsInTenant(req.tenantId, recipientObjectIds);
    if (!ok) {
      throw new ApiError(422, "One or more recipients are invalid or inactive in this tenant.");
    }

    const admin = isTenantAdminUser(req);
    if (!admin) {
      const allowed = await getElevatedRecipientIdSet(req.tenantId);
      // Employees can message admins (including super-admin scoped admins). Keep
      // existing elevated checks but do not block messaging someone who is an
      // admin of the tenant; admins must be able to talk to super admins too.
      const User = require("../models/user.model");
      const Role = require("../models/role.model");
      const Permission = require("../models/permission.model");
      const tenantAdmins = await getUserIdsWithTenantManage(req.tenantId);
      for (const id of uniqueIds) {
        if (allowed.has(String(id)) || tenantAdmins.has(String(id))) continue;
        throw new ApiError(
          403,
          "You can only send notifications to leadership, tenant administrators, or super admins."
        );
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

router.get("/", serviceAuth, async (req, res, next) => {
  try {
    const isAdmin = isTenantAdminUser(req);
    const filter = isAdmin
      ? { tenantId: req.tenantId }
      : {
          tenantId: req.tenantId,
          $or: [{ recipientUserId: req.auth.userId }, { fromUserId: req.auth.userId }],
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
