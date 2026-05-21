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
      // Desktop project runs all non-mobile specs PLUS `mobile-tap-discipline`
      // — that meta-test reads the spec directory via fs and needs no browser
      // viewport, so it runs here (under chromium, fastest project) rather
      // than redundantly in every phone project.
      testMatch: /tests\/(?:(?!mobile-).+|mobile-tap-discipline)\.spec\.js$/,
    },
    {
      name: 'iphone-se',
      use: {
        ...devices['iPhone SE'],
        baseURL: 'http://localhost:8080',
        screenshot: 'only-on-failure',
      },
      // Smallest realistic iOS viewport (375px wide). Same mobile-* spec
      // coverage as iphone-14; catches breakpoint regressions at the
      // narrow end of the phone range.
      testMatch: /tests\/mobile-.+\.spec\.js$/,
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
      // `mobile-tap-discipline.spec.js` is a viewport-agnostic meta-test —
      // routed to the desktop project to avoid running it under every phone.
      testMatch: /tests\/mobile-(?!tap-discipline\.spec\.js$).+\.spec\.js$/,
    },
    {
      name: 'iphone-14-pro-max',
      use: {
        ...devices['iPhone 14 Pro Max'],
        baseURL: 'http://localhost:8080',
        screenshot: 'only-on-failure',
      },
      // Largest realistic iOS viewport (430px wide). Same mobile-* spec
      // coverage as iphone-14; catches breakpoint regressions at the
      // wide end of the phone range.
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
