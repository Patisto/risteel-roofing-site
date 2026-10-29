# R & I Steel Roofing website and CMS

Static HTML/CSS pages served by a small Express app. The CMS lets an administrator update the hero video URL, services and images, projects, gallery photos, testimonials, and read/delete contact enquiries.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env` and fill in your Neon database URL, CMS admin email/password, a random token secret, and Cloudinary credentials.
3. Run `npm install` and then `npm start`.
4. Visit `http://localhost:3000` for the website and `http://localhost:3000/cms/` for the CMS.

The server creates its tables and inserts starter content the first time it connects. Database tables are in Neon/Postgres. Uploaded images go to the Cloudinary `risteel-roofing` folder. New enquiries are saved in the `messages` table. The website and CMS use the same Express origin; do not expose the database or Cloudinary secret in browser code.

## Environment settings

- `DATABASE_URL`: Neon Postgres connection string.
- `DATABASE_SSL=true`: enables TLS for Neon.
- `CMS_ADMIN_EMAIL` and `CMS_ADMIN_PASSWORD`: CMS sign-in credentials.
- `CMS_TOKEN_SECRET`: long random secret for signed 12-hour CMS sessions.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: server-side Cloudinary credentials.

The CMS is available at `/cms/`. Contact forms submit to Express and are stored for review in its Messages tab. Change copy and static layout in the HTML files and shared styles in `styles.css`.

## Git

This folder is an independent Git repository. Start recording changes with `git add .` and `git commit` after configuring a Git author identity.
