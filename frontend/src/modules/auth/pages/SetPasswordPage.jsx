import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";

function SetPasswordPage() {
  const { showToast } = useToast();
  const [mode, setMode] = useState("code");
  const [form, setForm] = useState({
    inviteToken: "",
    email: "",
    invitationCode: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.password !== form.confirmPassword) {
      showToast("Password and confirmation do not match.", "error");
      return;
    }
    setLoading(true);
    try {
      const payload =
        mode === "token"
          ? { inviteToken: form.inviteToken.trim(), password: form.password }
          : {
              email: form.email.trim().toLowerCase(),
              invitationCode: form.invitationCode.trim(),
              password: form.password,
            };
      await api.post("/auth/set-password", payload);
      showToast("Password set successfully", "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Set Password</h2>
        <p className="small-note">
          After verifying your OTP, use the <strong>invitation code</strong> from your second email together with this
          sign-in email.
        </p>
        <div className="inline-form" style={{ marginBottom: "0.75rem" }}>
          <label className="permission-check-item">
            <input
              type="radio"
              name="smode"
              checked={mode === "code"}
              onChange={() => setMode("code")}
            />
            <span>Email + invitation code</span>
          </label>
          <label className="permission-check-item">
            <input
              type="radio"
              name="smode"
              checked={mode === "token"}
              onChange={() => setMode("token")}
            />
            <span>Invite token (legacy)</span>
          </label>
        </div>
        {mode === "code" ? (
          <>
            <input
              type="email"
              placeholder="Sign-in email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
              autoComplete="email"
            />
            <input
              placeholder="Invitation code (from second email)"
              value={form.invitationCode}
              onChange={(e) => setForm((prev) => ({ ...prev, invitationCode: e.target.value.toUpperCase() }))}
              required
              autoComplete="one-time-code"
            />
          </>
        ) : (
          <input
            placeholder="Invite token"
            value={form.inviteToken}
            onChange={(e) => setForm((prev) => ({ ...prev, inviteToken: e.target.value }))}
            required
            autoComplete="off"
          />
        )}
        <input
          type="password"
          placeholder="New password (min 8 characters)"
          value={form.password}
          onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          required
          autoComplete="new-password"
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={form.confirmPassword}
          onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
          required
          autoComplete="new-password"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Saving..." : "Save Password"}
        </button>
        <Link to="/login">Back to login</Link>
      </form>
    </div>
  );
}

export default SetPasswordPage;
