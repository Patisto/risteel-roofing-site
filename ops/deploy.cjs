const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const release = path.resolve(process.argv[2] || '');
const base = '/srv/risteel';
const current = path.join(base, 'current');
const shared = path.join(base, 'shared');
const previous = fs.existsSync(current) ? fs.readlinkSync(current) : null;
if (!release.startsWith(path.join(base, 'releases') + path.sep)) throw new Error(`Refusing release outside ${base}/releases`);
fs.mkdirSync(path.join(shared, 'uploads'), { recursive: true });
if (!fs.existsSync(path.join(shared, '.env'))) throw new Error(`Create ${shared}/.env with Neon and CMS configuration before deploying.`);
for (const [file, target] of [['.env', path.join(shared, '.env')], ['uploads', path.join(shared, 'uploads')]]) {
  const destination = path.join(release, file);
  try { fs.unlinkSync(destination); } catch {}
  fs.symlinkSync(target, destination, file === 'uploads' ? 'dir' : 'file');
}
const tempLink = `${current}.next`;
try { fs.unlinkSync(tempLink); } catch {}
fs.symlinkSync(release, tempLink, 'dir');
fs.renameSync(tempLink, current);
function pm2Reload() { execFileSync('pm2', ['startOrReload', path.join(release, 'ecosystem.config.cjs'), '--update-env'], { stdio: 'inherit', cwd: release }); execFileSync('pm2', ['save'], { stdio: 'inherit' }); }
function healthCheck() { return new Promise((resolve, reject) => { const req=http.get('http://127.0.0.1:3000/api/health',res=>{res.resume();res.statusCode===200?resolve():reject(new Error(`Health check returned ${res.statusCode}`))});req.setTimeout(3000,()=>req.destroy(new Error('Health check timed out')));req.on('error',reject);}); }
(async()=>{try{pm2Reload();let healthy=false;for(let i=0;i<15;i++){try{await healthCheck();healthy=true;break}catch{await new Promise(r=>setTimeout(r,1000))}}if(!healthy)throw new Error('API health check failed after deployment');console.log(`Activated ${release}`)}catch(error){if(previous){const rollback=`${current}.rollback`;try{fs.unlinkSync(rollback)}catch{};fs.symlinkSync(previous,rollback,'dir');fs.renameSync(rollback,current);try{pm2Reload()}catch{}}throw error}})().catch(e=>{console.error(e);process.exit(1)});
