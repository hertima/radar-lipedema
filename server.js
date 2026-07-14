const fs = require("fs");
const path = require("path");
const express = require("express");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 3000);
const profileId = "default";
const publicDir = __dirname;
const schemaPath = path.join(__dirname, "db", "schema.sql");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.PGHOST,
  port: process.env.PGPORT ? Number(process.env.PGPORT) : undefined,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : false,
});

app.disable("x-powered-by");
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
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
  await pool.query(
    `insert into profiles (id, name, email, goal)
     values ($1, $2, $3, $4)
     on conflict (id) do nothing`,
    [profileId, "Ana", "ana@email.com", "Entender padr\u00f5es do ciclo"]
  );
}

async function latestPhotos() {
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

app.get("/api/bootstrap", asyncRoute(async (_request, response) => {
  const [profile, records, photos] = await Promise.all([
    pool.query("select id, name, email, goal, photo_data_url as \"photoDataUrl\", updated_at as \"updatedAt\" from profiles where id = $1", [profileId]),
    pool.query(
      `select id, record_type as "recordType", payload, created_at as "createdAt"
         from records
        where profile_id = $1
        order by created_at desc
        limit 20`,
      [profileId]
    ),
    latestPhotos(),
  ]);

  response.json({
    profile: profile.rows[0] || null,
    records: records.rows,
    photos,
  });
}));

app.put("/api/profile", asyncRoute(async (request, response) => {
  const name = cleanText(request.body.name, "Ana", 120);
  const email = cleanText(request.body.email, "", 180);
  const goal = cleanText(request.body.goal, "", 240);
  const photoDataUrl = cleanText(request.body.photoDataUrl, "", 20_000_000);

  const result = await pool.query(
    `insert into profiles (id, name, email, goal, photo_data_url, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (id) do update set
       name = excluded.name,
       email = excluded.email,
       goal = excluded.goal,
       photo_data_url = coalesce(nullif(excluded.photo_data_url, ''), profiles.photo_data_url),
       updated_at = now()
     returning id, name, email, goal, photo_data_url as "photoDataUrl", updated_at as "updatedAt"`,
    [profileId, name, email, goal, photoDataUrl]
  );

  response.json({ ok: true, profile: result.rows[0] });
}));

app.post("/api/records", asyncRoute(async (request, response) => {
  const recordType = cleanText(request.body.recordType, "registro", 80);
  const payload = cleanPayload(request.body.payload);

  const result = await pool.query(
    `insert into records (profile_id, record_type, payload)
     values ($1, $2, $3)
     returning id, record_type as "recordType", payload, created_at as "createdAt"`,
    [profileId, recordType, payload]
  );

  response.status(201).json({ ok: true, record: result.rows[0] });
}));

app.get("/api/records", asyncRoute(async (request, response) => {
  const limit = Math.min(Number(request.query.limit || 50), 200);
  const result = await pool.query(
    `select id, record_type as "recordType", payload, created_at as "createdAt"
       from records
      where profile_id = $1
      order by created_at desc
      limit $2`,
    [profileId, limit]
  );

  response.json({ ok: true, records: result.rows });
}));

app.post("/api/photos", asyncRoute(async (request, response) => {
  const slot = cleanText(request.body.slot, "", 40);
  const imageDataUrl = cleanText(request.body.imageDataUrl, "", 20_000_000);
  const notes = cleanText(request.body.notes, "", 1000);

  if (!slot || !imageDataUrl.startsWith("data:image/")) {
    response.status(400).json({ ok: false, error: "Foto inv\u00e1lida." });
    return;
  }

  const result = await pool.query(
    `insert into photos (profile_id, slot, image_data_url, notes)
     values ($1, $2, $3, $4)
     returning id, slot, image_data_url as "imageDataUrl", notes, created_at as "createdAt"`,
    [profileId, slot, imageDataUrl, notes]
  );

  response.status(201).json({ ok: true, photo: result.rows[0] });
}));

app.get("/api/photos/latest", asyncRoute(async (_request, response) => {
  response.json({ ok: true, photos: await latestPhotos() });
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
