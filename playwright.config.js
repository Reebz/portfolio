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
      testMatch: /tests\/mobile-.+\.spec\.js$/,
    },
    {
      name: 'ipad-pro-11',
      use: {
        ...devices['iPad Pro 11'],
        baseURL: 'http://localhost:8080',
        screenshot: 'only-on-failure',
      },
      testMatch: /tests\/mobile-.+\.spec\.js$/,
    },
  ],
});
