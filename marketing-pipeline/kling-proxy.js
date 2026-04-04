// kling-proxy.js — local CORS proxy for Kling official API
// Usage: node kling-proxy.js
// Browser calls http://localhost:3001/kling/... → forwarded to api-singapore.klingai.com/v1/...

const http  = require('http');
const https = require('https');

const PORT       = 3004;
const KLING_HOST = 'api-singapore.klingai.com';

http.createServer((req, res) => {

  // CORS — allow any origin (file:// included)
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (!req.url.startsWith('/kling/')) {
    res.writeHead(404); res.end('Not found'); return;
  }

  // /kling/videos/image2video → /v1/videos/image2video
  const klingPath = '/v1/' + req.url.slice('/kling/'.length);

  const options = {
    hostname: KLING_HOST,
    port:     443,
    path:     klingPath,
    method:   req.method,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': req.headers['authorization'] || '',
    },
  };

  const proxy = https.request(options, (upstream) => {
    res.writeHead(upstream.statusCode, {
      'Content-Type':                'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    upstream.pipe(res);
  });

  proxy.on('error', (e) => {
    console.error('Proxy error:', e.message);
    res.writeHead(502);
    res.end(JSON.stringify({ code: -1, message: e.message }));
  });

  req.pipe(proxy);

}).listen(PORT, () => {
  console.log(`Kling proxy → http://localhost:${PORT}`);
  console.log(`Routes: /kling/* → https://${KLING_HOST}/v1/*`);
});
