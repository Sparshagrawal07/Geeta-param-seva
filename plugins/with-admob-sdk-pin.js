const {
  withProjectBuildGradle,
  createRunOncePlugin,
} = require('@expo/config-plugins');

/**
 * Expo SDK 57 ships Kotlin 2.1.x. react-native-google-mobile-ads 16.5 pulls
 * play-services-ads 25.4 (Kotlin metadata 2.3), which fails compileReleaseKotlin.
 * Pin Ads SDK to the last 24.x line known to work with Kotlin 2.1.
 */
function withAdMobSdkPin(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    const marker = '// geeta-param-seva-admob-sdk-pin';
    if (config.modResults.contents.includes(marker)) {
      return config;
    }

    config.modResults.contents += `
${marker}
allprojects {
    configurations.all {
        resolutionStrategy {
            force 'com.google.android.gms:play-services-ads:24.6.0'
        }
    }
}
`;
    return config;
  });
}

module.exports = createRunOncePlugin(withAdMobSdkPin, 'with-admob-sdk-pin', '1.0.0');
