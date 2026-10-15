module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^octokit$': '<rootDir>/tests/mocks/octokitMock.js',
    '.*utils/sanitizer$': '<rootDir>/tests/mocks/sanitizerMock.js',
  },
  testTimeout: 20000,
};
