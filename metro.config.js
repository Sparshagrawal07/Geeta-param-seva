const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

/**
 * Keep release assets lean:
 * - Only Ionicons from @expo/vector-icons (~3.5 MB of other icon fonts dropped)
 * - Only Noto Sans Devanagari 400 + 700 (other weights unused)
 */
const unusedIconFonts =
  /@expo\/vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\/(?!Ionicons\.ttf$).+\.ttf$/;
const unusedNotoWeights =
  /@expo-google-fonts\/noto-sans-devanagari\/(?!400Regular|700Bold)[^/]+\/.+\.ttf$/;

const existing = config.resolver.blockList;
config.resolver.blockList = existing
  ? Array.isArray(existing)
    ? [...existing, unusedIconFonts, unusedNotoWeights]
    : [existing, unusedIconFonts, unusedNotoWeights]
  : [unusedIconFonts, unusedNotoWeights];

module.exports = withNativeWind(config, { input: './src/global.css' });
