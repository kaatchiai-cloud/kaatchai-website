#!/usr/bin/env node

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { readFile } from 'node:fs/promises';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'stori-dev';

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('Missing R2 env vars. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
  process.exit(1);
}

const endpoint = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

const KEY = `smoke-test/${Date.now()}-hello.txt`;
const BODY = 'Stori R2 smoke test — ' + new Date().toISOString();

async function run() {
  // PUT via presigned URL
  const putCmd = new PutObjectCommand({ Bucket: BUCKET_NAME, Key: KEY, Body: BODY });
  const putUrl = await getSignedUrl(s3, putCmd, { expiresIn: 60 });
  const putRes = await fetch(putUrl, { method: 'PUT', body: BODY });
  if (!putRes.ok) {
    console.error('PUT failed:', putRes.status, await putRes.text());
    process.exit(1);
  }
  console.log('PUT ok —', KEY);

  // GET via presigned URL
  const getCmd = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: KEY });
  const getUrl = await getSignedUrl(s3, getCmd, { expiresIn: 60 });
  const getRes = await fetch(getUrl);
  if (!getRes.ok) {
    console.error('GET failed:', getRes.status, await getRes.text());
    process.exit(1);
  }
  const body = await getRes.text();
  console.log('GET ok —', KEY);
  console.log(body === BODY ? 'bytes match ✓' : 'MISMATCH ✗');
  if (body !== BODY) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
