import "../../../styles/wf-notifications.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../../lib/api";
import ModulePage from "../../../components/common/ModulePage";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";
import useAuth from "../../../hooks/useAuth";

/** Above this many people the composer gets a filter field (Screens 21/22 show none). */
const FILTER_THRESHOLD = 8;

function titleCase(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "Sent";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function sentLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const stamp = date.getTime();
  if (stamp >= startOfToday.getTime()) return `Today, ${time}`;
  if (stamp >= startOfToday.getTime() - 86400000) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${time}`;
}

function nameOf(person) {
  if (!person || typeof person === "string") return "";
  return person.name || person.email || "";
}

function idOf(value) {
  if (!value) return "";
  return typeof value === "string" ? value : value._id || value.id || "";
}

function absolute(url) {
  if (!url) return "";
  return /^https?:/i.test(url) ? url : `${window.location.origin}${url}`;
}

/** Attachment label + links carried on the notification metadata. */
function attachmentOf(row) {
  const meta = row?.metadata || {};
  const raw = meta.fileName || meta.attachmentName || meta.attachment || meta.pdfUrl || "";
  const name = raw ? String(raw).split("?")[0].split("/").filter(Boolean).pop() : "";
  return {
    name: name || "",
    href: absolute(meta.pdfUrl || ""),
    formHref: absolute(meta.publicUrl || meta.publicPath || ""),
  };
}

function NotificationsPage({ embedded = false }) {
  const { showToast } = useToast();
  const { user, tenantContextId, permissionCodes = [], accountRole, isSuperAdmin } = useAuth();
  const isTenantAdmin =
    permissionCodes.includes("tenant.manage") ||
    accountRole === "tenant_admin" ||
    accountRole === "super_admin" ||
    isSuperAdmin;
  const canCompose =
    isTenantAdmin ||
    permissionCodes.includes("*") ||
    permissionCodes.includes("notification.compose") ||
    permissionCodes.includes("report.view");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeUsers, setComposeUsers] = useState([]);
  const [recipientsLoading, setRecipientsLoading] = useState(true);
  const [recipientsError, setRecipientsError] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState({ message: "", subject: "" });
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipientNonce, setRecipientNonce] = useState(0);
  const [recipientsOpen, setRecipientsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const recipientsRef = useRef(null);
  const notificationsActive = useRef(true);
  const currentUserId = user?._id || user?.id;

  const loadNotifications = useCallback(async () => {
    try {
      const res = await api.get("/notifications");
      if (notificationsActive.current) setItems(res.data || []);
    } catch (error) {
      if (notificationsActive.current) showToast(getErrorMessage(error), "error");
    } finally {
      if (notificationsActive.current) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    notificationsActive.current = true;
    queueMicrotask(() => {
      if (notificationsActive.current) loadNotifications();
    });
    const timer = setInterval(loadNotifications, 15000);
    return () => {
      notificationsActive.current = false;
      clearInterval(timer);
    };
  }, [loadNotifications, tenantContextId]);

  useEffect(() => {
    if (!canCompose) return undefined;
    let active = true;
    const load = async (initial = false) => {
      if (initial) {
        setRecipientsLoading(true);
        setRecipientsError(false);
      }
      const path = isTenantAdmin ? "/notifications/recipients/all" : "/notifications/recipients/elevated";
      try {
        const recipRes = await api.get(path);
        if (active) {
          setComposeUsers(recipRes.data?.users || []);
          setRecipientsError(false);
        }
      } catch (error) {
        if (active) {
          showToast(getErrorMessage(error), "error");
          setComposeUsers([]);
          setRecipientsError(true);
        }
      } finally {
        if (active && initial) setRecipientsLoading(false);
      }
    };
    load(true);
    const timer = setInterval(() => load(), 20000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [showToast, tenantContextId, isTenantAdmin, canCompose, recipientNonce]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 860px)");
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const filteredRecipients = useMemo(() => {
    const needle = recipientQuery.trim().toLowerCase();
    if (!needle) return composeUsers;
    return composeUsers.filter((person) => {
      const name = String(person.name || "").toLowerCase();
      const email = String(person.email || "").toLowerCase();
      return name.includes(needle) || email.includes(needle);
    });
  }, [composeUsers, recipientQuery]);

  const recipientIds = useMemo(() => composeUsers.map((person) => String(person._id)), [composeUsers]);
  const activeSelectedIds = selectedIds.filter((id) => recipientIds.includes(id));
  const selectedRecipientCount = activeSelectedIds.length;
  const allRecipientsSelected = recipientIds.length > 0 && selectedRecipientCount === recipientIds.length;
  const someRecipientsSelected = selectedRecipientCount > 0 && !allRecipientsSelected;

  useEffect(() => {
    if (!recipientsOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (recipientsRef.current && !recipientsRef.current.contains(event.target)) {
        setRecipientsOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setRecipientsOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [recipientsOpen]);

  const toggleRecipient = (id) => {
    const key = String(id);
    setSelectedIds((prev) => {
      const active = prev.filter((entry) => recipientIds.includes(entry));
      return active.includes(key) ? active.filter((entry) => entry !== key) : [...active, key];
    });
  };

  const toggleAllRecipients = () => {
    setSelectedIds(allRecipientsSelected ? [] : recipientIds);
  };

  const refreshRecipients = () => {
    setRecipientsLoading(true);
    setRecipientsError(false);
    setRecipientNonce((nonce) => nonce + 1);
    showToast("Recipient list refreshed", "success");
  };

  const create = async (event) => {
    event.preventDefault();
    if (!activeSelectedIds.length) {
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
        recipientUserIds: activeSelectedIds,
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
    return items.filter((row) => {
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
        return (
          action === "PASSWORD_RESET_REQUEST" ||
          action.includes("FORM") ||
          action.includes("WORKFLOW") ||
          action.includes("DISPATCH")
        );
      }
      const fromId = row.fromUserId?._id || row.fromUserId;
      const toId = row.recipientUserId?._id || row.recipientUserId;
      if (String(fromId) === String(currentUserId) || String(toId) === String(currentUserId)) return true;
      const action = String(row.eventType || "").toUpperCase();
      return (
        action === "PASSWORD_RESET_REQUEST" ||
        action.includes("FORM") ||
        action.includes("WORKFLOW") ||
        action.includes("DISPATCH")
      );
    });
  }, [items, isTenantAdmin, isSuperAdmin, accountRole, currentUserId]);

  const threadItems = useMemo(
    () => [...relevantNotifications].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    [relevantNotifications],
  );

  const rows = useMemo(
    () =>
      threadItems.map((row) => {
        const isSent = idOf(row.fromUserId) === String(currentUserId);
        const actor = isSent ? row.recipientUserId : row.fromUserId;
        const subject =
          row.subject || String(row.message || "").split("\n")[0].trim().slice(0, 90) || "—";
        return {
          row,
          isSent,
          party: nameOf(actor) || "—",
          subject,
          status: titleCase(row.status),
          sent: sentLabel(row.createdAt),
          attachment: attachmentOf(row),
        };
      }),
    [threadItems, currentUserId],
  );

  const showFilter = composeUsers.length > FILTER_THRESHOLD;

  const content = (
    <div className="notifw-page">
        {canCompose ? (
          <section className="notifw-compose">
            <div className="notifw-compose__head">
              <h2 className="notifw-compose__title">
                <span className="notifw-compose__title-desk">New message</span>
                <span className="notifw-compose__title-mob">Send a message</span>
              </h2>
              <p className="notifw-compose__sub">Select recipients and send your message.</p>
            </div>

            <form className="notifw-form" onSubmit={create}>
              <div className="notifw-field">
                <span className="notifw-label" id="notifw-recipients-label">
                  Recipients
                </span>
                <div
                  className={`notifw-recipient-picker${recipientsOpen ? " is-open" : ""}`}
                  ref={recipientsRef}
                >
                  <button
                    type="button"
                    className="notifw-recipient-picker__trigger"
                    aria-expanded={recipientsOpen}
                    aria-controls="notifw-recipient-menu"
                    aria-labelledby="notifw-recipients-label"
                    onClick={() => setRecipientsOpen((open) => !open)}
                  >
                    <span>
                      {selectedRecipientCount
                        ? `${selectedRecipientCount} recipient${selectedRecipientCount === 1 ? "" : "s"} selected`
                        : "Select recipients"}
                    </span>
                    <span className="notifw-recipient-picker__chevron" aria-hidden="true" />
                  </button>
                  {recipientsOpen ? (
                    <div
                      className="notifw-recipient-menu"
                      id="notifw-recipient-menu"
                      role="group"
                      aria-labelledby="notifw-recipients-label"
                    >
                      <label className="notifw-recipient notifw-recipient--all">
                        <input
                          type="checkbox"
                          checked={allRecipientsSelected}
                          ref={(node) => {
                            if (node) node.indeterminate = someRecipientsSelected;
                          }}
                          disabled={!recipientIds.length}
                          onChange={toggleAllRecipients}
                        />
                        <span className="notifw-recipient__name">Select all recipients</span>
                      </label>
                      {showFilter ? (
                        <input
                          className="notifw-recipients__filter"
                          type="search"
                          value={recipientQuery}
                          onChange={(event) => setRecipientQuery(event.target.value)}
                          placeholder="Search employees by name or email"
                          aria-label="Filter recipients"
                        />
                      ) : null}
                      <div className="notifw-recipients__list">
                        {recipientsLoading ? (
                          <p className="notifw-recipients__empty">Loading recipients…</p>
                        ) : recipientsError ? (
                          <p className="notifw-recipients__empty">Couldn’t load recipients. Refresh the list to try again.</p>
                        ) : filteredRecipients.length === 0 ? (
                          <p className="notifw-recipients__empty">No recipients available in this organization.</p>
                        ) : (
                          filteredRecipients.map((person) => (
                            <label key={person._id} className="notifw-recipient" title={person.email}>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(String(person._id))}
                                onChange={() => toggleRecipient(person._id)}
                              />
                              <span className="notifw-recipient__details">
                                <span className="notifw-recipient__name">{person.name || person.email}</span>
                                {person.email ? (
                                  <span className="notifw-recipient__email">
                                    {person.tenantName ? `${person.email} · ${person.tenantName}` : person.email}
                                  </span>
                                ) : null}
                              </span>
                              <span className="notifw-recipient__role">{person.accountRole || "Employee"}</span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="notifw-field">
                <label className="notifw-label" htmlFor="notifw-subject">
                  Subject
                </label>
                <input
                  id="notifw-subject"
                  className="notifw-input"
                  type="text"
                  value={form.subject}
                  onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                  placeholder={isMobile ? "Enter subject" : undefined}
                />
              </div>

              <div className="notifw-field">
                <label className="notifw-label" htmlFor="notifw-message">
                  Message
                </label>
                <textarea
                  id="notifw-message"
                  className="notifw-textarea"
                  rows={5}
                  value={form.message}
                  onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                  placeholder={isMobile ? "Write your message" : undefined}
                />
              </div>

              <div className="notifw-actions">
                <button
                  className="notifw-btn notifw-btn--primary"
                  type="submit"
                  disabled={!selectedRecipientCount || !form.message.trim()}
                >
                  Send to selected
                </button>
                <button
                  className="notifw-btn notifw-btn--ghost"
                  type="button"
                  onClick={refreshRecipients}
                >
                  Refresh recipient list
                </button>
              </div>
            </form>
          </section>
        ) : null}

        <h2 className="notifw-section">Notifications</h2>

        {loading ? (
          <div className="notifw-panel notifw-skeleton" aria-label="Loading messages">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="notifw-skeleton__row" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="notifw-panel notifw-empty">
            <h3>No messages yet</h3>
            <p>Messages you send and receive will appear here with live updates.</p>
          </div>
        ) : (
          <>
            <div className="notifw-panel notifw-only-desk">
              <table className="notifw-table">
                <colgroup>
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "27%" }} />
                  <col style={{ width: "21%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "18%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Subject</th>
                    <th>Attachment</th>
                    <th>Status</th>
                    <th>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ row, party, subject, status, sent, attachment }) => (
                    <tr key={row._id}>
                      <td>{party}</td>
                      <td className="notifw-cell-subject">{subject}</td>
                      <td className="notifw-cell-attachment">
                        {attachment.name ? (
                          attachment.href ? (
                            <a href={attachment.href} target="_blank" rel="noreferrer">
                              {attachment.name}
                            </a>
                          ) : (
                            <span>{attachment.name}</span>
                          )
                        ) : (
                          <span className="notifw-muted">—</span>
                        )}
                        {attachment.formHref ? (
                          <a className="notifw-form-link" href={attachment.formHref} target="_blank" rel="noreferrer">
                            Open form
                          </a>
                        ) : null}
                      </td>
                      <td>
                        <span className="notifw-pill">{status}</span>
                      </td>
                      <td className="notifw-cell-sent">{sent}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="notifw-cards notifw-only-mob">
              {rows.map(({ row, isSent, party, subject, status, attachment }) => (
                <article key={row._id} className="notifw-card">
                  <div className="notifw-card__top">
                    <span className="notifw-kind">{isSent ? "Activity" : "Inbox"}</span>
                    <span className="notifw-card__status">{status}</span>
                  </div>
                  <p className="notifw-card__who">{party}</p>
                  <h3 className="notifw-card__subject">{subject}</h3>
                  {attachment.name || attachment.formHref ? (
                    <p className="notifw-card__attachment">
                      {attachment.name ? (
                        attachment.href ? (
                          <a href={attachment.href} target="_blank" rel="noreferrer">
                            Attachment: {attachment.name}
                          </a>
                        ) : (
                          <span>Attachment: {attachment.name}</span>
                        )
                      ) : null}
                      {attachment.formHref ? (
                        <a className="notifw-form-link" href={attachment.formHref} target="_blank" rel="noreferrer">
                          Open form
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        )}
    </div>
  );

  return embedded
    ? content
    : (
      <ModulePage
        title="Notifications"
        description="Message employees, tenant administrators, and platform admins."
      >
        {content}
      </ModulePage>
    );
}

export default NotificationsPage;
