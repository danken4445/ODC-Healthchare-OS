import { type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import { z } from "zod";

export type ProfessionalFeeResult<T> =
  { data: T; error: null } | { data: null; error: Error };

export const feeModelSchema = z.enum(["fixed_rate", "practitioner_declared"]);
export type FeeModel = z.infer<typeof feeModelSchema>;

const databaseUuidSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
  );

const feeSettingsSchema = z.object({
  organization_id: databaseUuidSchema,
  fee_model: feeModelSchema,
  is_government: z.boolean(),
  can_manage_fee_model: z.boolean(),
});

const providerFeeServiceSchema = z.object({
  service_practitioner_id: databaseUuidSchema,
  service_id: databaseUuidSchema,
  service_name: z.string(),
  currency: z.string(),
  min_professional_fee: z.coerce.number().nullable(),
  max_professional_fee: z.coerce.number().nullable(),
  current_fee: z.coerce.number().nullable(),
  current_fee_effective_from: z.string().nullable(),
});

const feeHistoryItemSchema = z.object({
  id: databaseUuidSchema,
  amount: z.coerce.number(),
  effective_from: z.string(),
  created_by: databaseUuidSchema,
  created_at: z.string(),
});

const feeOverviewItemSchema = providerFeeServiceSchema.extend({
  practitioner_role_id: databaseUuidSchema,
  practitioner_name: z.string(),
});

export type OrganizationFeeSettings = z.infer<typeof feeSettingsSchema>;
export type ProviderFeeService = z.infer<typeof providerFeeServiceSchema>;
export type ProfessionalFeeHistoryItem = z.infer<typeof feeHistoryItemSchema>;
export type ProfessionalFeeOverviewItem = z.infer<typeof feeOverviewItemSchema>;

export const setMyProfessionalFeeInputSchema = z.object({
  serviceId: z.string().uuid(),
  amount: z.coerce.number().finite().min(0),
  effectiveFrom: z.string().datetime().optional(),
});

export const setProfessionalFeeForPractitionerInputSchema = z.object({
  servicePractitionerId: z.string().uuid(),
  amount: z.coerce.number().finite().min(0),
  effectiveFrom: z.string().datetime().optional(),
});

export const setProfessionalFeeBoundsInputSchema = z
  .object({
    serviceId: z.string().uuid(),
    minProfessionalFee: z.coerce.number().finite().min(0).nullable(),
    maxProfessionalFee: z.coerce.number().finite().min(0).nullable(),
  })
  .refine(
    (input) =>
      input.minProfessionalFee === null ||
      input.maxProfessionalFee === null ||
      input.minProfessionalFee <= input.maxProfessionalFee,
    { message: "Minimum fee cannot exceed maximum fee." },
  );

function rpcFailure(error: { message: string }): ProfessionalFeeResult<never> {
  return { data: null, error: new Error(error.message) };
}

function parseRpc<T>(
  schema: z.ZodType<T>,
  data: unknown,
): ProfessionalFeeResult<T> {
  const parsed = schema.safeParse(data);
  return parsed.success
    ? { data: parsed.data, error: null }
    : {
        data: null,
        error: new Error("The fee service returned an invalid response."),
      };
}

