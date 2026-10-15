import { useEffect, useRef, useState } from "react";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/error";
import ApprovalChainPicker from "./ApprovalChainPicker";
import PlaceholderChips from "../../components/schema-forms/PlaceholderChips";
import { appUrl } from "./doctorLinks";

/**
 * Assign ONE form to MULTIPLE doctors. Each selected doctor gets their own
 * dispatch (own token/link); placeholders in the agreement and instructions
 * resolve per doctor, so the same form personalizes for everyone.
 */
function BulkAssignFormModal({ onClose, onAssigned, selfHandlerId = "", selfHandlerName = "", selectedDoctors = [], onRemoveDoctor = () => {} }) {
  const isSelfMode = Boolean(selfHandlerId);
  const [modules, setModules] = useState([]);
  const [handlers, setHandlers] = useState([]);
  const [moduleId, setModuleId] = useState("");
  const [handlerUserId, setHandlerUserId] = useState(selfHandlerId);
  const [chainPreview, setChainPreview] = useState(null);
  const [chainLoading, setChainLoading] = useState(false);
  const [approvalChainOrder, setApprovalChainOrder] = useState("EMP_TO_TOP");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [banner, setBanner] = useState("");
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState("");
  const [results, setResults] = useState(null);
  const instructionsRef = useRef(null);

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
          // The employee picker is admin-only; self-assign mode fixes the
          // sharing employee to the logged-in user instead.
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

  const copyLink = async (link) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      /* clipboard unavailable — the link is still visible to copy manually */
    }
  };

  const copyAllLinks = async () => {
    const links = (results || []).filter((r) => r.link).map((r) => `${r.name}: ${r.link}`);
    if (!links.length) return;
    try {
      await navigator.clipboard.writeText(links.join("\n"));
    } catch {
      /* ignore */
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!moduleId) {
      setBanner("Choose a form to assign.");
      return;
    }
    if (!handlerUserId) {
      setBanner("Choose the employee who will share the links with the doctors.");
      return;
    }
    if (!selectedDoctors.length) {
      setBanner("No doctors selected — tick rows in the directory, then open this dialog.");
      return;
    }
    setSending(true);
    setBanner("");
    setResults(null);
    try {
      // One chain direction for the whole batch, from the sharing employee.
      const picked =
        approvalChainOrder === "TOP_TO_EMP" ? chainPreview?.reversedChain : chainPreview?.chain;
      const approvalChainUserIds = (picked || []).map((u) => String(u._id)).filter(Boolean);
      const out = [];
      for (const doc of selectedDoctors) {
        const id = doc._id;
        setProgress(`Assigning ${out.length + 1} of ${selectedDoctors.length} · ${doc.name || ""}`);
        try {
          const res = await api.post(`/doctors/${id}/compliance`, {
            moduleId,
            handlerUserId,
            instructions: instructions.trim(),
            ...(dueDate ? { dueDate } : {}),
            ...(approvalChainUserIds.length ? { approvalChainUserIds } : {}),
          });
          out.push({ doctorId: id, name: doc.name || String(id), link: appUrl(res.data.publicPath), warnings: res.data.warnings || [], error: "" });
        } catch (err) {
          out.push({ doctorId: id, name: doc.name || String(id), link: "", warnings: [], error: getErrorMessage(err) });
        }
      }
      setResults(out);
      onAssigned();
    } finally {
      setSending(false);
      setProgress("");
    }
  };

  if (results) {
    const okCount = results.filter((r) => r.link).length;
    return (
      <div className="modal-backdrop" role="presentation">
        <div className="modal-card doc-modal-card" role="dialog" aria-modal="true">
          <h3>
            Assigned to {okCount} of {results.length} doctor{results.length === 1 ? "" : "s"}
          </h3>
          <p className="doc-hint">
            Each doctor got their own link with their details filled in. No email was sent — copy
            the links and share them on whichever channel you prefer.
          </p>
          <ul className="doc-field-list">
            {results.map((r) => (
              <li key={String(r.doctorId)}>
                <span className="doc-field-label">{r.name}
                  {r.warnings?.length ? (
                    <>
                      <br />
                      <span className="doc-form-note">Note: {r.warnings.join(" ")}</span>
                    </>
                  ) : null}
                </span>
                {r.link ? (
                  <span className="doc-field-type">
                    <button type="button" className="doc-action-btn doc-action-btn--view" onClick={() => copyLink(r.link)}>
                      Copy link
                    </button>
                  </span>
                ) : (
                  <span className="doc-form-error">{r.error || "Failed"}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="doc-modal-actions">
            {okCount > 1 ? (
              <button type="button" className="btn-secondary" onClick={copyAllLinks}>
                Copy all links
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

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !sending) onClose();
      }}
      role="presentation"
    >
      <div className="modal-card doc-modal-card" role="dialog" aria-modal="true">
        <h3>Assign form to doctors</h3>
        <p className="doc-hint">
          {isSelfMode
            ? "You are assigning as yourself. Pick the doctors and the form — every doctor gets an individual link with their own details filled into the placeholders."
            : "Pick the doctors and the form — every doctor gets an individual link with their own details filled into the placeholders. No email is sent."}
        </p>

        {banner ? <div className="doc-form-banner">{banner}</div> : null}

        <form onSubmit={submit}>
          <div className="stacked-label">
            <span>Sending to ({selectedDoctors.length} doctor{selectedDoctors.length === 1 ? "" : "s"}) *</span>
          </div>
          {selectedDoctors.length ? (
            <ul className="doc-doctor-list doc-doctor-list--static">
              {selectedDoctors.map((d) => (
                <li key={d._id}>
                  <span className="doc-doctor-name">{d.name}</span>
                  <span className="doc-cell-sub">{d.doctorCode || d.email || ""}</span>
                  <button
                    type="button"
                    className="doc-action-btn doc-action-btn--danger"
                    onClick={() => onRemoveDoctor(d._id)}
                    disabled={sending}
                    aria-label={`Remove ${d.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="doc-form-note">No doctors selected — tick rows in the directory, then open this dialog.</p>
          )}

          <label className="stacked-label">
            <span>Form *</span>
            <select value={moduleId} onChange={(event) => setModuleId(event.target.value)} disabled={sending}>
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
              <span>Employee who shares the links *</span>
              <select
                value={handlerUserId}
                onChange={(event) => {
                  setHandlerUserId(event.target.value);
                  loadChainFor(event.target.value);
                }}
                disabled={sending}
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
              radioName="bulk-approval-chain-order"
            />
          ) : null}

          <label className="stacked-label">
            <span>Instructions</span>
            <textarea
              ref={instructionsRef}
              rows={3}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Optional note with {{doctor.name}} style placeholders"
              disabled={sending}
            />
            <PlaceholderChips onInsert={insertInstructionTag} disabled={sending} />
          </label>

          <label className="stacked-label">
            <span>Due date</span>
            <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} disabled={sending} />
          </label>

          {progress ? <p className="doc-form-note">{progress}…</p> : null}

          <div className="doc-modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={sending}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={sending}>
              {sending ? "Assigning…" : selectedDoctors.length ? `Assign to ${selectedDoctors.length} doctor${selectedDoctors.length === 1 ? "" : "s"}` : "Assign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BulkAssignFormModal;
