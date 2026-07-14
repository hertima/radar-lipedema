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
const port = Number(process.env.PORT || 3000);
const publicDir = __dirname;
const schemaPath = path.join(__dirname, "db", "schema.sql");
const jwtSecret = process.env.JWT_SECRET || "dev-only-insecure-secret-troque-isso";
const sessionCookieName = "session";
const sessionMaxAgeMs = 30 * 24 * 60 * 60 * 1000;
const resetTokenTtlMs = 30 * 60 * 1000;

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

app.post("/api/auth/register", asyncRoute(async (request, response) => {
  const email = cleanText(request.body.email, "", 180).toLowerCase();
  const password = String(request.body.password || "");
  const name = cleanText(request.body.name, "", 120) || email.split("@")[0] || "Usuária";

  if (!email.includes("@") || password.length < 6) {
    response.status(400).json({ ok: false, error: "Informe um e-mail válido e uma senha com pelo menos 6 caracteres." });
    return;
  }

  const existing = await pool.query("select id from users where email = $1", [email]);
  if (existing.rows.length) {
    response.status(409).json({ ok: false, error: "Já existe uma conta com esse e-mail." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userResult = await pool.query(
    "insert into users (email, password_hash) values ($1, $2) returning id",
    [email, passwordHash]
  );
  const userId = userResult.rows[0].id;

  const profileResult = await pool.query(
    `insert into profiles (id, name, email, goal)
     values ($1, $2, $3, $4)
     returning id, name, email, goal, photo_data_url as "photoDataUrl", updated_at as "updatedAt"`,
    [userId, name, email, "Entender padrões do ciclo"]
  );

  setSessionCookie(response, userId);
  response.status(201).json({ ok: true, profile: profileResult.rows[0] });
}));

app.post("/api/auth/login", asyncRoute(async (request, response) => {
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
    `select id, name, email, goal, photo_data_url as "photoDataUrl", updated_at as "updatedAt"
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

app.post("/api/auth/forgot-password", asyncRoute(async (request, response) => {
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

app.post("/api/auth/reset-password", asyncRoute(async (request, response) => {
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
      `select id, name, email, goal, photo_data_url as "photoDataUrl", updated_at as "updatedAt"
         from profiles where id = $1`,
      [request.userId]
    ),
    pool.query(
      `select id, record_type as "recordType", payload, created_at as "createdAt"
         from records
        where profile_id = $1
        order by created_at desc
        limit 20`,
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

  const result = await pool.query(
    `update profiles set
       name = coalesce(nullif($2, ''), name),
       email = coalesce(nullif($3, ''), email),
       goal = coalesce(nullif($4, ''), goal),
       photo_data_url = coalesce(nullif($5, ''), photo_data_url),
       updated_at = now()
     where id = $1
     returning id, name, email, goal, photo_data_url as "photoDataUrl", updated_at as "updatedAt"`,
    [request.userId, name, email, goal, photoDataUrl]
  );

  response.json({ ok: true, profile: result.rows[0] });
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
