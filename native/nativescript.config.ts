import { NativeScriptConfig } from '@nativescript/core';

export default {
  id: 'org.nativescript.fieldnotes',
  appPath: 'app',
  appResourcesPath: 'App_Resources',
  bundler: 'vite',
  bundlerConfigPath: 'vite.config.mts',
  cli: { additionalPathsToClean: ['.ns-vite-build'] },
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none',
  },
} as NativeScriptConfig;
