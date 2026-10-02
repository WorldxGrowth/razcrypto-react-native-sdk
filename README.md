# RazCrypto Gateway — React Native checkout SDK

Open RazCrypto crypto checkout in your React Native app. The customer sees the same window as on the web:
1. pick a network, then a coin
2. scan the QR, or tap "Open in MetaMask / Trust"
3. on success the screen turns green

Your app gets the result back.

- **npm (after release):** `@razcrypto/react-native`
- **Peer dependencies:** `react`, `react-native` ≥ 0.72, `react-native-webview` ≥ 13
- **Keys:** client-side only, publishable key (`pk_…`). Your server creates the payment with its secret key.
- **License:** MIT

```bash
npm install @razcrypto/react-native react-native-webview
cd ios && pod install   # iOS
```

## Usage: hook (promise style)

```tsx
import { useRazCryptoCheckout } from '@razcrypto/react-native';

function PayButton({ paymentId }: { paymentId: string }) {
  const { open, element } = useRazCryptoCheckout();
  return (
    <>
      <Button
        title="Pay with crypto"
        onPress={async () => {
          const r = await open({ key: 'pk_live_…', paymentId }); // or { checkoutUrl }
          if (r.status === 'success') await api.verify(r.paymentId, r.signature); // then wait for payment.paid
          if (r.status === 'failed') Alert.alert(r.message);
        }}
      />
      {element}
    </>
  );
}
```

## Usage: component

```tsx
<RazCryptoCheckout
  visible={open}
  options={{ checkoutUrl }}
  onResult={(r) => {
    setOpen(false);
    handle(r);
  }}
/>
```

`CheckoutResult` is one of:
- `{ status: 'success', paymentId, referenceId, paymentStatus, signature }`
- `{ status: 'pending', paymentId }` (seen on-chain, confirming)
- `{ status: 'cancelled' }`
- `{ status: 'failed', code, message }`

## What happens
- **Bridge:** before the page loads, the SDK maps the page's `window.RazCryptoNative.postMessage` to React Native's WebView bridge. Messages are accepted only from the pay origin.
- **Wallet links:** links to MetaMask, Trust, `wc:` and every other site open outside the app with `Linking`.
- **Android Back:** asks "leave this payment?". This is the same dialog as on the web.
- **After a success:**
  - The window closes by itself after the green animation.
  - Verify `signature` (HMAC-SHA256 of `payment_id|reference_id|status` with your webhook secret) on your server.
  - Ship only after the `payment.paid` webhook.
- **Older React Native:** URLs are parsed without the `URL` class, because older RN versions ship an incomplete one.

## Development

```bash
npm install
npm run typecheck && npm test && npm run build
```
