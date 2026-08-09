const SchemaFormDispatch = require("../../models/schemaFormDispatch.model");
const Module = require("./pinkForm/models/module");
const {
  afterSubmissionNotify,
  afterFullyApprovedNotify,
  pushDispatchEvent,
} = require("./schemaFormDispatch.service");

/**
 * Called from pink-form after a public submission + PDF (when body.dispatchToken is set).
 */
async function completeDispatchAfterSubmission({ dispatchToken, submissionId, moduleId, pdfDownloadUrl }) {
  const token = String(dispatchToken || "").trim();
  if (!token) return;

  const dispatch = await SchemaFormDispatch.findOne({ token });
  if (!dispatch) return;
  if (String(dispatch.moduleId) !== String(moduleId)) return;
  if (dispatch.status !== "SENT") return;

  dispatch.pinkSubmissionId = submissionId;
  dispatch.pdfRelativeUrl = pdfDownloadUrl || "";

  const mod = await Module.findById(moduleId).select("name").lean();
  const moduleName = mod?.name || "Form";

  const chain = dispatch.approvalChainUserIds || [];
  if (!chain.length) {
    dispatch.status = "APPROVED";
    dispatch.currentApprovalIndex = -1;
    await dispatch.save();
    await pushDispatchEvent(dispatch._id, "AUTO_APPROVED", "No reporting chain; completed on submit.");
    await afterFullyApprovedNotify({ dispatch, moduleName });
    return;
  }

  dispatch.status = "IN_APPROVAL";
  dispatch.currentApprovalIndex = 0;
  await dispatch.save();
  await pushDispatchEvent(
    dispatch._id,
    "FORM_SUBMITTED",
    "PDF generated; emails and in-app tasks sent to first approver.",
  );
  await afterSubmissionNotify({ dispatch, moduleName });
}

module.exports = {
  completeDispatchAfterSubmission,
};
