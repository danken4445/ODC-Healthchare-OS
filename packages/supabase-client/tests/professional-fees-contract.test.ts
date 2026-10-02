import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import {
  getOrganizationFeeSettings,
  getProfessionalFeeOverview,
  hasOrganizationPermission,
  listProfessionalFeeHistory,
} from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const databaseUuid = "10000000-0000-0000-0000-000000000001";
const organizationId = "20000000-0000-0000-0000-000000000002";

test("professional fee responses accept PostgreSQL UUID-shaped IDs", async () => {
  const client = asClient({
    rpc: async (name: string) => {
      if (name === "get_organization_fee_settings") {
        return {
          data: [
            {
              organization_id: databaseUuid,
              fee_model: "fixed_rate",
              is_government: false,
              can_manage_fee_model: true,
            },
          ],
          error: null,
        };
      }
      if (name === "list_professional_fee_history") {
        return {
          data: [
            {
              id: databaseUuid,
              amount: 100,
              effective_from: "2026-10-02T00:00:00.000Z",
              created_by: organizationId,
              created_at: "2026-10-02T00:00:00.000Z",
            },
          ],
          error: null,
        };
      }
      return {
        data: [
          {
            service_practitioner_id: databaseUuid,
            service_id: organizationId,
            service_name: "Consultation",
            currency: "PHP",
            min_professional_fee: 100,
            max_professional_fee: 200,
            current_fee: 150,
            current_fee_effective_from: "2026-10-02T00:00:00.000Z",
            practitioner_role_id: databaseUuid,
            practitioner_name: "Dr. Fee",
          },
        ],
        error: null,
      };
    },
  });

  const settings = await getOrganizationFeeSettings(client, organizationId);
  const history = await listProfessionalFeeHistory(client, databaseUuid);
  const overview = await getProfessionalFeeOverview(client, organizationId);

  assert.equal(settings.error, null);
  assert.equal(history.error, null);
  assert.equal(overview.error, null);
  assert.equal(overview.data?.[0]?.service_id, organizationId);
});

test("professional fee responses reject malformed UUID-shaped IDs", async () => {
  const client = asClient({
    rpc: async () => ({
      data: [
        {
          organization_id: "not-a-uuid",
          fee_model: "fixed_rate",
          is_government: false,
          can_manage_fee_model: true,
        },
      ],
      error: null,
    }),
  });

  const result = await getOrganizationFeeSettings(client, organizationId);
  assert.notEqual(result.error, null);
  assert.equal(result.data, null);
});

test("permission contract requests the practitioner fee default key", async () => {
  const client = asClient({
    rpc: async (name: string, args: Record<string, string>) => {
      assert.equal(name, "has_organization_permission");
      assert.deepEqual(args, {
        target_organization_id: organizationId,
        target_permission: "can_manage_professional_fees",
      });
      return { data: true, error: null };
    },
  });

  const result = await hasOrganizationPermission(
    client,
    organizationId,
    "can_manage_professional_fees",
  );
  assert.equal(result.error, null);
  assert.equal(result.data, true);
});
