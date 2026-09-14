export const JOIN_APPLICANT_NAME_MAX_LENGTH = 80;

export function normalizeJoinApplicantName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function isValidJoinApplicantName(input: string): boolean {
  const name = normalizeJoinApplicantName(input);
  return name.length > 0 && name.length <= JOIN_APPLICANT_NAME_MAX_LENGTH;
}
