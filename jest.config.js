module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*)',
  ],
  moduleNameMapper: {
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-sqlite.ts',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.ts',
    '^expo-file-system/legacy$': '<rootDir>/__mocks__/expo-file-system/legacy.ts',
    '^expo-font$': '<rootDir>/__mocks__/expo-font.ts',
    '^@expo/vector-icons/Ionicons$': '<rootDir>/__mocks__/ionicons.ts',
  },
};
