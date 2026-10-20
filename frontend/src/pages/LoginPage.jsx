import { useEffect, useState } from "react";
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

  useEffect(() => {
    document.title = "Sign in | Pinktech";
  }, []);

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
      navigate("/app", { replace: true });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
    }
  };

  return (
    <div className="taste-login">
      <section className="taste-login-story">
        <Link className="taste-login-brand" to="/">
          <span className="taste-login-brand-mark" aria-hidden="true">P</span>
          <span>Pinktech</span>
        </Link>
        <div className="taste-login-story-copy">
          <h2>Work moves<br />forward.</h2>
          <p>
            Pick up where your team left off, with profiles, documents, and signatures in one
            connected workspace.
          </p>
          <span className="taste-login-note">Agreements, in context.</span>
        </div>
        <div className="taste-login-story-note">
          <span aria-hidden="true">↗</span>
          <span>A clearer path from intake to signature.</span>
        </div>
      </section>
      <section className="taste-login-panel" aria-labelledby="login-heading">
        <Link className="taste-login-back" to="/">Back to Pinktech <span aria-hidden="true">↗</span></Link>
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1 id="login-heading">Welcome back.</h1>
          <p>Sign in with your invite credentials to access your tenant workspace.</p>

          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={form.email}
            onChange={handleChange}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={handleChange}
            required
          />

          {error ? <p className="error-text" role="alert">{error}</p> : null}

          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
          <div className="auth-links">
            <Link to="/forgot-password">Forgot password?</Link>
            <Link to="/verify-otp">Verify invite OTP</Link>
          </div>
        </form>
        <div className="taste-login-foot">© {new Date().getFullYear()} Pinktech</div>
      </section>
    </div>
  );
}

export default LoginPage;
