const mongoose = require("mongoose");
const crypto = require("crypto");
const env = require("../config/env");
const { notificationAdapter, PLATFORM_TENANT_CODES } = require("@pink/shared");
const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const Tenant = require("../models/tenant.model");
const ExternalUser = require("../models/externalUser.model");
const SchemaFormDispatch = require("../models/schemaFormDispatch.model");
const Module = require("../models/module.model");
const logger = require("@pink/shared").logger;
const { listManagersUpChain } = require("./reportingChain.service");
const { getUserIdsWithTenantManage } = require("./notifications.service");

function apiOrigin() {
  const base = (env.API_PUBLIC_URL || "").replace(/\/$/, "");
  if (base) return base;
  return `http://127.0.0.1:${env.PORT}`;
}

/**
 * Absolute origin for SPA links in emails. Never return "" — relative URLs break in Gmail (e.g. http://public/...).
 */
function appOriginForEmail() {
  const configured = String(env.APP_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  if (env.NODE_ENV === "production") {
    logger.warn(
      { fallback: env.DEV_APP_PUBLIC_URL },
      "APP_PUBLIC_URL is empty in production; set it to your real app URL (e.g. https://app.example.com).",
    );
  }
  const dev = String(env.DEV_APP_PUBLIC_URL || "http://127.0.0.1:5173")
    .trim()
    .replace(/\/$/, "");
  return dev || "http://127.0.0.1:5173";
}

function absolutePdfUrl(relativePath) {
  if (!relativePath) return "";
  if (String(relativePath).startsWith("http")) return relativePath;
  const origin = apiOrigin();
  const pathPart = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  return `${origin}${pathPart}`;
}

function dispatchPublicPath(token) {
  return `/public/schema-forms/dispatch/${encodeURIComponent(token)}`;
}

/** Absolute URL for emails and sharing. Prefer linkOrigin from the sender's browser when provided. */
function dispatchPublicUrl(token, linkOrigin) {
  const origin = String(linkOrigin || "")
    .trim()
    .replace(/\/$/, "");
  const front = origin || appOriginForEmail();
  return `${front}${dispatchPublicPath(token)}`;
}

function safe(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadUsersMap(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean).map((id) => String(id)))];
  if (!ids.length) return new Map();
  const oids = ids.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  const users = await User.find({ _id: { $in: oids } }).select("name email empCode").lean();
  return new Map(users.map((u) => [String(u._id), u]));
}

async function createInAppNotification({
  tenantId,
  recipientUserId,
  fromUserId,
  subject,
  message,
  eventType,
  metadata,
}) {
  await Notification.create({
    tenantId,
    userId: recipientUserId,
    recipientUserId,
    fromUserId: fromUserId || null,
    channel: "IN_APP",
    subject: subject || "",
    message,
    eventType,
    status: "SENT",
    metadata: metadata || undefined,
  });
}

async function emailUser(user, subject, html) {
  if (!user?.email) return;
  await notificationAdapter.sendEmail({
    to: user.email,
    subject,
    html,
    templateParams: {
      to_email: user.email,
      subject,
      message: html,
    },
  });
}

/** Avoid duplicate sends when the same person appears in multiple roles (e.g. creator and approver). */
async function emailUserDedup(seenLowercaseEmails, user, subject, html) {
  if (!user?.email) return;
  const key = String(user.email).trim().toLowerCase();
  if (seenLowercaseEmails.has(key)) return;
  seenLowercaseEmails.add(key);
  await emailUser(user, subject, html);
}

/**
 * Build approval chain (reporting line) for the employee who sent the form, top-down from immediate manager.
 */
async function buildApprovalChain(tenantId, dispatchedByUserId) {
  const ids = await listManagersUpChain(tenantId, dispatchedByUserId);
  return ids.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
}

async function pushDispatchEvent(dispatchId, kind, detail) {
  if (!dispatchId) return;
  await SchemaFormDispatch.findByIdAndUpdate(dispatchId, {
    $push: { eventLog: { at: new Date(), kind, detail: String(detail || "").slice(0, 2000) } },
  });
}

