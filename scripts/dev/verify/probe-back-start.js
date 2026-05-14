const { spawn } = require('child_process');
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

const cmd = process.env.MAVEN_COMMAND || 'mvn';
const timeoutMs = 120000;
async function main() {
  const { getProjectRoot } = await import('../../data/lib/project-root.mjs');
  const repoRoot = getProjectRoot();
  const resultPath = path.join(repoRoot, 'reports', 'back-probe-result.json');
  const cwd = path.join(repoRoot, 'back');
  const configPath = resolveConfigPath(repoRoot);
  const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};
  const port = Number(process.env.APP_PORT || config.backend?.port || 8888);
  const args = [
    '-DskipTests',
    '-Dspring-boot.run.profiles=legacy',
    `-Dspring-boot.run.jvmArguments=-DAPP_PORT=${port} -DTERRAPEDIA_MAIL_ENABLED=false`,
    'spring-boot:run',
  ];
  const dbName = process.env.TERRAPEDIA_DB_NAME || config.database?.name || 'terria_v1_local';
  const dbHost = process.env.TERRAPEDIA_DB_HOST || config.database?.host || '127.0.0.1';
  const dbPort = Number(process.env.TERRAPEDIA_DB_PORT || config.database?.port || 3306);
  const dbUser = process.env.TERRAPEDIA_DB_USERNAME || config.database?.username || 'root';
  const dbPassword = process.env.TERRAPEDIA_DB_PASSWORD || config.database?.password || 'root';
  const dbUrl = process.env.TERRAPEDIA_DB_URL
    || config.database?.url
    || `jdbc:mysql://${dbHost}:${dbPort}/${dbName}?useUnicode=true&characterEncoding=utf-8&useSSL=false&serverTimezone=Asia/Shanghai&allowPublicKeyRetrieval=true`;
  const redisHost = process.env.TERRAPEDIA_REDIS_HOST || config.redis?.host || '127.0.0.1';
  const redisPort = String(process.env.TERRAPEDIA_REDIS_PORT || config.redis?.port || 6380);
  const redisPassword = process.env.TERRAPEDIA_REDIS_PASSWORD || config.redis?.password || 'root';
  const redisDatabase = String(process.env.TERRAPEDIA_REDIS_DATABASE || config.redis?.database || 0);
  const adminUsername = process.env.TERRAPEDIA_ADMIN_USERNAME || getConfigValue(config, ['auth', 'admin', 'username']) || 'admin';
  const adminPassword = requireTextSetting(
    'TERRAPEDIA_ADMIN_PASSWORD',
    process.env.TERRAPEDIA_ADMIN_PASSWORD || getConfigValue(config, ['auth', 'admin', 'password']),
    configPath
  );
  const adminDisplayName = process.env.TERRAPEDIA_ADMIN_DISPLAY_NAME || getConfigValue(config, ['auth', 'admin', 'displayName']) || 'Admin';
  const adminTokenSecret = requireTextSetting(
    'TERRAPEDIA_AUTH_TOKEN_SECRET',
    process.env.TERRAPEDIA_AUTH_TOKEN_SECRET || getConfigValue(config, ['auth', 'admin', 'tokenSecret']),
    configPath
  );
  const userTokenSecret = requireTextSetting(
    'TERRAPEDIA_USER_TOKEN_SECRET',
    process.env.TERRAPEDIA_USER_TOKEN_SECRET || getConfigValue(config, ['auth', 'user', 'tokenSecret']),
    configPath
  );
  const minioEnabled = String(process.env.TERRAPEDIA_MINIO_ENABLED ?? config.minio?.enabled ?? false).toLowerCase();
  const configuredCredentialsFile = process.env.TERRAPEDIA_MINIO_CREDENTIALS_FILE || config.minio?.credentialsFile || '';
  const minioCredentialsFile = configuredCredentialsFile
    ? (path.isAbsolute(configuredCredentialsFile) ? configuredCredentialsFile : path.join(repoRoot, configuredCredentialsFile))
    : '';
  const env = { ...process.env };

  const child = spawn(cmd, args, { cwd, shell: false, env });
  let logs = '';
  let done = false;

  const append = (d) => { logs += d.toString(); if (logs.length > 20000) logs = logs.slice(-20000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);

  function finish(ok, reason) {
    if (done) return;
    done = true;
    try { child.kill('SIGTERM'); } catch {}
    setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000);
    fs.writeFileSync(resultPath, JSON.stringify({ ok, reason, logs }, null, 2));
    setTimeout(() => process.exit(ok ? 0 : 1), 80);
  }

  function probePort() {
    return new Promise((resolve) => {
      const s = new net.Socket();
      s.setTimeout(800);
      s.once('connect', () => { s.destroy(); resolve(true); });
      const fail = () => { s.destroy(); resolve(false); };
      s.once('error', fail);
      s.once('timeout', fail);
      s.connect(port, '127.0.0.1');
    });
  }

  function probeHttp() {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/api/v3/api-docs`, (res) => {
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 500;
        res.resume();
        resolve(Boolean(ok));
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1200, () => { req.destroy(); resolve(false); });
    });
  }

  const iv = setInterval(async () => {
    if (done) return clearInterval(iv);
    const p = await probePort();
    if (!p) return;
    const h = await probeHttp();
    if (h) finish(true, 'port-and-http-ok');
  }, 1200);

  setTimeout(() => finish(false, 'timeout'), timeoutMs);
  child.on('exit', (code) => {
    if (!done) finish(false, `child-exit-${code}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

function getConfigValue(root, segments) {
  let current = root;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return null;
    }
    current = current[segment];
  }
  return current ?? null;
}

function requireTextSetting(name, value, configPath) {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`Missing ${name}. Set it in ${configPath} or via environment variable.`);
  }
  return text;
}

function resolveConfigPath(root) {
  const candidates = [
    path.join(root, 'scripts', 'dev', 'config', 'local-stack.config.json'),
    path.join(root, 'scripts', 'dev', 'local-stack.config.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}
