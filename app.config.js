const brandPalette = require('./brand-palette.js');

// Ensure EXPO_PUBLIC_ADMOB_* from .env are visible when Expo evaluates this config.
try {
  // eslint-disable-next-line import/no-extraneous-dependencies, @typescript-eslint/no-require-imports
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
} catch {
  // dotenv optional; EAS/env may already inject vars
}

const APP_NAME = 'Geeta Param Seva';
const APP_PACKAGE = 'com.geetaparamseva.app';

/** Expo-facing assets generated from assets/images/icons via `npm run prepare:icons`. */
const ICON = './assets/images/icon.png';
const ADAPTIVE_ICON = './assets/images/adaptive-icon.png';
const LOGO = './assets/images/logo.png';
const FAVICON = './assets/images/favicon.png';
const NOTIFICATION_ICON = './assets/images/notification-icon.png';

/**
 * Preview APKs: ARM device ABIs only (no x86/x86_64 emulator slices).
 * preview-arm64: single-ABI APK for the smallest sideload artifact.
 * Production AAB: ARM ABIs; Play Store serves the matching split.
 */
const buildProfile = process.env.EAS_BUILD_PROFILE || process.env.EAS_BUILD_PROFILE_NAME || '';
const androidBuildArchs =
  buildProfile === 'preview-arm64' ? ['arm64-v8a'] : ['armeabi-v7a', 'arm64-v8a'];

/** Google sample IDs until real AdMob app IDs are set in env / EAS secrets. */
const appJson = require('./app.json');
const admobFromJson = appJson['react-native-google-mobile-ads'] || {};
const admobAndroidAppId =
  process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID ||
  admobFromJson.android_app_id ||
  'ca-app-pub-3940256099942544~3347511713';
const admobIosAppId =
  process.env.EXPO_PUBLIC_ADMOB_IOS_APP_ID ||
  admobFromJson.ios_app_id ||
  'ca-app-pub-3940256099942544~1458002511';

/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: APP_NAME,
  slug: 'GeetaParamSeva',
  version: '1.0.0',
  orientation: 'portrait',
  icon: ICON,
  scheme: 'geetaparamseva',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: APP_PACKAGE,
    googleServicesFile: './GoogleService-Info.plist',
    icon: ICON,
    supportsTablet: false,
    entitlements: {
      'aps-environment': 'production',
    },
    infoPlist: {
      CFBundleDisplayName: APP_NAME,
      ITSAppUsesNonExemptEncryption: false,
    },
    config: {
      usesNonExemptEncryption: false,
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
      ],
    },
  },
  android: {
    package: APP_PACKAGE,
    versionCode: 1,
    googleServicesFile: './google-services.json',
    adaptiveIcon: {
      backgroundColor: brandPalette.iconBackground,
      foregroundImage: ADAPTIVE_ICON,
    },
    permissions: [
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.VIBRATE',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.WAKE_LOCK',
    ],
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    bundler: 'metro',
    favicon: FAVICON,
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: brandPalette.iconBackground,
        image: LOGO,
        imageWidth: 200,
        resizeMode: 'contain',
        android: {
          image: LOGO,
          imageWidth: 200,
        },
      },
    ],
    'expo-localization',
    '@react-native-community/datetimepicker',
    [
      'expo-notifications',
      {
        sounds: ['./assets/sounds/community_reminder.wav'],
        icon: NOTIFICATION_ICON,
        color: brandPalette.primary,
        defaultChannel: 'community-reminders-v4',
        // Ensures remote alerts can wake the app; custom sounds still need a store/dev build.
        enableBackgroundRemoteNotifications: true,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          // Drop emulator ABIs from release binaries (biggest APK win for direct APK installs).
          // Play AAB still delivers per-device splits; ARM coverage stays intact.
          buildArchs: androidBuildArchs,
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          enablePngCrunchInReleaseBuilds: true,
        },
        ios: {
          // Required by react-native-google-mobile-ads on Expo.
          useFrameworks: 'static',
          deploymentTarget: '16.4',
          privacyManifestAggregationEnabled: true,
        },
      },
    ],
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: admobAndroidAppId,
        iosAppId: admobIosAppId,
      },
    ],
    './plugins/with-admob-sdk-pin',
    [
      './plugins/with-apk-filename',
      { apkBaseName: 'Geeta-Param-Seva' },
    ],
  ],
  experiments: {
    typedRoutes: true,
    tsconfigPaths: true,
  },
  extra: {
    eas: {
      projectId: 'd0d29dc6-414e-45e7-9570-803d2470e884',
    },
  },
};

module.exports = {
  // Keep app.json AdMob keys in the resolved config (expo-doctor + invertase gradle).
  ...appJson,
  expo: config,
  'react-native-google-mobile-ads': {
    android_app_id: admobAndroidAppId,
    ios_app_id: admobIosAppId,
  },
};