async function createDispatchesForRecipients({
  tenantId,
  moduleId,
  externals,
  dispatchedByUserId,
  instructions,
  dueDate,
  approvalChainUserIds,
  /** Optional e.g. window.location.origin from KYC UI so email links match the app the user has open. */
  linkOrigin,
  /**
   * EMAIL (default) keeps the historical behaviour: the service mails the link.
   * MANUAL sends no email at all — an employee copies the link from their page
   * and shares it with the recipient themselves.
   */
  delivery = "EMAIL",
  /** Employee who will share the link with the recipient (doctor compliance). */
  handlerUserId = null,
  /** Agreement template picked on the form, if any. */
  templateId = null,
  /** Composed agreement frozen at assign time (Party 1 + doctor blanks). */
  agreementHtml = "",
  openingSignatureTemplateId = null,
  openingAgreementSnapshot = null,
}) {
  const manualDelivery = delivery === "MANUAL";
  const handlerOid =
    handlerUserId && mongoose.Types.ObjectId.isValid(String(handlerUserId))
      ? new mongoose.Types.ObjectId(String(handlerUserId))
      : null;
  const explicitChain =
    approvalChainUserIds && approvalChainUserIds.length
      ? approvalChainUserIds.map((id) =>
          id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)),
        )
      : null;
  // A doctor's submission is approved up the reporting line of the
  // employee who shares the link (the handler). When that employee
  // sits at the top of the org, fall back to the assigning admin's
  // own line so the chain is never empty by accident.
  let chain;
  if (explicitChain) {
    chain = explicitChain;
  } else {
    const handlerChain = handlerOid ? await buildApprovalChain(tenantId, handlerOid) : [];
    chain = handlerChain.length
      ? handlerChain
      : await buildApprovalChain(tenantId, dispatchedByUserId);
  }
  const tenant = await Tenant.findById(tenantId).select("name").lean();
  const tenantName = tenant?.name || "Your organization";
  const creator = await User.findById(dispatchedByUserId).select("name email empCode").lean();
  const moduleDoc = await Module.findById(moduleId).select("name").lean();
  const moduleName = moduleDoc?.name || "Form";

  const dispatches = [];
  for (const ext of externals) {
    const token = crypto.randomBytes(24).toString("hex");
    // eslint-disable-next-line no-await-in-loop
    const doc = await SchemaFormDispatch.create({
      tenantId,
      moduleId,
      externalUserId: ext._id,
      dispatchedByUserId,
      handlerUserId: handlerOid,
      templateId: templateId || null,
      agreementHtml: agreementHtml || "",
      openingSignatureTemplateId: openingSignatureTemplateId || null,
      openingAgreementSnapshot,
      delivery: manualDelivery ? "MANUAL" : "EMAIL",
      token,
      instructions: instructions || "",
      dueDate: dueDate || null,
      status: "SENT",
      approvalChainUserIds: chain,
      currentApprovalIndex: -1,
      eventLog: [{ at: new Date(), kind: "CREATED", detail: `Approval chain: ${chain.length} step(s).` }],
    });
    dispatches.push(doc);
  }

  const creatorLabel = creator?.empCode || creator?.name || creator?.email || "Employee";

  const userMap = await loadUsersMap([...chain, dispatchedByUserId, ...(handlerOid ? [String(handlerOid)] : [])]);
  const handler = handlerOid ? userMap.get(String(handlerOid)) : null;
  const handlerLabel = handler?.empCode || handler?.name || handler?.email || "An employee";

  for (const d of dispatches) {
    const ext = externals.find((e) => String(e._id) === String(d.externalUserId));
    const link = dispatchPublicUrl(d.token, linkOrigin);
    const dueStr = d.dueDate ? new Date(d.dueDate).toLocaleString() : "Not specified";

    // MANUAL delivery: no email leaves the system. The handler gets the link
    // in-app and shares it with the recipient over whatever channel they prefer.
    if (manualDelivery) {
      if (handlerOid) {
        // eslint-disable-next-line no-await-in-loop
        await createInAppNotification({
          tenantId,
          recipientUserId: handlerOid,
          fromUserId: new mongoose.Types.ObjectId(dispatchedByUserId),
          subject: `${tenantName}: share this form link with ${ext.name || "the recipient"}`,
          message: `"${moduleName}" was assigned to ${ext.name || ext.email}. Copy the link below and send it to them on any channel you prefer — no email was sent. Link: ${link}${
            d.instructions ? `\n\nInstructions: ${d.instructions}` : ""
          }`,
          eventType: "SCHEMA_FORM_DISPATCH_MANUAL_SHARE",
          metadata: {
            type: "SCHEMA_FORM_DISPATCH_MANUAL_SHARE",
            dispatchId: String(d._id),
            moduleId: String(moduleId),
            doctorId: String(ext._id),
            publicUrl: link,
            publicPath: dispatchPublicPath(d.token),
          },
        });
      }
      // eslint-disable-next-line no-await-in-loop
      await pushDispatchEvent(
        d._id,
        "MANUAL_SHARE",
        `No email sent. ${handlerLabel} copies the link and shares it with the recipient.`,
      );
      continue;
    }

    const extSubject = `${tenantName}: form request — action required`;
    const extHtml = `
      <p><strong>${safe(tenantName)}</strong> has sent you a form to complete.</p>
      <p><a href="${safe(link)}"><strong>Open the form</strong></a></p>
      <p style="margin:12px 0;font-size:13px;color:#444;">If the button or link above does not open, copy this URL into your browser:</p>
      <p style="word-break:break-all;font-family:monospace;font-size:13px;background:#f5f5f5;padding:10px;border-radius:6px;border:1px solid #ddd;">${safe(link)}</p>
      ${d.instructions ? `<p><strong>Instructions:</strong><br/>${safe(d.instructions).replace(/\n/g, "<br/>")}</p>` : ""}
      <p><strong>Complete by:</strong> ${safe(dueStr)}</p>
      <p>Sent by: ${safe(creatorLabel)}</p>
    `;
    // eslint-disable-next-line no-await-in-loop
    await emailUser({ email: ext.email, name: ext.name }, extSubject, extHtml);

    const empSubject = `Form sent to ${ext.name || ext.email}`;
    const empHtml = `
      <p>You sent a form link to <strong>${safe(ext.name)}</strong> (${safe(ext.email)}).</p>
      <p>Recipient link: <a href="${safe(link)}">${safe(link)}</a></p>
      <p>Tenant: ${safe(tenantName)} · Due: ${safe(dueStr)}</p>
    `;
    // eslint-disable-next-line no-await-in-loop
    await emailUser(creator, empSubject, empHtml);

    const chainTotal = chain.length;
    const seenChainEmails = new Set();
    for (let i = 0; i < chain.length; i++) {
      const mgr = userMap.get(String(chain[i]));
      if (!mgr?.email) continue;
      const stepN = i + 1;
      const mgrSubject = `${tenantName}: form assigned — you are approver ${stepN}/${chainTotal} — ${ext.name || ext.email}`;
      const mgrHtml = `
        <p><strong>${safe(creatorLabel)}</strong> sent a form to <strong>${safe(ext.name)}</strong> (${safe(ext.email)}).</p>
        <p>You are <strong>approver ${stepN} of ${chainTotal}</strong> in the reporting chain for this dispatch. After they submit, approvals run in order; you will get another email when it is your turn to act in the app (<strong>KYC → Form dispatches</strong>).</p>
        <p>The recipient has not submitted yet.</p>
        <p>Tenant: ${safe(tenantName)} · Due: ${safe(dueStr)}</p>
      `;
      // eslint-disable-next-line no-await-in-loop
      await emailUserDedup(seenChainEmails, mgr, mgrSubject, mgrHtml);
    }

    const firstManager = chain.length ? userMap.get(String(chain[0])) : null;
    if (firstManager?._id) {
      // eslint-disable-next-line no-await-in-loop
      await createInAppNotification({
        tenantId,
        recipientUserId: firstManager._id,
        fromUserId: new mongoose.Types.ObjectId(dispatchedByUserId),
        subject: `${tenantName}: form link sent`,
        message: `${creatorLabel} emailed a form to ${ext.name || ext.email}. Recipient link: ${link}. You will get the PDF for approval after they submit.`,
        eventType: "SCHEMA_FORM_DISPATCH_SENT",
        metadata: {
          type: "SCHEMA_FORM_DISPATCH_SENT",
          dispatchId: String(d._id),
          publicUrl: link,
          publicPath: dispatchPublicPath(d.token),
        },
      });
    }
    // eslint-disable-next-line no-await-in-loop
    await pushDispatchEvent(
      d._id,
      "EMAIL_INITIAL",
      `Emailed external user, sender, and all ${chain.length} approver(s) in chain (in-app FYI to L1 if applicable).`,
    );
  }

  return { dispatches, tenantName, creatorLabel };
}

