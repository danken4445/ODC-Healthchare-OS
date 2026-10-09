export function shouldShowLegacyPharmacyPos(permissions: readonly string[]) {
  return permissions.includes("can_manage_pos");
}
