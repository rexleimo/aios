/**
 * Fill any `{name}` token left in a translated message.
 *
 * Lingui normally interpolates when values are passed to `i18n._`, but the
 * Next.js server/client bundles can disagree on which i18n instance owns the
 * catalog; in that case the message text arrives with its ICU placeholders
 * untouched. This pass is idempotent: already-interpolated messages have no
 * braces left.
 */
export function interpolate(message, values) {
  const text = String(message ?? '');
  if (!values) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (match, key) => (
    Object.hasOwn(values, key) && values[key] !== undefined && values[key] !== null
      ? String(values[key])
      : match
  ));
}