async function afterSubmissionNotify({ dispatch, moduleName }) {
  const tenant = await Tenant.findById(dispatch.tenantId).select("name").lean();
  const tenantName = tenant?.name || "Organization";
  const pdfAbs = absolutePdfUrl(dispatch.pdfRelativeUrl);
  const ext = await ExternalUser.findById(dispatch.externalUserId).lean();
  const creator = await User.findById(dispatch.dispatchedByUserId).select("name email empCode").lean();
  const chain = dispatch.approvalChainUserIds || [];
  const userMap = await loadUsersMap([...chain.map(String), String(dispatch.dispatchedByUserId)]);

  const extSubject = `${tenantName}: we received your form`;
  const extHtml = `
    <p>Thank you. <strong>${safe(moduleName)}</strong> was submitted successfully.</p>
    ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF receipt</a></p>` : ""}
  `;
  await emailUser({ email: ext?.email, name: ext?.name }, extSubject, extHtml);

  const crSubject = `Form submitted by ${ext?.name || ext?.email}`;
  const crHtml = `
    <p><strong>${safe(ext?.name)}</strong> (${safe(ext?.email)}) submitted <strong>${safe(moduleName)}</strong>.</p>
    ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF</a></p>` : ""}
    ${chain.length ? `<p>Awaiting approval from your reporting line (${chain.length} step(s)).</p>` : "<p>No approval steps; workflow is complete.</p>"}
  `;
  await emailUser(creator, crSubject, crHtml);

  if (chain.length) {
    const fromOid = dispatch.dispatchedByUserId ? new mongoose.Types.ObjectId(dispatch.dispatchedByUserId) : null;
    const seen = new Set();
    for (let i = 0; i < chain.length; i++) {
      const approver = userMap.get(String(chain[i]));
      if (!approver?.email) continue;
      const isFirst = i === 0;
      const apprSubject = isFirst
        ? `${tenantName}: approve form — ${safe(moduleName)}`
        : `${tenantName}: form submitted — your step is ${i + 1}/${chain.length} — ${safe(moduleName)}`;
      const apprHtml = isFirst
        ? `
      <p><strong>${safe(ext?.name)}</strong> submitted <strong>${safe(moduleName)}</strong>.</p>
      ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF</a></p>` : ""}
      <p><strong>Action required:</strong> Sign in to the app and open <strong>KYC → Form dispatches</strong> to approve or reject.</p>
    `
        : `
      <p><strong>${safe(ext?.name)}</strong> submitted <strong>${safe(moduleName)}</strong>.</p>
      ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF</a></p>` : ""}
      <p>You are <strong>approver ${i + 1} of ${chain.length}</strong>. The submission is currently with an earlier approver; you will receive another email when it reaches you.</p>
    `;
      // eslint-disable-next-line no-await-in-loop
      await emailUserDedup(seen, approver, apprSubject, apprHtml);
      if (isFirst && approver._id) {
        // eslint-disable-next-line no-await-in-loop
        await createInAppNotification({
          tenantId: dispatch.tenantId,
          recipientUserId: chain[0],
          fromUserId: fromOid,
          subject: apprSubject,
          message: `${ext?.name || "Recipient"} submitted "${moduleName}". PDF: ${pdfAbs || "n/a"}`,
          eventType: "SCHEMA_FORM_DISPATCH_APPROVAL",
          metadata: {
            type: "SCHEMA_FORM_DISPATCH_APPROVAL",
            dispatchId: String(dispatch._id),
            pdfUrl: pdfAbs,
            moduleName,
          },
        });
      }
    }
  }

  // In-app update for whoever owns this dispatch: the tenant's admins, the
  // employee who shared the link, and Pinktech's super admins. This is how a
  // doctor's submission reaches the people who assigned the form — the
  // per-form status itself lives on that doctor's own View page.
  const recipientLabel = ext?.name || ext?.email || "The recipient";
  const statusLabel = dispatch.status === "APPROVED" ? "Completed" : "Awaiting approval";
  const adminSubject = `${tenantName}: form submitted — ${moduleName}`;
  const adminMessage = `${recipientLabel} submitted "${moduleName}". Status: ${statusLabel}. See this form's status on their Doctor Management → View page.`;
  const adminMeta = {
    type: "DOCTOR_FORM_SUBMITTED",
    dispatchId: String(dispatch._id),
    moduleId: String(dispatch.moduleId),
    externalUserId: String(dispatch.externalUserId),
    publicPath: dispatchPublicPath(dispatch.token),
    moduleName,
    status: dispatch.status,
  };
  const notifyFrom = dispatch.dispatchedByUserId
    ? new mongoose.Types.ObjectId(String(dispatch.dispatchedByUserId))
    : null;

  const adminRecipients = await getUserIdsWithTenantManage(dispatch.tenantId);
  if (dispatch.handlerUserId) adminRecipients.add(String(dispatch.handlerUserId));
  if (dispatch.dispatchedByUserId) adminRecipients.add(String(dispatch.dispatchedByUserId));

  for (const adminId of adminRecipients) {
    if (!mongoose.Types.ObjectId.isValid(adminId)) continue;
    // eslint-disable-next-line no-await-in-loop
    await createInAppNotification({
      tenantId: dispatch.tenantId,
      recipientUserId: adminId,
      fromUserId: notifyFrom,
      subject: adminSubject,
      message: adminMessage,
      eventType: "DOCTOR_FORM_SUBMITTED",
      metadata: adminMeta,
    });
  }

  // Pinktech's shared super admin lives in the platform tenant (PINKTECH in new
  // databases, PLATFORM in older ones), so its notification is filed there to
  // land in their inbox.
  const platformTenant = await Tenant.findOne({ code: { $in: PLATFORM_TENANT_CODES } }).select("_id").lean();
  if (platformTenant?._id) {
    const systemRoles = await Role.find({ tenantId: platformTenant._id, type: "SYSTEM" })
      .select("_id")
      .lean();
    const systemRoleIds = systemRoles.map((r) => r._id);
    if (systemRoleIds.length) {
      const superAdmins = await User.find({
        tenantId: platformTenant._id,
        roleIds: { $in: systemRoleIds },
        status: { $nin: ["DISABLED", "LOCKED"] },
      })
        .select("_id")
        .lean();
      for (const admin of superAdmins) {
        // eslint-disable-next-line no-await-in-loop
        await createInAppNotification({
          tenantId: platformTenant._id,
          recipientUserId: admin._id,
          fromUserId: notifyFrom,
          subject: `${tenantName}: ${adminSubject}`,
          message: adminMessage,
          eventType: "DOCTOR_FORM_SUBMITTED",
          metadata: adminMeta,
        });
      }
    }
  }
}

