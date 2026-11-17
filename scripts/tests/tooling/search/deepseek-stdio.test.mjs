import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import test from 'node:test';
import { BoundedStdioTransport } from '../../../lib/tooling/search/stdio-transport.mjs';
import { LIMITS } from '../../../lib/tooling/search/contracts.mjs';
import { createHarness } from './deepseek-fixtures.mjs';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('stdio handles split multibyte UTF-8, CRLF, coalesced lines and empty lines', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  const frame = Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id: String.fromCodePoint(0x1f50e), method: 'ping' })}\r\n\n`);
  const split = frame.indexOf(Buffer.from(String.fromCodePoint(0x1f50e))) + 1;
  harness.input.write(frame.subarray(0, split));
  harness.input.write(frame.subarray(split));
  harness.input.write('{"jsonrpc":"2.0","id":8,"method":"ping"}\n{"jsonrpc":"2.0","id":9,"method":"ping"}\n');
  await tick();
  assert.deepEqual(harness.messages.map((item) => item.id), [String.fromCodePoint(0x1f50e), 8, 9]);
});

test('malformed JSON, invalid UTF-8 and invalid envelopes produce bounded safe errors, then recover', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.input.write('provider-secret {\n');
  harness.input.write(Buffer.from([0xff, 0x0a]));
  for (const value of [null, [], { id: null, method: 'ping' }, { jsonrpc: '1.0', id: 2, method: 'ping' }]) {
    harness.input.write(`${JSON.stringify(value)}\n`);
  }
  await harness.request('ping');
  assert.deepEqual(harness.messages.slice(0, 6).map((item) => item.error.code), [-32700, -32700, -32600, -32600, -32600, -32600]);
  assert.doesNotMatch(JSON.stringify(harness.messages), /provider-secret/);
});

test('oversized newline and no-newline frames are discarded without accumulating unbounded input', async (t) => {
  const harness = await createHarness();
  t.after(() => harness.close());
  harness.input.write('x'.repeat(LIMITS.lineBytes + 1));
  for (let i = 0; i < 8; i++) harness.input.write('x'.repeat(LIMITS.lineBytes));
  harness.input.write('\n');
  await harness.request('ping');
  assert.equal(harness.messages.length, 2);
  assert.equal(harness.messages[0].error.code, -32600);
  harness.input.write(`${'x'.repeat(LIMITS.lineBytes + 1)}\n`);
  await harness.request('ping');
  assert.equal(harness.messages.length, 4);
});

test('transport enforces output frame limit and rewrites SDK errors without unsafe data', async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const chunks = [];
  output.on('data', (chunk) => chunks.push(chunk));
  const transport = new BoundedStdioTransport(input, output);
  await transport.start();
  await transport.send({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'provider-secret', data: 'fake-key' } });
  const reply = JSON.parse(Buffer.concat(chunks).toString().trim());
  assert.equal(reply.error.code, -32602);
  assert.doesNotMatch(JSON.stringify(reply), /provider-secret|fake-key/);
  await assert.rejects(transport.send({ jsonrpc: '2.0', id: 2, result: { value: 'x'.repeat(LIMITS.outputBytes) } }));
  await transport.close();
  input.destroy();
  output.destroy();
});

test('stalled stdout cannot queue unlimited output and closes the connection', async () => {
  const input = new PassThrough();
  const output = new Writable({ write(_chunk, _encoding, _callback) {} });
  const transport = new BoundedStdioTransport(input, output);
  let closed = false;
  transport.onclose = () => { closed = true; };
  transport.onerror = () => {};
  await transport.start();
  const result = { value: 'x'.repeat(1024 * 1024) };
  const pending = [];
  for (let i = 0; i < 20; i++) pending.push(transport.send({ jsonrpc: '2.0', id: i, result }).catch(() => {}));
  await tick();
  assert.equal(closed, true);
  assert.ok(output.writableLength <= LIMITS.queuedOutputBytes);
  input.destroy();
  output.destroy();
  await transport.close();
});

test('EOF processes a final partial line, then closes; input/output errors are sanitized', async () => {
  for (const mode of ['eof', 'input-error', 'output-error']) {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume();
    const transport = new BoundedStdioTransport(input, output);
    const seen = [];
    const errors = [];
    let closed = false;
    let finishClose;
    const closeEvent = new Promise((resolve) => { finishClose = resolve; });
    transport.onmessage = (message) => seen.push(message);
    transport.onerror = (error) => errors.push(error.message);
    transport.onclose = () => { closed = true; finishClose(); };
    await transport.start();
    if (mode === 'eof') input.end('{"jsonrpc":"2.0","id":1,"method":"ping"}');
    else (mode === 'input-error' ? input : output).emit('error', new Error('provider-secret'));
    await closeEvent;
    assert.equal(closed, true);
    if (mode === 'eof') assert.equal(seen.length, 1);
    else assert.equal(errors.length, 1);
    assert.doesNotMatch(JSON.stringify(errors), /provider-secret/);
    await transport.close();
    input.destroy();
    output.destroy();
  }
});

test('entry emits its final ping response on EOF without requiring newline or credentials', async () => {
  let reads = 0;
  const harness = await createHarness({ getEnv: () => { reads++; return {}; } });
  harness.input.end('{"jsonrpc":"2.0","id":100,"method":"ping"}');
  await harness.closed;
  assert.deepEqual(harness.messages, [{ jsonrpc: '2.0', id: 100, result: {} }]);
  assert.equal(reads, 0);
  await harness.close();
});
