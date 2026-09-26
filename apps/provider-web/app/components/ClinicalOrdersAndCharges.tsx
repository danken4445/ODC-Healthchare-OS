import type { ReactNode } from "react";

export interface ClinicalOrderAction<T extends string> {
  id: T;
  label: string;
}

interface ClinicalOrdersAndChargesProps<T extends string> {
  actions: readonly ClinicalOrderAction<T>[];
  activeAction: T;
  children: ReactNode;
  headingAside?: ReactNode;
  onActionChange: (action: T) => void;
}

/** Config-driven action selector. Contexts decide which clinical actions exist. */
export function ClinicalOrdersAndCharges<T extends string>({
  actions,
  activeAction,
  children,
  headingAside,
  onActionChange,
}: ClinicalOrdersAndChargesProps<T>) {
  return (
    <section className="encounter-actions" aria-labelledby="encounter-actions-heading">
      <div className="encounter-section-heading">
        <div>
          <p className="eyebrow">Orders and charges</p>
          <h2 id="encounter-actions-heading">Encounter actions</h2>
        </div>
        <div className="encounter-heading-aside">{headingAside}<span>Permission-based</span></div>
      </div>
      {actions.length ? (
        <div className="encounter-action-launcher" role="group" aria-label="Choose an encounter action">
          {actions.map((action) => (
            <button aria-pressed={activeAction === action.id} key={action.id} onClick={() => onActionChange(action.id)} type="button">{action.label}</button>
          ))}
        </div>
      ) : <p className="hint">Your current role does not have clinical order permissions.</p>}
      {children}
    </section>
  );
}
