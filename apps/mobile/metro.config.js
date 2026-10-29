// apps/mobile has its own install (Expo SDK pins React 19.2.3, the web app uses 19.2.4), so it is
// not an npm workspace. Metro is told to also watch the shared TypeScript package it links to.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../../packages/shared')];

module.exports = config;
