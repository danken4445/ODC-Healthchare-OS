-- Keep the focused encounter recorder behind the same database-derived
-- permission used by its clinical actions. Triage staff retain the minimum
-- encounter visibility needed for the queue, but cannot read full recording
-- history or open the recorder without consultation permission.
drop policy if exists encounters_select on public.encounters;
create policy encounters_select on public.encounters for select to authenticated
  using (
    public.is_patient_self(patient_id, organization_id)
    or public.has_organization_permission(organization_id, 'can_start_consultation')
    or public.has_organization_permission(organization_id, 'can_record_triage')
  );

drop policy if exists medication_requests_select on public.medication_requests;
create policy medication_requests_select on public.medication_requests for select to authenticated
  using (
    public.is_patient_self(patient_id, organization_id)
    or public.has_organization_permission(organization_id, 'can_start_consultation')
  );

drop policy if exists document_references_select on public.document_references;
create policy document_references_select on public.document_references for select to authenticated
  using (
    public.is_patient_self(patient_id, organization_id)
    or public.has_organization_permission(organization_id, 'can_start_consultation')
  );
