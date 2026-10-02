import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";

function SetPasswordPage() {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    inviteToken: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    const email = params.get("email") || "";
    if (token) setForm((prev) => ({ ...prev, inviteToken: token }));
    if (email) setForm((prev) => ({ ...prev, email }));
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.password !== form.confirmPassword) {
      showToast("Password and confirmation do not match.", "error");
      return;
    }
    setLoading(true);
    try {
      const payload = form.inviteToken
        ? { inviteToken: form.inviteToken.trim(), password: form.password }
        : { email: form.email.trim().toLowerCase(), password: form.password };
      await api.post("/auth/set-password", payload);
      showToast("Password set successfully", "success");
      setSuccess(true);
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Password Set</h2>
          <p>Your password has been set. You can now sign in.</p>
          <Link to="/login" className="btn-primary">Go to Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Set Password</h2>
        <p className="small-note">After verifying your OTP, set your password below.</p>
        {!form.inviteToken && (
          <input
            type="email"
            placeholder="Sign-in email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
            autoComplete="email"
          />
        )}
        {form.inviteToken && (
          <input type="hidden" value={form.inviteToken} />
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
