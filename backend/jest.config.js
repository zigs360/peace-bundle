module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  setupFilesAfterEnv: ['./tests/setup.js'],
  globalTeardown: './tests/globalTeardown.js',
};
