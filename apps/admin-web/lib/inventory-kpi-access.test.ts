import assert from "node:assert/strict";
import test from "node:test";
import { canViewInventoryFinancialKpis } from "./inventory-kpi-access.ts";

test("hides inventory valuation and margin KPIs from view-only staff", () => {
  assert.equal(
    canViewInventoryFinancialKpis({
      isOrganizationAdmin: false,
      isSuperadmin: false,
    }),
    false,
  );
});

test("shows inventory valuation and margin KPIs to organization administrators", () => {
  assert.equal(
    canViewInventoryFinancialKpis({
      isOrganizationAdmin: true,
      isSuperadmin: false,
    }),
    true,
  );
});

test("shows inventory valuation and margin KPIs to superadmins", () => {
  assert.equal(
    canViewInventoryFinancialKpis({
      isOrganizationAdmin: false,
      isSuperadmin: true,
    }),
    true,
  );
});
