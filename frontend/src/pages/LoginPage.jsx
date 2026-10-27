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
  const [showPassword, setShowPassword] = useState(false);
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);
  const [unlockAt, setUnlockAt] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!unlockAt) return undefined;
    const unlockTime = new Date(unlockAt).getTime();
    const timer = window.setInterval(() => {
      setSecondsRemaining(Math.max(0, Math.ceil((unlockTime - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [unlockAt]);

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
    setAttemptsRemaining(null);
    setUnlockAt(null);
    setSecondsRemaining(0);

    try {
      await login(form.email, form.password);
      showToast("Login successful", "success");
      navigate("/app", { replace: true });
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      const details = err?.response?.data?.details;
      if (Number.isInteger(details?.remainingAttempts)) {
        setAttemptsRemaining(details.remainingAttempts);
      }
      if (details?.unlockAt) {
        const unlockTime = new Date(details.unlockAt);
        if (!Number.isNaN(unlockTime.getTime())) {
          setUnlockAt(unlockTime.toISOString());
          setSecondsRemaining(Math.max(0, Math.ceil((unlockTime.getTime() - Date.now()) / 1000)));
        }
      }
    }
  };

  const lockCountdown = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`;

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
          <div className="password-input-wrap">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              required
            />
            <button
              type="button"
              className="password-visibility-toggle"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 3l18 18" />
                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M9.9 5.2A11.4 11.4 0 0 1 12 5c5 0 8.4 4.6 9 7-.2.9-.9 2-2 3" />
                  <path d="M6.2 6.2C3.9 7.6 2.4 9.8 2 12c.6 2.4 4 7 10 7 1.1 0 2.1-.2 3-.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>

          {error ? (
            <div className="error-text" role="alert">
              <p>{error}</p>
              {attemptsRemaining !== null ? (
                <p>{attemptsRemaining} failed attempt{attemptsRemaining === 1 ? "" : "s"} remaining before a temporary lock.</p>
              ) : null}
              {unlockAt ? (
                <p>
                  Try again at {new Date(unlockAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
                  {secondsRemaining > 0 ? ` Time remaining: ${lockCountdown}.` : " You can try again now."}
                </p>
              ) : null}
            </div>
          ) : null}

          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
          <div className="auth-links">
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
        </form>
        <div className="taste-login-foot">© {new Date().getFullYear()} Pinktech</div>
      </section>
    </div>
  );
}

export default LoginPage;
