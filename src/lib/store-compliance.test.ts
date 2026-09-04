import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { LEGAL_SUPPORT_EMAIL, getPrivacyPolicySections, getTermsOfServiceSections, privacyPolicySections, resolveLegalAudience, termsOfServiceSections } from '@/lib/legal-content';
import { messages } from '@/lib/i18n/messages';

const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'src');

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

function flattenBodies(sections: Array<{ title: string; body: string }>) {
  return sections.map((section) => `${section.title}\n${section.body}`).join('\n').toLowerCase();
}

describe('store compliance: legal and account deletion', () => {
  it('ships privacy policy content covering collection, use, and deletion', () => {
    const titles = privacyPolicySections.map((section) => section.title.toLowerCase());
    expect(titles.some((title) => title.includes('collect'))).toBe(true);
    expect(titles.some((title) => title.includes('use'))).toBe(true);
    expect(titles.some((title) => title.includes('deletion') || title.includes('retention'))).toBe(
      true
    );
    expect(LEGAL_SUPPORT_EMAIL).toBe('geetaparamseva@gmail.com');
  });

  it('ships distinct member and admin privacy/terms variants', () => {
    const memberPrivacy = flattenBodies(getPrivacyPolicySections('member'));
    const adminPrivacy = flattenBodies(getPrivacyPolicySections('admin'));
    const memberTerms = flattenBodies(getTermsOfServiceSections('member'));
    const adminTerms = flattenBodies(getTermsOfServiceSections('admin'));

    expect(memberPrivacy).toContain(LEGAL_SUPPORT_EMAIL);
    expect(adminPrivacy).toContain(LEGAL_SUPPORT_EMAIL);
    expect(memberTerms).toContain(LEGAL_SUPPORT_EMAIL);
    expect(adminTerms).toContain(LEGAL_SUPPORT_EMAIL);

    expect(adminPrivacy).toMatch(/personal pin|roster|sole/);
    expect(adminTerms).toMatch(/personal pin|join pin|admin/);
    expect(memberPrivacy).toMatch(/join pin|account deletion|children|audience/);
    expect(memberPrivacy).toMatch(/admob|advertising|banner/);
    expect(adminPrivacy).toMatch(/admob|advertising|banner/);
    expect(memberTerms).toMatch(/advertising|banner/);
    expect(memberTerms).not.toEqual(adminTerms);
    expect(resolveLegalAudience('user')).toBe('member');
    expect(resolveLegalAudience('admin')).toBe('admin');
    expect(resolveLegalAudience('senior_admin')).toBe('admin');
    expect(resolveLegalAudience(null)).toBe('member');
  });

  it('ships terms of service content', () => {
    expect(termsOfServiceSections.length).toBeGreaterThanOrEqual(3);
    expect(getTermsOfServiceSections('admin').length).toBeGreaterThanOrEqual(3);
  });

  it('exposes in-app privacy, terms, and delete-account copy', () => {
    expect(messages.privacyPolicy.length).toBeGreaterThan(0);
    expect(messages.termsOfService.length).toBeGreaterThan(0);
    expect(messages.deleteAccount.length).toBeGreaterThan(0);
    expect(messages.deleteAccountConfirm.toLowerCase()).toContain('delete');
    expect(messages.signInLegalConsent.toLowerCase()).toMatch(/terms|privacy/);
    expect(messages.legalAudienceMember.length).toBeGreaterThan(0);
    expect(messages.legalAudienceAdmin.length).toBeGreaterThan(0);
    expect(messages.legalAudienceSignedOutNote.toLowerCase()).toMatch(/member|admin/);
  });

  it('keeps legal screens and account settings wired in the app tree', () => {
    expect(existsSync(path.join(SRC, 'app/legal/privacy.tsx'))).toBe(true);
    expect(existsSync(path.join(SRC, 'app/legal/terms.tsx'))).toBe(true);
    expect(existsSync(path.join(SRC, 'app/settings.tsx'))).toBe(true);
    expect(existsSync(path.join(SRC, 'components/settings/settings-panel.tsx'))).toBe(true);
    expect(existsSync(path.join(SRC, 'components/legal/legal-links.tsx'))).toBe(true);
    expect(existsSync(path.join(SRC, 'components/legal/legal-document.tsx'))).toBe(true);
    expect(existsSync(path.join(SRC, 'services/account.ts'))).toBe(true);

    const accountService = readFileSync(path.join(SRC, 'services/account.ts'), 'utf8');
    expect(accountService).toContain('deleteAccount');
    expect(accountService).not.toMatch(/test-auth|isTestSession|mock/);

    const settingsPanel = readFileSync(path.join(SRC, 'components/settings/settings-panel.tsx'), 'utf8');
    expect(settingsPanel).toContain('deleteUserAccount');
    expect(settingsPanel).toContain('/legal/privacy');
    expect(settingsPanel).toContain('/legal/terms');

    const privacyScreen = readFileSync(path.join(SRC, 'app/legal/privacy.tsx'), 'utf8');
    const termsScreen = readFileSync(path.join(SRC, 'app/legal/terms.tsx'), 'utf8');
    expect(privacyScreen).toContain('resolveLegalAudience');
    expect(termsScreen).toContain('resolveLegalAudience');
  });
});

