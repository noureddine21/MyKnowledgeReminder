module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-notify-kit|@op-engineering|@react-native-vector-icons|react-native-safe-area-context|react-native-screens)/)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/index.ts'],
};
