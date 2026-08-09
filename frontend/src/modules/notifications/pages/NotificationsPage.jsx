import { useCallback, useEffect, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import DataTable from "../../../components/common/DataTable";
import TenantScopeBanner from "../../../components/common/TenantScopeBanner";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

function NotificationsPage() {
  const { showToast } = useToast();
  const { tenantContextId, permissionCodes = [] } = useAuth();
  const isTenantAdmin = permissionCodes.includes("tenant.manage");
  const canCompose =
    isTenantAdmin ||
    permissionCodes.includes("notification.compose") ||
    permissionCodes.includes("report.view");
  const [items, setItems] = useState([]);
  const [composeUsers, setComposeUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({
    channel: "IN_APP",
    message: "",
    subject: "",
  });

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get("/notifications");
      setItems(res.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [showToast]);

  const loadComposeTargets = useCallback(async () => {
    try {
      const path = isTenantAdmin ? "/notifications/recipients/all" : "/notifications/recipients/elevated";
      const res = await api.get(path);
      setComposeUsers(res.data?.users || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
      setComposeUsers([]);
    }
  }, [showToast, isTenantAdmin]);

  useEffect(() => {
    let active = true;
    api
      .get("/notifications")
      .then((notifRes) => {
        if (active) setItems(notifRes.data || []);
      })
      .catch((error) => {
        if (active) showToast(getErrorMessage(error), "error");
      });
    return () => {
      active = false;
    };
  }, [showToast, tenantContextId]);

  useEffect(() => {
    if (!canCompose) {
      setComposeUsers([]);
      setSelectedIds([]);
      return undefined;
    }
    let active = true;
    const path = isTenantAdmin ? "/notifications/recipients/all" : "/notifications/recipients/elevated";
    api
      .get(path)
      .then((recipRes) => {
        if (!active) return;
        setComposeUsers(recipRes.data?.users || []);
        setSelectedIds([]);
      })
      .catch((error) => {
        if (active) {
          showToast(getErrorMessage(error), "error");
          setComposeUsers([]);
        }
      });
    return () => {
      active = false;
    };
  }, [showToast, tenantContextId, isTenantAdmin, canCompose]);

  const toggleRecipient = (id) => {
    const s = String(id);
    setSelectedIds((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const create = async (event) => {
    event.preventDefault();
    if (!selectedIds.length) {
      showToast("Select at least one recipient.", "error");
      return;
    }
    try {
      await api.post("/notifications", {
        channel: form.channel,
        message: form.message,
        eventType: "MANUAL",
        subject: form.subject,
        recipientUserIds: selectedIds,
      });
      showToast("Notification sent", "success");
      setForm({ channel: "IN_APP", message: "", subject: "" });
      setSelectedIds([]);
      loadNotifications();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  return (
    <ModulePage
      title="Notifications"
      description={
        isTenantAdmin
          ? "As a tenant administrator you can message any active employee. Others may only message leadership (top org levels) and tenant administrators."
          : "You can send messages only to leadership (top hierarchy levels) and tenant administrators. Incoming messages appear below."
      }
    >
      <TenantScopeBanner context="Notifications" />
      {canCompose ? (
      <form className="stacked-form notifications-compose" onSubmit={create}>
        <h3 className="notifications-compose__title">New message</h3>
        <p className="small-note">
          Recipients ({composeUsers.length} available):
          {isTenantAdmin ? " all active employees in this tenant." : " high-level positions and admins only."}
        </p>
        <div className="notifications-recipient-picker">
          {composeUsers.length === 0 ? (
            <p className="hint">No recipients loaded. Check positions and roles (tenant.manage for admins).</p>
          ) : (
            composeUsers.map((u) => (
              <label key={u._id} className="notifications-recipient-option">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(String(u._id))}
                  onChange={() => toggleRecipient(u._id)}
                />
                <span>
                  {u.name}{" "}
                  <span className="notifications-recipient-email">
                    &lt;{u.email}&gt;
                    {u.status && u.status !== "ACTIVE" ? ` · ${u.status}` : ""}
                  </span>
                </span>
              </label>
            ))
          )}
        </div>
        <label htmlFor="notif-subject">Subject</label>
        <input
          id="notif-subject"
          value={form.subject}
          onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
          placeholder="Optional subject"
        />
        <label htmlFor="notif-channel">Channel</label>
        <select
          id="notif-channel"
          value={form.channel}
          onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}
        >
          <option value="IN_APP">In-app</option>
          <option value="EMAIL">Email</option>
        </select>
        <label htmlFor="notif-message">Message</label>
        <textarea
          id="notif-message"
          rows={4}
          value={form.message}
          onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
          required
          placeholder="Your message"
        />
        <div className="notifications-compose-actions">
          <button className="btn-primary" type="submit">
            Send to selected
          </button>
          <button type="button" className="btn-secondary" onClick={() => loadComposeTargets()}>
            Refresh recipient list
          </button>
        </div>
      </form>
      ) : (
        <p className="small-note">You can view your inbox below. Sending new messages requires notification permissions.</p>
      )}
      <h3 className="notifications-inbox-title">Inbox / activity</h3>
      <p className="small-note">
        {isTenantAdmin
          ? "Showing all notifications in this tenant."
          : "Showing threads where you are the sender or recipient."}
      </p>
      <DataTable
        columns={[
          { key: "createdAt", label: "When", render: (row) => (row.createdAt ? new Date(row.createdAt).toLocaleString() : "—") },
          {
            key: "from",
            label: "From",
            render: (row) => row.fromUserId?.email || row.fromUserId?.name || "—",
          },
          {
            key: "to",
            label: "To",
            render: (row) => row.recipientUserId?.email || row.recipientUserId?.name || "—",
          },
          { key: "subject", label: "Subject", render: (row) => row.subject || "—" },
          {
            key: "pdf",
            label: "Attachment",
            render: (row) => {
              const pdf = row.metadata?.pdfUrl ? (
                <a className="link" href={row.metadata.pdfUrl} target="_blank" rel="noreferrer">
                  PDF
                </a>
              ) : null;
              const form =
                row.metadata?.publicUrl || row.metadata?.publicPath ? (
                  <a
                    className="link"
                    href={
                      row.metadata.publicUrl ||
                      (typeof window !== "undefined" && row.metadata.publicPath
                        ? `${window.location.origin}${row.metadata.publicPath}`
                        : row.metadata.publicPath || "#")
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Form link
                  </a>
                ) : null;
              if (!pdf && !form) return "—";
              return (
                <span style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {pdf}
                  {form}
                </span>
              );
            },
          },
          { key: "message", label: "Message", render: (row) => (row.message?.length > 80 ? `${row.message.slice(0, 80)}…` : row.message) },
          { key: "channel", label: "Channel" },
          { key: "status", label: "Status" },
        ]}
        rows={items}
      />
    </ModulePage>
  );
}

export default NotificationsPage;
