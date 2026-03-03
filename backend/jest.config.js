export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/*.test.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};
