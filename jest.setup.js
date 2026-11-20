/* eslint-env jest */

// Native modules are not available in Jest: replace them with mocks.
jest.mock('react-native-notify-kit', () => require('react-native-notify-kit/jest-mock'));

jest.mock('@op-engineering/op-sqlite', () => ({
  open: jest.fn(() => {
    throw new Error('op-sqlite is not available in tests; mock src/database/connection instead.');
  }),
}));

jest.mock('@react-native-community/datetimepicker', () => ({
  DateTimePickerAndroid: { open: jest.fn(), dismiss: jest.fn() },
}));

jest.mock('@react-native-vector-icons/material-design-icons/static', () => ({
  MaterialDesignIcons: () => null,
}));

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
