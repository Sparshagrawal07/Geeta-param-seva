export function isFunctionsEmulator() {
  return process.env.FUNCTIONS_EMULATOR === 'true';
}

export function enforceAppCheck() {
  return process.env.ENFORCE_APP_CHECK === 'true';
}
