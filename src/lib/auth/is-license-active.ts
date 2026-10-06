type LicensePeriod = {
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

export function isLicenseActive(license: LicensePeriod | null) {
  if (license?.status !== "active" || !license.starts_at || !license.ends_at) return false;

  const now = Date.now();
  return new Date(license.starts_at).getTime() <= now && new Date(license.ends_at).getTime() > now;
}
