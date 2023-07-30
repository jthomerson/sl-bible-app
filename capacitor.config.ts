import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'sl-bible-app',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
