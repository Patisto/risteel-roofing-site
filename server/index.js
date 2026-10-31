import 'dotenv/config';
import express from 'express';
import pg from 'pg';
import multer from 'multer';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(root, 'uploads'));
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) });
const collections = {
  services: { table: 'services', fields: ['title','summary','description','image_url','sort_order','active'] },
  projects: { table: 'projects', fields: ['title','category','description','image_url','sort_order','active'] },
  gallery: { table: 'gallery_items', fields: ['title','image_url','alt_text','sort_order','active'] },
  testimonials: { table: 'testimonials', fields: ['quote','author','location','sort_order','active'] },
};



async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), hero_video_url text NOT NULL DEFAULT 'https://accreditedroofing.co.nz/wp-content/uploads/2026/08/hero-loop-1280.mp4', updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS services (id bigserial PRIMARY KEY, title text NOT NULL, summary text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS projects (id bigserial PRIMARY KEY, title text NOT NULL, category text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS gallery_items (id bigserial PRIMARY KEY, title text NOT NULL DEFAULT '', image_url text NOT NULL, alt_text text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS testimonials (id bigserial PRIMARY KEY, quote text NOT NULL, author text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS messages (id bigserial PRIMARY KEY, name text NOT NULL, email text NOT NULL, phone text NOT NULL DEFAULT '', service text NOT NULL DEFAULT '', message text NOT NULL, read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
  `);
  await pool.query("INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING");
  const seeds = [
    ['services', ['Steel Truss Installation','Iron Sheet Installation','Steel Window Fabrication','Electrical Installation','Plumbing Services'], ['Engineered structures for durable roof frames.','Careful fitting for a clean, weather-ready finish.','Custom steel frames made to your project.','Electrical installation for homes and businesses.','Plumbing installation and repair.'], ['Engineered steel trusses for strong, long-lasting roof structures on homes and commercial buildings.','Precision iron sheet roofing that stands up to Malawi’s rains and sun, fitted for a clean, tight finish.','Custom-fabricated steel window frames built to your dimensions, security needs and design.','Electrical wiring and fittings for residential and commercial properties.','Reliable plumbing installation and repair, from new builds to existing systems.'], ['service1.png','service2.png','service3.png','service4.png','service5.png']],
    ['projects', ['Roofing & construction','Steel truss installation','Steelwork & fabrication','Building services'], ['Roofing','Roof structures','Fabrication','Building services'], ['Roofing installation for homes and commercial buildings.','Measured steel structures for roof projects.','Custom fabrication and finishing for building projects.','Supporting services for residential and commercial properties.'], ['image1.jpg','image2.jpg','image4.jpg','image6.jpg']],
    ['gallery', ['Roofing & construction','Team on site','Roof structures','Building services','Roofing work','Steelwork & fabrication'], ['', '', '', '', '', ''], ['', '', '', '', '', ''], ['image1.jpg','image2.jpg','image4.jpg','image6.jpg','poster.jpg','background.jpg']],
    ['testimonials', ['The team delivered a strong, clean roof and kept us informed at every stage.','Professional workmanship, clear quotation and a finish that exceeded expectations.','From measurement to handover, R & I Steel made the project feel straightforward.'], ['Homeowner','Commercial client','Property owner'], ['Blantyre','Malawi','Zomba'], ['', '', '']],
  ];
  for (const [table, titles, summaries, descriptions, images] of seeds) {
    const seedTable = table === 'gallery' ? 'gallery_items' : table;
    const count = await pool.query(`SELECT count(*)::int AS n FROM ${seedTable}`);
    if (count.rows[0].n) continue;
    for (let i = 0; i < titles.length; i++) {
      const fields = table === 'services' ? [titles[i], summaries[i], descriptions[i], `assets/risteel/${images[i]}`, i] : table === 'projects' ? [titles[i], summaries[i], descriptions[i], `assets/risteel/${images[i]}`, i] : table === 'gallery' ? [titles[i], `assets/risteel/${images[i]}`, titles[i], i] : [titles[i], summaries[i], descriptions[i], i];
      const cols = table === 'services' ? 'title,summary,description,image_url,sort_order' : table === 'projects' ? 'title,category,description,image_url,sort_order' : table === 'gallery' ? 'title,image_url,alt_text,sort_order' : 'quote,author,location,sort_order';
      const placeholders = fields.map((_, j) => `$${j + 1}`).join(',');
      await pool.query(`INSERT INTO ${table === 'gallery' ? 'gallery_items' : table} (${cols}) VALUES (${placeholders})`, fields);
    }
  }
}

function signToken(email) {
  const payload = Buffer.from(JSON.stringify({ sub: email, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.CMS_TOKEN_SECRET || '').update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !process.env.CMS_TOKEN_SECRET) return res.status(401).json({ error: 'Please sign in.' });
  const expected = crypto.createHmac('sha256', process.env.CMS_TOKEN_SECRET).update(payload).digest();
  let provided;
  try { provided = Buffer.from(signature, 'base64url'); } catch { return res.status(401).json({ error: 'Invalid session.' }); }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return res.status(401).json({ error: 'Invalid session.' });
  try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString()); if (data.exp < Date.now() || data.sub !== process.env.CMS_ADMIN_EMAIL) return res.status(401).json({ error: 'Session expired.' }); req.admin = data.sub; next(); } catch { return res.status(401).json({ error: 'Invalid session.' }); }
}
app.disable('x-powered-by');
app.use(cors({ origin: (process.env.CORS_ORIGIN || '').split(',').map(x=>x.trim()).filter(Boolean), credentials: false }));
app.use(express.json({ limit: '1mb' }));
await fs.mkdir(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '30d', immutable: true }));
app.use('/cms', express.static(path.join(root, 'cms')));
app.get('/cms', (_req,res)=>res.redirect('/cms/'));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/site', async (_req, res, next) => {
  try {
    const [settings, ...data] = await Promise.all([
      pool.query('SELECT hero_video_url FROM site_settings WHERE id=1'),
      pool.query('SELECT id,title,summary,description,image_url FROM services WHERE active=true ORDER BY sort_order,id'),
      pool.query('SELECT id,title,category,description,image_url FROM projects WHERE active=true ORDER BY sort_order,id'),
      pool.query('SELECT id,title,image_url,alt_text FROM gallery_items WHERE active=true ORDER BY sort_order,id'),
      pool.query('SELECT id,quote,author,location FROM testimonials WHERE active=true ORDER BY sort_order,id'),
    ]);
    res.json({ settings: settings.rows[0] || {}, services: data[0].rows, projects: data[1].rows, gallery: data[2].rows, testimonials: data[3].rows });
  } catch (e) { next(e); }
});
app.post('/api/contact', async (req, res, next) => {
  try {
    const { name, email, phone = '', service = '', message } = req.body || {};
    if (![name, email, message].every(v => typeof v === 'string' && v.trim()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please provide your name, a valid email and project details.' });
    await pool.query('INSERT INTO messages(name,email,phone,service,message) VALUES($1,$2,$3,$4,$5)', [name.trim(), email.trim(), String(phone).trim(), String(service).trim(), message.trim()]);
    res.status(201).json({ ok: true, message: 'Thanks. Your enquiry has been sent.' });
  } catch (e) { next(e); }
});
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!process.env.CMS_ADMIN_EMAIL || !process.env.CMS_ADMIN_PASSWORD || !process.env.CMS_TOKEN_SECRET) return res.status(503).json({ error: 'CMS admin credentials are not configured on the server.' });
  const a = Buffer.from(String(email || '')); const b = Buffer.from(process.env.CMS_ADMIN_EMAIL);
  const emailOk = a.length === b.length && crypto.timingSafeEqual(a, b);
  const p = Buffer.from(String(password || '')); const q = Buffer.from(process.env.CMS_ADMIN_PASSWORD);
  const passwordOk = p.length === q.length && crypto.timingSafeEqual(p, q);
  if (!emailOk || !passwordOk) return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ token: signToken(email) });
});
app.use('/api/admin', requireAdmin);
app.get('/api/admin/messages', async (_req, res, next) => { try { res.json((await pool.query('SELECT * FROM messages ORDER BY created_at DESC')).rows); } catch (e) { next(e); } });
app.patch('/api/admin/messages/:id', async (req, res, next) => { try { const { rows } = await pool.query('UPDATE messages SET read=$1 WHERE id=$2 RETURNING *', [Boolean(req.body.read), req.params.id]); if (!rows[0]) return res.sendStatus(404); res.json(rows[0]); } catch (e) { next(e); } });
app.delete('/api/admin/messages/:id', async (req, res, next) => { try { await pool.query('DELETE FROM messages WHERE id=$1', [req.params.id]); res.sendStatus(204); } catch (e) { next(e); } });
app.get('/api/admin/settings', async (_req, res, next) => { try { res.json((await pool.query('SELECT * FROM site_settings WHERE id=1')).rows[0]); } catch (e) { next(e); } });
app.put('/api/admin/settings', async (req, res, next) => { try { const url = String(req.body.hero_video_url || '').trim(); if (url && !/^https:\/\//i.test(url) && !/^assets\//.test(url)) return res.status(400).json({ error: 'Use an https:// URL or a local assets/ path.' }); const { rows } = await pool.query('UPDATE site_settings SET hero_video_url=$1,updated_at=now() WHERE id=1 RETURNING *', [url]); res.json(rows[0]); } catch (e) { next(e); } });
app.post('/api/admin/upload', upload.single('image'), async (req, res, next) => { try { if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, WEBP or GIF image.' }); const filename = `${randomUUID()}.webp`; await sharp(req.file.buffer).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(path.join(uploadDir, filename)); res.json({ url: `${publicBaseUrl}/uploads/${filename}` }); } catch (e) { next(e); } });
for (const [key, config] of Object.entries(collections)) {
  const table = config.table;
  app.get(`/api/admin/${key}`, async (_req, res, next) => { try { res.json((await pool.query(`SELECT * FROM ${table} ORDER BY sort_order,id`)).rows); } catch (e) { next(e); } });
  app.post(`/api/admin/${key}`, async (req, res, next) => { try { const data = Object.fromEntries(config.fields.filter(f => f in (req.body || {})).map(f => [f, req.body[f]])); if (!data.title && !data.quote) return res.status(400).json({ error: 'A title or testimonial quote is required.' }); const fields=Object.keys(data); const vals=fields.map(f=>data[f]); const {rows}=await pool.query(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,vals); res.status(201).json(rows[0]); } catch(e){next(e);} });
  app.put(`/api/admin/${key}/:id`, async (req, res, next) => { try { const data=Object.fromEntries(config.fields.filter(f=>f in (req.body||{})).map(f=>[f,req.body[f]])); const fields=Object.keys(data); if(!fields.length)return res.status(400).json({error:'No editable fields provided.'}); const vals=fields.map(f=>data[f]); const {rows}=await pool.query(`UPDATE ${table} SET ${fields.map((f,i)=>`${f}=$${i+1}`).join(',')} WHERE id=$${fields.length+1} RETURNING *`,[...vals,req.params.id]); if(!rows[0])return res.sendStatus(404); res.json(rows[0]);}catch(e){next(e);} });
  app.delete(`/api/admin/${key}/:id`, async (req,res,next)=>{try{const result=await pool.query(`DELETE FROM ${table} WHERE id=$1`,[req.params.id]);if(!result.rowCount)return res.sendStatus(404);res.sendStatus(204);}catch(e){next(e);}});
}
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error. Check the server logs.' }); });

const port = Number(process.env.PORT || 3000);
initialize().then(() => app.listen(port, () => console.log(`R&I site and CMS running at http://localhost:${port}`))).catch(err => { console.error('Database setup failed:', err); process.exit(1); });
