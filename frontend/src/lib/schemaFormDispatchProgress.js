/** @typedef {{ status?: string, currentApprovalIndex?: number, approvalChainUserIds?: unknown[], eventLog?: { kind: string }[] }} SchemaDispatchRow */

/**
 * Number of approvers configured for this dispatch.
 * @param {SchemaDispatchRow} row
 */
export function schemaFormChainLength(row) {
  return (row.approvalChainUserIds || []).length;
}

/**
 * Human-readable chain / approval progress for Workflows UI.
 * @param {SchemaDispatchRow} row
 */
export function getSchemaFormDispatchProgress(row) {
  const total = schemaFormChainLength(row);
  const status = row.status || "SENT";
  const idx = typeof row.currentApprovalIndex === "number" ? row.currentApprovalIndex : -1;

  if (total === 0) {
    return {
      total: 0,
      completedSteps: 0,
      pendingStepNumber: null,
      progressFraction: 0,
      summary: "—",
      statusLine: "No approval chain (auto-complete after submit)",
      rejected: false,
      approvedCount: 0,
      rejectedCount: 0,
    };
  }

  if (status === "APPROVED") {
    return {
      total,
      completedSteps: total,
      pendingStepNumber: null,
      progressFraction: 1,
      summary: `${total}/${total}`,
      statusLine: `${total} approved · 0 rejected`,
      rejected: false,
      approvedCount: total,
      rejectedCount: 0,
    };
  }

  if (status === "REJECTED") {
    const advances = (row.eventLog || []).filter((e) => e.kind === "APPROVAL_ADVANCED").length;
    return {
      total,
      completedSteps: advances,
      pendingStepNumber: null,
      progressFraction: advances / total,
      summary: "Rejected",
      statusLine: `${advances} approved · 1 rejected`,
      rejected: true,
      approvedCount: advances,
      rejectedCount: 1,
    };
  }

  if (status === "SENT") {
    return {
      total,
      completedSteps: 0,
      pendingStepNumber: null,
      progressFraction: 0,
      summary: `0/${total}`,
      statusLine: `0/${total} chain steps used · awaiting external submit`,
      rejected: false,
      approvedCount: 0,
      rejectedCount: 0,
    };
  }

  // IN_APPROVAL — idx is the approver who must act; equals count of completed approvals so far
  const completed = idx >= 0 ? idx : 0;
  const progressFraction = total > 0 ? completed / total : 0;
  return {
    total,
    completedSteps: completed,
    pendingStepNumber: completed + 1,
    progressFraction,
    summary: `${completed}/${total}`,
    statusLine: `${completed}/${total} approved · pending step ${completed + 1} of ${total}`,
    rejected: false,
    approvedCount: completed,
    rejectedCount: 0,
  };
}
