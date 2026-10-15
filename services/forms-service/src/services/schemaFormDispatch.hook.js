const SchemaFormDispatch = require("../models/schemaFormDispatch.model");
const Module = require("../models/schemaFormModule.model");
const {
  afterSubmissionNotify,
  afterFullyApprovedNotify,
  pushDispatchEvent,
} = require("./schemaFormDispatch.service");

async function completeDispatchAfterSubmission({ dispatchToken, submissionId, moduleId, pdfDownloadUrl }) {
  const token = String(dispatchToken || "").trim();
  if (!token) return;

  const dispatch = await SchemaFormDispatch.findOne({ token });
  if (!dispatch) return;
  if (String(dispatch.moduleId) !== String(moduleId)) return;
  if (dispatch.status !== "SENT" && dispatch.status !== "CORRECTION_REQUIRED") return;

  const revision = dispatch.revision || 1;
  const isCorrection = dispatch.status === "CORRECTION_REQUIRED";

  // Freeze the definition used for this response: later edits by the Super Admin
  // must never change how an already-submitted response reads or scores.
  const mod = await Module.findById(moduleId).select("name moduleType formSchema").lean();
  const moduleName = mod?.name || "Form";
  const formSnapshot = {
    name: mod?.name || "Form",
    moduleType: mod?.moduleType || "FORM",
    fields: mod?.formSchema?.fields || [],
  };

  dispatch.submissions = dispatch.submissions || [];
  dispatch.submissions.push({
    revision,
    submissionId,
    pdfRelativeUrl: pdfDownloadUrl || "",
    submittedAt: new Date(),
    formSnapshot,
  });
  dispatch.pinkSubmissionId = submissionId;
  dispatch.pdfRelativeUrl = pdfDownloadUrl || "";
  if (isCorrection) {
    dispatch.rejection = { reason: "", byUserId: null, at: null, stepIndex: -1 };
  }

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
    isCorrection ? "CORRECTION_RESUBMITTED" : "FORM_SUBMITTED",
    isCorrection
      ? `Correction attempt ${revision} submitted; approval chain restarted from step 1.`
      : "PDF generated; emails and in-app tasks sent to first approver.",
  );
  await afterSubmissionNotify({ dispatch, moduleName });
}

module.exports = {
  completeDispatchAfterSubmission,
};
