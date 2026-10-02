/** Outcome of a checkout. Always confirm on your server (webhook `payment.paid`) before shipping. */
export type CheckoutResult =
  /** `signature` = hex HMAC-SHA256(webhook secret, "payment_id|reference_id|status"); verify on your server. */
  | { status: 'success'; paymentId: string; referenceId: string | null; paymentStatus: string; signature: string | null }
  /** Seen on-chain, waiting for confirmations. */
  | { status: 'pending'; paymentId: string }
  | { status: 'cancelled' }
  | { status: 'failed'; code: string; message: string };

export type BridgeMessage = { type: string; payload: Record<string, unknown> };

/** A message from the checkout page (`{source:"razcrypto", type, payload}`), or null when it is not ours. */
export function parseBridgeMessage(raw: string): BridgeMessage | null {
  try {
    const o = JSON.parse(raw) as { source?: unknown; type?: unknown; payload?: unknown };
    if (o?.source !== 'razcrypto' || typeof o.type !== 'string') return null;
    return { type: o.type, payload: o.payload && typeof o.payload === 'object' ? (o.payload as Record<string, unknown>) : {} };
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export function toSuccess(p: Record<string, unknown>): Extract<CheckoutResult, { status: 'success' }> {
  return { status: 'success', paymentId: str(p.payment_id) ?? '', referenceId: str(p.reference_id), paymentStatus: str(p.status) ?? 'paid', signature: str(p.signature) };
}

/** Runs before the page loads: maps the page's `window.RazCryptoNative.postMessage` to React Native's bridge. */
export const INJECTED_BRIDGE = `(function(){window.RazCryptoNative={postMessage:function(s){window.ReactNativeWebView.postMessage(s);}};})();true;`;

/** Android Back: let the page ask "leave this payment?"; close directly when the page is not ready. */
export const REQUEST_CLOSE = `(function(){if(window.__razcryptoRequestClose){window.__razcryptoRequestClose();}else{window.ReactNativeWebView.postMessage(JSON.stringify({source:'razcrypto',type:'close',payload:{}}));}})();true;`;

/**
 * Reducer for the page's messages. `state` keeps the last success/pending so `close` can report them.
 * Returns the final result when checkout should close, else null.
 */
export function onBridgeMessage(m: BridgeMessage, state: { success: CheckoutResult | null; pending: CheckoutResult | null }): CheckoutResult | null {
  switch (m.type) {
    case 'success':
      state.success = toSuccess(m.payload);
      return null;
    case 'status':
      if (m.payload.status === 'confirming') state.pending = { status: 'pending', paymentId: str(m.payload.payment_id) ?? '' };
      return null;
    case 'done':
      return state.success ?? toSuccess(m.payload);
    case 'close':
      return state.success ?? state.pending ?? { status: 'cancelled' };
    default:
      return null;
  }
}
