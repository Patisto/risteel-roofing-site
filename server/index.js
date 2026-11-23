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
  projects: { table: 'projects', fields: ['title','category','description','image_url','image_url_2','image_url_3','sort_order','active'] },
  gallery: { table: 'gallery_items', fields: ['title','image_url','alt_text','sort_order','active'] },
  testimonials: { table: 'testimonials', fields: ['quote','author','location','sort_order','active'] },
  blog: { table: 'blog_posts', fields: ['title','summary','content','image_url','sort_order','active'] },
  team: { table: 'team_members', fields: ['name','role','bio','image_url','sort_order','active'] },
};



async function initialize() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), hero_video_url text NOT NULL DEFAULT 'https://accreditedroofing.co.nz/wp-content/uploads/2026/08/hero-loop-1280.mp4', hero_image_url text NOT NULL DEFAULT 'assets/risteel/Rooftop Renovation Hero Banner.png', page_hero_about text NOT NULL DEFAULT 'assets/risteel/image4.jpg', page_hero_services text NOT NULL DEFAULT 'assets/risteel/image1.jpg', page_hero_projects text NOT NULL DEFAULT 'assets/risteel/image2.jpg', page_hero_gallery text NOT NULL DEFAULT 'assets/risteel/image4.jpg', page_hero_blog text NOT NULL DEFAULT 'assets/risteel/Rooftop Renovation Hero Banner.png', page_hero_contact text NOT NULL DEFAULT 'assets/risteel/image6.jpg', about_story_image text NOT NULL DEFAULT 'assets/risteel/image2.jpg', home_who_we_are_image text NOT NULL DEFAULT 'assets/risteel/image2.jpg', story_heading text NOT NULL DEFAULT 'A local team built on practical skill and honest work.', story_paragraph_1 text NOT NULL DEFAULT 'R & I Steel Roofing is a provider of steel roofing and fabrication solutions in Malawi. Our team works on steel roof trusses, iron sheet roofing, custom steel windows, electrical installations and plumbing.', story_paragraph_2 text NOT NULL DEFAULT 'From the first site measure through to handover, we aim to communicate clearly, specify materials up front and deliver careful workmanship.', updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS services (id bigserial PRIMARY KEY, title text NOT NULL, summary text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS projects (id bigserial PRIMARY KEY, title text NOT NULL, category text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS gallery_items (id bigserial PRIMARY KEY, title text NOT NULL DEFAULT '', image_url text NOT NULL, alt_text text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS testimonials (id bigserial PRIMARY KEY, quote text NOT NULL, author text NOT NULL DEFAULT '', location text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS blog_posts (id bigserial PRIMARY KEY, title text NOT NULL, summary text NOT NULL DEFAULT '', content text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS team_members (id bigserial PRIMARY KEY, name text NOT NULL, role text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '', image_url text NOT NULL DEFAULT '', sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS messages (id bigserial PRIMARY KEY, name text NOT NULL, email text NOT NULL, phone text NOT NULL DEFAULT '', service text NOT NULL DEFAULT '', message text NOT NULL, read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS blog_comments (id bigserial PRIMARY KEY, post_id bigint NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE, name text NOT NULL, comment text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE IF NOT EXISTS blog_likes (post_id bigint NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE, visitor_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(post_id,visitor_id));
  `);
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url_2 text NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url_3 text NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS hero_image_url text NOT NULL DEFAULT 'assets/risteel/Rooftop Renovation Hero Banner.png'");
  for (const [column, value] of Object.entries({ page_hero_about: 'assets/risteel/image4.jpg', page_hero_services: 'assets/risteel/image1.jpg', page_hero_projects: 'assets/risteel/image2.jpg', page_hero_gallery: 'assets/risteel/image4.jpg', page_hero_blog: 'assets/risteel/Rooftop Renovation Hero Banner.png', page_hero_contact: 'assets/risteel/image6.jpg', about_story_image: 'assets/risteel/image2.jpg', home_who_we_are_image: 'assets/risteel/image2.jpg', story_heading: 'A local team built on practical skill and honest work.', story_paragraph_1: 'R & I Steel Roofing is a provider of steel roofing and fabrication solutions in Malawi. Our team works on steel roof trusses, iron sheet roofing, custom steel windows, electrical installations and plumbing.', story_paragraph_2: 'From the first site measure through to handover, we aim to communicate clearly, specify materials up front and deliver careful workmanship.' })) {
    await pool.query(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS ${column} text NOT NULL DEFAULT '${value.replaceAll("'", "''")}'`);
  }
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
  const blogCount = await pool.query('SELECT count(*)::int AS n FROM blog_posts');
  if (!blogCount.rows[0].n) {
    await pool.query(
      'INSERT INTO blog_posts (title,summary,content,image_url,sort_order) VALUES ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)',
      [
        'Planning a roof that lasts',
        'The most useful decisions happen before installation begins.',
        'A good roof starts with a careful site measure, suitable materials and a clear installation plan. Taking time to understand the building and the weather conditions helps create a stronger, cleaner result.',
        'assets/risteel/Rooftop Renovation Hero Banner.png',
        0,
        'Why steel trusses are a smart foundation',
        'A strong roof structure supports everything that follows.',
        'Steel trusses provide a durable foundation for roofing projects and can be measured and fabricated to suit the building. Our team helps clients choose a practical approach for their home or business.',
        'assets/risteel/image2.jpg',
        1,
      ],
    );
  }
  const teamCount = await pool.query('SELECT count(*)::int AS n FROM team_members');
  if (!teamCount.rows[0].n) {
    await pool.query(
      'INSERT INTO team_members (name,role,bio,image_url,sort_order) VALUES ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10),($11,$12,$13,$14,$15)',
      [
        'Leadership Team',
        'Managing Director',
        'Guides the company’s work and helps keep every project focused on quality, clear communication and dependable service.',
        '',
        0,
        'Site Operations',
        'Head Foreman',
        'Coordinates site teams, checks workmanship and helps each installation move safely and smoothly from preparation to handover.',
        '',
        1,
        'Customer Support',
        'Customer Relations & Digital Marketing',
        'Supports clients with enquiries and project updates, and shares the team’s work with homes and businesses across Malawi.',
        '',
        2,
      ],
    );
  }
  const legacyTeam = await pool.query("SELECT count(*)::int AS n FROM team_members WHERE (name='R & I Steel Team' AND role='Roofing & fabrication specialists') OR (name='Project team' AND role='Site installation and support')");
  const totalTeam = await pool.query('SELECT count(*)::int AS n FROM team_members');
  if (legacyTeam.rows[0].n === 2 && totalTeam.rows[0].n === 2) {
    await pool.query("UPDATE team_members SET name='Leadership Team',role='Managing Director',bio='Guides the company’s work and helps keep every project focused on quality, clear communication and dependable service.',image_url='',sort_order=0 WHERE name='R & I Steel Team' AND role='Roofing & fabrication specialists'");
    await pool.query("UPDATE team_members SET name='Site Operations',role='Head Foreman',bio='Coordinates site teams, checks workmanship and helps each installation move safely and smoothly from preparation to handover.',image_url='',sort_order=1 WHERE name='Project team' AND role='Site installation and support'");
    await pool.query("INSERT INTO team_members(name,role,bio,image_url,sort_order) VALUES('Customer Support','Customer Relations & Digital Marketing','Supports clients with enquiries and project updates, and shares the team’s work with homes and businesses across Malawi.','',2)");
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
      pool.query('SELECT * FROM site_settings WHERE id=1'),
      pool.query('SELECT id,title,summary,description,image_url FROM services WHERE active=true ORDER BY sort_order,id'),
      pool.query('SELECT id,title,category,description,image_url,image_url_2,image_url_3 FROM projects WHERE active=true ORDER BY sort_order,id'),
      pool.query('SELECT id,title,image_url,alt_text FROM gallery_items WHERE active=true ORDER BY sort_order,id'),
      pool.query('SELECT id,quote,author,location FROM testimonials WHERE active=true ORDER BY sort_order,id'),
      pool.query('SELECT id,title,summary,content,image_url,created_at FROM blog_posts WHERE active=true ORDER BY sort_order,id,created_at DESC'),
      pool.query('SELECT id,name,role,bio,image_url FROM team_members WHERE active=true ORDER BY sort_order,id'),
    ]);
    const projectGallery=data[1].rows.flatMap(project=>[project.image_url,project.image_url_2,project.image_url_3].filter(Boolean).map((image_url,index)=>({id:`project-${project.id}-${index+1}`,title:project.title,image_url,alt_text:project.title,source:'project'})));
    res.json({ settings: settings.rows[0] || {}, services: data[0].rows, projects: data[1].rows, gallery: [...data[2].rows,...projectGallery], testimonials: data[3].rows, blog: data[4].rows, team: data[5].rows });
  } catch (e) { next(e); }
});
app.get('/share/blog/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id,title,summary,content,image_url FROM blog_posts WHERE id=$1 AND active=true', [req.params.id]);
    const post = rows[0];
    if (!post) return res.status(404).type('text').send('Blog post not found.');
    const siteUrl = 'https://risteelroofing.com';
    const articleUrl = `${siteUrl}/blog-post.html?id=${encodeURIComponent(post.id)}`;
    const apiOrigin = publicBaseUrl || `${req.protocol}://${req.get('host')}`;
    const imageUrl = /^https?:\/\//i.test(post.image_url) ? post.image_url
      : post.image_url.startsWith('/uploads/') ? `${apiOrigin}${post.image_url}`
      : post.image_url.startsWith('assets/') ? `${siteUrl}/${post.image_url.split('/').map(encodeURIComponent).join('/')}`
      : `${siteUrl}/assets/risteel/Rooftop%20Renovation%20Hero%20Banner.png`;
    const description = post.summary || String(post.content || '').replace(/\s+/g, ' ').slice(0, 220);
    const escapeAttribute = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeAttribute(post.title)} | R &amp; I Steel Roofing</title><meta name="description" content="${escapeAttribute(description)}"><link rel="canonical" href="${escapeAttribute(articleUrl)}"><meta property="og:type" content="article"><meta property="og:site_name" content="R &amp; I Steel Roofing"><meta property="og:title" content="${escapeAttribute(post.title)}"><meta property="og:description" content="${escapeAttribute(description)}"><meta property="og:url" content="${escapeAttribute(articleUrl)}"><meta property="og:image" content="${escapeAttribute(imageUrl)}"><meta property="og:image:alt" content="${escapeAttribute(post.title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escapeAttribute(post.title)}"><meta name="twitter:description" content="${escapeAttribute(description)}"><meta name="twitter:image" content="${escapeAttribute(imageUrl)}"><meta http-equiv="refresh" content="1;url=${escapeAttribute(articleUrl)}"></head><body><p>Opening article: <a href="${escapeAttribute(articleUrl)}">${escapeAttribute(post.title)}</a></p></body></html>`);
  } catch (e) { next(e); }
});
app.get('/api/blog/:id/comments', async (req,res,next)=>{try{const post=await pool.query('SELECT id FROM blog_posts WHERE id=$1 AND active=true',[req.params.id]);if(!post.rows[0])return res.sendStatus(404);const {rows}=await pool.query('SELECT id,name,comment,created_at FROM blog_comments WHERE post_id=$1 ORDER BY created_at DESC',[req.params.id]);res.json(rows)}catch(e){next(e)}});
app.post('/api/blog/:id/comments', async (req,res,next)=>{try{const {name,comment}=req.body||{};if(typeof name!=='string'||typeof comment!=='string'||!name.trim()||!comment.trim())return res.status(400).json({error:'Enter your name and comment.'});if(name.trim().length>100||comment.trim().length>3000)return res.status(400).json({error:'Name must be under 100 characters and comment under 3,000.'});const post=await pool.query('SELECT id FROM blog_posts WHERE id=$1 AND active=true',[req.params.id]);if(!post.rows[0])return res.sendStatus(404);const {rows}=await pool.query('INSERT INTO blog_comments(post_id,name,comment) VALUES($1,$2,$3) RETURNING id,name,comment,created_at',[req.params.id,name.trim(),comment.trim()]);res.status(201).json(rows[0])}catch(e){next(e)}});
app.get('/api/blog/:id/likes',async(req,res,next)=>{try{const post=await pool.query('SELECT id FROM blog_posts WHERE id=$1 AND active=true',[req.params.id]);if(!post.rows[0])return res.sendStatus(404);const {rows}=await pool.query('SELECT count(*)::int AS count FROM blog_likes WHERE post_id=$1',[req.params.id]);res.json(rows[0])}catch(e){next(e)}});
app.post('/api/blog/:id/likes',async(req,res,next)=>{try{const visitorId=String(req.body?.visitor_id||'');if(!/^[a-f0-9-]{36}$/i.test(visitorId))return res.status(400).json({error:'Invalid browser ID.'});const post=await pool.query('SELECT id FROM blog_posts WHERE id=$1 AND active=true',[req.params.id]);if(!post.rows[0])return res.sendStatus(404);const removed=await pool.query('DELETE FROM blog_likes WHERE post_id=$1 AND visitor_id=$2 RETURNING post_id',[req.params.id,visitorId]);const liked=!removed.rowCount;if(liked)await pool.query('INSERT INTO blog_likes(post_id,visitor_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.params.id,visitorId]);const {rows}=await pool.query('SELECT count(*)::int AS count FROM blog_likes WHERE post_id=$1',[req.params.id]);res.json({liked,count:rows[0].count})}catch(e){next(e)}});
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
app.get('/api/admin/comments', async (_req,res,next)=>{try{res.json((await pool.query('SELECT c.*,b.title AS post_title FROM blog_comments c JOIN blog_posts b ON b.id=c.post_id ORDER BY c.created_at DESC')).rows)}catch(e){next(e)}});
app.delete('/api/admin/comments/:id', async (req,res,next)=>{try{const result=await pool.query('DELETE FROM blog_comments WHERE id=$1',[req.params.id]);if(!result.rowCount)return res.sendStatus(404);res.sendStatus(204)}catch(e){next(e)}});
app.get('/api/admin/settings', async (_req, res, next) => { try { res.json((await pool.query('SELECT * FROM site_settings WHERE id=1')).rows[0]); } catch (e) { next(e); } });
app.put('/api/admin/settings', async (req, res, next) => {
  try {
    const videoUrl = String(req.body.hero_video_url || '').trim();
    const imageFields = ['hero_image_url','page_hero_about','page_hero_services','page_hero_projects','page_hero_gallery','page_hero_blog','page_hero_contact','about_story_image','home_who_we_are_image'];
    const textFields = ['story_heading','story_paragraph_1','story_paragraph_2'];
    const data = Object.fromEntries([...imageFields,...textFields].map(field => [field, String(req.body[field] ?? '').trim()]));
    if (videoUrl && !/^https:\/\//i.test(videoUrl) && !/^assets\//.test(videoUrl)) return res.status(400).json({ error: 'Use an https:// URL or a local assets/ path for the hero video.' });
    for (const field of imageFields) if (data[field] && !/^https?:\/\//i.test(data[field]) && !/^\/uploads\//.test(data[field]) && !/^assets\//.test(data[field])) return res.status(400).json({ error: `Use an image URL, an /uploads/ path or a local assets/ path for ${field.replaceAll('_',' ')}.` });
    const columns = ['hero_video_url', ...imageFields, ...textFields];
    const values = [videoUrl, ...imageFields.map(field=>data[field]), ...textFields.map(field=>data[field])];
    const { rows } = await pool.query(`UPDATE site_settings SET ${columns.map((field,index)=>`${field}=$${index+1}`).join(',')},updated_at=now() WHERE id=1 RETURNING *`, values);
    res.json(rows[0]);
  } catch (e) { next(e); }
});
app.post('/api/admin/upload', upload.single('image'), async (req, res, next) => { try { if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, WEBP or GIF image.' }); const filename = `${randomUUID()}.webp`; await sharp(req.file.buffer).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(path.join(uploadDir, filename)); res.json({ url: `${publicBaseUrl}/uploads/${filename}` }); } catch (e) { next(e); } });
for (const [key, config] of Object.entries(collections)) {
  const table = config.table;
  app.get(`/api/admin/${key}`, async (_req, res, next) => { try { res.json((await pool.query(`SELECT * FROM ${table} ORDER BY sort_order,id`)).rows); } catch (e) { next(e); } });
  app.post(`/api/admin/${key}`, async (req, res, next) => { try { const data = Object.fromEntries(config.fields.filter(f => f in (req.body || {})).map(f => [f, req.body[f]])); if (!data.title && !data.quote && !data.name) return res.status(400).json({ error: 'A title, name or testimonial quote is required.' }); const fields=Object.keys(data); const vals=fields.map(f=>data[f]); const {rows}=await pool.query(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,vals); res.status(201).json(rows[0]); } catch(e){next(e);} });
  app.put(`/api/admin/${key}/:id`, async (req, res, next) => { try { const data=Object.fromEntries(config.fields.filter(f=>f in (req.body||{})).map(f=>[f,req.body[f]])); const fields=Object.keys(data); if(!fields.length)return res.status(400).json({error:'No editable fields provided.'}); const vals=fields.map(f=>data[f]); const {rows}=await pool.query(`UPDATE ${table} SET ${fields.map((f,i)=>`${f}=$${i+1}`).join(',')} WHERE id=$${fields.length+1} RETURNING *`,[...vals,req.params.id]); if(!rows[0])return res.sendStatus(404); res.json(rows[0]);}catch(e){next(e);} });
  app.delete(`/api/admin/${key}/:id`, async (req,res,next)=>{try{const result=await pool.query(`DELETE FROM ${table} WHERE id=$1`,[req.params.id]);if(!result.rowCount)return res.sendStatus(404);res.sendStatus(204);}catch(e){next(e);}});
}
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Server error. Check the server logs.' }); });

const port = Number(process.env.PORT || 3000);
initialize().then(() => app.listen(port, () => console.log(`R&I site and CMS running at http://localhost:${port}`))).catch(err => { console.error('Database setup failed:', err); process.exit(1); });
