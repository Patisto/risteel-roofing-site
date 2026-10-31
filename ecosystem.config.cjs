const path = require('node:path');
const release = __dirname;
module.exports = {
  apps: [{
    name: 'risteel-api',
    script: path.join(release, 'server/index.js'),
    cwd: release,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '350M',
    env: { NODE_ENV: 'production', PORT: '3000', UPLOAD_DIR: '/srv/risteel/shared/uploads' },
  }],
};
