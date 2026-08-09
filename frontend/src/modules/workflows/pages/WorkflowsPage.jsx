import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import TenantScopeBanner from "../../../components/common/TenantScopeBanner";
import useAuth from "../../../hooks/useAuth";
import { resolveSchemaFormAssetUrl } from "../../../lib/schemaFormsPublic";
import { getSchemaFormDispatchProgress } from "../../../lib/schemaFormDispatchProgress";

function statusClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "APPROVED") return "workflow-status-pill workflow-status-pill--ok";
  if (s === "REJECTED") return "workflow-status-pill workflow-status-pill--bad";
  if (s === "IN_APPROVAL") return "workflow-status-pill workflow-status-pill--pending";
  if (s === "SENT") return "workflow-status-pill workflow-status-pill--sent";
  return "workflow-status-pill";
}

function WorkflowsPage() {
  const { tenantContextId } = useAuth();
  const [pipelineRows, setPipelineRows] = useState([]);
  /** Row whose activity log is open in the modal, or null */
  const [activityLogRow, setActivityLogRow] = useState(null);

  const loadPipeline = useCallback(async () => {
    try {
      const res = await api.get("/kyc/form-dispatches");
      setPipelineRows(res.data || []);
    } catch {
      setPipelineRows([]);
    }
  }, []);

  useEffect(() => {
    loadPipeline();
  }, [tenantContextId, loadPipeline]);

  useEffect(() => {
    if (!activityLogRow) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setActivityLogRow(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activityLogRow]);

  return (
    <ModulePage
      title="Workflows"
      description="Track external form dispatches: status, chain progress (approved vs rejected), activity log. Approvers use Form approvals to act. Default approval order is reporting-line L1→Ln unless changed on KYC → External forms."
    >
      <TenantScopeBanner context="Workflows" />
      <p className="small-note" style={{ marginBottom: "0.75rem" }}>
        To approve or reject when it is your step in the chain, open{" "}
        <Link className="link" to="/form-dispatch-approvals">
          Form approvals
        </Link>
        .
      </p>
      <h3>1) External form pipeline (tracking)</h3>
      <p className="small-note">
        <strong>Status</strong> and <strong>Chain progress</strong> columns are only detailed here. Use <strong>Activity log</strong> for the audit trail. If you have{" "}
        <code>workflow.submit</code> or <code>tenant.manage</code>, you see all tenant dispatches; otherwise only sends you created or must approve.
      </p>
      <DataTable
        columns={[
          { key: "createdAt", label: "Sent", render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—") },
          { key: "moduleName", label: "Form" },
          {
            key: "external",
            label: "External",
            render: (row) => row.externalUserId?.email || row.externalUserId?.name || "—",
          },
          {
            key: "status",
            label: "Status",
            render: (row) => <span className={statusClass(row.status)}>{row.status || "—"}</span>,
          },
          {
            key: "chainProgress",
            label: "Chain progress",
            render: (row) => {
              const p = getSchemaFormDispatchProgress(row);
              const pct = Math.round(Math.min(1, Math.max(0, p.progressFraction)) * 100);
              const fillClass =
                p.rejected === true
                  ? "workflow-progress-fill workflow-progress-fill--rejected"
                  : row.status === "APPROVED"
                    ? "workflow-progress-fill workflow-progress-fill--done"
                    : "workflow-progress-fill";
              return (
                <div className="workflow-progress-cell" title={p.statusLine}>
                  <div className="workflow-progress-track" aria-hidden>
                    <div className={fillClass} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="workflow-progress-meta">{p.statusLine}</div>
                </div>
              );
            },
          },
          {
            key: "by",
            label: "Sent by",
            render: (row) => row.dispatchedByUserId?.empCode || row.dispatchedByUserId?.email || "—",
          },
          {
            key: "pdf",
            label: "PDF",
            render: (row) =>
              row.pdfRelativeUrl ? (
                <a className="link" href={resolveSchemaFormAssetUrl(row.pdfRelativeUrl)} target="_blank" rel="noreferrer">
                  Open
                </a>
              ) : (
                "—"
              ),
          },
          {
            key: "log",
            label: "Activity",
            render: (row) => (
              <button type="button" className="btn-secondary" onClick={() => setActivityLogRow(row)}>
                Activity log ({(row.eventLog || []).length})
              </button>
            ),
          },
        ]}
        rows={pipelineRows}
      />

      {activityLogRow ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setActivityLogRow(null)}>
          <div
            className="modal-card invite-modal-card"
            role="dialog"
            aria-labelledby="workflow-activity-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="workflow-activity-title">Activity log</h3>
            <p className="small-note" style={{ marginTop: 0 }}>
              <strong>{activityLogRow.moduleName || "Form"}</strong> · {activityLogRow.externalUserId?.email || activityLogRow.externalUserId?.name || "—"} ·{" "}
              <span>{activityLogRow.status}</span>
            </p>
            <ul className="small-note" style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
              {(activityLogRow.eventLog || []).map((ev, i) => (
                <li
                  key={`${activityLogRow._id}-ev-${i}`}
                  style={{
                    marginBottom: "0.65rem",
                    paddingBottom: "0.5rem",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {ev.at ? new Date(ev.at).toLocaleString() : "—"} — <code>{ev.kind}</code>
                  {ev.detail ? <span> · {ev.detail}</span> : null}
                </li>
              ))}
            </ul>
            <details className="small-note" style={{ marginBottom: "1rem" }}>
              <summary style={{ cursor: "pointer" }}>Raw JSON</summary>
              <pre className="json-block" style={{ marginTop: "0.5rem", fontSize: "0.8rem", maxHeight: "240px", overflow: "auto" }}>
                {JSON.stringify(activityLogRow.eventLog || [], null, 2)}
              </pre>
            </details>
            <button type="button" className="btn-primary" onClick={() => setActivityLogRow(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </ModulePage>
  );
}

export default WorkflowsPage;
