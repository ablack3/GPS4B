import { registerRootComponent } from 'expo';

// Import for side effects: defines the background location task at bundle
// load, which TaskManager requires so the OS can deliver location updates
// even when no UI is mounted.
import './src/location';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
