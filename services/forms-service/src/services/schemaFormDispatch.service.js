const mongoose = require("mongoose");
const crypto = require("crypto");
const env = require("../config/env");
const notificationAdapter = require("./notification.adapter");
const Notification = require("../models/notification.model");
const User = require("../models/user.model");
const Tenant = require("../models/tenant.model");
const ExternalUser = require("../models/externalUser.model");
const SchemaFormDispatch = require("../models/schemaFormDispatch.model");
const logger = require("@pink/shared").logger;
const { listManagersUpChain } = require("./reportingChain.service");

function apiOrigin() {
  const base = (env.API_PUBLIC_URL || "").replace(/\/$/, "");
  if (base) return base;
  return `http://127.0.0.1:${env.PORT}`;
}

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

async function emailUserDedup(seenLowercaseEmails, user, subject, html) {
  if (!user?.email) return;
  const key = String(user.email).trim().toLowerCase();
  if (seenLowercaseEmails.has(key)) return;
  seenLowercaseEmails.add(key);
  await emailUser(user, subject, html);
}

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
  linkOrigin,
}) {
  const chain =
    approvalChainUserIds && approvalChainUserIds.length
      ? approvalChainUserIds.map((id) =>
          id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)),
        )
      : await buildApprovalChain(tenantId, dispatchedByUserId);
  const tenant = await Tenant.findById(tenantId).select("name").lean();
  const tenantName = tenant?.name || "Your organization";
  const creator = await User.findById(dispatchedByUserId).select("name email empCode").lean();

  const dispatches = [];
  for (const ext of externals) {
    const token = crypto.randomBytes(24).toString("hex");
    const doc = await SchemaFormDispatch.create({
      tenantId,
      moduleId,
      externalUserId: ext._id,
      dispatchedByUserId,
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

  const userMap = await loadUsersMap([...chain, dispatchedByUserId]);

  for (const d of dispatches) {
    const ext = externals.find((e) => String(e._id) === String(d.externalUserId));
    const link = dispatchPublicUrl(d.token, linkOrigin);
    const dueStr = d.dueDate ? new Date(d.dueDate).toLocaleString() : "Not specified";

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
    await emailUser({ email: ext.email, name: ext.name }, extSubject, extHtml);

    const empSubject = `Form sent to ${ext.name || ext.email}`;
    const empHtml = `
      <p>You sent a form link to <strong>${safe(ext.name)}</strong> (${safe(ext.email)}).</p>
      <p>Recipient link: <a href="${safe(link)}">${safe(link)}</a></p>
      <p>Tenant: ${safe(tenantName)} · Due: ${safe(dueStr)}</p>
    `;
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
      await emailUserDedup(seenChainEmails, mgr, mgrSubject, mgrHtml);
    }

    const firstManager = chain.length ? userMap.get(String(chain[0])) : null;
    if (firstManager?._id) {
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
      await emailUserDedup(seen, approver, apprSubject, apprHtml);
      if (isFirst && approver._id) {
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
      await emailUserDedup(seen, u, subj, body);
      const fromOid = actorUserId ? new mongoose.Types.ObjectId(actorUserId) : null;
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
  await emailUserDedup(seen, { email: ext?.email, name: ext?.name }, `${tenantName}: form fully approved`, html);
  await emailUserDedup(seen, creator, subj, html);
  for (const id of chainIds) {
    const u = userMap.get(id);
    await emailUserDedup(seen, u, subj, html);
  }
}

async function afterRejectedNotify({ dispatch, moduleName, actorUserId }) {
  const tenant = await Tenant.findById(dispatch.tenantId).select("name").lean();
  const tenantName = tenant?.name || "Organization";
  const pdfAbs = absolutePdfUrl(dispatch.pdfRelativeUrl);
  const ext = await ExternalUser.findById(dispatch.externalUserId).lean();
  const creator = await User.findById(dispatch.dispatchedByUserId).select("name email empCode").lean();
  const actor = await User.findById(actorUserId).select("name email empCode").lean();
  const actorLabel = actor?.empCode || actor?.name || actor?.email || "Approver";
  const chainIds = (dispatch.approvalChainUserIds || []).map((id) => String(id));
  const userMap = await loadUsersMap([...chainIds, String(dispatch.dispatchedByUserId)]);

  const html = `
    <p><strong>${safe(moduleName)}</strong> was <strong>rejected</strong> by ${safe(actorLabel)} (${safe(tenantName)}).</p>
    ${pdfAbs ? `<p><a href="${safe(pdfAbs)}">Download PDF</a></p>` : ""}
  `;
  const subj = `${tenantName}: form rejected — ${moduleName}`;
  const seen = new Set();
  await emailUserDedup(seen, { email: ext?.email, name: ext?.name }, `${tenantName}: form update`, html);
  await emailUserDedup(seen, creator, subj, html);
  for (const id of chainIds) {
    const u = userMap.get(id);
    await emailUserDedup(seen, u, subj, html);
  }
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
  loadUsersMap,
};
