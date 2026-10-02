/** What to open: publishable key + payment id (created on your server), or the payment's `checkout_url`. */
export type CheckoutOptions =
  | { key: string; paymentId: string; payHost?: string; locale?: 'en' | 'hi' }
  | { checkoutUrl: string; locale?: 'en' | 'hi' };

export const DEFAULT_PAY_HOST = 'https://pay.razcryptogateway.com';
const PAY_ID = /^pay_[0-9A-Za-z]{20}$/;
const PK = /^pk_(live|test)_[0-9A-Za-z]{16,}$/;
const LOCAL = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

/** Error with a stable `code` (thrown by [validateOptions]). */
export class RazCryptoError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RazCryptoError';
  }
}

// React Native's URL class is incomplete on older versions, so URLs are parsed by hand.
type Parsed = { scheme: string; host: string; origin: string; segments: string[]; query: Record<string, string> };
const URL_RE = /^(https?):\/\/([^/?#:]+)(:\d+)?([^?#]*)(\?[^#]*)?/i;

export function parseUrl(u: string): Parsed | null {
  const m = URL_RE.exec(u);
  if (!m) return null;
  const scheme = m[1]!.toLowerCase();
  const host = m[2]!.toLowerCase();
  const port = m[3] ?? '';
  const query: Record<string, string> = {};
  for (const pair of (m[5] ?? '').replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
    query[k] = decodeURIComponent(i < 0 ? '' : pair.slice(i + 1).replace(/\+/g, ' '));
  }
  const defaultPort = (scheme === 'https' && port === ':443') || (scheme === 'http' && port === ':80');
  return { scheme, host, origin: `${scheme}://${host}${defaultPort ? '' : port}`, segments: (m[4] ?? '').split('/').filter(Boolean), query };
}

const safe = (u: string): Parsed | null => {
  const p = parseUrl(u);
  return p && (p.scheme === 'https' || (p.scheme === 'http' && LOCAL.has(p.host))) ? p : null;
};

/** Throws [RazCryptoError] for secret keys, bad ids or non-https hosts. */
export function validateOptions(o: CheckoutOptions): void {
  if ('checkoutUrl' in o) {
    const u = safe(o.checkoutUrl);
    if (!u || !PAY_ID.test(u.segments.at(-1) ?? '') || !u.query.t) throw new RazCryptoError('invalid_checkout_url', 'checkoutUrl must be the URL returned when the payment was created');
    return;
  }
  if (o.key.startsWith('sk_')) throw new RazCryptoError('invalid_key', 'Never use a secret key in an app. Pass your publishable key (pk_…).');
  if (!PK.test(o.key)) throw new RazCryptoError('invalid_key', 'key must be a publishable key (pk_live_… or pk_test_…)');
  if (!PAY_ID.test(o.paymentId)) throw new RazCryptoError('invalid_payment_id', 'paymentId must look like pay_…');
  if (!safe(o.payHost ?? DEFAULT_PAY_HOST)) throw new RazCryptoError('invalid_pay_host', 'payHost must be https');
}

export const originOf = (url: string): string => parseUrl(url)?.origin ?? '';

const qs = (q: Record<string, string | undefined>) =>
  Object.entries(q)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/** Embedded checkout page URL for the WebView. */
export function embedUrl(o: CheckoutOptions): string {
  if ('checkoutUrl' in o) {
    const p = parseUrl(o.checkoutUrl)!;
    return `${p.origin}/embed/${p.segments.at(-1)}?${qs({ t: p.query.t ?? '', locale: o.locale })}`;
  }
  return `${originOf(o.payHost ?? DEFAULT_PAY_HOST)}/embed/${o.paymentId}?${qs({ key: o.key, locale: o.locale })}`;
}

/** Origin the checkout is served from; only this origin may talk to the app. */
export const payOrigin = (o: CheckoutOptions): string => originOf('checkoutUrl' in o ? o.checkoutUrl : (o.payHost ?? DEFAULT_PAY_HOST));
