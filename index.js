/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';
import { registerBackgroundNotificationHandler } from './src/services/notificationEvents';

// Must be registered before the app component so background/killed-state
// notification events (e.g. a tap on a reminder) are handled.
registerBackgroundNotificationHandler();

AppRegistry.registerComponent(appName, () => App);
