const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Names local/CI APK outputs with a readable base name (display name stays "Geeta Param Seva").
 *
 * Note: EAS cloud hosting always serves downloads as `application-<buildId>.apk` via
 * Content-Disposition, regardless of Gradle output names. Use
 * `npm run download:android:apk` (or `build:android:apk:save`) to save a clean filename.
 */
function withApkFilename(config, { apkBaseName = 'Geeta-Param-Seva' } = {}) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    const marker = '// geeta-param-seva-apk-filename';
    if (config.modResults.contents.includes(marker)) {
      return config;
    }

    // Escape ${} so Gradle — not this JS template — expands version/ABI.
    // Gradle 9 removed project/defaultConfig archivesBaseName; use base.archivesName.
    config.modResults.contents += `
${marker}
base {
    archivesName = "${apkBaseName}"
}
android.applicationVariants.configureEach { variant ->
    variant.outputs.configureEach { output ->
        def abi = output.getFilter(com.android.build.OutputFile.ABI)
        def abiSuffix = abi != null ? "-\${abi}" : ""
        outputFileName = "${apkBaseName}-\${variant.versionName}\${abiSuffix}.apk"
    }
}
`;
    return config;
  });
}

module.exports = withApkFilename;
