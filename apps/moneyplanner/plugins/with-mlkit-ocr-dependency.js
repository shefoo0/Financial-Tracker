// Asks Google Play Services to download the ML Kit text-recognition model when
// the app is installed (not on the first scan), so reading a statement photo
// works offline right away. Used by expo-text-extractor on Android.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withMlkitOcrDependency(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, 'com.google.mlkit.vision.DEPENDENCIES', 'ocr');
    return cfg;
  });
};
