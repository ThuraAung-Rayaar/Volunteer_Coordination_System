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
