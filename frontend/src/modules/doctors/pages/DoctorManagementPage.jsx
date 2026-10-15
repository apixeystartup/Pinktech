import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { useToast } from "../../../components/common/ToastProvider";
import { getErrorMessage } from "../../../lib/error";
import useAuth from "../../../hooks/useAuth";
import { isAdminRole } from "../../../lib/access-control";
import DoctorFormModal from "../DoctorFormModal";
import DeleteDoctorModal from "../DeleteDoctorModal";
import BulkAssignFormModal from "../BulkAssignFormModal";
import "../../../styles/doctors.css";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "DRAFT", label: "Draft" },
];

function DoctorCell({ row }) {
  const navigate = useNavigate();
  return (
    <div className="doc-cell">
      <button type="button" className="doc-linkish doc-cell-name" onClick={() => navigate(`/app/doctors/${row._id}`)}>
        {row.name}
      </button>
      <span className="doc-cell-sub">{row.doctorCode}</span>
    </div>
  );
}

function ComplianceCell({ row }) {
  const compliance = row.compliance || { completed: 0, total: 0, percent: 0 };
  if (!compliance.total) return <span className="doc-cell-sub">No forms assigned</span>;
  const complete = compliance.percent === 100;
  return (
    <div className="doc-progress" title={`${compliance.completed} of ${compliance.total} completed`}>
      <span className="doc-progress-track">
        <span
          className={`doc-progress-fill${complete ? " doc-progress-fill--complete" : ""}`}
          style={{ width: `${compliance.percent}%` }}
        />
      </span>
      <span className="doc-progress-text">
        {compliance.completed}/{compliance.total}
      </span>
    </div>
  );
}

function DoctorManagementPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user, permissionCodes = [], accountRole, isSuperAdmin } = useAuth();
  const canManage = permissionCodes.includes("*") || permissionCodes.includes("doctor.manage");
  const isAdmin = isAdminRole(accountRole, isSuperAdmin);
  const selfId = user?._id || user?.id || "";
  // Admins assign to any employee; employees may also assign, but only with
  // themselves as the sharing employee (enforced by the backend too).
  const canAssignForm = isAdmin || (accountRole === "employee" && Boolean(selfId));

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState({ open: false, doctor: null });
  const [deleting, setDeleting] = useState(null);
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);
  // Bulk-assign selection lives on the table (outside the form): tick the
  // doctors here, then Assign Form shows that exact list inside the dialog.
  const [selectedDoctorIds, setSelectedDoctorIds] = useState([]);

  const toggleDoctor = (id) => {
    setSelectedDoctorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleAllVisible = (ids) => {
    const allSelected = ids.length > 0 && ids.every((id) => selectedDoctorIds.includes(id));
    setSelectedDoctorIds((prev) =>
      allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])],
    );
  };

  const removeSelectedDoctor = (id) => {
    setSelectedDoctorIds((prev) => prev.filter((x) => x !== id));
  };

  const selectedDoctors = rows.filter((r) => selectedDoctorIds.includes(r._id));

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = {};
        if (query) params.q = query;
        if (status) params.status = status;
        const res = await api.get("/doctors", { params });
        setRows(res.data);
      } catch (error) {
        if (!silent) showToast(getErrorMessage(error), "error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [query, status, showToast],
  );

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep numbers fresh the same way the other module pages do.
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

  const columns = [
    ...(canAssignForm
      ? [
        {
          key: "select",
          label: (
            <input
              type="checkbox"
              checked={rows.length > 0 && rows.every((r) => selectedDoctorIds.includes(r._id))}
              onChange={() => toggleAllVisible(rows.map((r) => r._id))}
              aria-label="Select all doctors"
            />
          ),
          render: (row) => (
            <input
              type="checkbox"
              checked={selectedDoctorIds.includes(row._id)}
              onChange={() => toggleDoctor(row._id)}
              aria-label={`Select ${row.name}`}
            />
          ),
        },
      ]
      : []),
    {
      key: "name",
      label: "Doctor",
      render: (row) => <DoctorCell row={row} />,
    },
    {
      key: "specialization",
      label: "Specialization",
      render: (row) => row.specialization || <span className="doc-cell-sub">—</span>,
    },
    {
      key: "experience",
      label: "Experience",
      render: (row) => (row.yearsOfExperience === null || row.yearsOfExperience === undefined
        ? "—"
        : `${row.yearsOfExperience} yrs`),
    },
    {
      key: "contact",
      label: "Contact",
      render: (row) => (
        <div className="doc-cell">
          <span>{row.email || "—"}</span>
          <span className="doc-cell-sub">{row.phone || "No phone"}</span>
        </div>
      ),
    },
    {
      key: "clinic",
      label: "Clinic / Hospital",
      render: (row) => row.clinicHospitalName || <span className="doc-cell-sub">—</span>,
    },
    {
      key: "compliance",
      label: "Compliance",
      render: (row) => <ComplianceCell row={row} />,
    },
    {
      key: "status",
      label: "Status",
      render: (row) => (
        <span className={`dash-status dash-status--${String(row.status).toLowerCase()}`}>{row.status}</span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <div className="doc-row-actions">
          <button type="button" className="doc-action-btn doc-action-btn--icon doc-action-btn--view" onClick={() => navigate(`/app/doctors/${row._id}`)} title="View" aria-label={`View ${row.name}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
          {canManage ? (
            <>
              <button type="button" className="doc-action-btn doc-action-btn--icon" onClick={() => setModal({ open: true, doctor: row })} title="Edit" aria-label={`Edit ${row.name}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="doc-action-btn doc-action-btn--icon doc-action-btn--danger" onClick={() => setDeleting(row)} title="Delete" aria-label={`Delete ${row.name}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <ModulePage
      title="Doctor Management"
      description="Search the doctor directory, open a profile for full details, and keep compliance forms, agreements and approvals in sync."
    >

      <div className="doc-toolbar">
        <input
          className="dash-search"
          type="search"
          placeholder="Search name, email, phone, clinic…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search doctors"
        />
        <select className="dash-select" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="doc-toolbar-spacer" />
        <div className="doc-toolbar-actions">
          {canAssignForm ? (
            <button
              type="button"
              className="btn-primary"
              disabled={!selectedDoctorIds.length}
              title={selectedDoctorIds.length ? `Assign a form to ${selectedDoctorIds.length} selected doctor${selectedDoctorIds.length === 1 ? "" : "s"}` : "Tick doctors in the list first"}
              onClick={() => setBulkAssignOpen(true)}
            >
              Assign Form{selectedDoctorIds.length ? ` (${selectedDoctorIds.length})` : ""}
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className="btn-secondary" onClick={() => setModal({ open: true, doctor: null })}>
              Add Doctor
            </button>
          ) : null}
          <button
            type="button"
            className="btn-secondary btn-icon-only"
            title="Refresh"
            aria-label="Refresh doctors"
            onClick={() => load()}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        emptyText={
          loading
            ? "Loading doctors…"
            : query || status
              ? "No doctors match your search."
              : "No doctors yet — use Add Doctor to create the first profile."
        }
      />

      {modal.open ? (
        <DoctorFormModal
          key={modal.doctor?._id || "create"}
          doctor={modal.doctor}
          onClose={() => setModal({ open: false, doctor: null })}
          onSaved={() => {
            setModal({ open: false, doctor: null });
            load();
          }}
        />
      ) : null}

      {deleting ? (
        <DeleteDoctorModal
          key={deleting._id}
          doctor={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            load();
          }}
        />
      ) : null}

      {bulkAssignOpen ? (
        <BulkAssignFormModal
          onClose={() => setBulkAssignOpen(false)}
          onAssigned={() => load(true)}
          selfHandlerId={isAdmin ? "" : selfId}
          selfHandlerName={isAdmin ? "" : user?.name || user?.email || ""}
          selectedDoctors={selectedDoctors}
          onRemoveDoctor={removeSelectedDoctor}
        />
      ) : null}
    </ModulePage>
  );
}

export default DoctorManagementPage;
