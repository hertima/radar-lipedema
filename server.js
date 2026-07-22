const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");
const { matchFoodInGuide, antiInflammatoryFoodGuide } = require("./foodGuide.js");

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT || 3000);
const publicDir = __dirname;
const schemaPath = path.join(__dirname, "db", "schema.sql");
const jwtSecret = process.env.JWT_SECRET || "dev-only-insecure-secret-troque-isso";
const sessionCookieName = "session";
const sessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const resetTokenTtlMs = 30 * 60 * 1000;
const verificationCodeTtlMs = 10 * 60 * 1000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
});

let mailTransport = null;
if (process.env.SMTP_HOST) {
  mailTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

const metaPixelId = process.env.META_PIXEL_ID || "";
const metaCapiAccessToken = process.env.META_CAPI_ACCESS_TOKEN || "";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function sendMetaConversionEvent(eventName, request, { email } = {}) {
  if (!metaPixelId || !metaCapiAccessToken) {
    return;
  }

  const clientIp = request.headers["x-forwarded-for"]?.split(",")[0]?.trim() || request.socket.remoteAddress;
  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: `https://${request.hostname}${request.originalUrl}`,
        user_data: {
          client_ip_address: clientIp,
          client_user_agent: request.headers["user-agent"] || "",
          ...(email ? { em: [sha256Hex(email)] } : {}),
        },
      },
    ],
  };

  try {
    await fetch(`https://graph.facebook.com/v19.0/${metaPixelId}/events?access_token=${metaCapiAccessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn("Falha ao enviar evento para Meta Conversions API:", error.message);
  }
}

app.disable("x-powered-by");
app.use(cookieParser());
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

function cleanText(value, fallback = "", max = 500) {
  if (typeof value !== "string") {
    return fallback;
  }

  return value.trim().slice(0, max);
}

const emailPattern = /^[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+$/;

function isValidEmail(value) {
  return typeof value === "string" && value.length <= 180 && emailPattern.test(value);
}

const rateLimitHits = new Map();

function rateLimit(name, max, windowMs) {
  return (request, response, next) => {
    const key = `${name}:${request.ip}`;
    const now = Date.now();
    const hits = (rateLimitHits.get(key) || []).filter((timestamp) => now - timestamp < windowMs);

    if (hits.length >= max) {
      response.status(429).json({ ok: false, error: "Muitas tentativas. Aguarde um pouco e tente de novo." });
      return;
    }

    hits.push(now);
    rateLimitHits.set(key, hits);
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  rateLimitHits.forEach((hits, key) => {
    const fresh = hits.filter((timestamp) => now - timestamp < 60 * 60 * 1000);
    if (fresh.length) {
      rateLimitHits.set(key, fresh);
    } else {
      rateLimitHits.delete(key);
    }
  });
}, 15 * 60 * 1000).unref();

function cleanPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

async function ensureDatabase() {
  const legacyProfileId = await pool
    .query("select data_type from information_schema.columns where table_name = 'profiles' and column_name = 'id'")
    .catch(() => ({ rows: [] }));

  if (legacyProfileId.rows.length && legacyProfileId.rows[0].data_type !== "uuid") {
    await pool.query("drop table if exists photos, records, profiles cascade");
  }

  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
}

function setSessionCookie(response, userId) {
  const token = jwt.sign({ sub: userId }, jwtSecret, { expiresIn: "30d" });
  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: sessionMaxAgeMs,
  });
}

function readSessionUserId(request) {
  const token = request.cookies?.[sessionCookieName];
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    return payload.sub;
  } catch (error) {
    return null;
  }
}

function requireAuth(request, response, next) {
  const userId = readSessionUserId(request);
  if (!userId) {
    response.status(401).json({ ok: false, error: "Não autenticado." });
    return;
  }

  request.userId = userId;
  next();
}

async function sendResetEmail(email, resetUrl) {
  if (!mailTransport) {
    console.log(`[reset-password] link para ${email}: ${resetUrl}`);
    return;
  }

  await mailTransport.sendMail({
    from: process.env.MAIL_FROM || "Radar Lipedema <no-reply@radarlipedema.app>",
    to: email,
    subject: "Recuperação de senha - Radar Lipedema",
    html: `<p>Você pediu para redefinir sua senha no Radar Lipedema.</p><p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a></p><p>Esse link expira em 30 minutos. Se não foi você, ignore este e-mail.</p>`,
  });
}

function generateVerificationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

async function sendVerificationCode(email, code) {
  if (!mailTransport) {
    console.log(`[verify-email] código para ${email}: ${code}`);
    return;
  }

  await mailTransport.sendMail({
    from: process.env.MAIL_FROM || "Radar Lipedema <no-reply@radarlipedema.app>",
    to: email,
    subject: `${code} é o seu código do Radar Lipedema`,
    html: `<p>Seu código de verificação é:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p><p>Ele expira em 10 minutos. Se não foi você, ignore este e-mail.</p>`,
  });
}

async function issueVerificationCode(userId, email) {
  const code = generateVerificationCode();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + verificationCodeTtlMs);

  await pool.query(
    "insert into email_verification_codes (user_id, code_hash, expires_at) values ($1, $2, $3)",
    [userId, codeHash, expiresAt]
  );

  await sendVerificationCode(email, code);
}

function appBaseUrl() {
  return process.env.APP_URL || "https://app.radarlipedema.com.br";
}

async function sendReminderEmail(email, subject, html) {
  if (!mailTransport) {
    console.log(`[reminder] ${subject} -> ${email}`);
    return;
  }

  await mailTransport.sendMail({
    from: process.env.MAIL_FROM || "Radar Lipedema <no-reply@radarlipedema.app>",
    to: email,
    subject,
    html,
  });
}

function currentBrazilTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = `${map.year}-${map.month}-${map.day}`;
  return {
    date,
    time: `${map.hour === "24" ? "00" : map.hour}:${map.minute}`,
    weekday: new Date(`${date}T00:00:00`).getDay(),
  };
}

async function runDailySymptomReminderSweep() {
  const { date, time } = currentBrazilTime();
  const due = await pool.query(
    `select p.id, u.email, p.name
       from profiles p
       join users u on u.id = p.id
      where p.reminder_daily_enabled = true
        and p.reminder_time = $1
        and u.email_verified = true
        and (p.reminder_last_daily_sent_on is null or p.reminder_last_daily_sent_on <> $2)`,
    [time, date]
  );

  for (const row of due.rows) {
    await sendReminderEmail(
      row.email,
      "Hora de registrar seus sintomas no Radar Lipedema",
      `<p>Oi${row.name ? `, ${row.name}` : ""}!</p><p>Esse é o seu lembrete diário para registrar dor, edema, sensibilidade e humor de hoje.</p><p><a href="${appBaseUrl()}">Abrir o Radar Lipedema</a></p>`
    );
    await pool.query("update profiles set reminder_last_daily_sent_on = $2 where id = $1", [row.id, date]);
  }
}

async function runGarmentReminderSweep(date) {
  const due = await pool.query(
    `select p.id, u.email, p.name
       from profiles p
       join users u on u.id = p.id
      where p.garment_last_replaced_at is not null
        and p.garment_last_replaced_at <= (current_date - interval '120 days')
        and u.email_verified = true
        and (p.reminder_last_garment_sent_on is null or p.reminder_last_garment_sent_on <= (current_date - interval '14 days'))`
  );

  for (const row of due.rows) {
    await sendReminderEmail(
      row.email,
      "Hora de trocar sua meia de compressão",
      `<p>Oi${row.name ? `, ${row.name}` : ""}!</p><p>Já fazem mais de 120 dias desde a última troca registrada da sua meia de compressão. A compressão perde eficácia com o uso — considere trocá-la.</p><p><a href="${appBaseUrl()}">Abrir o Radar Lipedema</a></p>`
    );
    await pool.query("update profiles set reminder_last_garment_sent_on = $2 where id = $1", [row.id, date]);
  }
}

async function runCycleAlertReminderSweep(date) {
  const due = await pool.query(
    `select p.id, u.email, p.name, p.last_period_start as "lastPeriodStart", p.cycle_length as "cycleLength"
       from profiles p
       join users u on u.id = p.id
      where p.reminder_cycle_alert_enabled = true
        and p.last_period_start is not null
        and u.email_verified = true
        and (p.reminder_last_cycle_sent_on is null or p.reminder_last_cycle_sent_on <> $1)`,
    [date]
  );

  for (const row of due.rows) {
    const cycleLength = row.cycleLength || 28;
    const start = new Date(`${String(row.lastPeriodStart).slice(0, 10)}T00:00:00`);
    const today = new Date(`${date}T00:00:00`);
    const daysSinceStart = Math.round((today - start) / 86_400_000);
    const cycleDay = (((daysSinceStart % cycleLength) + cycleLength) % cycleLength) + 1;
    const daysUntilNext = cycleLength - cycleDay + 1;

    if (daysUntilNext === 1) {
      await sendReminderEmail(
        row.email,
        "Previsão: seu ciclo deve começar amanhã",
        `<p>Oi${row.name ? `, ${row.name}` : ""}!</p><p>Baseado no seu último registro, a previsão é que seu ciclo comece amanhã. Fique de olho nos seus sintomas.</p><p><a href="${appBaseUrl()}">Abrir o Radar Lipedema</a></p>`
      );
      await pool.query("update profiles set reminder_last_cycle_sent_on = $2 where id = $1", [row.id, date]);
    }
  }
}

async function runWeeklyInsightReminderSweep(date) {
  const due = await pool.query(
    `select p.id, u.email, p.name
       from profiles p
       join users u on u.id = p.id
      where p.reminder_weekly_insight_enabled = true
        and u.email_verified = true
        and (p.reminder_last_weekly_sent_on is null or p.reminder_last_weekly_sent_on <> $1)`,
    [date]
  );

  for (const row of due.rows) {
    await sendReminderEmail(
      row.email,
      "Seu resumo semanal - Radar Lipedema",
      `<p>Oi${row.name ? `, ${row.name}` : ""}!</p><p>Abra o app para ver seu resumo de sintomas e insights da semana.</p><p><a href="${appBaseUrl()}">Abrir o Radar Lipedema</a></p>`
    );
    await pool.query("update profiles set reminder_last_weekly_sent_on = $2 where id = $1", [row.id, date]);
  }
}

async function runDailyChecksSweep() {
  const { date, weekday } = currentBrazilTime();
  await runGarmentReminderSweep(date);
  await runCycleAlertReminderSweep(date);
  if (weekday === 0) {
    await runWeeklyInsightReminderSweep(date);
  }
}

function startReminderScheduler() {
  setInterval(() => {
    runDailySymptomReminderSweep().catch((error) => console.warn("Falha no lembrete diário de sintomas:", error.message));
  }, 60 * 1000).unref();

  let lastChecksDate = null;
  setInterval(() => {
    const { date, time } = currentBrazilTime();
    if (time === "09:00" && lastChecksDate !== date) {
      lastChecksDate = date;
      runDailyChecksSweep().catch((error) => console.warn("Falha nos lembretes diários:", error.message));
    }
  }, 60 * 1000).unref();
}

async function latestPhotos(profileId) {
  const result = await pool.query(
    `select distinct on (slot) slot, image_data_url as "imageDataUrl", notes, created_at as "createdAt"
       from photos
      where profile_id = $1
      order by slot, created_at desc`,
    [profileId]
  );

  return result.rows;
}

app.get("/api/health", asyncRoute(async (_request, response) => {
  const db = await pool.query("select now() as now");
  response.json({ ok: true, app: "Radar Lipedema", databaseTime: db.rows[0].now });
}));

const FOUNDERS_CAP = 50;

app.get("/api/stats/public", asyncRoute(async (_request, response) => {
  const result = await pool.query("select count(*)::int as count from users where email_verified = true");
  const verifiedUsers = result.rows[0].count;
  response.json({
    ok: true,
    verifiedUsers,
    foundersCap: FOUNDERS_CAP,
    foundersSpotsLeft: Math.max(0, FOUNDERS_CAP - verifiedUsers),
  });
}));

app.post("/api/auth/register", rateLimit("register", 10, 15 * 60 * 1000), asyncRoute(async (request, response) => {
  const email = cleanText(request.body.email, "", 180).toLowerCase();
  const password = String(request.body.password || "");
  const name = cleanText(request.body.name, "", 120) || email.split("@")[0] || "Usuária";

  if (!isValidEmail(email) || password.length < 6) {
    response.status(400).json({ ok: false, error: "Informe um e-mail válido e uma senha com pelo menos 6 caracteres." });
    return;
  }

  const existing = await pool.query("select id, email_verified as \"emailVerified\" from users where email = $1", [email]);
  const existingUser = existing.rows[0];

  if (existingUser?.emailVerified) {
    response.status(409).json({ ok: false, error: "Já existe uma conta com esse e-mail." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let userId;

  if (existingUser) {
    userId = existingUser.id;
    await pool.query("update users set password_hash = $1 where id = $2", [passwordHash, userId]);
  } else {
    const userResult = await pool.query(
      "insert into users (email, password_hash) values ($1, $2) returning id",
      [email, passwordHash]
    );
    userId = userResult.rows[0].id;

    await pool.query(
      `insert into profiles (id, name, email, goal)
       values ($1, $2, $3, $4)`,
      [userId, name, email, "Entender padrões do ciclo"]
    );
  }

  await issueVerificationCode(userId, email);
  response.status(201).json({ ok: true, pendingVerification: true, email });
}));

app.post("/api/auth/verify-email", rateLimit("verify-email", 10, 10 * 60 * 1000), asyncRoute(async (request, response) => {
  const email = cleanText(request.body.email, "", 180).toLowerCase();
  const code = cleanText(request.body.code, "", 6);

  if (!/^\d{6}$/.test(code)) {
    response.status(400).json({ ok: false, error: "Código inválido." });
    return;
  }

  const userResult = await pool.query("select id from users where email = $1", [email]);
  const user = userResult.rows[0];
  if (!user) {
    response.status(400).json({ ok: false, error: "Código inválido ou expirado." });
    return;
  }

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const codeResult = await pool.query(
    `select id from email_verification_codes
      where user_id = $1 and code_hash = $2 and used_at is null and expires_at > now()`,
    [user.id, codeHash]
  );

  if (!codeResult.rows.length) {
    response.status(400).json({ ok: false, error: "Código inválido ou expirado." });
    return;
  }

  await pool.query("update email_verification_codes set used_at = now() where id = $1", [codeResult.rows[0].id]);
  await pool.query("update users set email_verified = true where id = $1", [user.id]);

  sendMetaConversionEvent("CompleteRegistration", request, { email });

  const profileResult = await pool.query(
    `select id, name, email, goal, photo_data_url as "photoDataUrl",
            cycle_length as "cycleLength", period_length as "periodLength", last_period_start as "lastPeriodStart",
            last_backup_at as "lastBackupAt",
            lipedema_stage as "lipedemaStage", lipedema_type as "lipedemaType",
            garment_compression_class as "garmentCompressionClass", garment_last_replaced_at as "garmentLastReplacedAt",
            reminder_daily_enabled as "reminderDailyEnabled", reminder_time as "reminderTime",
            reminder_cycle_alert_enabled as "reminderCycleAlertEnabled", reminder_weekly_insight_enabled as "reminderWeeklyInsightEnabled",
            height_cm as "heightCm",
            updated_at as "updatedAt"
       from profiles where id = $1`,
    [user.id]
  );

  setSessionCookie(response, user.id);
  response.json({ ok: true, profile: profileResult.rows[0] });
}));

app.post("/api/auth/resend-code", rateLimit("resend-code", 5, 15 * 60 * 1000), asyncRoute(async (request, response) => {
  const email = cleanText(request.body.email, "", 180).toLowerCase();
  const userResult = await pool.query(
    "select id from users where email = $1 and email_verified = false",
    [email]
  );

  if (userResult.rows.length) {
    await issueVerificationCode(userResult.rows[0].id, email);
  }

  response.json({ ok: true, message: "Se houver um cadastro pendente para esse e-mail, reenviamos o código." });
}));

app.post("/api/auth/login", rateLimit("login", 10, 15 * 60 * 1000), asyncRoute(async (request, response) => {
  const email = cleanText(request.body.email, "", 180).toLowerCase();
  const password = String(request.body.password || "");

  const result = await pool.query("select id, password_hash from users where email = $1", [email]);
  const user = result.rows[0];
  const valid = user && (await bcrypt.compare(password, user.password_hash));

  if (!valid) {
    response.status(401).json({ ok: false, error: "E-mail ou senha incorretos." });
    return;
  }

  setSessionCookie(response, user.id);
  response.json({ ok: true });
}));

app.post("/api/auth/logout", (_request, response) => {
  response.clearCookie(sessionCookieName);
  response.json({ ok: true });
});

app.get("/api/auth/me", asyncRoute(async (request, response) => {
  const userId = readSessionUserId(request);
  if (!userId) {
    response.json({ ok: true, authenticated: false });
    return;
  }

  const result = await pool.query(
    `select id, name, email, goal, photo_data_url as "photoDataUrl",
            cycle_length as "cycleLength", period_length as "periodLength", last_period_start as "lastPeriodStart",
            last_backup_at as "lastBackupAt",
            lipedema_stage as "lipedemaStage", lipedema_type as "lipedemaType",
            garment_compression_class as "garmentCompressionClass", garment_last_replaced_at as "garmentLastReplacedAt",
            reminder_daily_enabled as "reminderDailyEnabled", reminder_time as "reminderTime",
            reminder_cycle_alert_enabled as "reminderCycleAlertEnabled", reminder_weekly_insight_enabled as "reminderWeeklyInsightEnabled",
            height_cm as "heightCm",
            updated_at as "updatedAt"
       from profiles where id = $1`,
    [userId]
  );

  if (!result.rows.length) {
    response.clearCookie(sessionCookieName);
    response.json({ ok: true, authenticated: false });
    return;
  }

  response.json({ ok: true, authenticated: true, profile: result.rows[0] });
}));

app.post("/api/auth/forgot-password", rateLimit("forgot-password", 5, 15 * 60 * 1000), asyncRoute(async (request, response) => {
  const email = cleanText(request.body.email, "", 180).toLowerCase();
  const result = await pool.query("select id from users where email = $1", [email]);
  const user = result.rows[0];

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + resetTokenTtlMs);

    await pool.query(
      "insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)",
      [user.id, tokenHash, expiresAt]
    );

    const baseUrl = process.env.APP_URL || `${request.protocol}://${request.get("host")}`;
    const resetUrl = `${baseUrl}/?resetToken=${token}`;
    await sendResetEmail(email, resetUrl);
  }

  response.json({ ok: true, message: "Se esse e-mail existir, enviamos um link de recuperação." });
}));

