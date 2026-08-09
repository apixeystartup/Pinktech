import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import TenantScopeBanner from "../../../components/common/TenantScopeBanner";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";
import { resolveSchemaFormAssetUrl } from "../../../lib/schemaFormsPublic";
import { getSchemaFormDispatchProgress } from "../../../lib/schemaFormDispatchProgress";

function FormDispatchApprovalsPage() {
  const { showToast } = useToast();
  const { tenantContextId } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/kyc/form-dispatches");
      const all = res.data || [];
      setRows(all.filter((r) => r.status === "IN_APPROVAL" && r.canApprove));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [tenantContextId, load]);

  const approve = async (id, action) => {
    if (action === "REJECT" && !window.confirm("Reject this submission? The external user and creator will be notified.")) return;
    try {
      await api.post(`/kyc/form-dispatches/${id}/approve`, { action });
      showToast(action === "APPROVE" ? "Approved." : "Rejected.", "success");
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return (
    <ModulePage
      title="Form approvals"
      description="Inbox for approvers in the reporting chain: approve or reject external form submissions when it is your step. Notifications and emails follow the same rules as KYC. Employees who only send forms (operational / level-1 field staff) continue to use KYC → External forms; this page is for chain approvers and supervisors."
    >
      <TenantScopeBanner context="Form approvals" />
      <p className="small-note">
        <Link className="link" to="/workflows">
          Workflows
        </Link>{" "}
        shows every dispatch, chain progress, and activity logs. Only items where <strong>you</strong> are the current approver appear below.
      </p>
      {loading ? <p className="small-note">Loading…</p> : null}
      {!loading && !rows.length ? (
        <p className="small-note">Nothing waiting on you right now.</p>
      ) : null}
      <DataTable
        columns={[
          { key: "createdAt", label: "Dispatch sent", render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—") },
          { key: "moduleName", label: "Form" },
          {
            key: "external",
            label: "External user",
            render: (row) => row.externalUserId?.email || row.externalUserId?.name || "—",
          },
          {
            key: "by",
            label: "Sent by",
            render: (row) => row.dispatchedByUserId?.empCode || row.dispatchedByUserId?.email || "—",
          },
          {
            key: "chain",
            label: "Your step / chain",
            render: (row) => {
              const p = getSchemaFormDispatchProgress(row);
              return p.total ? (
                <span className="small-note" title={p.statusLine}>
                  Step {p.pendingStepNumber} of {p.total} · {p.summary} done
                </span>
              ) : (
                "—"
              );
            },
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
            key: "actions",
            label: "Actions",
            render: (row) => (
              <span className="table-row-actions">
                <button type="button" className="btn-primary" onClick={() => approve(row._id, "APPROVE")}>
                  Approve
                </button>
                <button type="button" className="btn-danger" onClick={() => approve(row._id, "REJECT")}>
                  Reject
                </button>
              </span>
            ),
          },
        ]}
        rows={rows}
      />
    </ModulePage>
  );
}

export default FormDispatchApprovalsPage;
