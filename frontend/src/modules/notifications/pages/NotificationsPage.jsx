import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

function initials(name = "") {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0]}${parts[1]?.[0] || ""}`.toUpperCase();
}

function timeAgo(date) {
  if (!date) return "";
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

function NotificationsPage() {
  const { showToast } = useToast();
  const { user, tenantContextId, permissionCodes = [], accountRole, isSuperAdmin } = useAuth();
  const isTenantAdmin =
    permissionCodes.includes("*") ||
    permissionCodes.includes("tenant.manage") ||
    accountRole === "tenant_admin" ||
    accountRole === "super_admin" ||
    isSuperAdmin;
  const canCompose =
    isTenantAdmin ||
    permissionCodes.includes("notification.compose") ||
    permissionCodes.includes("report.view");
  const [items, setItems] = useState([]);
  const [composeUsers, setComposeUsers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ message: "", subject: "" });
  const [recipientQuery, setRecipientQuery] = useState("");
  const [openRecipient, setOpenRecipient] = useState(false);
  const [activeTab, setActiveTab] = useState("inbox");
  const recipientWrapRef = useRef(null);
  const currentUserId = user?._id || user?.id;

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get("/notifications");
      setItems(res.data || []);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  }, [showToast]);


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
    const timer = setInterval(() => {
      api
        .get("/notifications")
        .then((notifRes) => {
          if (active) setItems(notifRes.data || []);
        })
        .catch(() => {});
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [showToast, tenantContextId]);

  useEffect(() => {
    if (!canCompose) {
      setComposeUsers([]);
      setSelectedIds([]);
      return undefined;
    }
    let active = true;
    const load = () => {
      const path = isTenantAdmin ? "/notifications/recipients/all" : "/notifications/recipients/elevated";
      api
        .get(path)
        .then((recipRes) => {
          if (!active) return;
          setComposeUsers(recipRes.data?.users || []);
        })
        .catch((error) => {
          if (active) {
            showToast(getErrorMessage(error), "error");
            setComposeUsers([]);
          }
        });
    };
    load();
    const timer = setInterval(load, 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [showToast, tenantContextId, isTenantAdmin, canCompose]);

  useEffect(() => {
    const onClick = (event) => {
      if (recipientWrapRef.current && !recipientWrapRef.current.contains(event.target)) {
        setOpenRecipient(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const userById = useMemo(() => new Map(composeUsers.map((u) => [String(u._id), u])), [composeUsers]);

  const selectedUsers = useMemo(() => selectedIds.map((id) => userById.get(id)).filter(Boolean), [selectedIds, userById]);

  const filteredRecipients = useMemo(() => {
    const query = recipientQuery.trim().toLowerCase();
    if (!query) return composeUsers.filter((u) => !selectedIds.includes(String(u._id)));
    return composeUsers.filter((u) => {
      if (selectedIds.includes(String(u._id))) return false;
      const name = String(u.name || "").toLowerCase();
      const email = String(u.email || "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [composeUsers, recipientQuery, selectedIds]);

  const addRecipient = (id) => {
    const s = String(id);
    if (selectedIds.includes(s)) return;
    setSelectedIds((prev) => [...prev, s]);
    setRecipientQuery("");
    setOpenRecipient(false);
  };

  const removeRecipient = (id) => {
    const s = String(id);
    setSelectedIds((prev) => prev.filter((x) => x !== s));
  };

  const create = async (event) => {
    event.preventDefault();
    if (!selectedIds.length) {
      showToast("Select at least one recipient.", "error");
      return;
    }
    if (!form.message.trim()) {
      showToast("Add a message before sending.", "error");
      return;
    }
    try {
      await api.post("/notifications", {
        channel: "IN_APP",
        message: form.message.trim(),
        eventType: "MANUAL",
        subject: form.subject.trim(),
        recipientUserIds: selectedIds,
      });
      showToast("Notification sent", "success");
      setForm({ message: "", subject: "" });
      setSelectedIds([]);
      loadNotifications();
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    }
  };

  const relevantNotifications = useMemo(() => {
    if (!items.length) return [];
    const scoped = items.filter((row) => {
      if (isTenantAdmin || isSuperAdmin) {
        if (accountRole === "super_admin" || isSuperAdmin) {
          const fromId = row.fromUserId?._id || row.fromUserId;
          const toId = row.recipientUserId?._id || row.recipientUserId;
          if (String(fromId) === String(currentUserId) || String(toId) === String(currentUserId)) return true;
          return /admin/i.test(row.message || "") || /admin/i.test(row.subject || "");
        }
        const fromId = row.fromUserId?._id || row.fromUserId;
        const toId = row.recipientUserId?._id || row.recipientUserId;
        if (String(fromId) === String(currentUserId) || String(toId) === String(currentUserId)) return true;
        const action = String(row.eventType || "").toUpperCase();
        return action.includes("FORM") || action.includes("WORKFLOW") || action.includes("DISPATCH");
      }
      const fromId = row.fromUserId?._id || row.fromUserId;
      const toId = row.recipientUserId?._id || row.recipientUserId;
      if (String(fromId) === String(currentUserId) || String(toId) === String(currentUserId)) return true;
      const action = String(row.eventType || "").toUpperCase();
      return action.includes("FORM") || action.includes("WORKFLOW") || action.includes("DISPATCH");
    });
    return scoped;
  }, [items, isTenantAdmin, isSuperAdmin, accountRole, currentUserId]);

  const sentItems = useMemo(() => {
    return relevantNotifications.filter((row) => {
      const fromId = row.fromUserId?._id || row.fromUserId;
      return String(fromId) === String(currentUserId);
    });
  }, [relevantNotifications, currentUserId]);

  const inboxItems = useMemo(() => {
    if (activeTab === "sent") return sentItems;
    return relevantNotifications.filter((row) => {
      const fromId = row.fromUserId?._id || row.fromUserId;
      return String(fromId) !== String(currentUserId);
    });
  }, [activeTab, relevantNotifications, sentItems, currentUserId]);

  const threadItems = useMemo(() => {
    return [...inboxItems].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [inboxItems]);

  return (
    <ModulePage
      title="Notifications"
      description={
        isTenantAdmin
          ? "All active employees in this tenant are available as recipients. Messages between you, admins, and super admins stay in this inbox."
          : "Only the people involved with you appear here. Messages stay scoped to your work."
      }
    >
      <div className="notif-grid">
        {canCompose ? (
          <section className="notif-card notif-card--compose">
            <header className="notif-card__header">
              <div>
                <h2>New message</h2>
                <p>Send in-app to selected people. Auto-refreshes the recipient list.</p>
              </div>
              <span className="notif-pill">In-app</span>
            </header>
            <form className="notif-compose" onSubmit={create}>
              <div className="notif-field">
                <label htmlFor="notif-subject">Subject</label>
                <input
                  id="notif-subject"
                  value={form.subject}
                  onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                  placeholder="Add a short subject (optional)"
                />
              </div>

              <div className="notif-field">
                <label>Recipients</label>
                <div className="notif-recipient-shell" ref={recipientWrapRef}>
                  {selectedUsers.length > 0 ? (
                    <div className="notif-chips">
                      {selectedUsers.map((u) => (
                        <span key={u._id} className="notif-chip">
                          <span className="notif-chip__avatar">{initials(u.name)}</span>
                          <span className="notif-chip__text">
                            <strong>{u.name}</strong>
                            <small>{u.email}</small>
                          </span>
                          <button type="button" onClick={() => removeRecipient(u._id)} aria-label={`Remove ${u.name}`}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="notif-recipient-input">
                    <input
                      value={recipientQuery}
                      onChange={(e) => {
                        setRecipientQuery(e.target.value);
                        setOpenRecipient(true);
                      }}
                      onFocus={() => setOpenRecipient(true)}
                      placeholder={selectedUsers.length ? "Add another person…" : "Search employees by name or email"}
                    />
                    <button type="button" className="notif-recipient-add" onClick={() => setOpenRecipient((v) => !v)}>
                      +
                    </button>
                  </div>
                  {openRecipient && (filteredRecipients.length > 0 || recipientQuery.trim()) ? (
                    <div className="notif-recipient-dropdown">
                      {filteredRecipients.length === 0 ? (
                        <p className="notif-recipient-empty">No matching active employees found.</p>
                      ) : (
                        filteredRecipients.slice(0, 20).map((u) => (
                          <button type="button" key={u._id} className="notif-recipient-option" onClick={() => addRecipient(u._id)}>
                            <span className="notif-recipient-option__avatar">{initials(u.name)}</span>
                            <span className="notif-recipient-option__text">
                              <strong>{u.name}</strong>
                              <small>
                                {u.email}
                                {u.status && u.status !== "ACTIVE" ? ` · ${u.status}` : ""}
                              </small>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <p className="notif-hint">
                  {isTenantAdmin ? "All active employees in this tenant." : "Leadership, admins, and people you can message."} · {composeUsers.length} available
                </p>
              </div>

              <div className="notif-field">
                <label htmlFor="notif-message">Message</label>
                <textarea
                  id="notif-message"
                  rows={6}
                  value={form.message}
                  onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                  required
                  placeholder="Write your message here…"
                />
              </div>

              <div className="notif-actions">
                <button className="btn-primary" type="submit" disabled={!selectedIds.length || !form.message.trim()}>
                  Send in-app
                </button>
                <span className="notif-actions__hint">Auto-refreshes recipients</span>
              </div>
            </form>
          </section>
        ) : null}

        <section className="notif-card notif-card--inbox">
          <header className="notif-card__header">
            <div>
              <h2>Inbox</h2>
              <p>
                {isTenantAdmin
                  ? "Showing notifications involving you and tenant activity."
                  : "Only notifications involving you appear here."}
              </p>
            </div>
            <div className="notif-tabs">
              <button
                type="button"
                className={activeTab === "inbox" ? "is-active" : ""}
                onClick={() => setActiveTab("inbox")}
              >
                Received {receivedCount > 0 ? <span>{receivedCount}</span> : null}
              </button>
              <button
                type="button"
                className={activeTab === "sent" ? "is-active" : ""}
                onClick={() => setActiveTab("sent")}
              >
                Sent {sentCount > 0 ? <span>{sentCount}</span> : null}
              </button>
            </div>
          </header>

          {threadItems.length === 0 ? (
            <div className="notif-empty">
              <div className="notif-empty__orb" />
              <h3>{activeTab === "sent" ? "No sent messages yet" : "Your inbox is clear"}</h3>
              <p>
                {activeTab === "sent"
                  ? "Messages you send will appear here with live updates."
                  : "New messages from people involved with you will land here."}
              </p>
            </div>
          ) : (
            <div className="notif-thread">
              {threadItems.map((row) => {
                const from = row.fromUserId || {};
                const to = row.recipientUserId || {};
                const isSent = String(from._id || from) === String(currentUserId);
                const actor = isSent ? to : from;
                const pdf = row.metadata?.pdfUrl;
                const formLink = row.metadata?.publicUrl || row.metadata?.publicPath;
                const fullFormLink = formLink
                  ? formLink.startsWith("http")
                    ? formLink
                    : `${window.location.origin}${formLink}`
                  : null;
                return (
                  <article key={row._id} className="notif-item">
                    <div className="notif-item__top">
                      <div className="notif-item__actor">
                        <span className="notif-item__avatar">{initials(actor?.name || actor?.email)}</span>
                        <div>
                          <p>
                            <strong>{isSent ? `To: ${actor?.name || actor?.email || "—"}` : `From: ${actor?.name || actor?.email || "—"}`}</strong>
                          </p>
                          <span>{timeAgo(row.createdAt)}</span>
                        </div>
                      </div>
                      <div className="notif-item__meta">
                        {row.subject ? <span className="notif-subject">{row.subject}</span> : null}
                        <span className={`notif-status notif-status--${String(row.status || "sent").toLowerCase()}`}>
                          {row.status || "SENT"}
                        </span>
                      </div>
                    </div>
                    <p className="notif-item__message">{row.message}</p>
                    {(pdf || fullFormLink) && (
                      <div className="notif-item__attachments">
                        {pdf ? (
                          <a href={pdf} target="_blank" rel="noreferrer" className="notif-attachment">
                            View PDF
                          </a>
                        ) : null}
                        {fullFormLink ? (
                          <a href={fullFormLink} target="_blank" rel="noreferrer" className="notif-attachment">
                            Open form
                          </a>
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ModulePage>
  );
}

export default NotificationsPage;
