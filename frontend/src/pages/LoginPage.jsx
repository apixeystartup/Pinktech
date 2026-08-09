import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuth from "../hooks/useAuth";
import { useToast } from "../components/common/ToastProvider";
import { getErrorMessage } from "../lib/error";

function LoginPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { login, isLoading } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    try {
      await login(form.email, form.password);
      showToast("Login successful", "success");
      navigate("/", { replace: true });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
    }
  };

  return (
    <div className="auth-container">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h2>Sign in</h2>
        <p>Use your invite credentials to access your tenant workspace.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          required
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          required
        />

        {error ? <p className="error-text">{error}</p> : null}

        <button type="submit" className="btn-primary" disabled={isLoading}>
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
        <div className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/verify-otp">Verify invite OTP</Link>
          <Link to="/set-password">Set invited password</Link>
        </div>
      </form>
    </div>
  );
}

export default LoginPage;
