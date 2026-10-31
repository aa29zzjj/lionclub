import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lionclubsmembership.app',
  appName: 'LionClubs',
  webDir: 'mobile-app/dist',
  ios: {
    // Candidate B: dedicated bearer-token mobile auth API (/api/mobile/*),
    // not the web's HttpOnly cookie session. See src/lib/mobile-auth.ts.
    contentInset: 'automatic',
  },
};

export default config;
