import { useEffect, useState } from "react";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { useToast } from "../../../components/common/ToastProvider";

function EmployeeManagementPage() {
  const { showToast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [statusFilter, setStatusFilter] = useState("ALL");

  const load = async () => {
    try {
      const res = await api.get("/users?showAll=true");
      setEmployees((res.data || []).filter((e) => e.email !== "superadmin@example.com"));
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const filtered = statusFilter === "ALL"
    ? employees
    : employees.filter((e) => e.status === statusFilter);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((e) => e._id)));
    }
  };

  const sendCreds = async (userIds) => {
    if (!userIds.length) {
      showToast("No employees selected", "error");
      return;
    }
    try {
      let sent = 0;
      for (const id of userIds) {
        await api.post(`/users/${id}/send-creds`);
        sent++;
      }
      showToast(`Credentials sent to ${sent} employee(s)`, "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const resetCreds = async (userIds) => {
    if (!userIds.length) {
      showToast("No employees selected", "error");
      return;
    }
    try {
      let reset = 0;
      for (const id of userIds) {
        await api.post(`/users/${id}/reset-creds`);
        reset++;
      }
      showToast(`Credentials reset for ${reset} employee(s)`, "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const formatRoles = (roleIds) => {
    if (!roleIds || !roleIds.length) return "—";
    return roleIds.map((r) => r.name || r).join(", ");
  };

  return (
    <ModulePage title="Employee Management" description="Manage employees, send credentials, and reset passwords.">
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["ALL", "ACTIVE", "INVITED", "DISABLED"].map((s) => (
          <button
            key={s}
            className={statusFilter === s ? "btn-primary" : "btn-secondary"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="btn-secondary" onClick={load}>Refresh</button>
        <button className="btn-secondary" onClick={() => sendCreds([...selected])} disabled={selected.size === 0}>
          Send Creds ({selected.size})
        </button>
        <button className="btn-secondary" onClick={() => resetCreds([...selected])} disabled={selected.size === 0}>
          Reset Creds ({selected.size})
        </button>
      </div>

      <DataTable
        columns={[
          {
            key: "_select",
            label: (
              <input
                type="checkbox"
                checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
              />
            ),
            render: (row) => (
              <input
                type="checkbox"
                checked={selected.has(row._id)}
                onChange={() => toggleSelect(row._id)}
              />
            ),
          },
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "empCode", label: "Emp ID" },
          { key: "roles", label: "Roles", render: (row) => formatRoles(row.roleIds) },
          {
            key: "status",
            label: "Status",
            render: (row) => (
              <span style={{ color: row.status === "ACTIVE" ? "green" : row.status === "INVITED" ? "orange" : "gray" }}>
                {row.status}
              </span>
            ),
          },
        ]}
        rows={filtered}
      />
    </ModulePage>
  );
}

export default EmployeeManagementPage;
