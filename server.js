const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { Pool } = require("pg");

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

  const profileResult = await pool.query(
    `select id, name, email, goal, photo_data_url as "photoDataUrl",
            cycle_length as "cycleLength", period_length as "periodLength", last_period_start as "lastPeriodStart",
            last_backup_at as "lastBackupAt",
            lipedema_stage as "lipedemaStage", lipedema_type as "lipedemaType",
            garment_compression_class as "garmentCompressionClass", garment_last_replaced_at as "garmentLastReplacedAt",
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
       updated_at = now()
     where id = $1
     returning id, name, email, goal, photo_data_url as "photoDataUrl",
               cycle_length as "cycleLength", period_length as "periodLength", last_period_start as "lastPeriodStart",
               last_backup_at as "lastBackupAt",
               lipedema_stage as "lipedemaStage", lipedema_type as "lipedemaType",
               garment_compression_class as "garmentCompressionClass", garment_last_replaced_at as "garmentLastReplacedAt",
               updated_at as "updatedAt"`,
    [request.userId, name, email, goal, photoDataUrl, cycleLength, periodLength, lastPeriodStart, lipedemaStage, lipedemaType, garmentCompressionClass, garmentLastReplacedAt]
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

app.get("/api/photos/latest", requireAuth, asyncRoute(async (request, response) => {
  response.json({ ok: true, photos: await latestPhotos(request.userId) });
}));

app.use(express.static(publicDir, {
  extensions: ["html"],
  setHeaders(response, filePath) {
    if (filePath.endsWith(".html")) {
      response.setHeader("Cache-Control", "no-cache");
    }
  },
}));

app.get("*", (_request, response) => {
  response.sendFile(path.join(publicDir, "index.html"));
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
  })
  .catch((error) => {
    console.error("Erro ao iniciar servidor:", error);
    process.exit(1);
  });
