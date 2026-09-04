# Geeta Param Seva

Community app for seva updates, messages, and chapter polls. Built with Expo Router (SDK 57), Firebase Auth (phone + group PIN), Firestore, and Cloud Functions.

## Prerequisites

- Node.js 20.19+ / 22.13+ / 24.3+ (Expo SDK 57)
- Firebase project: `geeta-param-seva-6aa03`
- Expo / EAS CLI for store builds

## Auth model

- Members sign in with **mobile + unexpired group join PIN** (24h, auto-generated)
- New admins (roster) first login with join PIN, then must set a **personal PIN**
- After personal PIN is set, admins/seniors re-login with personal PIN only
- Only one device session is active per account
- Cloud Function `signInWithGroupPin` issues a Firebase custom token

## Setup

```bash
npm install
cp .env.example .env
cp functions/.env.example functions/.env
```

### Seed senior admin

```bash
# optional: SENIOR_ADMIN_PIN=246810 HRIDYA_SENIOR_ADMIN_PIN=321456
node scripts/seed-senior-admin.cjs
```

Seeded senior admins (created only via DB/seed — never in the app):

| Name | Phone | PIN |
|------|-------|-----|
| Sparsh Agrawal | `+919599679802` | `246810` |
| Hridya Hirawat | `+918810419061` | `321456` |

### Seed QA admin + member

```bash
node scripts/seed-test-accounts.cjs
```

| Account | Phone | PIN |
|---------|-------|-----|
| Admin | `+911111111111` | Personal `111111` |
| Member | `+912222222222` | Join `222222` (long QA expiry) |

## Development

```bash
npx expo start
```

## Backend deploy

```bash
npm run deploy:backend
```

Required functions include: `signInWithGroupPin`, `generateGroupJoinPin`, `setPersonalPin`, roster upsert/deactivate, practice assignment/completion/reminder callables, `wipeDailyFeed`, `deleteAccount`.

## Roles

| Role | Access |
|------|--------|
| Senior admin | All groups; roster (members + admins); PINs; practice overview |
| Admin | Assigned groups only; add members; posts, polls; standing Adhyay/Aarti practice |
| Member | Own group feed; today’s practice (Adhyay/Aarti); vote on polls; alerts |

Private access: phone must be on `access_roster` before PIN sign-in.

## Banner ads (AdMob + Remote Config)

Member-only **banner ads** (no interstitial / video). Placement is scroll-bound and away from primary taps:

| Screen | Banners |
|--------|---------|
| Home | Up to 2 (slot 2 only if screen height ≥ 720) after practice + Gita entry |
| Seva | 1 after the feed |
| Profile | 1 at the bottom |
| Aarti / Gita / auth / notifications / admin | none |

1. Create AdMob apps + **banner** units (Android + iOS). In AdMob blocking controls, restrict adult / dating / gambling categories.
2. Set app IDs in env / EAS secrets: `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`, `EXPO_PUBLIC_ADMOB_IOS_APP_ID`.
3. Publish Remote Config (unit IDs + kill switch):

```bash
ADS_ENABLED=true \
ADS_BANNER_ANDROID=ca-app-pub-xxx/yyy \
ADS_BANNER_IOS=ca-app-pub-xxx/zzz \
node scripts/seed-ads-remote-config.cjs --apply
```

4. Rebuild a native binary (ads SDK is not available in Expo Go):

```bash
npm run build:android:aab:local
# or eas build for iOS / Android
```

Remote keys: `ads_enabled`, `ads_max_home`, `ads_show_home|seva|profile`, `ads_show_admins`, `ads_banner_android`, `ads_banner_ios`, optional `*_2` units. In `__DEV__`, Google test banner IDs are used when Remote Config units are empty.

## Brand icons

Platform masters live in `assets/images/icons/` (iOS AppIcon set + Android mipmaps).
Generate Expo-facing assets after updating masters:

```bash
npm run prepare:icons
```

This writes `icon.png`, `adaptive-icon.png`, `logo.png`, `favicon.png`, and `notification-icon.png` under `assets/images/` with Android adaptive safe-zone padding and a white notification mask.

```bash
# Play Store AAB
npx eas build --profile production --platform android

# Installable preview APK (same app id + name as production)
npm run build:android:apk

# EAS hosting always names CDN downloads `application-<buildId>.apk`.
# Save a clean local file after a finished build:
npm run download:android:apk
# → dist/Geeta-Param-Seva.apk

# Or build on EAS, wait, and save in one step:
npm run build:android:apk:save

# Optional: local EAS build with an explicit output path
npm run build:android:apk:local

# Install latest preview APK onto a connected device/emulator
npm run install:android:apk
```

Custom notification sound and remote push require a development/EAS build (not Expo Go).

## Quality checks

```bash
npm test
npm run typecheck
npm run functions:build
```
