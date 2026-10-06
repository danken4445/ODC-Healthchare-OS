# NBB Pharmacy POS Design

## Goal

Give an NBB facility a usable pharmacy point-of-sale terminal: a cashier records
a required patient name, selects only currently available pharmacy inventory,
and completes a zero-patient-liability transaction without recording a payment.

## Confirmed product decisions

- The NBB path is available only when the organization is NBB or government
  no-billing. The server, not the browser, decides that eligibility.
- A patient name is mandatory free text. This flow does not create, search for,
  or link a patient record.
- Cashiers dispense solely from the Pharmacy Department. A checkout must fail
  if the signed-in cashier is not assigned to the organization's Pharmacy
  Department or no usable Pharmacy stock exists.
- Standard item prices remain recorded for NBB claim and audit evidence, but
  the patient balance is exactly zero. No cash, card, QR, bank-transfer, or
  other payment may be created.

## UX

`/pos` becomes a focused terminal rather than the generic one-item record
form. In NBB mode it shows the required patient-name field, searchable active
inventory that has pharmacy stock, a multi-item quantity cart, stock remaining,
standard-charge totals for staff/audit context, and one `Complete NBB sale`
action. It has loading, empty, permission-denied, out-of-stock, and success
receipt states. It has no payment-method selector, tender amount, payment
status, or price shown to the patient.

The ordinary POS workflow and its payment controls remain unchanged for
non-NBB organizations.

## Server contract

A new, distinct checkout RPC preserves the existing `create_pos_sale` public
signature. It accepts organization ID, cart item IDs/whole-number quantities,
and a nonblank patient name. In one transaction it:

1. checks `can_manage_pos`, organization scope, NBB/government facility mode,
   and Pharmacy Department cashier assignment;
2. locks the relevant Pharmacy stock rows, rejects inactive or unavailable
   items and insufficient stock, and prevents cross-organization item IDs;
3. records the NBB sale, standard prices in integer centavos, zero patient
   liability, an immutable audit trail, and no `payments` row;
4. decrements only the Pharmacy stock and records the normal inventory
   movement with the cashier as actor; and
5. returns receipt/sale identifiers plus zero patient balance.

The database implementation will use the repository's canonical inventory
mutation semantics, not a client-side stock update. It will resolve the exact
department relationship/column names during recon and use a typed business
error for each rejected precondition.

## Financial and privacy boundaries

- New monetary values introduced by this change use `bigint` centavos. Legacy
  numeric fields are not reinterpreted or changed in this slice.
- The NBB standard charge is not a patient payment or collected cash. No
  financial-ledger entry is modified or deleted; future claim/ledger work must
  use compensating append-only entries.
- The receipt/history exposes the patient name only to authorized clinic staff
  in the same organization. It is never added to a public queue, URL, or
  client log.

## Verification

Database coverage proves mandatory patient name, NBB eligibility, cashier
pharmacy assignment, tenant isolation, current-stock filtering, atomic
insufficient-stock rejection, pharmacy-only deduction, zero patient balance,
and absence of a payment record. Client/UI coverage proves NBB hides payment
controls and blocks checkout until a name and item are supplied. Existing
standard POS checkout remains covered unchanged.

## Out of scope

- Patient registration, patient matching, and appointment/slot behavior.
- PhilHealth claim submission, financial-subledger posting, or a broad legacy
  money-column migration.
- Depletion from non-Pharmacy departments or cashier-selectable departments.
