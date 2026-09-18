#!/usr/bin/env node
// Submit every URL of the published sitemap to IndexNow (Bing, Yandex, Naver,
// Seznam). The key file is committed as
// `docs-site/<key>.txt`, so the docs build publishes it at
// https://cli.rexai.top/<key>.txt and the endpoint can validate ownership.
//
// The workflow runs this after a successful Pages deployment and tolerates
// failures: a rejected submission must never fail a release.
import process from 'node:process';

const HOST = 'cli.rexai.top';
const KEY = '8f42c1d7b9e356a0c4d2f8b1e6a9503c';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH_SIZE = 10000;

const keyLocation = `https://${HOST}/${KEY}.txt`;
const sitemapUrl = `https://${HOST}/sitemap.xml`;

async function fetchSitemapUrls() {
  const response = await fetch(sitemapUrl, { headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) {
    throw new Error(`sitemap fetch failed with ${response.status} for ${sitemapUrl}`);
  }
  const xml = await response.text();
  const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((match) => match[1]);
  return [...new Set(urls)];
}

async function submit(urlList) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation, urlList }),
  });
  return { status: response.status, body: (await response.text()).slice(0, 300) };
}

async function main() {
  const urls = await fetchSitemapUrls();
  if (urls.length === 0) {
    throw new Error('sitemap contained no URLs');
  }

  let submitted = 0;
  for (let index = 0; index < urls.length; index += BATCH_SIZE) {
    const batch = urls.slice(index, index + BATCH_SIZE);
    const { status, body } = await submit(batch);
    // 200 = accepted, 202 = accepted while the key is being validated.
    if (status !== 200 && status !== 202) {
      throw new Error(`IndexNow rejected ${batch.length} url(s) with ${status}: ${body}`);
    }
    submitted += batch.length;
    console.log(`indexnow: submitted ${batch.length} url(s) (http ${status})`);
  }

  console.log(`indexnow: ${submitted} url(s) accepted for ${HOST}`);
}

main().catch((error) => {
  console.error(`indexnow: ${error.message}`);
  process.exit(1);
});
