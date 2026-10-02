import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import {
  getOrganizationQueueSettings,
  listPractitionerQueuePrefixes,
  setOrganizationQueueMode,
  setPractitionerQueuePrefix,
} from "../src/index.ts";

function asClient(value: object): SupabaseClient<Database> {
  return value as unknown as SupabaseClient<Database>;
}

const organizationId = "22222222-2222-4222-8222-222222222222";
const roleId = "33333333-3333-4333-8333-333333333333";

test("queue settings client parses the organization mode and practitioner prefixes", async () => {
  const calls: string[] = [];
  const client = asClient({
    rpc: async (name: string) => {
      calls.push(name);
      if (name === "get_organization_queue_settings") {
        return { data: [{ organization_id: organizationId, queue_mode: "clinic_wide", can_manage_queue_mode: true }], error: null };
      }
      return { data: [{ practitioner_role_id: roleId, display_name: "Dr. Queue", role_code: "doctor", queue_prefix: null }], error: null };
    },
  });
  const settings = await getOrganizationQueueSettings(client, organizationId);
  const prefixes = await listPractitionerQueuePrefixes(client, organizationId);
  assert.equal(settings.error, null);
  assert.equal(settings.data?.queue_mode, "clinic_wide");
  assert.equal(prefixes.error, null);
  assert.equal(prefixes.data?.[0]?.queue_prefix, null);
  assert.deepEqual(calls, ["get_organization_queue_settings", "list_practitioner_queue_prefixes"]);
});

test("queue settings client sends validated mode and normalized prefix RPC inputs", async () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = asClient({
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { data: name === "set_organization_queue_mode" ? "per_practitioner" : "B", error: null };
    },
  });
  const mode = await setOrganizationQueueMode(client, organizationId, "per_practitioner");
  const prefix = await setPractitionerQueuePrefix(client, roleId, " b ");
  assert.equal(mode.data, "per_practitioner");
  assert.equal(prefix.data, "B");
  assert.deepEqual(calls, [
    { name: "set_organization_queue_mode", args: { p_organization_id: organizationId, p_queue_mode: "per_practitioner" } },
    { name: "set_practitioner_queue_prefix", args: { p_practitioner_role_id: roleId, p_queue_prefix: "B" } },
  ]);
});
