import { type SupabaseClient } from "@supabase/supabase-js";
import type { Database, QueueMode } from "@odyssey/types";
import { z } from "zod";

export const queueModeSchema = z.enum(["clinic_wide", "per_practitioner"]);
export type { QueueMode };

const databaseUuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

const queueSettingsSchema = z.object({
  organization_id: databaseUuidSchema,
  queue_mode: queueModeSchema,
  can_manage_queue_mode: z.boolean(),
});

const practitionerQueuePrefixSchema = z.object({
  practitioner_role_id: databaseUuidSchema,
  display_name: z.string().min(1),
  role_code: z.string().min(1),
  queue_prefix: z
    .string()
    .regex(/^[A-Z]$/)
    .nullable(),
});

export type QueueSettings = z.infer<typeof queueSettingsSchema>;
export type PractitionerQueuePrefix = z.infer<
  typeof practitionerQueuePrefixSchema
>;

type QueueResult<T> = { data: T; error: null } | { data: null; error: Error };

function rpcFailure(error: { message: string }): QueueResult<never> {
  return { data: null, error: new Error(error.message) };
}

function parseRpc<T>(schema: z.ZodType<T>, data: unknown): QueueResult<T> {
  const parsed = schema.safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : {
        data: null,
        error: new Error("The queue service returned an invalid response."),
      };
}

export async function getOrganizationQueueSettings(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<QueueResult<QueueSettings>> {
  const { data, error } = await client.rpc("get_organization_queue_settings", {
    p_organization_id: organizationId,
  });
  if (error) return rpcFailure(error);
  return parseRpc(queueSettingsSchema, Array.isArray(data) ? data[0] : data);
}

export async function setOrganizationQueueMode(
  client: SupabaseClient<Database>,
  organizationId: string,
  queueMode: QueueMode,
): Promise<QueueResult<QueueMode>> {
  const parsed = queueModeSchema.safeParse(queueMode);
  if (!parsed.success)
    return { data: null, error: new Error("Choose a valid queue mode.") };
  const { data, error } = await client.rpc("set_organization_queue_mode", {
    p_organization_id: organizationId,
    p_queue_mode: parsed.data,
  });
  if (error) return rpcFailure(error);
  return parseRpc(queueModeSchema, data);
}

export async function listPractitionerQueuePrefixes(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<QueueResult<PractitionerQueuePrefix[]>> {
  const { data, error } = await client.rpc("list_practitioner_queue_prefixes", {
    p_organization_id: organizationId,
  });
  if (error) return rpcFailure(error);
  return parseRpc(z.array(practitionerQueuePrefixSchema), data ?? []);
}

export async function setPractitionerQueuePrefix(
  client: SupabaseClient<Database>,
  practitionerRoleId: string,
  queuePrefix: string | null,
): Promise<QueueResult<string | null>> {
  const normalized = queuePrefix?.trim().toUpperCase() || null;
  if (
    normalized !== null &&
    !queueModePrefixSchema.safeParse(normalized).success
  ) {
    return {
      data: null,
      error: new Error("Queue prefix must be one letter A-Z."),
    };
  }
  const { data, error } = await client.rpc("set_practitioner_queue_prefix", {
    p_practitioner_role_id: practitionerRoleId,
    p_queue_prefix: normalized,
  } as never);
  if (error) return rpcFailure(error);
  return parseRpc(
    z
      .string()
      .regex(/^[A-Z]$/)
      .nullable(),
    data,
  );
}

const queueModePrefixSchema = z.string().regex(/^[A-Z]$/);