async function afterApprovalStepNotify({ dispatch, moduleName, stepIndex, actorUserId }) {
  const tenant = await Tenant.findById(dispatch.tenantId).select("name").lean();
  const tenantName = tenant?.name || "Organization";
  const pdfAbs = absolutePdfUrl(dispatch.pdfRelativeUrl);
  const ext = await ExternalUser.findById(dispatch.externalUserId).lean();
  const creator = await User.findById(dispatch.dispatchedByUserId).select("name email empCode").lean();
  const chain = (dispatch.approvalChainUserIds || []).map(String);
  const actor = await User.findById(actorUserId).select("name email empCode").lean();
  const actorLabel = actor?.empCode || actor?.name || actor?.email || "Approver";

  const nextId = stepIndex < chain.length ? chain[stepIndex] : null;
  const userMap = await loadUsersMap([...chain, String(actorUserId || ""), String(dispatch.dispatchedByUserId || "")]);
  const nextUser = nextId ? userMap.get(String(nextId)) : null;
  const pendingStepNum = nextId ? chain.indexOf(String(nextId)) + 1 : chain.length;
  const pendingLabel = nextUser?.empCode || nextUser?.name || nextUser?.email || "the next approver";

  const baseMsg = `Update on "${moduleName}" (${tenantName}): approved by ${actorLabel}.`;

  const loopHtml = (extra) => `
    <p>${safe(baseMsg)} ${safe(extra || "")}</p>
    ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF</a></p>` : ""}
  `;

  await emailUser({ email: ext?.email, name: ext?.name }, `${tenantName}: form approved — ${moduleName}`, loopHtml("Your submission is moving to the next step."));
  await emailUser(creator, `${tenantName}: approval progress — ${moduleName}`, loopHtml(""));

  const seen = new Set();
  if (ext?.email) seen.add(String(ext.email).trim().toLowerCase());
  if (creator?.email) seen.add(String(creator.email).trim().toLowerCase());

  for (const id of chain) {
    const u = userMap.get(String(id));
    if (!u?.email) continue;
    const isNext = nextId && String(id) === String(nextId);
    if (isNext) {
      const subj = `${tenantName}: approve form — ${moduleName}`;
      const body = `
        <p><strong>${safe(ext?.name)}</strong>'s submission needs your approval.</p>
        ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF</a></p>` : ""}
        <p>You are <strong>approver ${pendingStepNum} of ${chain.length}</strong>. Open the app → <strong>KYC → Form dispatches</strong> to act.</p>
      `;
      // eslint-disable-next-line no-await-in-loop
      await emailUserDedup(seen, u, subj, body);
      const fromOid = actorUserId ? new mongoose.Types.ObjectId(actorUserId) : null;
      // eslint-disable-next-line no-await-in-loop
      await createInAppNotification({
        tenantId: dispatch.tenantId,
        recipientUserId: new mongoose.Types.ObjectId(nextId),
        fromUserId: fromOid,
        subject: `${tenantName}: approval needed`,
        message: `Approve "${moduleName}" for ${ext?.name || "recipient"}. PDF: ${pdfAbs || "n/a"}`,
        eventType: "SCHEMA_FORM_DISPATCH_APPROVAL",
        metadata: { type: "SCHEMA_FORM_DISPATCH_APPROVAL", dispatchId: String(dispatch._id), pdfUrl: pdfAbs, moduleName },
      });
    } else {
      const fySubject = `${tenantName}: approval progress — ${moduleName}`;
      const fyHtml = `
        <p>${safe(baseMsg)}</p>
        <p>Current approver: <strong>${safe(pendingLabel)}</strong> (step ${pendingStepNum} of ${chain.length}).</p>
        ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF</a></p>` : ""}
        <p>No action required from you at this step.</p>
      `;
      // eslint-disable-next-line no-await-in-loop
      await emailUserDedup(seen, u, fySubject, fyHtml);
    }
  }
}

async function afterFullyApprovedNotify({ dispatch, moduleName }) {
  const tenant = await Tenant.findById(dispatch.tenantId).select("name").lean();
  const tenantName = tenant?.name || "Organization";
  const pdfAbs = absolutePdfUrl(dispatch.pdfRelativeUrl);
  const ext = await ExternalUser.findById(dispatch.externalUserId).lean();
  const creator = await User.findById(dispatch.dispatchedByUserId).select("name email empCode").lean();
  const chainIds = (dispatch.approvalChainUserIds || []).map((id) => String(id));
  const userMap = await loadUsersMap([...chainIds, String(dispatch.dispatchedByUserId)]);

  const html = `
    <p><strong>${safe(moduleName)}</strong> is fully approved in ${safe(tenantName)}.</p>
    ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF</a></p>` : ""}
  `;
  const subj = `${tenantName}: form fully approved — ${moduleName}`;
  const seen = new Set();
  // eslint-disable-next-line no-await-in-loop
  await emailUserDedup(seen, { email: ext?.email, name: ext?.name }, `${tenantName}: form fully approved`, html);
  // eslint-disable-next-line no-await-in-loop
  await emailUserDedup(seen, creator, subj, html);
  for (const id of chainIds) {
    const u = userMap.get(id);
    // eslint-disable-next-line no-await-in-loop
    await emailUserDedup(seen, u, subj, html);
  }
}

