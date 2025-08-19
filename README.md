# Togi n8n Code Nodes

This repository provides JavaScript-based **n8n Code nodes** for integrating with [Togi](https://togi-app.com), a platform that adds human-in-the-loop decision making to automation workflows.

These nodes allow you to send **decisions** and **reports** to the Togi app and **poll for answers** — entirely from within your n8n flows.

---

## Included Files

| File               | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `togi-decision.js` | Code node to post a decision and wait for a response |
| `togi-report.js`   | Code node to send a report                           |
| `n8n-example.json` | Example workflow: Decision → Answer → Report         |

---

## Prerequisites

### n8n Setup with Crypto Support

To use these nodes, n8n must support the native Node.js `crypto` and `https` modules. If you are running n8n via Docker, add the following to your `docker-compose.yaml`:

```yaml
version: "3.1"

services:
  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"
    restart: always
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=yourpassword
      - N8N_FEATURE_FLAG_CODE_NODE=true
      - NODE_FUNCTION_ALLOW_BUILTIN=crypto,https
      - TZ=Europe/Berlin
    volumes:
      - ./n8n-data:/home/node/.n8n
```

Then restart the container:

```bash
docker compose down
docker compose up -d
```

### ⚠️ Windows System Clock Warning

Togi requires an accurate system time for request signatures to be accepted.  
On Windows, incorrect system time can result in “Invalid Signature” errors.

Run this in an **Administrator PowerShell** to resync your clock:

```powershell
w32tm /resync
```

Despite resyncing the clock might still be in the future. In this case use the `TIMEOFFSET` variables to compensate for that.

---

## Usage

### 1. Post a Decision (Encrypted or Plain)

Use the `togi-decision.js` code node with an input like:

```json
{
  "title": "What should we do?",
  "description": "Pick the next action",
  "options": ["Schedule", "Cancel", "Defer"],
  "priority": "medium" // One of: low, medium, high
}
```

The node:

- Posts the decision to Togi
- Waits up to `MAX_POLL_SECONDS` seconds (customizable) for a response
- Decrypts the result (if encryption is enabled)
- Returns `{ "answer": "Asbwer data" }` or `{ "deleted": true }`

### 2. Post a Report

Use the `togi-report.js` code node with an input like:

```json
{
  "description": "Report text"
}
```

## Encryption Support

Both nodes optionally support end-to-end encryption using AES-256-CBC with a Base64 key.

To enable it:

- Set the `SECRET` variable in the `.js` files to your **Base64-encoded project password**
- If left empty, data is sent as plaintext

---

## Example Workflow

Import `n8n-example.json` into your n8n instance to try a complete flow:

1. Trigger → Create Decision
2. Wait for answer
3. Convert to report
4. Post report

---

## Support

Need help or have feedback?  
Email us at: [support@togi-app.com](mailto:support@togi-app.com)

---

## 📝 License

MIT License  
Copyright (c) 2025 Togi

Permission is hereby granted, free of charge, to any person obtaining a copy  
of this software and associated documentation files (the "Software"), to deal  
in the Software without restriction, including without limitation the rights  
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell  
copies of the Software, and to permit persons to whom the Software is  
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in  
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR  
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,  
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
