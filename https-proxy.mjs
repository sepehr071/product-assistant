import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const key = fs.readFileSync(path.join(root, 'certs', 'key.pem'));
const cert = fs.readFileSync(path.join(root, 'certs', 'cert.pem'));
const targetPort = Number(process.env.KIOSK_PORT || 8030);
const listenPort = Number(process.env.HTTPS_PORT || 8443);

const server = https.createServer({ key, cert }, (req, res) => {
  const proxy = http.request(
    {
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    }
  );
  proxy.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(`proxy error: ${err.message}`);
  });
  req.pipe(proxy);
});

server.listen(listenPort, '0.0.0.0', () => {
  console.log(`https kiosk proxy 0.0.0.0:${listenPort} -> 127.0.0.1:${targetPort}`);
});
