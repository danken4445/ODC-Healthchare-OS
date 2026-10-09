-- Standalone pharmacy orders have no patient or encounter foreign key, but
-- require patient_reference. Linked orders retain the original requirement of
-- a physical prescription reference or a native medication request.
--
-- Rollback: replace this constraint with the prior two-branch check after all
-- standalone orders have a non-empty physical_prescription_reference.

alter table public.pharmacy_prescription_orders
  drop constraint if exists pharmacy_prescription_orders_check;

alter table public.pharmacy_prescription_orders
  add constraint pharmacy_prescription_orders_check check (
    nullif(btrim(coalesce(physical_prescription_reference, '')), '') is not null
    or medication_request_id is not null
    or (
      patient_id is null
      and encounter_id is null
      and nullif(btrim(coalesce(patient_reference, '')), '') is not null
    )
  );
