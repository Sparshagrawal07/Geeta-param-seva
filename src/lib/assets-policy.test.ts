import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');
const IMAGES_DIR = path.join(ROOT, 'assets/images');
const ICONS_DIR = path.join(IMAGES_DIR, 'icons');
const LOGO_PATH = path.join(IMAGES_DIR, 'logo.png');
const MAX_LOGO_BYTES = 300 * 1024;
const MAX_ICON_BYTES = 300 * 1024;
const MAX_SOUND_BYTES = 512 * 1024;
const MAX_SPIRITUAL_ASSET_BYTES = 1024 * 1024;
const MAX_SPIRITUAL_TOTAL_BYTES = 10 * 1024 * 1024;

const GENERATED_ASSETS = [
  'icon.png',
  'adaptive-icon.png',
  'logo.png',
  'favicon.png',
  'notification-icon.png',
] as const;

function walkFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkFiles(full, extensions));
      continue;
    }
    if (extensions.some((ext) => entry.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

const SPIRITUAL_ASSET_FILENAMES = [
  'temple-hero-light.png',
  'temple-hero-dark.png',
  'temple-reflection-light.png',
  'temple-reflection-dark.png',
  'feather-light.png',
  'feather-dark.png',
  'lotus-divider-light.png',
  'lotus-divider-dark.png',
  'krishna-art-light.png',
  'krishna-art-dark.png',
  'nav-lotus-bg-light.png',
  'nav-lotus-bg-dark.png',
  'mandala-1.png',
  'mandala-2.png',
  'mandala-3.png',
  'mandala-4.png',
  'mandala-5.png',
] as const;

describe('assets/images policy', () => {
  it('keeps icons master folder plus generated Expo assets', () => {
    const entries = readdirSync(IMAGES_DIR).filter((name) => !name.startsWith('.'));
    expect(entries.sort()).toEqual(['icons', 'spiritual', ...GENERATED_ASSETS].sort());
  });

  it('ships spiritual artwork slots', () => {
    const spiritualDir = path.join(IMAGES_DIR, 'spiritual');
    const files = readdirSync(spiritualDir)
      .filter((name) => name.endsWith('.png'))
      .sort();
    expect([...SPIRITUAL_ASSET_FILENAMES].sort()).toEqual(files);
    expect(files).not.toContain('krishna-art.png');
    expect(files).not.toContain('home-hero-light.jpg');
    expect(files).not.toContain('home-hero-dark.jpg');
  });

  it('keeps runtime spiritual artwork within media budgets', () => {
    const spiritualDir = path.join(IMAGES_DIR, 'spiritual');
    const files = walkFiles(spiritualDir, ['.png']);
    const oversized = files
      .filter((file) => statSync(file).size > MAX_SPIRITUAL_ASSET_BYTES)
      .map((file) => path.basename(file));
    const totalBytes = files.reduce((total, file) => total + statSync(file).size, 0);
    expect(oversized).toEqual([]);
    expect(totalBytes).toBeLessThanOrEqual(MAX_SPIRITUAL_TOTAL_BYTES);
  });

  it('uses precomposed hero reflections without runtime image blur', () => {
    const hero = readFileSync(
      path.join(SRC, 'components/verse/home-hero-header.tsx'),
      'utf8'
    );
    expect(hero).toContain('slot="heroTempleReflection"');
    expect(hero).not.toContain('blurRadius');
    expect(hero).not.toContain('MaskedView');
  });

  it('ships Android/iOS master icon packs', () => {
    expect(existsSync(path.join(ICONS_DIR, 'ios/iTunesArtwork@2x.png'))).toBe(true);
    expect(existsSync(path.join(ICONS_DIR, 'android/mipmap-xxxhdpi/ic_launcher_foreground.png'))).toBe(
      true
    );
    expect(existsSync(path.join(ICONS_DIR, 'android/playstore-icon.png'))).toBe(true);
    expect(existsSync(path.join(ICONS_DIR, 'android/values/ic_launcher_background.xml'))).toBe(true);
  });

  it('does not ship legacy template image names', () => {
    expect(existsSync(path.join(IMAGES_DIR, 'splash-icon.png'))).toBe(false);
    expect(existsSync(path.join(IMAGES_DIR, 'logo-display.png'))).toBe(false);
    expect(existsSync(path.join(IMAGES_DIR, 'android-icon-foreground.png'))).toBe(false);
  });

  it('does not ship expo.icon folder', () => {
    expect(existsSync(path.join(ROOT, 'assets/expo.icon'))).toBe(false);
  });

  it('keeps generated logo and icon under size budget', () => {
    expect(statSync(LOGO_PATH).size).toBeLessThanOrEqual(MAX_LOGO_BYTES);
    expect(statSync(path.join(IMAGES_DIR, 'icon.png')).size).toBeLessThanOrEqual(MAX_ICON_BYTES);
  });

  it('keeps notification sound under size budget', () => {
    const soundPath = path.join(ROOT, 'assets/sounds/community_reminder.wav');
    expect(statSync(soundPath).size).toBeLessThanOrEqual(MAX_SOUND_BYTES);
  });

  it('uses Android-safe launcher filenames without spaces', () => {
    const androidPngs = walkFiles(path.join(ICONS_DIR, 'android'), ['.png']);
    const offenders = androidPngs.filter((file) => path.basename(file).includes(' '));
    expect(offenders).toEqual([]);
  });
});

describe('app.config asset references', () => {
  it('wires icon, adaptive, splash, favicon, and notification assets', () => {
    const config = readFileSync(path.join(ROOT, 'app.config.js'), 'utf8');
    expect(config).toContain("const ICON = './assets/images/icon.png'");
    expect(config).toContain("const ADAPTIVE_ICON = './assets/images/adaptive-icon.png'");
    expect(config).toContain("const LOGO = './assets/images/logo.png'");
    expect(config).toContain("const FAVICON = './assets/images/favicon.png'");
    expect(config).toContain("const NOTIFICATION_ICON = './assets/images/notification-icon.png'");
    expect(config).toContain('icon: ICON');
    expect(config).toContain('foregroundImage: ADAPTIVE_ICON');
    expect(config).toContain('brandPalette.iconBackground');
    expect(config).not.toContain('splash-icon');
  });

  it('does not reference staging APP_ENV branching', () => {
    const config = readFileSync(path.join(ROOT, 'app.config.js'), 'utf8');
    expect(config).not.toMatch(/APP_ENV|IS_STAGING|\.staging/);
    expect(config).toContain("const APP_NAME = 'Geeta Param Seva'");
    expect(config).toContain("const APP_PACKAGE = 'com.geetaparamseva.app'");
  });
});

describe('google-services package list', () => {
  it('contains only production android package', () => {
    const googleServices = JSON.parse(
      readFileSync(path.join(ROOT, 'google-services.json'), 'utf8')
    ) as {
      client: { client_info: { android_client_info: { package_name: string } } }[];
    };
    const packages = googleServices.client.map((c) => c.client_info.android_client_info.package_name);
    expect(packages).toEqual(['com.geetaparamseva.app']);
  });
});

describe('dead code and asset imports', () => {
  it('does not reference removed admin whitelist or add-members modules', () => {
    expect(existsSync(path.join(SRC, 'components/admin/add-members-modal.tsx'))).toBe(false);
    expect(existsSync(path.join(SRC, 'components/admin/admin-whitelist-modal.tsx'))).toBe(false);
    expect(existsSync(path.join(SRC, 'services/admin-whitelist.ts'))).toBe(false);

    const files = walkFiles(SRC, ['.ts', '.tsx']);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith('.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      if (
        content.includes('add-members-modal') ||
        content.includes('admin-whitelist-modal') ||
        content.includes('admin-whitelist')
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('does not import deleted template assets', () => {
    const files = walkFiles(SRC, ['.ts', '.tsx']);
    const banned = ['react-logo', 'tabIcons', 'logo-glow', 'splash-icon', 'brand-loader'];
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith('.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      if (banned.some((token) => content.includes(token))) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('AppSpinner and LoadingScreen do not embed the logo', () => {
    const spinner = readFileSync(path.join(SRC, 'components/ui/app-spinner.tsx'), 'utf8');
    expect(spinner).not.toContain('require(');
    expect(spinner).not.toContain('assets/images');
    expect(spinner).not.toContain('<Image');

    const loading = readFileSync(path.join(SRC, 'components/ui/loading-screen.tsx'), 'utf8');
    expect(loading).not.toContain('logo.png');
    expect(loading).not.toContain('<Image');
    expect(loading).toContain('AppSpinner');
  });

  it('loads only Regular + Bold Noto weights (not the package barrel)', () => {
    const layout = readFileSync(path.join(SRC, 'app/_layout.tsx'), 'utf8');
    expect(layout).toContain("@expo-google-fonts/noto-sans-devanagari/400Regular");
    expect(layout).toContain("@expo-google-fonts/noto-sans-devanagari/700Bold");
    expect(layout).not.toMatch(
      /from '@expo-google-fonts\/noto-sans-devanagari';/
    );
  });

  it('imports Ionicons from the direct package path', () => {
    const files = walkFiles(SRC, ['.ts', '.tsx']);
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith('.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      if (content.includes("from '@expo/vector-icons'") && !content.includes("from '@expo/vector-icons/Ionicons'")) {
        offenders.push(path.relative(ROOT, file));
      }
      if (/from '@expo\/vector-icons';/.test(content)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
