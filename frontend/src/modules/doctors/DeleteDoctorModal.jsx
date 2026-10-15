import { useState } from "react";
import api from "../../lib/api";
import { getErrorMessage } from "../../lib/error";
import { useToast } from "../../components/common/ToastProvider";

/**
 * Confirmation dialog for deleting a doctor. Removing the profile also removes
 * its compliance dispatches and submitted responses (handled server-side), so
 * the copy below spells that out before the user commits.
 */
function DeleteDoctorModal({ doctor, onClose, onDeleted }) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState("");

  const confirmDelete = async () => {
    setSaving(true);
    setBanner("");
    try {
      await api.delete(`/doctors/${doctor._id}`);
      showToast("Doctor deleted.", "success");
      onDeleted();
    } catch (error) {
      setBanner(getErrorMessage(error));
      setSaving(false);
    }
  };

  const handleBackdrop = (event) => {
    if (event.target === event.currentTarget && !saving) onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdrop} role="presentation">
      <div className="modal-card doc-modal-card--small" role="dialog" aria-modal="true">
        <h3>Delete doctor?</h3>
        <p className="doc-hint">
          This permanently removes <strong>Dr. {doctor.name}</strong> ({doctor.doctorCode}) from the directory.
        </p>

        {banner ? <div className="doc-form-banner">{banner}</div> : null}

        <ul className="doc-delete-list">
          <li>Doctor profile and contact details</li>
          <li>Assigned compliance forms and their submitted responses</li>
          <li>KYC records linked to this doctor</li>
        </ul>

        <p className="doc-hint">
          Dashboard doctor counts update automatically. This action cannot be undone — to keep the record, use Edit
          Doctor and set the status to Inactive instead.
        </p>

        <div className="doc-modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="doc-btn-danger" onClick={confirmDelete} disabled={saving}>
            {saving ? "Deleting…" : "Delete Doctor"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeleteDoctorModal;
