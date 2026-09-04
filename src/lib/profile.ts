interface NamedProfile {
  name: string;
}

export function profileNeedsName(profile: NamedProfile | null | undefined): boolean {
  if (!profile) {
    return true;
  }

  return !profile.name.trim();
}
