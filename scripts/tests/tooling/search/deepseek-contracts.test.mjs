import assert from 'node:assert/strict';
import test from 'node:test';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, validateArguments, validateResponse } from '../../../lib/tooling/search/contracts.mjs';
import { searchResult } from './deepseek-fixtures.mjs';

test('tool discovery is valid MCP and discloses provider, cost and outbound data', () => {
  assert.ok(ListToolsResultSchema.safeParse({ tools: TOOLS }).success);
  assert.deepEqual(TOOLS.map((tool) => tool.name), ['deepseek_search', 'deepseek_fetch']);
  const validator = new AjvJsonSchemaValidator();
  for (const tool of TOOLS) {
    validator.getValidator(tool.inputSchema);
    validator.getValidator(tool.outputSchema);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.openWorldHint, true);
    assert.equal(tool.annotations.idempotentHint, false);
    assert.match(tool.description, /USD 0\.75 per 1,000/);
    assert.match(tool.description, /CNY 5 per 1,000/);
    assert.equal(tool._meta['aios/cost'].currency, 'USD');
    assert.equal(tool._meta['aios/cost'].pricePer1000SuccessfulRequests, 0.75);
    assert.equal(tool._meta['aios/cost'].source, 'https://api-docs.deepseek.com/guides/search.md');
    assert.deepEqual(tool._meta['aios/cost'].localizedPrices, [{
      locale: 'zh-cn', currency: 'CNY', pricePer1000SuccessfulRequests: 5,
      source: 'https://api-docs.deepseek.com/zh-cn/guides/search.md',
    }]);
  }
});

test('Search implements Unicode limits, nullable original question and official defaults', () => {
  const query = String.fromCodePoint(0x1f50e).repeat(128);
  assert.deepEqual(validateArguments('deepseek_search', { query }), {
    query, count: 10, localization: '', need_content: false,
  });
  assert.deepEqual(validateArguments('deepseek_search', {
    query: 'site:example.com after:2026', count: 50, ori_question: null,
    localization: '2001:db8::1', need_content: true,
  }), {
    query: 'site:example.com after:2026', count: 50,
    localization: '2001:db8::1', need_content: true,
  });
  assert.equal(validateArguments('deepseek_search', { query: 'q', ori_question: 'why?' }).ori_question, 'why?');
});

test('Search rejects invalid types, ranges, unknown keys and invalid IP localization', () => {
  const invalid = [null, [], {}, { query: '' }, { query: ' \n\t' },
    { query: 'x'.repeat(129) }, { query: 'q', count: 0 }, { query: 'q', count: 51 },
    { query: 'q', count: 1.5 }, { query: 'q', count: '1' },
    { query: 'q', need_content: 1 }, { query: 'q', ori_question: '' },
    { query: 'q', ori_question: 'x'.repeat(129) }, { query: 'q', localization: 'example.com' },
    { query: 'q', api_key: 'must-not-accept' }, { query: 'q', localization: null }];
  for (const args of invalid) {
    assert.throws(() => validateArguments('deepseek_search', args), { code: 'invalid_input' });
  }
});

test('Fetch validates absolute HTTP(S) host, no credentials and URL size', () => {
  for (const url of ['https://example.com', 'http://example.com/a?q=x#f',
    'HTTPS://example.com', 'http://127.0.0.1/a', 'http://[::1]/', 'http://internal/']) {
    assert.deepEqual(validateArguments('deepseek_fetch', { url }), { url });
  }
  const prefix = 'https://example.com/';
  assert.ok(validateArguments('deepseek_fetch', { url: prefix + 'a'.repeat(8192 - prefix.length) }));
  for (const url of ['', '/relative', 'file:///etc/passwd', 'ftp://example.com',
    'http:example.com', 'https://', 'https://user:pass@example.com',
    'https://@example.com', 'https://example.com\\@internal/',
    'https://example.com/has space', 'https://example.com/\nsecret',
    prefix + 'a'.repeat(8193 - prefix.length)]) {
    assert.throws(() => validateArguments('deepseek_fetch', { url }), { code: 'invalid_input' });
  }
  assert.throws(() => validateArguments('deepseek_fetch', { url: prefix, headers: {} }), { code: 'invalid_input' });
});

test('successful provider bodies are projected to documented, schema-validated output only', () => {
  const page = { title: 'Title', content: '# Markdown' };
  assert.deepEqual(validateResponse('deepseek_fetch', { ...page, internal: 'hidden' }), page);
  assert.deepEqual(validateResponse('deepseek_search', {
    results: [{ ...searchResult, internal: 'hidden' }], internal: 'hidden',
  }), { results: [searchResult] });
  assert.deepEqual(validateResponse('deepseek_search', { results: [] }), { results: [] });
  for (const value of [null, {}, { results: {} }, { results: [null] },
    { results: [{ ...searchResult, authority: 99 }] }, { results: Array(51).fill(searchResult) }]) {
    assert.throws(() => validateResponse('deepseek_search', value), { code: 'invalid_response' });
  }
  for (const value of [{ content: 'missing title' }, { title: '', content: null }]) {
    assert.throws(() => validateResponse('deepseek_fetch', value), { code: 'invalid_response' });
  }
});
