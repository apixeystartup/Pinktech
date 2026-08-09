const crypto = require("crypto");

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function initiateAadhaarOtp(_payload) {
  return { providerRef: crypto.randomBytes(8).toString("hex"), status: "OTP_SENT" };
}

async function verifyAadhaarOtp(payload) {
  return {
    status: payload.otp === "123456" ? "VERIFIED" : "FAILED",
    tokenHash: hashValue(`${payload.providerRef}:${payload.otp}`),
  };
}

async function verifyPan(payload) {
  return {
    status: /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(payload.pan || "") ? "VERIFIED" : "FAILED",
    tokenHash: hashValue(payload.pan || ""),
  };
}

module.exports = {
  initiateAadhaarOtp,
  verifyAadhaarOtp,
  verifyPan,
};
