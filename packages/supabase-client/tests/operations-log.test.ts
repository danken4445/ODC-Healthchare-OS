import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import { listClinicOperationsLogs } from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const organizationId = "11111111-1111-4111-8111-111111111111";

test("listClinicOperationsLogs invokes list_clinic_operations_logs with exact filter parameters", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return {
        data: [
          {
            id: 101,
            occurred_at: "2026-10-13T14:30:00Z",
            actor_id: "22222222-2222-4222-8222-222222222222",
            actor_name: "Dr. Juan Dela Cruz",
            actor_type: "registered_user",
            module: "billing",
            action: "insert",
            table_name: "payments",
            record_id: "33333333-3333-4333-8333-333333333333",
            description: "Cashier payment received",
            metadata: { receipt_number: "OR-9981" },
          },
        ],
        error: null,
      };
    },
  });

  const result = await listClinicOperationsLogs(client, organizationId, {
    module: "billing",
    action: "insert",
    actorId: "22222222-2222-4222-8222-222222222222",
    startTime: "2026-10-13T00:00:00Z",
    endTime: "2026-10-13T23:59:59Z",
    search: "OR-9981",
    limit: 50,
    offset: 0,
  });

  assert.equal(result.error, null);
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.data[0], {
    id: 101,
    occurredAt: "2026-10-13T14:30:00Z",
    actorId: "22222222-2222-4222-8222-222222222222",
    actorName: "Dr. Juan Dela Cruz",
    actorType: "registered_user",
    module: "billing",
    action: "insert",
    tableName: "payments",
    recordId: "33333333-3333-4333-8333-333333333333",
    description: "Cashier payment received",
    metadata: { receipt_number: "OR-9981" },
  });

  assert.deepEqual(calls, [
    {
      name: "list_clinic_operations_logs",
      args: {
        p_organization_id: organizationId,
        p_module: "billing",
        p_action: "insert",
        p_actor_id: "22222222-2222-4222-8222-222222222222",
        p_start_time: "2026-10-13T00:00:00Z",
        p_end_time: "2026-10-13T23:59:59Z",
        p_search: "OR-9981",
        p_limit: 50,
        p_offset: 0,
      },
    },
  ]);
});

test("listClinicOperationsLogs handles errors from database RPC gracefully", async () => {
  const client = asClient({
    rpc: async () => ({
      data: null,
      error: { message: "Permission denied: can_view_audit_log required." },
    }),
  });

  const result = await listClinicOperationsLogs(client, organizationId);
  assert.notEqual(result.error, null);
  assert.equal(result.error?.message, "Permission denied: can_view_audit_log required.");
});
