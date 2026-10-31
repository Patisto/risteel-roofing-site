# R & I Steel Roofing website and CMS

Static HTML/CSS pages served by a small Express app. The CMS lets an administrator update the hero video URL, services and images, projects, gallery photos, testimonials, and read/delete contact enquiries.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and fill in your Neon database URL, CMS admin email/password and a random token secret.
3. Run `npm install` and then `npm start`.
4. Visit `http://localhost:3000` for the website and `http://localhost:3000/cms/` for the CMS.

The server creates its tables and inserts starter content the first time it connects. Database tables are in Neon/Postgres. Uploaded images are resized and compressed to WebP, then stored in the VPS persistent uploads directory. New enquiries are saved in the `messages` table. The website and CMS use the same Express origin; keep database and token secrets on the server.

## Environment settings

- `DATABASE_URL`: Neon Postgres connection string.
- `DATABASE_SSL=true`: enables TLS for Neon.
- `CMS_ADMIN_EMAIL` and `CMS_ADMIN_PASSWORD`: CMS sign-in credentials.
- `CMS_TOKEN_SECRET`: long random secret for signed 12-hour CMS sessions.
- `UPLOAD_DIR`: persistent server-side image directory.
- `PUBLIC_BASE_URL`: API origin used when returning URLs for uploaded images.
- `CORS_ORIGIN`: comma-separated origins of the separately hosted website.

The CMS is available at `/cms/`. Contact forms submit to Express and are stored for review in its Messages tab. Change copy and static layout in the HTML files and shared styles in `styles.css`.

## VPS deployment

The GitHub Actions workflow deploys only the Express API and CMS files when `server/`, `cms/`, `ops/`, or the workflow changes on `main`. Configure Actions variable `VPS_HOST`, `VPS_USER`, `VPS_PORT`, and `VPS_KNOWN_HOSTS`, plus secret `VPS_SSH_KEY_B64`. On the VPS, install Node.js 22 and PM2, create `/srv/risteel/shared/.env` from `.env.example`, and configure PM2 startup for the deploy user. Uploaded images persist at `/srv/risteel/shared/uploads` across releases.

For a static website hosted on another origin, set `CORS_ORIGIN` and `PUBLIC_BASE_URL` in the VPS environment and set `window.RI_API_BASE` to the API origin before loading `assets/site.js`. The workflow does not deploy the public HTML pages or their assets.

## Git

This folder is an independent Git repository. Start recording changes with `git add .` and `git commit` after configuring a Git author identity.
