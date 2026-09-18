#!/usr/bin/env node
/**
 * Deploy Gen2 functions in small batches to avoid asia-south1 Cloud Run CPU quota
 * ("Quota exceeded for total allowable CPU per project per region").
 *
 * Usage:
 *   node scripts/deploy-functions-batch.cjs
 *   node scripts/deploy-functions-batch.cjs --with-firestore
 *   node scripts/deploy-functions-batch.cjs --only deleteAccount,wipeDailyFeed
 */
const { spawnSync } = require('child_process');

const PROJECT = 'geeta-param-seva-6aa03';
const BATCH_SIZE = 1;
const PAUSE_MS = 45_000;

const ALL_FUNCTIONS = [
  'signInWithGroupPin',
  'generateGroupJoinPin',
  'setPersonalPin',
  'setGroupPin',
  'upsertAccessRoster',
  'deactivateAccessRoster',
  'submitJoinApplication',
  'listJoinApplications',
  'rejectJoinApplication',
  'markJoinApplicationAdded',
  'listAccessRoster',
  'migrateWhitelistToRoster',
  'setMemberPracticeAssignment',
  'getMyPracticeToday',
  'markPracticeItemComplete',
  'markAllPracticeComplete',
  'getPracticeAdminOverview',
  'sendPracticeReminder',
  'getPracticeMonthlyReport',
  'notifyPracticeMonthlyReport',
  'notifyCommunityPostPublished',
  'onCommunityPostCreated',
  'wipeDailyFeed',
  'syncPushTokenIndex',
  'deleteAccount',
];

const args = process.argv.slice(2);
const withFirestore = args.includes('--with-firestore');
const onlyArg = args.find((a) => a.startsWith('--only='))?.slice('--only='.length)
  ?? (args.includes('--only') ? args[args.indexOf('--only') + 1] : null);

/** Default: only the functions that failed in the last full deploy (CPU quota). */
const DEFAULT_FAILED = [
  'getPracticeAdminOverview',
  'sendPracticeReminder',
  'notifyPracticeMonthlyReport',
  'notifyCommunityPostPublished',
  'onCommunityPostCreated',
  'wipeDailyFeed',
  'syncPushTokenIndex',
  'deleteAccount',
];

const targets = onlyArg
  ? onlyArg.split(',').map((s) => s.trim()).filter(Boolean)
  : args.includes('--all')
    ? ALL_FUNCTIONS
    : DEFAULT_FAILED;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deployBatch(names) {
  const only = names.map((n) => `functions:${n}`).join(',');
  console.log(`\n→ Deploying batch: ${names.join(', ')}`);
  const result = spawnSync(
    'npx',
    ['firebase', 'deploy', '--only', only, '--project', PROJECT],
    { stdio: 'inherit', shell: process.platform === 'win32' }
  );
  if (result.status !== 0) {
    throw new Error(`Batch failed: ${names.join(', ')}`);
  }
}

async function main() {
  if (withFirestore) {
    console.log('\n→ Deploying firestore rules + indexes');
    const fs = spawnSync(
      'npx',
      ['firebase', 'deploy', '--only', 'firestore', '--project', PROJECT],
      { stdio: 'inherit', shell: process.platform === 'win32' }
    );
    if (fs.status !== 0) process.exit(fs.status ?? 1);
  }

  console.log(`Deploying ${targets.length} function(s) in batches of ${BATCH_SIZE}…`);
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    deployBatch(batch);
    if (i + BATCH_SIZE < targets.length) {
      console.log(`Waiting ${PAUSE_MS / 1000}s for Cloud Run quota to settle…`);
      await sleep(PAUSE_MS);
    }
  }
  console.log('\n✔ All batches deployed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
