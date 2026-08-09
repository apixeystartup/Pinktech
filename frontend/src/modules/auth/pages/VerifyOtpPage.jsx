import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";

function VerifyOtpPage() {
  const { showToast } = useToast();
  const [mode, setMode] = useState("email");
  const [form, setForm] = useState({ inviteToken: "", email: "", otpCode: "" });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setResult("");
    const payload =
      mode === "token"
        ? { inviteToken: form.inviteToken.trim(), otpCode: form.otpCode.trim() }
        : { email: form.email.trim().toLowerCase(), otpCode: form.otpCode.trim() };
    try {
      const res = await api.post("/auth/verify-otp", payload);
      setResult(res.data.message);
      showToast("OTP verified", "success");
    } catch (error) {
      showToast(getErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Verify Invite OTP</h2>
        <p className="small-note">
          Use the <strong>email</strong> and <strong>OTP</strong> from your invite message, or paste the long{" "}
          <strong>invite token</strong> if you prefer.
        </p>
        <div className="inline-form" style={{ marginBottom: "0.75rem" }}>
          <label className="permission-check-item">
            <input
              type="radio"
              name="vmode"
              checked={mode === "email"}
              onChange={() => setMode("email")}
            />
            <span>Email + OTP</span>
          </label>
          <label className="permission-check-item">
            <input
              type="radio"
              name="vmode"
              checked={mode === "token"}
              onChange={() => setMode("token")}
            />
            <span>Invite token + OTP</span>
          </label>
        </div>
        {mode === "email" ? (
          <input
            type="email"
            placeholder="Work email (from invite)"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
            autoComplete="email"
          />
        ) : (
          <input
            placeholder="Invite token (from invite email)"
            value={form.inviteToken}
            onChange={(e) => setForm((prev) => ({ ...prev, inviteToken: e.target.value }))}
            required
            autoComplete="off"
          />
        )}
        <input
          placeholder="6-digit OTP"
          value={form.otpCode}
          onChange={(e) => setForm((prev) => ({ ...prev, otpCode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
          required
          inputMode="numeric"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Verifying..." : "Verify"}
        </button>
        {result ? <p>{result}</p> : null}
        <p className="small-note">After this step, check your inbox for the invitation code to set your password.</p>
        <Link to="/login">Back to login</Link>
      </form>
    </div>
  );
}

export default VerifyOtpPage;