/**
 * Rejection is in-app only (no email). Notifies the responsible employee who
 * dispatched the form plus every higher official in the approval chain.
 */
async function afterRejectedNotify({ dispatch, moduleName, actorUserId, reason }) {
  const tenant = await Tenant.findById(dispatch.tenantId).select("name").lean();
  const tenantName = tenant?.name || "Organization";
  const pdfAbs = absolutePdfUrl(dispatch.pdfRelativeUrl);
  const ext = await ExternalUser.findById(dispatch.externalUserId).lean();
  const actor = await User.findById(actorUserId).select("name email empCode").lean();
  const actorLabel = actor?.empCode || actor?.name || actor?.email || "Approver";
  const reasonText = String(reason || "").trim();
  const recipientLabel = ext?.name || ext?.email || "the recipient";
  const fromOid = actorUserId ? new mongoose.Types.ObjectId(actorUserId) : null;

  const recipients = new Set();
  if (dispatch.dispatchedByUserId) recipients.add(String(dispatch.dispatchedByUserId));
  for (const id of dispatch.approvalChainUserIds || []) recipients.add(String(id));

  for (const rid of recipients) {
    if (!mongoose.Types.ObjectId.isValid(rid)) continue;
    // eslint-disable-next-line no-await-in-loop
    await createInAppNotification({
      tenantId: dispatch.tenantId,
      recipientUserId: new mongoose.Types.ObjectId(rid),
      fromUserId: fromOid,
      subject: `${tenantName}: correction required — ${moduleName}`,
      message: `${actorLabel} rejected "${moduleName}" for ${recipientLabel}. Reason: ${reasonText || "(not provided)"}. PDF: ${pdfAbs || "n/a"}`,
      eventType: "SCHEMA_FORM_DISPATCH_REJECTED",
      metadata: {
        type: "SCHEMA_FORM_DISPATCH_REJECTED",
        dispatchId: String(dispatch._id),
        moduleName,
        reason: reasonText,
        pdfUrl: pdfAbs,
      },
    });
  }
}

