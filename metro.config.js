const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

// TF.js ships platform_node.js which crashes in browser — redirect to browser platform on web
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName.includes('platform_node')) {
    return {
      filePath: require.resolve('@tensorflow/tfjs-core/dist/platforms/platform_browser'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