app.post("/api/auth/reset-password", rateLimit("reset-password", 10, 15 * 60 * 1000), asyncRoute(async (request, response) => {
  const token = String(request.body.token || "");
  const password = String(request.body.password || "");

  if (!token || password.length < 6) {
    response.status(400).json({ ok: false, error: "Informe uma senha com pelo menos 6 caracteres." });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const result = await pool.query(
    `select id, user_id as "userId" from password_reset_tokens
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [tokenHash]
  );
  const row = result.rows[0];

  if (!row) {
    response.status(400).json({ ok: false, error: "Link inválido ou expirado. Peça a recuperação de novo." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query("update users set password_hash = $1 where id = $2", [passwordHash, row.userId]);
  await pool.query("update password_reset_tokens set used_at = now() where id = $1", [row.id]);

  response.json({ ok: true });
}));

app.get("/api/bootstrap", requireAuth, asyncRoute(async (request, response) => {
  const [profile, records, photos] = await Promise.all([
    pool.query(
      `select id, name, email, goal, photo_data_url as "photoDataUrl",
            cycle_length as "cycleLength", period_length as "periodLength", last_period_start as "lastPeriodStart",
            last_backup_at as "lastBackupAt",
            lipedema_stage as "lipedemaStage", lipedema_type as "lipedemaType",
            garment_compression_class as "garmentCompressionClass", garment_last_replaced_at as "garmentLastReplacedAt",
            reminder_daily_enabled as "reminderDailyEnabled", reminder_time as "reminderTime",
            reminder_cycle_alert_enabled as "reminderCycleAlertEnabled", reminder_weekly_insight_enabled as "reminderWeeklyInsightEnabled",
            height_cm as "heightCm",
            birthdate, sex, activity_level as "activityLevel",
            updated_at as "updatedAt"
         from profiles where id = $1`,
      [request.userId]
    ),
    pool.query(
      `select id, record_type as "recordType", payload, created_at as "createdAt"
         from records
        where profile_id = $1
        order by created_at desc
        limit 200`,
      [request.userId]
    ),
    latestPhotos(request.userId),
  ]);

  response.json({
    profile: profile.rows[0] || null,
    records: records.rows,
    photos,
  });
}));

app.put("/api/profile", requireAuth, asyncRoute(async (request, response) => {
  const name = cleanText(request.body.name, "", 120);
  const email = cleanText(request.body.email, "", 180);
  const goal = cleanText(request.body.goal, "", 240);
  const photoDataUrl = cleanText(request.body.photoDataUrl, "", 20_000_000);

  const cycleLengthRaw = Number(request.body.cycleLength);
  const periodLengthRaw = Number(request.body.periodLength);
  const cycleLength = Number.isFinite(cycleLengthRaw) ? Math.max(15, Math.min(60, Math.round(cycleLengthRaw))) : null;
  const periodLength = Number.isFinite(periodLengthRaw) ? Math.max(1, Math.min(15, Math.round(periodLengthRaw))) : null;

  let lastPeriodStart = null;
  if (typeof request.body.lastPeriodStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.body.lastPeriodStart)) {
    const parsed = new Date(`${request.body.lastPeriodStart}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) {
      lastPeriodStart = request.body.lastPeriodStart;
    }
  }

  const validStages = ["1", "2", "3"];
  const lipedemaStage = validStages.includes(request.body.lipedemaStage) ? request.body.lipedemaStage : null;

  const validTypes = ["I", "II", "III", "IV", "V"];
  const lipedemaType = validTypes.includes(request.body.lipedemaType) ? request.body.lipedemaType : null;

  const validCompressionClasses = ["15-20 mmHg", "20-30 mmHg", "30-40 mmHg", "40-50 mmHg"];
  const garmentCompressionClass = validCompressionClasses.includes(request.body.garmentCompressionClass)
    ? request.body.garmentCompressionClass
    : null;

  let garmentLastReplacedAt = null;
  if (typeof request.body.garmentLastReplacedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.body.garmentLastReplacedAt)) {
    const parsed = new Date(`${request.body.garmentLastReplacedAt}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.getTime() <= Date.now()) {
      garmentLastReplacedAt = request.body.garmentLastReplacedAt;
    }
  }

  const reminderDailyEnabled = typeof request.body.reminderDailyEnabled === "boolean" ? request.body.reminderDailyEnabled : null;
  const reminderCycleAlertEnabled = typeof request.body.reminderCycleAlertEnabled === "boolean" ? request.body.reminderCycleAlertEnabled : null;
  const reminderWeeklyInsightEnabled = typeof request.body.reminderWeeklyInsightEnabled === "boolean" ? request.body.reminderWeeklyInsightEnabled : null;

  let reminderTime = null;
  if (typeof request.body.reminderTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(request.body.reminderTime)) {
    reminderTime = request.body.reminderTime;
  }

  const heightRaw = Number(request.body.heightCm);
  const heightCm = Number.isFinite(heightRaw) ? Math.max(100, Math.min(230, Math.round(heightRaw))) : null;

  let birthdate = null;
  if (typeof request.body.birthdate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(request.body.birthdate)) {
    const parsed = new Date(`${request.body.birthdate}T00:00:00Z`);
    const ageMs = Date.now() - parsed.getTime();
    const ageYears = ageMs / (365.25 * 86_400_000);
    if (!Number.isNaN(parsed.getTime()) && ageYears >= 10 && ageYears <= 100) {
      birthdate = request.body.birthdate;
    }
  }

  const validSexes = ["female", "male"];
  const sex = validSexes.includes(request.body.sex) ? request.body.sex : null;

  const validActivityLevels = ["sedentary", "light", "moderate", "active", "very_active"];
  const activityLevel = validActivityLevels.includes(request.body.activityLevel) ? request.body.activityLevel : null;

  const result = await pool.query(
    `update profiles set
       name = coalesce(nullif($2, ''), name),
       email = coalesce(nullif($3, ''), email),
       goal = coalesce(nullif($4, ''), goal),
       photo_data_url = coalesce(nullif($5, ''), photo_data_url),
       cycle_length = coalesce($6, cycle_length),
       period_length = coalesce($7, period_length),
       last_period_start = coalesce($8, last_period_start),
       lipedema_stage = coalesce($9, lipedema_stage),
       lipedema_type = coalesce($10, lipedema_type),
       garment_compression_class = coalesce($11, garment_compression_class),
       garment_last_replaced_at = coalesce($12, garment_last_replaced_at),
       reminder_daily_enabled = coalesce($13, reminder_daily_enabled),
       reminder_time = coalesce($14, reminder_time),
       reminder_cycle_alert_enabled = coalesce($15, reminder_cycle_alert_enabled),
       reminder_weekly_insight_enabled = coalesce($16, reminder_weekly_insight_enabled),
       height_cm = coalesce($17, height_cm),
       birthdate = coalesce($18, birthdate),
       sex = coalesce($19, sex),
       activity_level = coalesce($20, activity_level),
       updated_at = now()
     where id = $1
     returning id, name, email, goal, photo_data_url as "photoDataUrl",
               cycle_length as "cycleLength", period_length as "periodLength", last_period_start as "lastPeriodStart",
               last_backup_at as "lastBackupAt",
               lipedema_stage as "lipedemaStage", lipedema_type as "lipedemaType",
               garment_compression_class as "garmentCompressionClass", garment_last_replaced_at as "garmentLastReplacedAt",
            reminder_daily_enabled as "reminderDailyEnabled", reminder_time as "reminderTime",
            reminder_cycle_alert_enabled as "reminderCycleAlertEnabled", reminder_weekly_insight_enabled as "reminderWeeklyInsightEnabled",
            height_cm as "heightCm",
            birthdate, sex, activity_level as "activityLevel",
               updated_at as "updatedAt"`,
    [
      request.userId, name, email, goal, photoDataUrl, cycleLength, periodLength, lastPeriodStart,
      lipedemaStage, lipedemaType, garmentCompressionClass, garmentLastReplacedAt,
      reminderDailyEnabled, reminderTime, reminderCycleAlertEnabled, reminderWeeklyInsightEnabled,
      heightCm, birthdate, sex, activityLevel,
    ]
  );

  response.json({ ok: true, profile: result.rows[0] });
}));

app.post("/api/auth/change-password", requireAuth, rateLimit("change-password", 10, 15 * 60 * 1000), asyncRoute(async (request, response) => {
  const currentPassword = String(request.body.currentPassword || "");
  const newPassword = String(request.body.newPassword || "");

  if (newPassword.length < 6) {
    response.status(400).json({ ok: false, error: "A nova senha precisa ter pelo menos 6 caracteres." });
    return;
  }

  const result = await pool.query("select password_hash from users where id = $1", [request.userId]);
  const user = result.rows[0];
  const valid = user && (await bcrypt.compare(currentPassword, user.password_hash));

  if (!valid) {
    response.status(401).json({ ok: false, error: "Senha atual incorreta." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query("update users set password_hash = $1 where id = $2", [passwordHash, request.userId]);

  response.json({ ok: true });
}));

app.delete("/api/account", requireAuth, rateLimit("delete-account", 10, 15 * 60 * 1000), asyncRoute(async (request, response) => {
  const password = String(request.body.password || "");

  const result = await pool.query("select password_hash from users where id = $1", [request.userId]);
  const user = result.rows[0];
  const valid = user && (await bcrypt.compare(password, user.password_hash));

  if (!valid) {
    response.status(401).json({ ok: false, error: "Senha incorreta." });
    return;
  }

  await pool.query("delete from users where id = $1", [request.userId]);
  response.clearCookie(sessionCookieName);
  response.json({ ok: true });
}));

app.post("/api/backup", requireAuth, asyncRoute(async (request, response) => {
  const result = await pool.query(
    `update profiles set last_backup_at = now() where id = $1
     returning last_backup_at as "lastBackupAt"`,
    [request.userId]
  );

  response.json({ ok: true, lastBackupAt: result.rows[0]?.lastBackupAt });
}));

app.post("/api/records", requireAuth, asyncRoute(async (request, response) => {
  const recordType = cleanText(request.body.recordType, "registro", 80);
  const payload = cleanPayload(request.body.payload);

  const result = await pool.query(
    `insert into records (profile_id, record_type, payload)
     values ($1, $2, $3)
     returning id, record_type as "recordType", payload, created_at as "createdAt"`,
    [request.userId, recordType, payload]
  );

  response.status(201).json({ ok: true, record: result.rows[0] });
}));

app.get("/api/records", requireAuth, asyncRoute(async (request, response) => {
  const limit = Math.min(Number(request.query.limit || 50), 200);
  const result = await pool.query(
    `select id, record_type as "recordType", payload, created_at as "createdAt"
       from records
      where profile_id = $1
      order by created_at desc
      limit $2`,
    [request.userId, limit]
  );

  response.json({ ok: true, records: result.rows });
}));

app.delete("/api/records/:id", requireAuth, asyncRoute(async (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) {
    response.status(400).json({ ok: false, error: "Registro inválido." });
    return;
  }

  const result = await pool.query(
    "delete from records where id = $1 and profile_id = $2 returning id",
    [id, request.userId]
  );

  if (!result.rows.length) {
    response.status(404).json({ ok: false, error: "Registro não encontrado." });
    return;
  }

  response.json({ ok: true });
}));

app.post("/api/photos", requireAuth, asyncRoute(async (request, response) => {
  const slot = cleanText(request.body.slot, "", 40);
  const imageDataUrl = cleanText(request.body.imageDataUrl, "", 20_000_000);
  const notes = cleanText(request.body.notes, "", 1000);

  if (!slot || !imageDataUrl.startsWith("data:image/")) {
    response.status(400).json({ ok: false, error: "Foto inválida." });
    return;
  }

  const result = await pool.query(
    `insert into photos (profile_id, slot, image_data_url, notes)
     values ($1, $2, $3, $4)
     returning id, slot, image_data_url as "imageDataUrl", notes, created_at as "createdAt"`,
    [request.userId, slot, imageDataUrl, notes]
  );

  response.status(201).json({ ok: true, photo: result.rows[0] });
}));

app.post("/api/food-scan", requireAuth, rateLimit("food-scan", 20, 15 * 60 * 1000), asyncRoute(async (request, response) => {
  const imageDataUrl = cleanText(request.body.imageDataUrl, "", 20_000_000);

  if (!imageDataUrl.startsWith("data:image/")) {
    response.status(400).json({ ok: false, error: "Foto inválida." });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    response.status(503).json({ ok: false, error: "Scanner de alimentos ainda não está configurado neste servidor." });
    return;
  }

  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você identifica alimentos em fotos de refeições para um app de saúde. Responda APENAS com JSON no formato " +
            '{"items":[{"name":"string em português","portion":"string curta descrevendo a porção vista","estimatedCalories":number,"proteinG":number,"carbsG":number,"fatG":number}]}. ' +
            "Se não conseguir identificar nenhum alimento com confiança razoável, responda com {\"items\":[]}. " +
            "As calorias e os macronutrientes (proteína, carboidrato e gordura em gramas) são estimativas visuais aproximadas, deixe isso implícito sendo conservadora.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Identifique os alimentos nesta foto e estime a porção e as calorias de cada um." },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: 700,
    }),
  });

  if (!aiResponse.ok) {
    const errorBody = await aiResponse.text().catch(() => "");
    console.error("Falha na API de visão:", aiResponse.status, errorBody);
    response.status(502).json({ ok: false, error: "Não foi possível analisar a foto agora. Tente novamente em instantes." });
    return;
  }

  const aiData = await aiResponse.json();
  let parsed;
  try {
    parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
  } catch (error) {
    parsed = { items: [] };
  }

  const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 8) : [];
  const results = items.map((item) => {
    const name = cleanText(item?.name, "", 120);
    const match = matchFoodInGuide(name);
    return {
      name,
      portion: cleanText(item?.portion, "", 120),
      estimatedCalories: Number.isFinite(Number(item?.estimatedCalories)) ? Math.round(Number(item.estimatedCalories)) : null,
      proteinG: Number.isFinite(Number(item?.proteinG)) ? Math.round(Number(item.proteinG)) : null,
      carbsG: Number.isFinite(Number(item?.carbsG)) ? Math.round(Number(item.carbsG)) : null,
      fatG: Number.isFinite(Number(item?.fatG)) ? Math.round(Number(item.fatG)) : null,
      match,
    };
  });

  const totalCalories = results.reduce((total, item) => total + (item.estimatedCalories || 0), 0);
  const totalProtein = results.reduce((total, item) => total + (item.proteinG || 0), 0);
  const totalCarbs = results.reduce((total, item) => total + (item.carbsG || 0), 0);
  const totalFat = results.reduce((total, item) => total + (item.fatG || 0), 0);

  const validMealSlots = ["breakfast", "lunch", "dinner", "snack"];
  const mealSlot = validMealSlots.includes(request.body.mealSlot) ? request.body.mealSlot : null;

  const payload = { items: results, totalCalories, totalProtein, totalCarbs, totalFat, mealSlot };

  const record = await pool.query(
    `insert into records (profile_id, record_type, payload)
     values ($1, 'save-food-scan', $2)
     returning id, record_type as "recordType", payload, created_at as "createdAt"`,
    [request.userId, JSON.stringify(payload)]
  );

  response.json({ ok: true, ...payload, record: record.rows[0] });
}));

app.post("/api/diet-plan", requireAuth, rateLimit("diet-plan", 5, 60 * 60 * 1000), asyncRoute(async (request, response) => {
  if (!process.env.OPENAI_API_KEY) {
    response.status(503).json({ ok: false, error: "Gerador de plano ainda não está configurado neste servidor." });
    return;
  }

  const goodList = antiInflammatoryFoodGuide.good.map((entry) => entry.name).join(", ");
  const avoidList = antiInflammatoryFoodGuide.avoid.map((entry) => entry.name).join(", ");

  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você monta um plano alimentar anti-inflamatório de 21 dias para uma pessoa com lipedema, para uso geral (não é uma prescrição individual). " +
            `Priorize estes grupos de alimentos: ${goodList}. Evite ou reduza estes: ${avoidList}. ` +
            'Responda APENAS com JSON no formato {"days":[{"day":1,"breakfast":"string curta","lunch":"string curta","snack":"string curta","dinner":"string curta"}]}, com exatamente 21 itens no array "days", numerados de 1 a 21. ' +
            "Cada refeição deve ser uma sugestão curta (uma frase, sem receita detalhada), variando ao longo dos 21 dias.",
        },
        {
          role: "user",
          content: "Gere o plano alimentar anti-inflamatório de 21 dias.",
        },
      ],
      max_tokens: 2500,
    }),
  });

  if (!aiResponse.ok) {
    const errorBody = await aiResponse.text().catch(() => "");
    console.error("Falha ao gerar plano de dieta:", aiResponse.status, errorBody);
    response.status(502).json({ ok: false, error: "Não foi possível gerar o plano agora. Tente novamente em instantes." });
    return;
  }

  const aiData = await aiResponse.json();
  let parsed;
  try {
    parsed = JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
  } catch (error) {
    parsed = { days: [] };
  }

  const rawDays = Array.isArray(parsed.days) ? parsed.days.slice(0, 21) : [];
  const days = rawDays.map((entry, index) => ({
    day: index + 1,
    breakfast: cleanText(entry?.breakfast, "", 200),
    lunch: cleanText(entry?.lunch, "", 200),
    snack: cleanText(entry?.snack, "", 200),
    dinner: cleanText(entry?.dinner, "", 200),
  }));

  if (days.length < 21) {
    response.status(502).json({ ok: false, error: "O plano veio incompleto. Tente gerar novamente." });
    return;
  }

  const payload = { days, generatedAt: new Date().toISOString() };

  const record = await pool.query(
    `insert into records (profile_id, record_type, payload)
     values ($1, 'diet-plan', $2)
     returning id, record_type as "recordType", payload, created_at as "createdAt"`,
    [request.userId, JSON.stringify(payload)]
  );

  response.json({ ok: true, ...payload, record: record.rows[0] });
}));

app.get("/api/photos/latest", requireAuth, asyncRoute(async (request, response) => {
  response.json({ ok: true, photos: await latestPhotos(request.userId) });
}));

app.get("/api/photos/history", requireAuth, asyncRoute(async (request, response) => {
  const slot = cleanText(request.query.slot, "", 40);
  if (!slot) {
    response.status(400).json({ ok: false, error: "Informe o ângulo (slot)." });
    return;
  }

  const result = await pool.query(
    `select id, slot, image_data_url as "imageDataUrl", notes, created_at as "createdAt"
       from photos
      where profile_id = $1 and slot = $2
      order by created_at desc
      limit 30`,
    [request.userId, slot]
  );

  response.json({ ok: true, photos: result.rows });
}));

const marketingHosts = new Set(["radarlipedema.com.br", "www.radarlipedema.com.br"]);

function isMarketingHost(request) {
  return marketingHosts.has(request.hostname);
}

app.get("/", (request, response) => {
  response.sendFile(path.join(publicDir, isMarketingHost(request) ? "landing.html" : "index.html"));
});

app.use(express.static(publicDir, {
  extensions: ["html"],
  setHeaders(response, filePath) {
    if (filePath.endsWith(".html")) {
      response.setHeader("Cache-Control", "no-cache");
    }
  },
}));

app.get("*", (request, response) => {
  response.sendFile(path.join(publicDir, isMarketingHost(request) ? "landing.html" : "index.html"));
});

app.use((error, _request, response, _next) => {
  console.error("Erro na API:", error);
  response.status(500).json({ ok: false, error: "Erro interno do servidor." });
});

ensureDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Radar Lipedema rodando na porta ${port}`);
    });
    startReminderScheduler();
  })
  .catch((error) => {
    console.error("Erro ao iniciar servidor:", error);
    process.exit(1);
  });
