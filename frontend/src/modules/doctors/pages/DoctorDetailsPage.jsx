import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import { useToast } from "../../../components/common/ToastProvider";
import { getErrorMessage } from "../../../lib/error";
import { isAdminRole } from "../../../lib/access-control";
import useAuth from "../../../hooks/useAuth";
import DoctorFormModal from "../DoctorFormModal";
import DeleteDoctorModal from "../DeleteDoctorModal";
import ApprovalChainPicker from "../ApprovalChainPicker";
import PlaceholderChips from "../../../components/schema-forms/PlaceholderChips";
import { appUrl } from "../doctorLinks";
import "../../../styles/doctors.css";

function fmtDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${fmtDate(d)} · ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function initials(name = "") {
  return String(name)
    .replace(/^dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function Badge({ item }) {
  if (!item) return null;
  return <span className={`doc-badge doc-badge--${item.tone || "muted"}`}>{item.label}</span>;
}

function Progress({ progress, minWidth }) {
  const complete = progress?.percent === 100;
  return (
    <div className="doc-progress" style={minWidth ? { minWidth } : undefined}>
      <span className="doc-progress-track">
        <span
          className={`doc-progress-fill${complete ? " doc-progress-fill--complete" : ""}`}
          style={{ width: `${progress?.percent || 0}%` }}
        />
      </span>
      <span className="doc-progress-text">
        {progress?.answered ?? 0}/{progress?.total ?? 0}
      </span>
    </div>
  );
}

function DetailRow({ label, value, mutedWhenEmpty = true }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <>
      <dt>{label}</dt>
      <dd className={empty && mutedWhenEmpty ? "doc-empty-value" : ""}>{empty ? "—" : value}</dd>
    </>
  );
}

/** Where the form sits in its approval chain, in one line. */
function approvalLevelLabel(form) {
  const steps = form.approvals?.steps || [];
  if (!steps.length) return "No approval chain";
  if (form.status?.key === "COMPLETED") return `All ${steps.length} steps done`;
  if (form.status?.key === "REJECTED" || form.status?.key === "CORRECTION_REQUIRED") {
    return "Correction requested";
  }
  const active = steps.find((s) => s.key === "PENDING");
  if (active) return `Step ${active.index + 1} of ${steps.length} · ${active.approverName || "awaiting"}`;
  return `Step 1 of ${steps.length}`;
}

function DoctorDetailsPage() {
  const { doctorId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, permissionCodes = [], accountRole, isSuperAdmin } = useAuth();
  const canManage = permissionCodes.includes("*") || permissionCodes.includes("doctor.manage");
  // Access control is disabled (everyone carries "*"), so "admin" has to come
  // from the account role: platform super admin or tenant admin.
  const isAdmin = isAdminRole(accountRole, isSuperAdmin);
  const selfId = user?._id || user?.id || "";
  // Admins assign to any employee; employees may also assign, but only with
  // themselves as the sharing employee (enforced by the backend too).
  const canAssignForm = isAdmin || (accountRole === "employee" && Boolean(selfId));

  const [doctor, setDoctor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState(null);
  const [regeneratingId, setRegeneratingId] = useState(null);
  const [deletingDispatchId, setDeletingDispatchId] = useState(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await api.get(`/doctors/${doctorId}`);
        setDoctor(res.data);
        setError("");
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [doctorId],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") load(true);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const openPublic = (path) => {
    if (!path) return;
    window.open(appUrl(path), "_blank", "noopener,noreferrer");
  };

  const copyPath = async (path) => {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(appUrl(path));
      showToast("Link copied — send it to the doctor on any channel.", "success");
    } catch {
      showToast("Could not copy automatically. Open the link and copy it from the address bar.", "error");
    }
  };

  const actOnDispatch = async (dispatchId, action) => {
    let reason = "";
    if (action === "REJECT") {
      reason = window.prompt("Reason for sending it back (correction):") || "";
      if (!reason.trim()) return;
    }
    try {
      await api.post(`/kyc/form-dispatches/${dispatchId}/approve`, {
        action,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      showToast(action === "APPROVE" ? "Approval recorded." : "Correction requested.", "success");
      load(true);
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
  };

  // The link is single-use: once the doctor has submitted, the only
  // way to hand them a working one again is to regenerate it here.
  const regenerateLink = async (form) => {
    setRegeneratingId(form.dispatchId);
    try {
      const { data } = await api.post(`/kyc/form-dispatches/${form.dispatchId}/regenerate-link`, {});
      showToast(
        `New link issued (link v${data.linkVersion}). Copy it and share it with the doctor.`,
        "success",
      );
      load(true);
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    } finally {
      setRegeneratingId(null);
    }
  };

  const deleteWorkflow = async (form) => {
    const confirmed = window.confirm(
      `Delete the ${form.name || "workflow"} workflow for this doctor? This will revoke its form link and remove it from workflow tracking. Existing submitted answers and PDFs will be retained.`,
    );
    if (!confirmed) return;

    setDeletingDispatchId(form.dispatchId);
    try {
      await api.delete(`/kyc/form-dispatches/${form.dispatchId}`);
      showToast("Workflow deleted. Existing submissions and PDFs were retained.", "success");
      await load(true);
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    } finally {
      setDeletingDispatchId(null);
    }
  };

  const compliance = doctor?.compliance || { forms: [], mcqSummary: [], summary: {}, agreement: null, approvals: null };

  if (loading && !doctor) {
    return (
      <ModulePage title="Doctor Details" description="Loading the doctor profile…">
        <div className="doc-empty">Loading…</div>
      </ModulePage>
    );
  }

  if (error && !doctor) {
    return (
      <ModulePage title="Doctor Details" description="The profile could not be loaded.">
        <div className="doc-empty">{error}</div>
        <div className="doc-actions" style={{ marginTop: 12 }}>
          <button type="button" className="btn-secondary" onClick={() => navigate("/app/doctors")}>
            Back to directory
          </button>
          <button type="button" className="btn-primary" onClick={() => load()}>
            Retry
          </button>
        </div>
      </ModulePage>
    );
  }

  const summary = compliance.summary || {};

  return (
    <ModulePage
      title="Doctor Details"
      description="Profile, compliance checklist, questionnaire progress, agreement and approvals."
      actions={
        <>
          {canManage ? (
            <button type="button" className="btn-secondary" title="Edit Doctor" onClick={() => setEditOpen(true)}>
              Edit
            </button>
          ) : null}
          {canAssignForm ? (
            <button type="button" className="btn-primary" onClick={() => setAssignOpen(true)}>
              Assign Form
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className="doc-btn-danger" title="Delete Doctor" onClick={() => setDeleteOpen(true)}>
              Delete
            </button>
          ) : null}
        </>
      }
    >

      <button type="button" className="doc-back" onClick={() => navigate("/app/doctors")}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5m7-7-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to directory
      </button>

      {/* --- top section --- */}
      <header className="doc-card doc-hero">
        <div className="doc-avatar" aria-hidden="true">
          {initials(doctor.name) || "?"}
        </div>
        <div className="doc-hero-main">
          <h2 className="doc-hero-name">Dr. {doctor.name}</h2>
          <p className="doc-hero-meta">
            {doctor.specialization || "Specialization not set"}
            {doctor.yearsOfExperience !== null && doctor.yearsOfExperience !== undefined
              ? ` · ${doctor.yearsOfExperience} yrs experience`
              : ""}
            {doctor.clinicHospitalName ? ` · ${doctor.clinicHospitalName}` : ""}
          </p>
          <span className="doc-id-chip">Doctor ID: {doctor.doctorCode}</span>
        </div>
        <div className="doc-hero-side">
          <span className={`dash-status dash-status--${String(doctor.status).toLowerCase()}`}>{doctor.status}</span>
          {doctor.draft ? <span className="doc-cell-sub">Draft profile — finish it with Edit Doctor</span> : null}
        </div>
      </header>

      <div className="doc-grid">
        {/* --- personal details --- */}
        <section className="doc-card doc-card--personal">
          <h3 className="doc-card-title">Personal Details</h3>
          <p className="doc-card-sub">Identity and contact information on file.</p>
          <dl className="doc-dl">
            <DetailRow label="Age" value={doctor.age !== null && doctor.age !== undefined ? `${doctor.age} yrs` : null} />
            <DetailRow label="Gender" value={doctor.gender} />
            <DetailRow label="Date of Birth" value={fmtDate(doctor.dateOfBirth)} />
            <DetailRow label="Phone Number" value={doctor.phone} />
            <DetailRow label="Email" value={doctor.email} />
            <DetailRow label="PAN" value={doctor.pan} />
            <DetailRow label="Aadhaar" value={doctor.aadhaar} />
            <DetailRow label="Medical Reg. No." value={doctor.medicalRegistrationNumber} />
            <DetailRow label="Qualification" value={doctor.qualification} />
            <DetailRow label="Clinic / Hospital" value={doctor.clinicHospitalName} />
            <DetailRow label="Address" value={doctor.address} />
            <DetailRow label="Added by" value={doctor.createdByLabel} />
            <DetailRow label="Last updated" value={fmtDateTime(doctor.updatedAt)} />
          </dl>
        </section>

        {/* --- compliance forms: one card per assigned form --- */}
        <div className="doc-forms-head">
          <h3 className="doc-card-title">Compliance Forms</h3>
          <p className="doc-card-sub" style={{ marginBottom: 0 }}>
            {summary.total
              ? `${summary.completed} of ${summary.total} required activities completed${
                  summary.actionRequired ? ` · ${summary.actionRequired} need attention` : ""
                }`
              : "Each form assigned to this doctor gets its own card."}
          </p>
        </div>

        {compliance.forms.length ? (
          <div className="doc-form-cards">
            {compliance.forms.map((form) => (
              <section className="doc-card doc-form-card" key={form.dispatchId}>
                <div className="doc-form-head">
                  <div className="doc-form-title-wrap">
                    <h3 className="doc-card-title">{form.name}</h3>
                    <p className="doc-form-meta">
                      {form.moduleType} · assigned {fmtDate(form.assignedAt)}
                      {form.dueDate ? ` · due ${fmtDate(form.dueDate)}` : ""}
                      {form.revision > 1 ? ` · revision ${form.revision}` : ""}
                    </p>
                  </div>
                  <Badge item={form.status} />
                </div>

                <dl className="doc-dl">
                  <DetailRow label="Managed by" value={form.handlerName} />
                  {form.templateName ? (
                    <DetailRow label="Template" value={form.templateName} />
                  ) : null}
                  <DetailRow
                    label="Submitted by doctor"
                    value={form.submittedAt ? fmtDateTime(form.submittedAt) : "Not submitted yet"}
                  />
                  <DetailRow label="Approval level" value={approvalLevelLabel(form)} />
                  <DetailRow
                    label="Progress"
                    value={form.progress?.total ? `${form.progress.answered} of ${form.progress.total}` : null}
                  />
                </dl>
                <Progress progress={form.progress} />

                {form.approvals?.chainLength ? (
                  <ol className="doc-chain">
                    {form.approvals.steps.map((step) => (
                      <li
                        key={step.index}
                        className={`doc-chain-step${step.key === "PENDING" ? " doc-chain-step--active" : ""}`}
                      >
                        <div className="doc-chain-step-main">
                          <div className="doc-chain-role">{step.role}</div>
                          <div className="doc-chain-name">{step.approverName || "—"}</div>
                        </div>
                        <Badge item={step} />
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="doc-form-note">
                    No approval chain — the form completes on its own once the doctor submits it.
                  </p>
                )}

                {form.rejection ? (
                  <div className="doc-form-banner">
                    <strong>Correction requested:</strong> {form.rejection.reason || "—"}
                  </div>
                ) : null}

                <div className="doc-actions doc-form-actions">
                  {isAdmin ? (
                    <button
                      type="button"
                      className="doc-mini-btn doc-mini-btn--danger"
                      onClick={() => deleteWorkflow(form)}
                      disabled={deletingDispatchId === form.dispatchId}
                    >
                      {deletingDispatchId === form.dispatchId ? "Deleting…" : "Delete workflow"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="doc-mini-btn doc-mini-btn--primary"
                      onClick={() => setTemplateForm(form)}
                    >
                      Open template
                    </button>
                  )}
                  {form.publicPath && (form.status?.key === "PENDING_SUBMISSION" || !form.submittedAt) ? (
                    <>
                      <button
                        type="button"
                        className="doc-mini-btn"
                        onClick={() => copyPath(form.publicPath)}
                      >
                        Copy link
                      </button>
                      <button
                        type="button"
                        className="doc-mini-btn"
                        onClick={() => openPublic(form.publicPath)}
                      >
                        Open form
                      </button>
                    </>
                  ) : null}
                  {form.status?.key !== "PENDING_SUBMISSION" || form.submissionReceived ? (
                    <button
                      type="button"
                      className="doc-mini-btn"
                      onClick={() => regenerateLink(form)}
                      disabled={regeneratingId === form.dispatchId}
                      title="Issue a fresh link and restart this workflow for another submission"
                    >
                      {regeneratingId === form.dispatchId ? "Regenerating…" : "Regenerate link"}
                    </button>
                  ) : null}
                  {form.pdfPath && form.status?.key !== "PENDING_SUBMISSION" ? (
                    <button
                      type="button"
                      className="doc-mini-btn"
                      onClick={() => openPublic(form.pdfPath)}
                    >
                      View document
                    </button>
                  ) : null}
                  {form.canApprove ? (
                    <>
                      <button
                        type="button"
                        className="doc-mini-btn doc-mini-btn--approve"
                        onClick={() => actOnDispatch(form.dispatchId, "APPROVE")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="doc-mini-btn doc-mini-btn--reject"
                        onClick={() => actOnDispatch(form.dispatchId, "REJECT")}
                      >
                        Send back
                      </button>
                    </>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="doc-card doc-grid-wide">
            <div className="doc-empty">
              No compliance forms assigned.
              {isAdmin ? " Use Assign Form to send one to this doctor." : ""}
            </div>
          </section>
        )}
      </div>

      {editOpen ? (
        <DoctorFormModal
          key={doctor._id}
          doctor={doctor}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setEditOpen(false);
            setDoctor((prev) => ({ ...prev, ...updated }));
            load(true);
          }}
        />
      ) : null}

      {assignOpen ? (
        <AssignFormModal
          doctorId={doctorId}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => load(true)}
          selfHandlerId={isAdmin ? "" : selfId}
          selfHandlerName={isAdmin ? "" : user?.name || user?.email || ""}
        />
      ) : null}

      {deleteOpen ? (
        <DeleteDoctorModal
          key={doctor._id}
          doctor={doctor}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => navigate("/app/doctors")}
        />
      ) : null}

      {templateForm ? (
        <TemplateModal
          form={templateForm}
          onClose={() => setTemplateForm(null)}
          onCopyLink={() => copyPath(templateForm.publicPath)}
        />
      ) : null}
    </ModulePage>
  );
}

/** Read-only preview of the form the doctor fills in. */
function TemplateModal({ form, onClose, onCopyLink }) {
  const template = form.template || { name: form.name, description: null, fields: [] };
  const fields = template.fields || [];
  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <div className="modal-card doc-modal-card" role="dialog" aria-modal="true" aria-label={`${template.name} template`}>
        <h3>{template.name}</h3>
        <p className="doc-hint">
          Form template · {form.moduleType || "FORM"}
          {form.revision > 1 ? ` · revision ${form.revision}` : ""}
        </p>

        {template.description ? <p className="doc-form-note">{template.description}</p> : null}

        {fields.length ? (
          <ul className="doc-field-list">
            {fields.map((field) => (
              <li key={field.key}>
                <span className="doc-field-label">
                  {field.label}
                  {field.required ? " *" : ""}
                </span>
                <span className="doc-field-type">{field.type}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="doc-form-note">No field list is stored for this form.</p>
        )}

        <div className="doc-modal-actions">
          {form.publicPath ? (
            <button type="button" className="btn-secondary" onClick={onCopyLink}>
              Copy link
            </button>
          ) : null}
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignFormModal({ doctorId, onClose, onAssigned, selfHandlerId = "", selfHandlerName = "" }) {
  const { showToast } = useToast();
  // Self-assign mode (employees): no employee picker — the logged-in employee
  // is fixed as the sharing employee and the chain preview uses their line alone.
  const isSelfMode = Boolean(selfHandlerId);
  const [modules, setModules] = useState([]);
  const [handlers, setHandlers] = useState([]);
  const [moduleId, setModuleId] = useState("");
  const [handlerUserId, setHandlerUserId] = useState(selfHandlerId);
  const [dueDate, setDueDate] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState("");
  const [assigned, setAssigned] = useState(null);
  const [assignedChain, setAssignedChain] = useState(null);
  // Approval chain for the picked employee: the dialog shows it both ways —
  // top → employee and employee → top — and the picker picks which order the
  // form follows. Each entry carries name, EMP ID and designation.
  const [chainPreview, setChainPreview] = useState(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [approvalChainOrder, setApprovalChainOrder] = useState("EMP_TO_TOP");
  const instructionsRef = useRef(null);

  // Personalization tags drop into the instructions at the cursor.
  const insertInstructionTag = (tag) => {
    const area = instructionsRef.current;
    const current = instructions || "";
    if (!area) {
      setInstructions(`${current}${tag}`);
      return;
    }
    const start = area.selectionStart ?? current.length;
    const end = area.selectionEnd ?? current.length;
    setInstructions(`${current.slice(0, start)}${tag}${current.slice(end)}`);
    requestAnimationFrame(() => {
      area.focus();
      const pos = start + tag.length;
      try {
        area.setSelectionRange(pos, pos);
      } catch {
        /* ignore */
      }
    });
  };

  // Whenever the employee changes, load their reporting line in both
  // directions so the picker can see — and pick — the approval chain.
  const loadChainFor = (employeeId) => {
    setChainPreview(null);
    if (!employeeId) {
      setChainLoading(false);
      return;
    }
    setChainLoading(true);
    api
      .get(`/kyc/approval-chain-preview/${employeeId}`)
      .then((res) => setChainPreview(res.data || null))
      .catch(() => setChainPreview(null))
      .finally(() => setChainLoading(false));
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [mods, staff] = await Promise.all([
          api.get("/kyc/schema-modules"),
          // The employee picker is admin-only; self-assign mode skips it and
          // loads the approval chain for the logged-in employee instead.
          isSelfMode ? Promise.resolve({ data: [] }) : api.get("/doctors/handler-options"),
        ]);
        if (!active) return;
        setModules(mods.data || []);
        setHandlers(staff.data || []);
        if (isSelfMode && selfHandlerId) loadChainFor(selfHandlerId);
      } catch (err) {
        if (active) setBanner(getErrorMessage(err));
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyLink = async (path) => {
    try {
      await navigator.clipboard.writeText(appUrl(path));
      showToast("Link copied — send it to the doctor on any channel you prefer.", "success");
    } catch {
      showToast("Could not copy automatically. Select the link and copy it.", "error");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!moduleId) {
      setBanner("Choose a form to assign.");
      return;
    }
    if (!handlerUserId) {
      setBanner("Choose the employee who will share the link with the doctor.");
      return;
    }
    setSaving(true);
    setBanner("");
    try {
      // The picked direction becomes the dispatch's approval chain. Without a
      // loaded preview the backend falls back to the reporting line.
      const picked =
        approvalChainOrder === "TOP_TO_EMP" ? chainPreview?.reversedChain : chainPreview?.chain;
      const approvalChainUserIds = (picked || []).map((u) => String(u._id)).filter(Boolean);
      const res = await api.post(`/doctors/${doctorId}/compliance`, {
        moduleId,
        handlerUserId,
        instructions: instructions.trim(),
        ...(dueDate ? { dueDate } : {}),
        ...(approvalChainUserIds.length ? { approvalChainUserIds } : {}),
      });
      setAssigned(res.data);
      setAssignedChain(approvalChainUserIds.length ? (picked || []) : null);
      onAssigned();
    } catch (err) {
      setBanner(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (assigned) {
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="modal-card doc-modal-card--small" role="dialog" aria-modal="true">
          <h3>Form assigned — share the link</h3>
          <p className="doc-hint">
            No email was sent anywhere. Copy the link below and send it to the doctor on whichever
            channel you prefer — <strong>{assigned.handlerName}</strong> is recorded as the managing
            employee for this form.
          </p>
          {assignedChain?.length ? (
            <p className="doc-hint">
              <strong>Approval chain:</strong>{" "}
              {assignedChain.map((u) => u.name || u.empCode || u.email).join(" → ")}
            </p>
          ) : null}
          {assigned.warnings?.length ? (
            <p className="doc-form-note">
              Note: {assigned.warnings.join(" ")}
            </p>
          ) : null}
          <label className="stacked-label">
            <span>Form link</span>
            <input readOnly value={appUrl(assigned.publicPath)} onFocus={(event) => event.target.select()} />
          </label>
          <div className="doc-modal-actions">
            <button type="button" className="btn-secondary" onClick={() => copyLink(assigned.publicPath)}>
              Copy link
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
      role="presentation"
    >
      <div className="modal-card doc-modal-card" role="dialog" aria-modal="true">
        <h3>Assign compliance form</h3>
        <p className="doc-hint">
          {isSelfMode
            ? "You are assigning this form as yourself: copy the link afterwards and pass it to the doctor on any channel. You are recorded as the manager of this form."
            : "Forms are built by admins in Forms. Assigning one here sends no email: copy the link afterwards and pass it to the doctor on any channel. The employee you pick is recorded as the manager of this form."}
        </p>

        {banner ? <div className="doc-form-banner">{banner}</div> : null}

        <form onSubmit={submit}>
          <label className="stacked-label">
            <span>Form *</span>
            <select value={moduleId} onChange={(event) => setModuleId(event.target.value)}>
              <option value="">Select a form</option>
              {modules.map((mod) => (
                <option key={mod._id} value={mod._id}>
                  {mod.name}
                </option>
              ))}
            </select>
          </label>

          {isSelfMode ? (
            <p className="doc-form-note">
              Sharing employee: <strong>{selfHandlerName || "You"}</strong> — the approval chain
              below uses your reporting line alone.
            </p>
          ) : (
            <label className="stacked-label">
              <span>Employee who shares the link *</span>
              <select
                value={handlerUserId}
                onChange={(event) => {
                  setHandlerUserId(event.target.value);
                  loadChainFor(event.target.value);
                }}
              >
                <option value="">Select an employee</option>
                {handlers.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.name}
                    {emp.empCode ? ` · ${emp.empCode}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {handlerUserId ? (
            <ApprovalChainPicker
              chainPreview={chainPreview}
              chainLoading={chainLoading}
              value={approvalChainOrder}
              onChange={setApprovalChainOrder}
            />
          ) : null}

          <label className="stacked-label">
            <span>Due date</span>
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </label>

          <label className="stacked-label">
            <span>Instructions</span>
            <textarea
              ref={instructionsRef}
              rows={3}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Optional note the employee passes on to the doctor"
            />
            <PlaceholderChips onInsert={insertInstructionTag} disabled={saving} />
          </label>

          <div className="doc-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Assigning…" : "Assign Form"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DoctorDetailsPage;
