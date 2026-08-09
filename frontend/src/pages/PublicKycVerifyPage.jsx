import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { getErrorMessage } from "../lib/error";

function PublicKycVerifyPage() {
  const [params] = useSearchParams();
  const typeFromUrl = useMemo(() => {
    const t = (params.get("type") || "").toUpperCase();
    return t === "PAN" || t === "AADHAAR" ? t : "";
  }, [params]);

  const [otpType, setOtpType] = useState(() => typeFromUrl || params.get("type") || "AADHAAR");
  const [invitationCode, setInvitationCode] = useState("");
  const [otp, setOtp] = useState("");
  const [fullName, setFullName] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const kycId = useMemo(() => params.get("kycId") || "", [params]);
  const token = useMemo(() => params.get("token") || "", [params]);

  useEffect(() => {
    if (typeFromUrl) setOtpType(typeFromUrl);
  }, [typeFromUrl]);

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const body = {
        kycId,
        token,
        otpType,
        invitationCode,
        otp,
      };
      if (otpType === "AADHAAR") {
        body.fullName = fullName.trim();
        body.aadhaarNumber = aadhaarNumber;
        body.mobile = mobile;
        body.email = email.trim();
      } else {
        body.panNumber = panNumber.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
      }
      const res = await api.post("/public/kyc/verify", body);
      setResult(res.data || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const typeLocked = Boolean(typeFromUrl);

  return (
    <section className="auth-container">
      <div className="auth-card">
        <h2>Verify {otpType === "AADHAAR" ? "Aadhaar" : "PAN"} OTP</h2>
        <p className="small-note">
          Use the link from your email (it loads this page). Enter the invitation code and OTP from the same message, then your document
          details below.
        </p>
        {error ? (
          <p className="error-text error-banner" role="alert">
            {error}
          </p>
        ) : null}
        {result?.ok ? (
          <p className="small-note" style={{ marginTop: "0.5rem", color: "var(--success, #16a34a)", fontWeight: 600 }}>
            {result.message || "Verification complete."}
          </p>
        ) : null}

        {!result?.ok ? (
          <form className="stacked-form" onSubmit={submit}>
            <label className="stacked-label">
              Document
              <select
                value={otpType}
                onChange={(e) => setOtpType(e.target.value)}
                disabled={typeLocked}
                required
              >
                <option value="AADHAAR">AADHAAR</option>
                <option value="PAN">PAN</option>
              </select>
            </label>
            {typeLocked ? (
              <p className="small-note">Document type is set by your email link.</p>
            ) : null}

            <label className="stacked-label">
              Invitation code
              <input
                value={invitationCode}
                onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                required
                autoComplete="off"
              />
            </label>
            <label className="stacked-label">
              OTP from email
              <input value={otp} onChange={(e) => setOtp(e.target.value)} required autoComplete="one-time-code" />
            </label>

            {otpType === "AADHAAR" ? (
              <>
                <label className="stacked-label">
                  Full name (as on Aadhaar)
                  <input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} />
                </label>
                <label className="stacked-label">
                  Aadhaar number (12 digits)
                  <input
                    value={aadhaarNumber}
                    onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    inputMode="numeric"
                    maxLength={12}
                    required
                  />
                </label>
                <label className="stacked-label">
                  Mobile number
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    inputMode="tel"
                    placeholder="10-digit mobile"
                    required
                  />
                </label>
                <label className="stacked-label">
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </label>
              </>
            ) : (
              <label className="stacked-label">
                PAN (10 characters)
                <input
                  value={panNumber}
                  onChange={(e) => setPanNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                  required
                  maxLength={10}
                  autoComplete="off"
                />
              </label>
            )}

            <button className="btn-primary" type="submit" disabled={loading || !kycId || !token || !invitationCode}>
              {loading ? "Submitting…" : "Verify and submit"}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

export default PublicKycVerifyPage;
