import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lionclubsmembership.app',
  appName: 'LionClubs',
  webDir: 'mobile-client-spike/dist',
  ios: {
    // Candidate A (NATIVE_SPIKE_ACCEPTANCE_2026-10-17.md #3): reuse the
    // existing HttpOnly web session cookie via Capacitor's native HTTP/cookie
    // handling instead of issuing a separate mobile token.
    contentInset: 'automatic',
  },
};

export default config;
