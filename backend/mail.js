import nodemailer from "nodemailer";

function isDevMode() {
  const m = (process.env.MAIL_MODE ?? "").toLowerCase();
  if (m === "dev" || m === "console") return true;
  return !process.env.SMTP_HOST;
}

export async function sendSignupOtpEmail(toEmail, code) {
  const ttlMs = Number(process.env.OTP_TTL_MS ?? String(10 * 60 * 1000));
  const minutes = Math.max(1, Math.round(ttlMs / 60000));
  const subject = "留白写作：注册验证码";
  const text = `你的注册验证码是：${code}\n\n${minutes} 分钟内有效。如非本人操作请忽略。`;
  const html = `<p>你的注册验证码是：</p><p style="font-size: 1.25rem; letter-spacing: 0.2em;"><strong>${code}</strong></p><p>${minutes} 分钟内有效。如非本人操作请忽略。</p>`;

  if (isDevMode()) {
    console.log(`[mail:dev] to=${toEmail} subject=${subject}\n${text}`);
    return;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.MAIL_FROM ?? user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html,
  });
}

export async function sendPasswordResetEmail(toEmail, resetUrl) {
  const ttlMs = Number(process.env.RESET_TOKEN_TTL_MS ?? String(60 * 60 * 1000));
  const minutes = Math.max(1, Math.round(ttlMs / 60000));
  const subject = "留白写作：重置密码";
  const text = `请点击以下链接重置密码（${minutes} 分钟内有效）。如非本人操作请忽略。\n\n${resetUrl}`;
  const html = `<p>请点击以下链接重置密码（<strong>${minutes}</strong> 分钟内有效）。如非本人操作请忽略。</p><p><a href="${resetUrl}">${resetUrl}</a></p>`;

  if (isDevMode()) {
    console.log(`[mail:dev] to=${toEmail} subject=${subject}\n${text}`);
    return;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const from = process.env.MAIL_FROM ?? user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass } : undefined,
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html,
  });
}
