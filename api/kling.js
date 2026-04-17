// Vercel serverless proxy for Official Kling AI API
// Browser calls /api/kling/videos/image2video → forwarded to api-singapore.klingai.com/v1/...

const https = require('https');

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Extract Kling path from URL — strip /api/kling prefix
  const fullPath = req.url || '';
  const klingRelPath = fullPath.replace(/^\/api\/kling/, '') || '/';
  const klingPath = '/v1' + klingRelPath;

  const options = {
    hostname: 'api-singapore.klingai.com',
    port: 443,
    path: klingPath,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': req.headers['authorization'] || '',
    },
  };

  return new Promise((resolve) => {
    const proxy = https.request(options, (upstream) => {
      let body = '';
      upstream.on('data', chunk => { body += chunk; });
      upstream.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(upstream.statusCode).send(body);
        resolve();
      });
    });

    proxy.on('error', (e) => {
      res.status(502).json({ code: -1, message: e.message });
      resolve();
    });

    if (req.body) {
      const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      proxy.write(bodyStr);
    }
    proxy.end();
  });
};