/**
 * Issue a fresh public link. The previous token is revoked (moved to
 * linkHistory) so the old link stops working; the approval chain
 * restarts from step 1 on resubmission. Used after a correction was
 * requested, or to re-issue a link the doctor has already spent.
 */
async function regenerateDispatchLink({ dispatch, actorUserId, linkOrigin }) {
  dispatch.linkHistory.push({
    token: dispatch.token,
    version: dispatch.linkVersion || 1,
    revision: dispatch.revision || 1,
    createdAt: dispatch.createdAt || new Date(),
    revokedAt: new Date(),
    usedAt: null,
  });
  const newToken = crypto.randomBytes(24).toString("hex");
  dispatch.token = newToken;
  dispatch.linkVersion = (dispatch.linkVersion || 1) + 1;
  dispatch.revision = (dispatch.revision || 1) + 1;
  dispatch.status = "SENT";
  dispatch.currentApprovalIndex = -1;
  dispatch.pinkSubmissionId = null;
  dispatch.pdfRelativeUrl = "";
  dispatch.submissionInProgressAt = null;
  await dispatch.save();
  await pushDispatchEvent(
    dispatch._id,
    "LINK_REGENERATED",
    `Correction link v${dispatch.linkVersion} issued by ${actorUserId}; approval chain restarted from step 1.`,
  );
  return { token: newToken, version: dispatch.linkVersion, url: dispatchPublicUrl(newToken, linkOrigin) };
}

