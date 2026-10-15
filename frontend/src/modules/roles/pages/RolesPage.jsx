import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

function isSyntheticInviteEmail(addr) {
  const a = String(addr || "").toLowerCase();
  return (
    a.endsWith("@org-sheet.pink") || a.endsWith("@import.local") || a.endsWith("@tenant.pink.local")
  );
}

/** Prefer official / workbook email for the same ordering as server-side invites. */
function inviteTargetFromUser(u) {
  const o = (u.orgContactEmail || "").trim().toLowerCase();
  const e = (u.email || "").trim().toLowerCase();
  if (o && !isSyntheticInviteEmail(o)) return o;
  if (e && !isSyntheticInviteEmail(e)) return e;
  return o || e || "";
}

function buildChipsFromUsers(users) {
  const out = [];
  const seen = new Set();
  for (const u of users) {
    const email = inviteTargetFromUser(u);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({
      key: String(u._id),
      email,
      name: (u.name && String(u.name).trim()) || "Team member",
    });
  }
  return out;
}

function RolesPage() {
  const { showToast } = useToast();
  const { tenantContextId, isSuperAdmin } = useAuth();
  const isHome = !!isSuperAdmin && !tenantContextId;
  const [items, setItems] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [form, setForm] = useState({ name: "" });
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("New team member");
  const [inviteEmailChips, setInviteEmailChips] = useState([]);
  const [inviteListLoading, setInviteListLoading] = useState(false);
  const [inviteManualInput, setInviteManualInput] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const sortedPermissions = useMemo(
    () => [...permissions].sort((a, b) => String(a.code).localeCompare(String(b.code))),
    [permissions],
  );

  const load = useCallback(async () => {
    try {
      const [rolesRes, permsRes] = await Promise.all([api.get("/roles"), api.get("/permissions")]);
      setItems(rolesRes.data || []);
      setPermissions(permsRes.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [showToast]);

  // The org tree derives each role's level, scope and employee count from the
  // role engine. Recompute it after any role change so Org Explore shows the
  // new data immediately instead of waiting for a manual "Re-detect".
  const recomputeOrgRoles = useCallback(async () => {
    try {
      await api.post("/org/roles/auto-detect");
    } catch {
      // best-effort: the role change itself already succeeded
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, tenantContextId]);

  useEffect(() => {
    let lastRun = 0;
    const run = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastRun < 1500) return;
      lastRun = now;
      load();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [load]);

  useEffect(() => {
    setForm({ name: "" });
    setEditingRoleId(null);
  }, [tenantContextId]);

  useEffect(() => {
    if (!inviteOpen || selectedRoleIds.length !== 1) return undefined;
    const roleId = selectedRoleIds[0];
    let cancelled = false;
    (async () => {
      setInviteListLoading(true);
      setInviteEmailChips([]);
      try {
        const res = await api.get("/users", { params: { roleId } });
        const users = Array.isArray(res.data) ? res.data : [];
        if (!cancelled) {
          setInviteEmailChips(buildChipsFromUsers(users));
        }
      } catch (error) {
        if (!cancelled) {
          showToast(getErrorMessage(error), "error");
        }
      } finally {
        if (!cancelled) setInviteListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteOpen, selectedRoleIds, tenantContextId, showToast]);

  const startEdit = (row) => {
    if (row.type === "SYSTEM") return;
    setEditingRoleId(row._id);
    setForm({ name: row.name || "" });
  };

  const cancelEdit = () => {
    setEditingRoleId(null);
    setForm({ name: "" });
  };

  const toggleRoleSelection = (roleId) => {
    const id = String(roleId);
    setSelectedRoleIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectableRoleIds = useMemo(
    () => items.filter((row) => row.type !== "SYSTEM").map((row) => String(row._id)),
    [items],
  );
  const allSelected =
    selectableRoleIds.length > 0 && selectableRoleIds.every((roleId) => selectedRoleIds.includes(roleId));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedRoleIds([]);
      return;
    }
    setSelectedRoleIds(selectableRoleIds);
  };

  const parseInviteEmails = (text) => {
    const lines = String(text || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return [...new Set(lines)];
  };

  const closeInviteModal = () => {
    if (inviteSubmitting) return;
    setInviteOpen(false);
    setInviteEmailChips([]);
    setInviteManualInput("");
  };

  const removeInviteChip = (key) => {
    setInviteEmailChips((prev) => prev.filter((c) => c.key !== key));
  };

  const addManualInviteEmails = () => {
    const parsed = parseInviteEmails(inviteManualInput);
    if (!parsed.length) {
      showToast("Enter at least one email to add.", "error");
      return;
    }
    const display = inviteName.trim() || "New team member";
    setInviteEmailChips((prev) => {
      const seen = new Set(prev.map((c) => c.email));
      const next = [...prev];
      for (const email of parsed) {
        if (seen.has(email)) continue;
        seen.add(email);
        next.push({
          key: `manual:${email}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          email,
          name: display,
        });
      }
      return next;
    });
    setInviteManualInput("");
  };

  const sendInvitesForRole = async () => {
    if (selectedRoleIds.length !== 1) {
      showToast("Select exactly one role to attach to invitations.", "error");
      return;
    }
    if (!inviteEmailChips.length) {
      showToast("No recipients — wait for the list to load or add emails below.", "error");
      return;
    }
    const roleId = selectedRoleIds[0];
    setInviteSubmitting(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const chip of inviteEmailChips) {
        try {
          await api.post("/users/invite", {
            name: chip.name,
            email: chip.email,
            roleIds: [roleId],
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      showToast(`Invites sent: ${ok} ok, ${fail} failed.`, fail ? "error" : "success");
      if (ok) {
        closeInviteModal();
      }
    } finally {
      setInviteSubmitting(false);
    }
  };

  const inviteRoleLabel = useMemo(() => {
    if (selectedRoleIds.length !== 1) return "";
    const id = selectedRoleIds[0];
    const row = items.find((r) => String(r._id) === id);
    return row?.name || "";
  }, [items, selectedRoleIds]);

  const deleteSelected = async () => {
    if (!selectedRoleIds.length) {
      showToast("Select roles to delete.", "error");
      return;
    }
    if (!window.confirm(`Delete ${selectedRoleIds.length} selected role(s)?`)) return;
    try {
      await api.delete("/roles", { data: { roleIds: selectedRoleIds } });
      showToast("Selected roles deleted", "success");
      setSelectedRoleIds([]);
      await recomputeOrgRoles();
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const submitRole = async (event) => {
    event.preventDefault();
    const allCodes = sortedPermissions.map((p) => p.code);
    try {
      if (editingRoleId) {
        await api.patch(`/roles/${editingRoleId}`, { name: form.name, permissionCodes: allCodes });
        showToast("Role updated", "success");
        cancelEdit();
      } else {
        await api.post("/roles", { name: form.name, permissionCodes: allCodes });
        setForm({ name: "" });
        showToast("Role created", "success");
      }
      await recomputeOrgRoles();
      load();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return (
    <ModulePage
      title="Roles"
      description="Manage seats and org levels. Access control is disabled — every signed-in user has all permissions, so permission selection is not required. Use Org Explore for the org directory, workbook import, and seat roles."
    >
      {isHome ? (
        <p className="notifications-empty">
          Home shows every tenant at once — pick a tenant in the switcher above to manage its roles.
        </p>
      ) : (
      <>
      <form className="stacked-form" onSubmit={submitRole}>
        <div className="inline-form">
          {editingRoleId ? <span className="small-note form-editing-hint">Editing role</span> : null}
          <input
            placeholder="Role name (e.g. Payroll Approver)"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
          <button className="btn-primary" type="submit">
            {editingRoleId ? "Save changes" : "Create role"}
          </button>
          {editingRoleId ? (
            <button className="btn-secondary" type="button" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
        </div>
      </form>
      <h3>Existing roles</h3>
      <div className="inline-form">
        <button type="button" className="btn-secondary" onClick={toggleSelectAll}>
          {allSelected ? "Clear all" : "Select all"}
        </button>
        <button type="button" className="btn-secondary" onClick={deleteSelected}>
          Delete selected ({selectedRoleIds.length})
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setInviteOpen(true)}
          disabled={selectedRoleIds.length !== 1}
          title={selectedRoleIds.length !== 1 ? "Select exactly one role for the invite" : "Send employee invites"}
        >
          Invite by selected role
        </button>
      </div>
      {inviteOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!inviteSubmitting) closeInviteModal();
          }}
        >
          <div
            className="modal-card invite-modal-card"
            role="dialog"
            aria-labelledby="invite-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="invite-modal-title">Invite employees</h3>
            <p className="small-note">
              <strong>{inviteRoleLabel || "Selected role"}</strong> — addresses load from people who already have this
              seat role (Org Explore / workbook). Official email is preferred when stored. Remove anyone with{" "}
              <strong>×</strong> before sending. Add extra addresses below if needed. Each person gets an OTP, then an
              invitation code to set their password.
            </p>
            <label className="stacked-label">
              Default display name (for manually added emails only)
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="New team member" />
            </label>
            <div className="stacked-label" style={{ marginBottom: 0 }}>
              <span>Recipients ({inviteEmailChips.length})</span>
              {inviteListLoading ? (
                <p className="small-note" style={{ margin: "6px 0 0" }}>
                  Loading people in this role…
                </p>
              ) : inviteEmailChips.length === 0 ? (
                <p className="small-note" style={{ margin: "6px 0 0" }}>
                  No addresses found. Import the org workbook or add emails below.
                </p>
              ) : (
                <div className="invite-email-chips" aria-label="Invite recipients">
                  {inviteEmailChips.map((c) => (
                    <div key={c.key} className="invite-email-chip" title={`${c.name} · ${c.email}`}>
                      <span>{c.email}</span>
                      <button
                        type="button"
                        className="invite-email-chip-remove"
                        disabled={inviteSubmitting}
                        aria-label={`Remove ${c.email}`}
                        onClick={() => removeInviteChip(c.key)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <label className="stacked-label">
              Add more emails (optional, comma or newline separated)
              <div className="inline-form" style={{ gap: "8px", alignItems: "stretch" }}>
                <input
                  type="text"
                  value={inviteManualInput}
                  onChange={(e) => setInviteManualInput(e.target.value)}
                  placeholder="colleague@company.com"
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addManualInviteEmails();
                    }
                  }}
                />
                <button type="button" className="btn-secondary" disabled={inviteSubmitting} onClick={addManualInviteEmails}>
                  Add
                </button>
              </div>
            </label>
            <div className="inline-form" style={{ justifyContent: "flex-end", gap: "0.5rem" }}>
              <button type="button" className="btn-secondary" disabled={inviteSubmitting} onClick={closeInviteModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={inviteSubmitting || inviteEmailChips.length === 0}
                onClick={sendInvitesForRole}
              >
                {inviteSubmitting ? "Sending…" : "Send invites"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <DataTable
        columns={[
          {
            key: "select",
            label: (
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all roles" />
            ),
            render: (row) =>
              row.type === "SYSTEM" ? (
                "—"
              ) : (
                <input
                  type="checkbox"
                  checked={selectedRoleIds.includes(String(row._id))}
                  onChange={() => toggleRoleSelection(row._id)}
                  aria-label={`Select ${row.name}`}
                />
              ),
          },
          { key: "name", label: "Name" },
          {
            key: "orgLevel",
            label: "Org level",
            render: (row) => {
              const a = row.auto?.level;
              const o = row.override?.level;
              const eff = o != null ? o : a != null ? a : 1;
              return o != null ? `${eff} (override)` : eff;
            },
          },
          {
            key: "orgScope",
            label: "Scope",
            render: (row) => {
              const a = row.auto?.scope;
              const o = row.override?.scope;
              const eff = o || a || "HQ";
              return o ? `${eff} (override)` : eff;
            },
          },
          { key: "employeeCount", label: "People" },
          { key: "_id", label: "Role ID" },
          {
            key: "actions",
            label: "",
            render: (row) =>
              row.type === "SYSTEM" ? (
                <span className="small-note">—</span>
              ) : (
                <span className="table-row-actions">
                  <button className="btn-secondary" type="button" onClick={() => startEdit(row)}>
                    Edit
                  </button>
                </span>
              ),
          },
        ]}
        rows={items}
      />
      </>
      )}
    </ModulePage>
  );
}

export default RolesPage;
