import crypto from "crypto";

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

/** 6-digit numeric OTP */
export function generateSignupOtp() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export function hashOtpCode(email, purpose, code) {
  const secret = process.env.OTP_HMAC_SECRET ?? process.env.AUTH_JWT_SECRET ?? "dev-otp-secret";
  const payload = `${normalizeEmail(email)}:${purpose}:${code}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
