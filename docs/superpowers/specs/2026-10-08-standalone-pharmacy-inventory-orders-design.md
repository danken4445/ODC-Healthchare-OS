# Standalone Pharmacy Inventory Orders

## Goal

Let nurses encode physical prescriptions without selecting a patient account or encounter. The medicine remains an inventory item, with live pharmacy stock visibility, queue tracking, pharmacist review, and stock deduction.

## Data model

- `pharmacy_prescription_orders.patient_id` and `encounter_id` become nullable for new standalone orders; existing linked orders remain unchanged.
- New standalone context is stored as required `patient_reference` text and optional `ward_reference` text.
- Queue results expose both legacy IDs and the new references.
- `inventory_usages.patient_id` and `encounter_id` become nullable only for standalone pharmacy dispenses. A `reference_text` field preserves the human-entered order reference.

## Workflow

1. The encoder enters a free-text patient/encounter reference, optional ward/bed, prescription reference, prescriber, and priority.
2. The encoder searches active inventory items by name or SKU and selects an item; live Pharmacy availability updates for the selected item and entered quantity.
3. The standalone request enters the existing prescription queue.
4. A pharmacist reviews it and completes dispensing as before.
5. For standalone orders, completion creates an immutable non-billable inventory usage, applies FEFO batch allocation where needed, and deducts Pharmacy stock. Existing patient-linked orders retain their current billing-aware usage path.

## Security and compatibility

- Existing `can_encode_pharmacy_prescriptions`, `can_dispense_pharmacy_prescriptions`, `can_tag_inventory_usage`, organization, and Pharmacy-department checks remain server-side.
- The new submit RPC has its own name during the compatibility window; legacy encoders continue to work until all clients use the standalone path.
- No patient record, encounter, billing event, or invoice is created by standalone orders.

## Acceptance criteria

- Encoder forms no longer query or display patient accounts/encounters.
- Medicine selection is inventory-backed and live stock is displayed while entering the line.
- Queue and pharmacist dispensing display free-text references for standalone orders.
- Dispensing standalone orders reduces Pharmacy stock with batch integrity and audit records.
- Existing linked orders remain reviewable and dispensable.
