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

// How long to wait for an answer (in seconds)
const MAX_POLL_SECONDS = 20; // e.g. 600 = 10 minutes

// Input data from upstream node
const input = $input.first().json;
const { title, description, options, priority } = input;
const decisionId = Math.floor(Date.now() / 1000).toString();

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

// Helper: decrypt base64(iv + ciphertext) with AES-256-CBC
function decryptAes256Cbc(base64Data, base64Key) {
  const buffer = Buffer.from(base64Data, 'base64');
  const iv = buffer.slice(0, 16);
  const ciphertext = buffer.slice(16);
  const key = Buffer.from(base64Key, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// Create decision payload (encrypted or plaintext)
const decisionPayload = SECRET
  ? {
      id: decisionId,
      decision: encryptAes256Cbc(JSON.stringify({ title, description, options, priority }), SECRET),
    }
  : {
      id: decisionId,
      decision: { title, description, options, priority },
    };

const requestBody = JSON.stringify(decisionPayload);

// Send signed POST request
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
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Send signed GET request (fresh signature each time)
function getJson(path) {
  const timestamp = (Date.now() - TIMEOFFSET).toString();
  const signature = createSignature(API_PASSWORD, timestamp);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path,
        method: 'GET',
        headers: {
          'X-API-Key': API_KEY,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Delete a decision
function deleteDecision(id) {
  const timestamp = (Date.now() - 1000).toString();
  const signature = createSignature(API_PASSWORD, timestamp);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: API_HOST,
        path: `/api/v1/decision/${id}`,
        method: 'DELETE',
        headers: {
          'X-API-Key': API_KEY,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
        },
      },
      (res) => {
        res.on('data', () => {}); // discard response body
        res.on('end', () => resolve(res.statusCode));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Main logic: send decision, poll answer, decrypt if needed
return new Promise(async (resolve, reject) => {
  try {
    const postRes = await postJson('/api/v1/decision', requestBody);
    if (postRes.status !== 202) {
      return resolve({ json: { status: postRes.status, error: postRes.body } });
    }

    for (let i = 0; i < MAX_POLL_SECONDS; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const raw = await getJson(`/api/v1/answer/${decisionId}`);
      if (raw === '[]') continue;

      try {
        const answerJson = JSON.parse(raw);
        if (answerJson.was_deleted === 1) {
          return resolve({ json: { deleted: true } });
        }

        const result = SECRET
          ? decryptAes256Cbc(answerJson.answer, SECRET)
          : answerJson.answer;

        return resolve({ json: result });
      } catch (err) {
        return reject(new Error(`Failed to parse or decrypt answer: ${err.message}`));
      }
    }

    await deleteDecision(decisionId);
    return resolve({
      json: {
        timeout: true,
        message: `No answer received after ${MAX_POLL_SECONDS} seconds. Decision deleted.`,
      },
    });
  } catch (err) {
    return reject(new Error(`Request failed: ${err.message}`));
  }
});
