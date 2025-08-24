// SPDX-License-Identifier: MIT
//
// Copyright (c) 2025 Togi
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

const crypto = require('crypto');
const https = require('https');

// The api host url
const API_HOST = 'api.togi-app.com';

// Configuration — replace with your actual credentials and optional encryption secret
const API_KEY = '';
const API_PASSWORD = '';
// leave empty if not using encryption
const SECRET = '';
// Adjust time into the past in milliseconds. The system clock under Windows
// is sometimes set into the future even after resync. By substracting this
// variable from the timestamp used for signature creation, an invalid
// signature can be prevented.
const TIMEOFFSET = 1000; 

// Input description field
const { description } = $input.first().json;
const reportId = Math.floor(Date.now() / 1000).toString();

// Helper: create HMAC-SHA256 signature
function createSignature(password, timestamp) {
  return crypto
    .createHmac('sha256', password)
    .update(timestamp)
    .digest('base64');
}

// Helper: encrypt string with AES-256-CBC and return base64(iv + ciphertext)
function encryptAes256Cbc(jsonString, base64Key) {
  const key = Buffer.from(base64Key, 'base64');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

// Create report payload (encrypted or plaintext)
const reportPayload = SECRET
  ? {
      id: reportId,
      report: encryptAes256Cbc(JSON.stringify({ description }), SECRET),
    }
  : {
      id: reportId,
      report: { description },
    };

const requestBody = JSON.stringify(reportPayload);

// HTTPS POST helper
function postJson(path, body) {
  const timestamp = (Date.now() - TIMEOFFSET).toString();
  const signature = createSignature(API_PASSWORD, timestamp);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path,
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: data });
        });
      }
    );
    req.on('error', (err) => reject(new Error(`Request failed: ${err.message}`)));
    req.write(body);
    req.end();
  });
}

// Execute and return server response
return postJson('/api/v1/report', requestBody)
  .then((res) => ({
    json: {
      status: res.status,
      response: res.body,
    },
  }))
  .catch((err) => {
    throw new Error(err.message);
  });