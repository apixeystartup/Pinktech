import { useCallback, useEffect, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import TenantScopeBanner from "../../../components/common/TenantScopeBanner";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";
import { Link } from "react-router-dom";

function AssignmentsPage() {
  const { showToast } = useToast();
  const { tenantContextId } = useAuth();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState({ userId: "", positionId: "" });

  const loadAssignments = useCallback(async () => {
    try {
      const res = await api.get("/assignments");
      setItems(res.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [showToast]);

  const loadLookups = useCallback(async () => {
    try {
      const [uRes, pRes] = await Promise.all([api.get("/users"), api.get("/positions")]);
      setUsers(uRes.data || []);
      setPositions(pRes.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [showToast]);

  useEffect(() => {
    loadAssignments();
    loadLookups();
  }, [loadAssignments, loadLookups, tenantContextId]);

  useEffect(() => {
    setForm({ userId: "", positionId: "" });
  }, [tenantContextId]);

  const create = async (event) => {
    event.preventDefault();
    try {
      await api.post("/assignments", form);
      setForm({ userId: "", positionId: "" });
      showToast("Assignment created", "success");
      loadAssignments();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return (
    <ModulePage
      title="Assignments"
      description="Assign a person to a hierarchy seat using employee directory and positions for this tenant."
      actions={
        <Link to="/org-employees" className="small-note">
          Manage people & employee IDs
        </Link>
      }
    >
      <TenantScopeBanner context="Assignments" />
      <form className="inline-form" onSubmit={create}>
        <select
          value={form.userId}
          onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))}
          required
          aria-label="Employee"
        >
          <option value="">Select employee</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {(u.empCode || "No ID") + " — " + u.name + " (" + u.email + ")"}
            </option>
          ))}
        </select>
        <select
          value={form.positionId}
          onChange={(e) => setForm((p) => ({ ...p, positionId: e.target.value }))}
          required
          aria-label="Position"
        >
          <option value="">Select position</option>
          {positions.map((pos) => (
            <option key={pos._id} value={pos._id}>
              {pos.title} — {pos.levelName}
            </option>
          ))}
        </select>
        <button className="btn-primary" type="submit">
          Assign
        </button>
      </form>
      <DataTable
        columns={[
          { key: "_id", label: "ID", render: (row) => String(row._id) },
          {
            key: "userId",
            label: "Employee",
            render: (row) =>
              row.userId && typeof row.userId === "object"
                ? `${row.userId.empCode || "—"} — ${row.userId.name} (${row.userId.email})`
                : String(row.userId ?? ""),
          },
          {
            key: "positionId",
            label: "Position",
            render: (row) =>
              row.positionId && typeof row.positionId === "object"
                ? `${row.positionId.title} (${String(row.positionId._id)})`
                : String(row.positionId ?? ""),
          },
          { key: "status", label: "Status" },
          { key: "activeFrom", label: "Active From" },
        ]}
        rows={items}
      />
    </ModulePage>
  );
}

export default AssignmentsPage;
