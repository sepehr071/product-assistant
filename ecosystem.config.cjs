const fs = require('fs');
const path = require('path');

const root = __dirname;
const envPath = path.join(root, '.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    env[trimmed.slice(0, i)] = trimmed.slice(i + 1);
  }
}

module.exports = {
  apps: [
    {
      name: 'product-kiosk',
      cwd: path.join(root, 'kiosk'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 0.0.0.0 -p 8030',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '8030',
        ALLOW_KIOSK_TOKEN: '1',
        AGENT_NAME: 'product-kiosk',
        CATALOG_DIR: path.join(root, 'data', 'products'),
        ...env,
      },
      autorestart: true,
      max_restarts: 30,
    },
    {
      name: 'product-kiosk-https',
      cwd: root,
      script: 'https-proxy.mjs',
      interpreter: 'node',
      env: { KIOSK_PORT: '8030', HTTPS_PORT: '8443' },
      autorestart: true,
      max_restarts: 30,
    },
    {
      name: 'product-kiosk-agent',
      cwd: path.join(root, 'agent'),
      script: 'src/agent.py',
      interpreter: path.join(root, 'agent', '.venv', 'bin', 'python'),
      args: 'start',
      env: {
        ...env,
        CATALOG_DIR: path.join(root, 'data', 'products'),
      },
      autorestart: true,
      max_restarts: 30,
    },
  ],
};
