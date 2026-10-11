import { defineConfig } from 'vitest/config';

const isAndroidOrTermux = process.platform === 'android' || Boolean(process.env.TERMUX_VERSION);

export default defineConfig({
  test: {
    testTimeout: isAndroidOrTermux ? 45000 : 15000,
    hookTimeout: isAndroidOrTermux ? 45000 : 15000,
    fileParallelism: !isAndroidOrTermux, // Sequential on Android/Termux to prevent LMK eviction, parallel in CI and workstations
  },
});
