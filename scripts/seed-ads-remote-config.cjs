/**
 * Publish Firebase Remote Config defaults for banner ads.
 *
 * Dry-run:  node scripts/seed-ads-remote-config.cjs
 * Apply:    node scripts/seed-ads-remote-config.cjs --apply
 *
 * Set real unit IDs via env before --apply for production:
 *   ADS_BANNER_ANDROID=ca-app-pub-xxx/yyy
 *   ADS_BANNER_IOS=ca-app-pub-xxx/zzz
 *   ADS_ENABLED=true
 */
const path = require('path');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

const PROJECT_ID = 'geeta-param-seva-6aa03';
const APPLY = process.argv.includes('--apply');

const ADS_ENABLED = process.env.ADS_ENABLED === 'true' ? 'true' : 'false';
const BANNER_ANDROID = (process.env.ADS_BANNER_ANDROID || '').trim();
const BANNER_IOS = (process.env.ADS_BANNER_IOS || '').trim();
const BANNER_ANDROID_2 = (process.env.ADS_BANNER_ANDROID_2 || BANNER_ANDROID).trim();
const BANNER_IOS_2 = (process.env.ADS_BANNER_IOS_2 || BANNER_IOS).trim();

const PARAMETERS = {
  ads_enabled: {
    defaultValue: { value: ADS_ENABLED },
    description: 'Master kill switch for member banner ads',
  },
  ads_max_home: {
    defaultValue: { value: '2' },
    description: 'Max banners on Home (1 or 2); slot 2 also needs tall screen',
  },
  ads_show_home: {
    defaultValue: { value: 'true' },
    description: 'Show banners on member Home (scroll footer)',
  },
  ads_show_seva: {
    defaultValue: { value: 'true' },
    description: 'Show one banner after Seva feed',
  },
  ads_show_profile: {
    defaultValue: { value: 'true' },
    description: 'Show one banner at bottom of Profile',
  },
  ads_show_admins: {
    defaultValue: { value: 'false' },
    description: 'If true, also show ads to admin/senior_admin (default off)',
  },
  ads_banner_android: {
    defaultValue: { value: BANNER_ANDROID },
    description: 'AdMob banner unit ID (Android) slot 1',
  },
  ads_banner_ios: {
    defaultValue: { value: BANNER_IOS },
    description: 'AdMob banner unit ID (iOS) slot 1',
  },
  ads_banner_android_2: {
    defaultValue: { value: BANNER_ANDROID_2 },
    description: 'AdMob banner unit ID (Android) Home slot 2 (optional)',
  },
  ads_banner_ios_2: {
    defaultValue: { value: BANNER_IOS_2 },
    description: 'AdMob banner unit ID (iOS) Home slot 2 (optional)',
  },
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
  });
}

async function main() {
  console.log(APPLY ? 'Applying Remote Config ads template…' : 'Dry-run Remote Config ads (pass --apply to publish)');
  console.log({
    ads_enabled: ADS_ENABLED,
    ads_banner_android: BANNER_ANDROID || '(empty)',
    ads_banner_ios: BANNER_IOS || '(empty)',
  });

  if (!APPLY) {
    console.log('\nParameters that would be set:');
    for (const [key, param] of Object.entries(PARAMETERS)) {
      console.log(`  ${key} = ${JSON.stringify(param.defaultValue.value)}`);
    }
    return;
  }

  const rc = admin.remoteConfig();
  const template = await rc.getTemplate();
  template.parameters = {
    ...(template.parameters || {}),
    ...PARAMETERS,
  };
  const validated = await rc.validateTemplate(template);
  const published = await rc.publishTemplate(validated);
  console.log(`Published Remote Config version ${published.versionNumber}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
