/**
 * @format
 */

/* eslint-env jest */
require('react-native-gesture-handler/jestSetup');

try {
  const {
    createJSReanimatedModule,
  } = require('react-native-reanimated/src/ReanimatedModule/js-reanimated');
  const instance = createJSReanimatedModule();
  Object.getPrototypeOf(instance).setCSSEventHandler = () => {};
} catch (e) {
  // Ignored if not found
}

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Map: (props) => React.createElement(View, { testID: 'maplibre-map', ...props }, props.children),
    Camera: (props) => React.createElement(View, { testID: 'maplibre-camera', ...props }, props.children),
    Marker: (props) => React.createElement(View, { testID: 'maplibre-marker', ...props }, props.children),
    LogManager: {
      setLogLevel: jest.fn(),
      onLog: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    },
  };
}, { virtual: true });

if (typeof afterEach === 'function') {
  afterEach(() => {
    try {
      const { appEventBus } = require('./src/core/events/eventBus');
      appEventBus.clear();
    } catch (e) {}
  });
}
