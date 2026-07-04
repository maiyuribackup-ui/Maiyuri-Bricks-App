// Standalone Expo app (not an npm workspace member). It has its own
// node_modules with React 19 / SDK 54, but @maiyuri/shared is linked via
// `file:` from packages/shared, so Metro must be allowed to read that source.
//
// We rely on normal (hierarchical) resolution: the app's own node_modules is
// nearest, so its React 19 always wins over the monorepo root's React 18 — no
// need to disable hierarchical lookup (doing so breaks react-native's own
// nested deps like @react-native/virtualized-lists).
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');

const config = getDefaultConfig(projectRoot);

// Let Metro read the linked shared package's source.
config.watchFolders = [sharedRoot];

module.exports = withNativeWind(config, { input: './global.css' });