describe('store compliance: no production auth bypasses', () => {
  it('does not ship mock store or test-auth modules', () => {
    expect(existsSync(path.join(SRC, 'services/mock-store.ts'))).toBe(false);
    expect(existsSync(path.join(SRC, 'lib/test-auth.ts'))).toBe(false);
  });

  it('sign-in screen has no development login shortcuts', () => {
    const signIn = readFileSync(path.join(SRC, 'app/(auth)/sign-in.tsx'), 'utf8');
    expect(signIn).not.toMatch(/signInForTesting|isTestAuthEnabled|testSignIn|Dev bypass|devOtp/i);
    expect(signIn).toContain('signInWithPhoneAndGroupPin');
    expect(signIn).toContain('LegalLinks');
    expect(signIn).not.toMatch(/whatsapp|msg91|sendWhatsAppOtp|ALLOW_OTP_DEV_MODE|Recaptcha|confirmPhoneOtp/i);
  });

  it('does not ship SMS OTP or reCAPTCHA client modules', () => {
    expect(existsSync(path.join(SRC, 'lib/phone-auth.ts'))).toBe(false);
    expect(existsSync(path.join(SRC, 'lib/whatsapp-otp.ts'))).toBe(false);
    expect(existsSync(path.join(SRC, 'components/auth/phone-captcha-modal.tsx'))).toBe(false);
  });

  it('auth provider has no test-session shortcuts', () => {
    const authProvider = readFileSync(path.join(SRC, 'providers/auth-provider.tsx'), 'utf8');
    expect(authProvider).not.toMatch(/isTestSession|signInForTesting|test-auth|mockUpsertMember/);
    expect(authProvider).toContain('onAuthStateChanged');
  });

  it('source tree has no mock-store or test-auth imports', () => {
    const files = walkFiles(SRC, ['.ts', '.tsx']);
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith('.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      if (
        content.includes("from '@/services/mock-store'") ||
        content.includes("from '@/lib/test-auth'") ||
        content.includes('signInForTesting') ||
        content.includes('isTestAuthEnabled')
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('i18n messages do not advertise development login buttons', () => {
    expect(messages).not.toHaveProperty('testSignIn');
    expect(messages).not.toHaveProperty('testSignInAdmin');
    expect(messages).not.toHaveProperty('testSignInSeniorAdminBypass');
    expect(messages).not.toHaveProperty('devOtpHint');
  });
});

describe('store compliance: app config', () => {
  it('uses production package identifiers without staging branching', () => {
    const configPath = path.join(ROOT, 'app.config.js');
    delete require.cache[configPath];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appConfig = require(configPath) as { expo: Record<string, any> };
    const expo = appConfig.expo;

    expect(expo.name).toBe('Geeta Param Seva');
    expect(expo.ios.infoPlist.CFBundleDisplayName).toBe('Geeta Param Seva');
    expect(expo.ios.bundleIdentifier).toBe('com.geetaparamseva.app');
    expect(expo.android.package).toBe('com.geetaparamseva.app');
    expect(expo.ios.config.usesNonExemptEncryption).toBe(false);
    expect(expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(expo.ios.privacyManifests.NSPrivacyAccessedAPITypes.length).toBeGreaterThan(0);
    expect(expo.plugins.some((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-notifications')).toBe(
      true
    );
    expect(
      expo.plugins.some(
        (plugin: unknown) => Array.isArray(plugin) && plugin[0] === './plugins/with-apk-filename'
      )
    ).toBe(true);
  });

  it('preview APK and production AAB profiles are configured', () => {
    const eas = JSON.parse(readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
    expect(eas.build.production).toBeTruthy();
    expect(eas.build.production.developmentClient).toBeUndefined();
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.build.preview).toBeTruthy();
    expect(eas.build.preview.distribution).toBe('internal');
    expect(eas.build.preview.android.buildType).toBe('apk');
    expect(eas.build.preview.android.applicationArchivePath).toContain('*.apk');
    expect(eas.build['preview-arm64'].android.applicationArchivePath).toContain('*.apk');
    expect(eas.build.staging).toBeUndefined();
    expect(eas.submit.production).toBeTruthy();
  });

  it('npm build script targets preview profile for APK sideload', () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['build:android:apk']).toContain('--profile preview');
    expect(pkg.scripts['install:android:apk']).toContain('--profile preview');
    expect(pkg.scripts['download:android:apk']).toContain('download-android-apk.mjs');
    expect(pkg.scripts['build:android:apk:save']).toContain('build-and-save-android-apk.mjs');
    expect(pkg.scripts['build:android:apk:local']).toContain('dist/Geeta-Param-Seva.apk');
    expect(pkg.scripts['build:android:staging']).toBeUndefined();
    expect(existsSync(path.join(ROOT, 'scripts/download-android-apk.mjs'))).toBe(true);
    expect(existsSync(path.join(ROOT, 'plugins/with-apk-filename.js'))).toBe(true);
  });

  it('APK filename plugin sets archivesName and outputFileName', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const withApkFilename = require(path.join(ROOT, 'plugins/with-apk-filename.js')) as (
      config: Record<string, unknown>,
      props?: { apkBaseName?: string }
    ) => Record<string, unknown> & {
      mods?: { android?: { appBuildGradle?: (c: unknown) => unknown } };
    };

    const config = withApkFilename(
      {
        name: 'Geeta Param Seva',
        slug: 'GeetaParamSeva',
        modResults: undefined,
      },
      { apkBaseName: 'Geeta-Param-Seva' }
    );

    expect(config.mods?.android?.appBuildGradle).toBeTypeOf('function');
  });
});
