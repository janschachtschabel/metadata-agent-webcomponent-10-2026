// Karma configuration for `ng test`.
//
// Exists mainly for `ChromeHeadlessCI`: inside a container Chrome cannot use its
// sandbox, and without `--no-sandbox` the browser dies on start and the job
// fails with "no captured browser" — which reads like a broken test rather than
// a missing flag. `--disable-dev-shm-usage` avoids the small /dev/shm that
// GitLab runners give a container, where Chrome crashes on larger test suites.
//
// Locally, `npx ng test` uses ChromeHeadless from angular.json and needs none
// of this.

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage'),
      subdir: '.',
      reporters: [{ type: 'text-summary' }, { type: 'cobertura' }],
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadless'],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      },
    },
    restartOnFileChange: true,
  });
};
