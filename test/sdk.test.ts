import { describe, expect, it } from 'vitest';
import { onBridgeMessage, parseBridgeMessage } from '../src/bridge';
import { embedUrl, payOrigin, validateOptions } from '../src/options';

const pay = 'pay_3fK9sQ2mZt7LxR1aPq0B';
const pk = `pk_test_${'a'.repeat(24)}`;

describe('options', () => {
  it('key + payment id → embed URL on the pay host', () => {
    const o = { key: pk, paymentId: pay, payHost: 'https://pay.example', locale: 'hi' as const };
    validateOptions(o);
    expect(embedUrl(o)).toBe(`https://pay.example/embed/${pay}?key=${pk}&locale=hi`);
    expect(payOrigin(o)).toBe('https://pay.example');
  });

  it('checkout_url keeps its host and token', () => {
    const o = { checkoutUrl: `https://pay.example/${pay}?t=ct_abc` };
    validateOptions(o);
    expect(embedUrl(o)).toBe(`https://pay.example/embed/${pay}?t=ct_abc`);
    expect(payOrigin({ checkoutUrl: `http://10.0.2.2:3000/${pay}?t=1` })).toBe('http://10.0.2.2:3000');
  });

  it('refuses secret keys and bad input', () => {
    expect(() => validateOptions({ key: `sk_live_${'a'.repeat(24)}`, paymentId: pay })).toThrow(/secret key/);
    expect(() => validateOptions({ key: pk, paymentId: 'nope' })).toThrow(/pay_/);
    expect(() => validateOptions({ key: pk, paymentId: pay, payHost: 'http://evil.example' })).toThrow(/https/);
    expect(() => validateOptions({ key: pk, paymentId: pay, payHost: 'ftp://x' })).toThrow(/https/);
    expect(payOrigin({ key: pk, paymentId: pay })).toBe('https://razcryptogateway.com'); // official host by default
    expect(() => validateOptions({ checkoutUrl: 'https://pay.example/whatever' })).toThrow(/checkoutUrl/);
  });
});

describe('bridge', () => {
  it('only our messages; success then done → success; close without payment → cancelled', () => {
    expect(parseBridgeMessage('{"source":"other","type":"success"}')).toBeNull();
    expect(parseBridgeMessage('nope')).toBeNull();
    const state = { success: null, pending: null };
    expect(onBridgeMessage(parseBridgeMessage(JSON.stringify({ source: 'razcrypto', type: 'success', payload: { payment_id: pay, reference_id: null, status: 'paid', signature: 'ab' } }))!, state)).toBeNull();
    expect(onBridgeMessage({ type: 'done', payload: {} }, state)).toEqual({ status: 'success', paymentId: pay, referenceId: null, paymentStatus: 'paid', signature: 'ab' });
    expect(onBridgeMessage({ type: 'close', payload: {} }, { success: null, pending: null })).toEqual({ status: 'cancelled' });
    const s2 = { success: null, pending: null };
    onBridgeMessage({ type: 'status', payload: { status: 'confirming', payment_id: pay } }, s2);
    expect(onBridgeMessage({ type: 'close', payload: {} }, s2)).toEqual({ status: 'pending', paymentId: pay });
  });
});
