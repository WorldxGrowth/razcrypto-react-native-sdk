import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Linking, Modal, SafeAreaView, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { INJECTED_BRIDGE, onBridgeMessage, parseBridgeMessage, REQUEST_CLOSE, type CheckoutResult } from './bridge.js';
import { embedUrl, originOf, payOrigin, RazCryptoError, validateOptions, type CheckoutOptions } from './options.js';

export const VERSION = '1.0.0';

export type RazCryptoCheckoutProps = {
  /** Show the checkout. */
  visible: boolean;
  options: CheckoutOptions;
  /** Called once when checkout closes (paid, pending, cancelled or failed). */
  onResult: (result: CheckoutResult) => void;
};

/**
 * Full-screen RazCrypto checkout in a modal WebView (same window as on the web: network → coin → QR → success).
 *
 * ```tsx
 * <RazCryptoCheckout visible={open} options={{ key: 'pk_live_…', paymentId }} onResult={(r) => { setOpen(false); handle(r); }} />
 * ```
 */
export function RazCryptoCheckout({ visible, options, onResult }: RazCryptoCheckoutProps): ReactElement {
  // react-native-webview types default P to `undefined` (props become `never`); pass an explicit P.
  const web = useRef<WebView<object>>(null);
  const state = useRef<{ success: CheckoutResult | null; pending: CheckoutResult | null; done: boolean }>({ success: null, pending: null, done: false });
  const [loading, setLoading] = useState(true);

  const prepared = useMemo(() => {
    try {
      validateOptions(options);
      return { url: embedUrl(options), origin: payOrigin(options), error: null };
    } catch (e) {
      return { url: '', origin: '', error: e instanceof RazCryptoError ? e : new RazCryptoError('invalid_options', String(e)) };
    }
  }, [options]);

  const finish = useCallback(
    (r: CheckoutResult) => {
      if (state.current.done) return;
      state.current.done = true;
      onResult(r);
    },
    [onResult],
  );

  // Invalid options fail at once; a new opening starts fresh.
  useEffect(() => {
    if (!visible) {
      state.current = { success: null, pending: null, done: false };
      setLoading(true);
      return;
    }
    if (prepared.error) finish({ status: 'failed', code: prepared.error.code, message: prepared.error.message });
  }, [visible, prepared, finish]);

  const onMessage = (e: WebViewMessageEvent) => {
    // Only listen while the WebView shows the pay origin.
    if (originOf(e.nativeEvent.url) !== prepared.origin) return;
    const m = parseBridgeMessage(e.nativeEvent.data);
    if (!m) return;
    const r = onBridgeMessage(m, state.current);
    if (r) finish(r);
  };

  // Stay in the WebView only for the pay origin; wallet links (MetaMask, Trust, wc:, …) open outside.
  const onShouldStart = (req: ShouldStartLoadRequest) => {
    if (/^https?:/.test(req.url) && originOf(req.url) === prepared.origin) return true;
    void Linking.openURL(req.url).catch(() => undefined);
    return false;
  };

  return (
    <Modal visible={visible && !prepared.error} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => web.current?.injectJavaScript(REQUEST_CLOSE)}>
      <SafeAreaView style={styles.fill}>
        {visible && !prepared.error ? (
          <WebView<object>
            ref={web}
            source={{ uri: prepared.url }}
            originWhitelist={['https://*', 'http://*']}
            injectedJavaScriptBeforeContentLoaded={INJECTED_BRIDGE}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={onShouldStart}
            onLoadEnd={() => setLoading(false)}
            onError={(e: { nativeEvent: { description: string } }) => {
              if (!state.current.success) finish({ status: 'failed', code: 'network_error', message: e.nativeEvent.description });
            }}
            applicationNameForUserAgent={`RazCryptoReactNative/${VERSION}`}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures={false}
          />
        ) : null}
        {loading ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator size="large" />
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

/**
 * Promise-style helper: `const r = await open({ key, paymentId })`. Render `element` once in your screen.
 */
export function useRazCryptoCheckout(): { open: (options: CheckoutOptions) => Promise<CheckoutResult>; element: ReactElement | null } {
  const [current, setCurrent] = useState<{ options: CheckoutOptions; resolve: (r: CheckoutResult) => void } | null>(null);
  const open = useCallback((options: CheckoutOptions) => new Promise<CheckoutResult>((resolve) => setCurrent({ options, resolve })), []);
  const element = current ? (
    <RazCryptoCheckout
      visible
      options={current.options}
      onResult={(r) => {
        current.resolve(r);
        setCurrent(null);
      }}
    />
  ) : null;
  return { open, element };
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#ffffff' },
  loader: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
