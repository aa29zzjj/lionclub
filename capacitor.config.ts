import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lionclubsmembership.app',
  appName: 'LionClubs',
  webDir: 'mobile-app/dist',
  // Matches --lion-page in mobile-app/src/styles.css. Without this the native
  // WKWebView's own inset/overscroll backing stays white, which shows as a
  // white strip behind the status bar (contentInset: 'automatic' reserves
  // that space natively, outside anything CSS on html/body can reach).
  backgroundColor: '#0a0d18',
  ios: {
    // Candidate B: dedicated bearer-token mobile auth API (/api/mobile/*),
    // not the web's HttpOnly cookie session. See src/lib/mobile-auth.ts.
    contentInset: 'automatic',
    backgroundColor: '#0a0d18',
  },
};

export default config;
