export function truncateText(value, maxBytes) {
  const text = String(value || '');
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes <= maxBytes) {
    return {
      excerpt: text,
      truncated: false,
    };
  }
  const excerpt = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
  return {
    excerpt: `${excerpt}\n[TRUNCATED]\n`,
    truncated: true,
  };
}
