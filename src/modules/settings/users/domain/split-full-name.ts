export function splitFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  const parts = trimmed.split(/\s+/g).filter(Boolean);

  return {
    firstName: parts[0] ?? trimmed,
    lastName: parts.slice(1).join(' '),
  };
}
