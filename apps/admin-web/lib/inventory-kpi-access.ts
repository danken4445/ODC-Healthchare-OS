export function canViewInventoryFinancialKpis({
  isOrganizationAdmin,
  isSuperadmin,
}: {
  isOrganizationAdmin: boolean;
  isSuperadmin: boolean;
}): boolean {
  return isSuperadmin || isOrganizationAdmin;
}
