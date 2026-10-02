import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";

function ResetPasswordPage() {
  const { showToast } = useToast();
  const [form, setForm] = useState({ resetToken: "", password: "" });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/reset-password", form);
      showToast("Password reset successful", "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Reset Password</h2>
        <input
          placeholder="Reset token"
          value={form.resetToken}
          onChange={(e) => setForm((prev) => ({ ...prev, resetToken: e.target.value }))}
          required
        />
        <input
          type="password"
          placeholder="New password"
          value={form.password}
          onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          required
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Resetting..." : "Reset Password"}
        </button>
        <Link to="/login">Back to login</Link>
      </form>
    </div>
  );
}

export default ResetPasswordPage;
