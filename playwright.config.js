const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npx serve -l 8080 -s .',
    port: 8080,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        baseURL: 'http://localhost:8080',
        screenshot: 'only-on-failure',
      },
      // Desktop project runs all existing specs; the mobile-*.spec.js files
      // are explicitly excluded so iOS Safari behavior doesn't run under chromium.
      testMatch: /tests\/(?!mobile-).+\.spec\.js$/,
    },
    {
      name: 'iphone-14',
      use: {
        ...devices['iPhone 14'],
        baseURL: 'http://localhost:8080',
        screenshot: 'only-on-failure',
      },
      // Mobile mode is now phones-only — touch + max-width 767px. Tablets
      // (768+) inherit desktop styling per the touch-detection contract
      // rewrite in style.css/desktop.js/boot.js.
      testMatch: /tests\/mobile-.+\.spec\.js$/,
    },
    {
      name: 'ipad-pro-11',
      use: {
        ...devices['iPad Pro 11'],
        baseURL: 'http://localhost:8080',
        screenshot: 'only-on-failure',
      },
      // Tablets inherit the desktop experience — this project runs only the
      // tablet-regression spec that proves the inheritance holds (zoom 1.5,
      // no mobile-specific CSS, native Win98 chrome).
      testMatch: /tests\/tablet-.+\.spec\.js$/,
    },
  ],
});
