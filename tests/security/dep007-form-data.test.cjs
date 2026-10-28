const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const root = process.env.DEP007_ROOT || path.resolve(__dirname, '../..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const copies = Object.keys(lock.packages).filter((entry) => entry.endsWith('node_modules/form-data'));
assert.ok(copies.length > 0, 'the test must exercise at least one real locked copy');
const escapeParam = (value) => value.replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/"/g, '%22');

async function receive(FormData, field, filename) {
  const form = new FormData();
  const bytes = Buffer.from([0, 1, 2, 127, 255, 13, 10, 42]);
  form.setBoundary('dep007-controlled-multipart-fixture');
  form.append('ordinary', 'normal text');
  form.append(field, bytes, { filename, contentType: 'application/octet-stream' });
  const wire = form.getBuffer();
  const server = http.createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 65536) req.destroy(new Error('fixture exceeded its bounded size'));
      else chunks.push(chunk);
    });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ body: Buffer.concat(chunks).toString('base64'), type: req.headers['content-type'] }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const received = await new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', headers: form.getHeaders(), timeout: 3000 }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
        });
      });
      request.on('error', reject);
      request.on('timeout', () => request.destroy(new Error('local receiver timeout')));
      request.end(wire);
    });
    assert.equal(received.type, 'multipart/form-data; boundary=' + form.getBoundary());
    const body = Buffer.from(received.body, 'base64').toString('latin1');
    const parts = body.split(new RegExp('(?:^|\\r\\n)--' + form.getBoundary() + '(?:\\r\\n|--\\r\\n)')).slice(1, -1);
    assert.equal(parts.length, 2, 'untrusted metadata must not create extra multipart fields');
    const parsed = parts.map((part) => {
      const split = part.indexOf('\r\n\r\n');
      assert.ok(split > 0);
      const headers = part.slice(0, split).split('\r\n');
      for (const header of headers) {
        assert.match(header, /^(Content-Disposition|Content-Type): /, 'no metadata-injected header');
      }
      return { headers, value: part.slice(split + 4) };
    });
    assert.deepEqual(parsed[0], { headers: ['Content-Disposition: form-data; name="ordinary"'], value: 'normal text' });
    assert.equal(parsed[1].headers[0], 'Content-Disposition: form-data; name="' + escapeParam(field) + '"; filename="' + escapeParam(filename) + '"');
    assert.equal(parsed[1].headers[1], 'Content-Type: application/octet-stream');
    assert.deepEqual(Buffer.from(parsed[1].value, 'latin1'), bytes, 'normal binary file bytes must arrive unchanged');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

for (const copy of copies) {
  const modulePath = path.join(root, copy);
  const FormData = require(modulePath);
  test(copy + ': ordinary file/text upload round-trips through a real local HTTP receiver', { timeout: 5000 }, async () => {
    await receive(FormData, 'upload', 'ordinary.bin');
  });
  test(copy + ': hostile field metadata cannot inject a header or a form part', { timeout: 5000 }, async () => {
    await receive(FormData, 'upload"\r\nX-Injected: true\r\n--dep007-controlled-multipart-fixture\r\nContent-Disposition: form-data; name="extra"', 'ordinary.bin');
  });
  test(copy + ': hostile filename remains one escaped filename', { timeout: 5000 }, async () => {
    await receive(FormData, 'upload', 'file"\r\nX-Injected: true\r\n--dep007-controlled-multipart-fixture\r\n.bin');
  });
  test(copy + ': quote-only field and filename metadata is escaped', { timeout: 5000 }, async () => {
    await receive(FormData, 'up"load', 'or"dinary.bin');
  });
  test(copy + ': boundary generation delegates to crypto instead of Math.random', () => {
    const script = `
      const crypto = require('node:crypto');
      const calls = [];
      crypto.randomBytes = (size) => { calls.push(size); return Buffer.alloc(size, 171); };
      Math.random = () => { throw new Error('predictable PRNG must not generate multipart boundaries'); };
      const FormData = require(process.argv[1]);
      const boundary = new FormData().getBoundary();
      process.stdout.write(JSON.stringify({ calls, boundary }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['-e', script, modulePath], { encoding: 'utf8', timeout: 3000 }));
    assert.deepEqual(result.calls, [12]);
    assert.equal(result.boundary, '--------------------------' + 'ab'.repeat(12));
  });
}
