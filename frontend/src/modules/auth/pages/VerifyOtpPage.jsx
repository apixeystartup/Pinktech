import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../../lib/api";
import { getErrorMessage } from "../../../lib/error";
import { useToast } from "../../../components/common/ToastProvider";

function VerifyOtpPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/verify-otp", {
        email: email.trim().toLowerCase(),
        otpCode: otpCode.trim(),
      });
      showToast("OTP verified", "success");
      navigate(`/set-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
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
          Enter the <strong>email</strong> and <strong>OTP</strong> from your invite message.
        </p>
        <input
          type="email"
          placeholder="Work email (from invite)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <input
          placeholder="6-digit OTP"
          value={otpCode}
          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          required
          inputMode="numeric"
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Verifying..." : "Verify & Set Password"}
        </button>
        <Link to="/login">Back to login</Link>
      </form>
    </div>
  );
}

export default VerifyOtpPage;
