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

function KycExternalFormsPage() {
  const { showToast } = useToast();
  const { tenantContextId } = useAuth();
  const [externalUsers, setExternalUsers] = useState([]);
  const [schemaModules, setSchemaModules] = useState([]);
  const [chainPreview, setChainPreview] = useState(null);
  const [formDispatch, setFormDispatch] = useState({
    moduleId: "",
    instructions: "",
    dueDate: "",
    approvalChainOrder: "DEFAULT",
    approvalChainUserIdsText: "",
    selectedExternals: [],
  });
  const [dispatches, setDispatches] = useState([]);
  const [dispatchSending, setDispatchSending] = useState(false);
  /** Shown right after POST so staff see the same URLs as emailed (uses tab origin). */
  const [lastSentLinks, setLastSentLinks] = useState([]);

  const recipientUrlForRow = (row) => {
    if (!row?.publicPath) return row?.publicUrl || "";
    if (typeof window === "undefined") return row.publicUrl || "";
    return `${window.location.origin}${row.publicPath}`;
  };

  const loadExternalUsers = useCallback(async () => {
    try {
      const res = await api.get("/kyc/external-users");
      setExternalUsers(res.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [showToast]);

  const loadSchemaModules = useCallback(async () => {
    try {
      const res = await api.get("/kyc/schema-modules");
      setSchemaModules(res.data || []);
    } catch {
      setSchemaModules([]);
    }
  }, []);

  const loadChainPreview = useCallback(async () => {
    try {
      const res = await api.get("/kyc/approval-chain-preview");
      setChainPreview(res.data || null);
    } catch {
      setChainPreview(null);
    }
  }, []);

  const loadDispatches = useCallback(async () => {
    try {
      const res = await api.get("/kyc/form-dispatches");
      setDispatches(res.data || []);
    } catch {
      setDispatches([]);
    }
  }, []);

  useEffect(() => {
    loadExternalUsers();
    loadSchemaModules();
    loadChainPreview();
    loadDispatches();
  }, [tenantContextId, loadExternalUsers, loadSchemaModules, loadChainPreview, loadDispatches]);

  const toggleExternalForForm = (id) => {
    const s = String(id);
    setFormDispatch((prev) => ({
      ...prev,
      selectedExternals: prev.selectedExternals.includes(s)
        ? prev.selectedExternals.filter((x) => x !== s)
        : [...prev.selectedExternals, s],
    }));
  };

  const sendFormDispatches = async (event) => {
    event.preventDefault();
    if (!formDispatch.moduleId || !formDispatch.selectedExternals.length) {
      showToast("Choose a form and at least one external user.", "error");
      return;
    }
    const customRaw = formDispatch.approvalChainUserIdsText.trim();
    let approvalChainUserIds;
    if (customRaw) {
      approvalChainUserIds = customRaw
        .split(/[\s,]+/)
        .map((x) => x.trim())
        .filter(Boolean);
    }
    setDispatchSending(true);
    try {
      const { data } = await api.post("/kyc/form-dispatches", {
        moduleId: formDispatch.moduleId,
        externalUserIds: formDispatch.selectedExternals,
        instructions: formDispatch.instructions,
        dueDate: formDispatch.dueDate || "",
        approvalChainOrder: formDispatch.approvalChainOrder,
        appPublicOrigin: typeof window !== "undefined" ? window.location.origin : "",
        ...(approvalChainUserIds?.length ? { approvalChainUserIds } : {}),
      });
      const rows = Array.isArray(data) ? data : [];
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setLastSentLinks(
        rows.map((d) => {
          const ext = externalUsers.find((u) => String(u._id) === String(d.externalUserId));
          const url =
            d.publicUrl ||
            (d.publicPath && origin ? `${origin}${d.publicPath}` : "") ||
            (d.token && origin ? `${origin}/public/schema-forms/dispatch/${encodeURIComponent(d.token)}` : "");
          return { email: ext?.email || String(d.externalUserId || ""), url };
        }),
      );
      showToast(
        rows.length ? `Sent ${rows.length} form link(s). Recipient URLs match this app (${origin || "—"}).` : "Dispatched.",
        "success",
      );
      setFormDispatch((p) => ({
        ...p,
        selectedExternals: [],
        instructions: "",
        dueDate: "",
        approvalChainOrder: "DEFAULT",
        approvalChainUserIdsText: "",
      }));
      loadDispatches();
      loadChainPreview();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setDispatchSending(false);
    }
  };

  const approveDispatch = async (id, action) => {
    if (action === "REJECT" && !window.confirm("Reject this submission? The external user and creator will be notified.")) return;
    try {
      await api.post(`/kyc/form-dispatches/${id}/approve`, { action });
      showToast(action === "APPROVE" ? "Approved." : "Rejected.", "success");
      loadDispatches();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return (
    <ModulePage
      title="External forms"
      description="Send tenant schema forms to external users you created on KYC, set approval order (default follows your reporting line L1→Ln), and track dispatches. All tenant-scoped forms from the Forms page appear in the list."
    >
      <TenantScopeBanner context="External forms" />
      <h3>1) Send schema form</h3>
      <p className="small-note">
        Forms are shared across the tenant (anyone who saved a form with tenant scope). Approval order defaults to your managers from immediate → top; choose <strong>Reverse</strong> or paste a comma-separated list of user IDs (tenant admins: any active users; others: same set as your chain, reordered only).
      </p>
      {chainPreview?.defaultOrder?.length ? (
        <p className="small-note">
          <strong>Your default chain:</strong>{" "}
          {chainPreview.defaultOrder.map((u) => u.empCode || u.email || u.name).join(" → ")}
        </p>
      ) : (
        <p className="small-note">No reporting managers found — submissions will auto-complete after send (no approval steps).</p>
      )}
      <form className="stacked-form" onSubmit={sendFormDispatches} style={{ maxWidth: "720px" }}>
        <label className="stacked-label">
          Form
          <select
            value={formDispatch.moduleId}
            onChange={(e) => setFormDispatch((p) => ({ ...p, moduleId: e.target.value }))}
            required
          >
            <option value="">Select form</option>
            {schemaModules.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {!schemaModules.length ? (
          <p className="small-note">No forms for this tenant yet. Open Forms and save a form (tenant scope attaches automatically when logged in).</p>
        ) : null}
        <label className="stacked-label">
          Approval order
          <select
            value={formDispatch.approvalChainOrder}
            onChange={(e) => setFormDispatch((p) => ({ ...p, approvalChainOrder: e.target.value }))}
          >
            <option value="DEFAULT">Default (manager → top)</option>
            <option value="REVERSE">Reverse (top → manager)</option>
          </select>
        </label>
        <label className="stacked-label">
          Custom approver user IDs (optional)
          <input
            value={formDispatch.approvalChainUserIdsText}
            onChange={(e) => setFormDispatch((p) => ({ ...p, approvalChainUserIdsText: e.target.value }))}
            placeholder="24-char hex ids, comma or space separated"
          />
        </label>
        <fieldset style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "0.75rem" }}>
          <legend className="small-note">Recipients (external users)</legend>
          {externalUsers.length === 0 ? (
            <p className="small-note">Create external users on the KYC page first.</p>
          ) : (
            externalUsers.map((u) => (
              <label key={u._id} className="notifications-recipient-option" style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={formDispatch.selectedExternals.includes(String(u._id))}
                  onChange={() => toggleExternalForForm(u._id)}
                />
                <span>
                  {u.name} <span className="small-note">&lt;{u.email}&gt;</span>
                </span>
              </label>
            ))
          )}
        </fieldset>
        <label className="stacked-label">
          Instructions (optional)
          <textarea
            rows={3}
            value={formDispatch.instructions}
            onChange={(e) => setFormDispatch((p) => ({ ...p, instructions: e.target.value }))}
            placeholder="Shown on the public form page with the tenant name."
          />
        </label>
        <label className="stacked-label">
          Last date (optional)
          <input
            type="datetime-local"
            value={formDispatch.dueDate}
            onChange={(e) => setFormDispatch((p) => ({ ...p, dueDate: e.target.value }))}
          />
        </label>
        <button className="btn-primary" type="submit" disabled={dispatchSending || !formDispatch.moduleId}>
          {dispatchSending ? "Sending…" : "Send form links"}
        </button>
      </form>
      {lastSentLinks.length ? (
        <div
          className="small-note"
          style={{
            maxWidth: "720px",
            marginTop: "0.75rem",
            padding: "0.75rem",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            background: "var(--surface-2, rgba(0,0,0,0.03))",
          }}
        >
          <strong>Just sent — recipient links</strong> (same as in email; open or copy here)
          <ul style={{ margin: "0.5rem 0 0 1rem", padding: 0, listStyle: "disc" }}>
            {lastSentLinks.map((item, i) => (
              <li key={`${item.email}-${i}`} style={{ marginBottom: "0.35rem" }}>
                <span className="small-note">{item.email}</span>
                {item.url ? (
                  <>
                    {" · "}
                    <a className="link" href={item.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                    {" · "}
                    <button
                      type="button"
                      className="link"
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
                      onClick={() => {
                        navigator.clipboard.writeText(item.url).then(
                          () => showToast("Link copied", "success"),
                          () => showToast("Could not copy", "error"),
                        );
                      }}
                    >
                      Copy URL
                    </button>
                    <div style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: "0.85em", marginTop: "0.25rem" }}>
                      {item.url}
                    </div>
                  </>
                ) : (
                  " — (no URL in response)"
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h3>2) Form dispatches & approvals</h3>
      <p className="small-note">
        You see rows you created, where you approve, or all tenant dispatches if you have workflow tracking access. The per-dispatch activity audit trail opens from{" "}
        <Link className="link" to="/workflows">
          Workflows
        </Link>{" "}
        (Activity log).
      </p>
      <DataTable
        columns={[
          { key: "createdAt", label: "Sent", render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—") },
          { key: "moduleName", label: "Form" },
          {
            key: "external",
            label: "External user",
            render: (row) => row.externalUserId?.email || row.externalUserId?.name || "—",
          },
          {
            key: "recipientLink",
            label: "Recipient link",
            render: (row) => {
              const url = recipientUrlForRow(row);
              if (!url) return "—";
              return (
                <span className="table-row-actions" style={{ flexWrap: "wrap", gap: "0.35rem" }}>
                  <a className="link" href={url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(url).then(
                        () => showToast("Link copied", "success"),
                        () => showToast("Could not copy", "error"),
                      );
                    }}
                  >
                    Copy
                  </button>
                </span>
              );
            },
          },
          { key: "status", label: "Status" },
          {
            key: "pdf",
            label: "PDF",
            render: (row) =>
              row.pdfRelativeUrl ? (
                <a className="link" href={resolveSchemaFormAssetUrl(row.pdfRelativeUrl)} target="_blank" rel="noreferrer">
                  Download
                </a>
              ) : (
                "—"
              ),
          },
          {
            key: "actions",
            label: "Actions",
            render: (row) =>
              row.canApprove ? (
                <span className="table-row-actions">
                  <button type="button" className="btn-primary" onClick={() => approveDispatch(row._id, "APPROVE")}>
                    Approve
                  </button>
                  <button type="button" className="btn-danger" onClick={() => approveDispatch(row._id, "REJECT")}>
                    Reject
                  </button>
                </span>
              ) : (
                "—"
              ),
          },
        ]}
        rows={dispatches}
      />
    </ModulePage>
  );
}

export default KycExternalFormsPage;
