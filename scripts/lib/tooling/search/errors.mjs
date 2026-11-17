const MESSAGES = Object.freeze({
  invalid_input: 'Invalid tool arguments. See the tool inputSchema.',
  missing_key: 'DEEPSEEK_API_KEY is missing or invalid in the MCP server environment.',
  request_too_large: 'DeepSeek request exceeds the local payload limit.',
  response_too_large: 'DeepSeek response exceeds the local payload limit.',
  invalid_response: 'DeepSeek returned an invalid response.',
  network: 'DeepSeek request failed. No automatic retry was attempted.',
  timeout: 'DeepSeek request exceeded the local deadline. No automatic retry was attempted.',
  cancelled: 'DeepSeek request was cancelled. Billing may already have occurred upstream.',
  authentication: 'DeepSeek rejected API authentication (HTTP 401).',
  balance: 'DeepSeek account balance is insufficient (HTTP 402).',
  forbidden: 'DeepSeek denied this request under its security policy (HTTP 403).',
  not_found: 'DeepSeek could not retrieve usable page content (HTTP 404).',
  rate_limited: 'DeepSeek rate limit reached (HTTP 429). Retry later explicitly.',
  upstream: 'DeepSeek rejected or could not complete this request. No automatic retry was attempted.',
  busy: 'The local DeepSeek MCP concurrency limit is reached. Retry later explicitly.',
  internal: 'The local DeepSeek MCP could not complete this request.',
});

export class SearchError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'internal';
    super(MESSAGES[safeCode]);
    this.name = 'SearchError';
    this.code = safeCode;
  }
}

export function safeError(error) {
  return new SearchError(error instanceof SearchError ? error.code : 'internal');
}

export function httpError(status) {
  return new SearchError({
    401: 'authentication', 402: 'balance', 403: 'forbidden',
    404: 'not_found', 429: 'rate_limited',
  }[status] || 'upstream');
}