/**
 * Email the (external) recipient the regenerated link — their only delivery
 * channel. `wasCorrection` distinguishes a correction request from a plain
 * re-issue (the doctor submitted and the link is spent).
 */
async function notifyRecipientRegeneratedLink({ dispatch, moduleName, linkOrigin, wasCorrection = false }) {
  const ext = await ExternalUser.findById(dispatch.externalUserId).lean();
  if (!ext?.email) return;
  const tenant = await Tenant.findById(dispatch.tenantId).select("name").lean();
  const tenantName = tenant?.name || "Your organization";
  const link = dispatchPublicUrl(dispatch.token, linkOrigin);
  const subject = wasCorrection
    ? `${tenantName}: corrected link for ${moduleName}`
    : `${tenantName}: new link for ${moduleName}`;
  const html = `
    <p><strong>${safe(tenantName)}</strong> ${
      wasCorrection ? "has requested a correction on" : "has issued a new link for"
    } <strong>${safe(moduleName)}</strong>.</p>
    <p><a href="${safe(link)}"><strong>Open the form</strong></a></p>
    <p style="word-break:break-all;font-family:monospace;font-size:13px;background:#f5f5f5;padding:10px;border-radius:6px;border:1px solid #ddd;">${safe(link)}</p>
    <p>Your previous link is no longer valid.</p>
  `;
  await emailUser({ email: ext.email, name: ext.name }, subject, html);
}

module.exports = {
  apiOrigin,
  absolutePdfUrl,
  dispatchPublicPath,
  dispatchPublicUrl,
  buildApprovalChain,
  pushDispatchEvent,
  createDispatchesForRecipients,
  afterSubmissionNotify,
  afterApprovalStepNotify,
  afterFullyApprovedNotify,
  afterRejectedNotify,
  regenerateDispatchLink,
  notifyRecipientRegeneratedLink,
  loadUsersMap,
};