export async function getOrganizationFeeSettings(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<ProfessionalFeeResult<OrganizationFeeSettings>> {
  const { data, error } = await client.rpc(
    "get_organization_fee_settings" as never,
    {
      p_organization_id: organizationId,
    } as never,
  );
  if (error) return rpcFailure(error);
  return parseRpc(feeSettingsSchema, Array.isArray(data) ? data[0] : data);
}

export async function setOrganizationFeeModel(
  client: SupabaseClient<Database>,
  organizationId: string,
  feeModel: FeeModel,
): Promise<ProfessionalFeeResult<FeeModel>> {
  const { data, error } = await client.rpc(
    "set_organization_fee_model" as never,
    {
      p_organization_id: organizationId,
      p_fee_model: feeModel,
    } as never,
  );
  if (error) return rpcFailure(error);
  return parseRpc(feeModelSchema, data);
}

export async function listMyProfessionalFeeServices(
  client: SupabaseClient<Database>,
): Promise<ProfessionalFeeResult<ProviderFeeService[]>> {
  const { data, error } = await client.rpc(
    "list_my_professional_fee_services" as never,
  );
  if (error) return rpcFailure(error);
  return parseRpc(z.array(providerFeeServiceSchema), data ?? []);
}

export async function listProfessionalFeeHistory(
  client: SupabaseClient<Database>,
  servicePractitionerId: string,
): Promise<ProfessionalFeeResult<ProfessionalFeeHistoryItem[]>> {
  const { data, error } = await client.rpc(
    "list_professional_fee_history" as never,
    {
      p_service_practitioner_id: servicePractitionerId,
    } as never,
  );
  if (error) return rpcFailure(error);
  return parseRpc(z.array(feeHistoryItemSchema), data ?? []);
}

export async function setMyProfessionalFee(
  client: SupabaseClient<Database>,
  input: z.input<typeof setMyProfessionalFeeInputSchema>,
): Promise<ProfessionalFeeResult<string>> {
  const parsed = setMyProfessionalFeeInputSchema.safeParse(input);
  if (!parsed.success)
    return { data: null, error: new Error("Enter a valid professional fee.") };
  const { data, error } = await client.rpc(
    "set_my_professional_fee" as never,
    {
      p_service_id: parsed.data.serviceId,
      p_amount: parsed.data.amount,
      p_effective_from: parsed.data.effectiveFrom ?? new Date().toISOString(),
    } as never,
  );
  if (error) return rpcFailure(error);
  return parseRpc(databaseUuidSchema, data);
}

export async function setProfessionalFeeForPractitioner(
  client: SupabaseClient<Database>,
  input: z.input<typeof setProfessionalFeeForPractitionerInputSchema>,
): Promise<ProfessionalFeeResult<string>> {
  const parsed = setProfessionalFeeForPractitionerInputSchema.safeParse(input);
  if (!parsed.success)
    return { data: null, error: new Error("Enter a valid professional fee.") };
  const { data, error } = await client.rpc(
    "set_professional_fee_for_practitioner" as never,
    {
      p_service_practitioner_id: parsed.data.servicePractitionerId,
      p_amount: parsed.data.amount,
      p_effective_from: parsed.data.effectiveFrom ?? new Date().toISOString(),
    } as never,
  );
  if (error) return rpcFailure(error);
  return parseRpc(databaseUuidSchema, data);
}

export async function setClinicServiceProfessionalFeeBounds(
  client: SupabaseClient<Database>,
  input: z.input<typeof setProfessionalFeeBoundsInputSchema>,
): Promise<ProfessionalFeeResult<string>> {
  const parsed = setProfessionalFeeBoundsInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      data: null,
      error: new Error("Enter valid professional fee bounds."),
    };
  const { data, error } = await client.rpc(
    "set_clinic_service_professional_fee_bounds" as never,
    {
      p_service_id: parsed.data.serviceId,
      p_min_professional_fee: parsed.data.minProfessionalFee,
      p_max_professional_fee: parsed.data.maxProfessionalFee,
    } as never,
  );
  if (error) return rpcFailure(error);
  return parseRpc(databaseUuidSchema, data);
}

export async function getProfessionalFeeOverview(
  client: SupabaseClient<Database>,
  organizationId: string,
): Promise<ProfessionalFeeResult<ProfessionalFeeOverviewItem[]>> {
  const { data, error } = await client.rpc(
    "get_professional_fee_overview" as never,
    {
      p_organization_id: organizationId,
    } as never,
  );
  if (error) return rpcFailure(error);
  return parseRpc(z.array(feeOverviewItemSchema), data ?? []);
}
