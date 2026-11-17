module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|react-native-.*)/)',
  ],
  moduleNameMapper: {
    '^react-native-worklets$':
      '<rootDir>/node_modules/react-native-worklets/src/mock.ts',
    '^react-native-reanimated$':
      '<rootDir>/node_modules/react-native-reanimated/mock.js',
  },
};
