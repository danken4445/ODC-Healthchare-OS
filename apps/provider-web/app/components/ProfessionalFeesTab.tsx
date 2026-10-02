"use client";

import {
  createBrowserSupabaseClient,
  getOrganizationFeeSettings,
  listMyProfessionalFeeServices,
  listProfessionalFeeHistory,
  setMyProfessionalFee,
  type ProfessionalFeeHistoryItem,
  type ProviderFeeService,
} from "@odyssey/supabase-client";
import { Button, Card } from "@odyssey/ui";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";

interface ProfessionalFeesTabProps {
  organizationId: string | null;
  canManageProfessionalFees: boolean;
}

type LoadState = "idle" | "loading" | "ready" | "error";
type HistoryState = {
  state: LoadState;
  items: ProfessionalFeeHistoryItem[];
  error: string | null;
};

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency || "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function feeBoundsLabel(service: ProviderFeeService): string {
  const minimum = service.min_professional_fee;
  const maximum = service.max_professional_fee;
  if (minimum !== null && maximum !== null) {
    return `${formatAmount(minimum, service.currency)} to ${formatAmount(maximum, service.currency)}`;
  }
  if (minimum !== null)
    return `At least ${formatAmount(minimum, service.currency)}`;
  if (maximum !== null)
    return `Up to ${formatAmount(maximum, service.currency)}`;
  return "No facility limit";
}

export function ProfessionalFeesTab({
  organizationId,
  canManageProfessionalFees,
}: ProfessionalFeesTabProps) {
  const titleId = useId();
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [services, setServices] = useState<ProviderFeeService[]>([]);
  const [isFixedRate, setIsFixedRate] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [history, setHistory] = useState<Record<string, HistoryState>>({});

  const loadFees = useCallback(async () => {
    if (!organizationId || !canManageProfessionalFees) return;

    setLoadState("loading");
    setLoadError(null);
    const client = createBrowserSupabaseClient();
    const settings = await getOrganizationFeeSettings(client, organizationId);
    if (settings.error) {
      setLoadState("error");
      setLoadError(settings.error.message);
      return;
    }
    if (settings.data.fee_model === "fixed_rate") {
      setIsFixedRate(true);
      setServices([]);
      setLoadState("ready");
      return;
    }

    setIsFixedRate(false);

    const result = await listMyProfessionalFeeServices(client);
    if (result.error) {
      setLoadState("error");
      setLoadError(result.error.message);
      return;
    }
    setServices(result.data);
    setLoadState("ready");
  }, [canManageProfessionalFees, organizationId]);

  useEffect(() => {
    void loadFees();
  }, [loadFees]);

  const beginEditing = (service: ProviderFeeService) => {
    setFeedback(null);
    setFeedbackIsError(false);
    setEditingServiceId(service.service_id);
    setAmount(service.current_fee === null ? "" : String(service.current_fee));
    setEffectiveFrom("");
  };

  const loadHistory = async (servicePractitionerId: string) => {
    const current = history[servicePractitionerId];
    if (current?.state === "loading" || current?.state === "ready") return;

    setHistory((previous) => ({
      ...previous,
      [servicePractitionerId]: { state: "loading", items: [], error: null },
    }));
    const result = await listProfessionalFeeHistory(
      createBrowserSupabaseClient(),
      servicePractitionerId,
    );
    setHistory((previous) => ({
      ...previous,
      [servicePractitionerId]: result.error
        ? { state: "error", items: [], error: result.error.message }
        : { state: "ready", items: result.data, error: null },
    }));
  };

  const saveFee = async (
    event: FormEvent<HTMLFormElement>,
    service: ProviderFeeService,
  ) => {
    event.preventDefault();
    const nextAmount = Number(amount);
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      setFeedbackIsError(true);
      setFeedback("Enter a valid fee of zero or more.");
      return;
    }
    if (
      service.min_professional_fee !== null &&
      nextAmount < service.min_professional_fee
    ) {
      setFeedbackIsError(true);
      setFeedback(
        `The fee must be at least ${formatAmount(service.min_professional_fee, service.currency)}.`,
      );
      return;
    }
    if (
      service.max_professional_fee !== null &&
      nextAmount > service.max_professional_fee
    ) {
      setFeedbackIsError(true);
      setFeedback(
        `The fee cannot exceed ${formatAmount(service.max_professional_fee, service.currency)}.`,
      );
      return;
    }

    setSaving(true);
    setFeedback(null);
    setFeedbackIsError(false);
    const result = await setMyProfessionalFee(createBrowserSupabaseClient(), {
      serviceId: service.service_id,
      amount: nextAmount,
      ...(effectiveFrom
        ? { effectiveFrom: new Date(effectiveFrom).toISOString() }
        : {}),
    });
    setSaving(false);
    if (result.error) {
      setFeedbackIsError(true);
      setFeedback(result.error.message);
      return;
    }

    setEditingServiceId(null);
    setHistory((previous) => {
      const next = { ...previous };
      delete next[service.service_practitioner_id];
      return next;
    });
    setFeedbackIsError(false);
    setFeedback("Professional fee saved. Earlier fee records are retained.");
    await loadFees();
  };

  if (!canManageProfessionalFees) {
    return (
      <section className="professional-fees" aria-labelledby={titleId}>
        <Card>
          <p className="eyebrow">Fee CMS</p>
          <h2 id={titleId}>Professional fees</h2>
          <p className="hint" role="status">
            Your current role does not have permission to manage professional
            fees.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="professional-fees" aria-labelledby={titleId}>
      <div className="section-heading professional-fees__heading">
        <div>
          <p className="eyebrow">Fee CMS</p>
          <h2 id={titleId}>My professional fees</h2>
          <p className="hint">
            Set a fee for each service you provide. Saving creates a new record
            and never changes prior fees.
          </p>
        </div>
      </div>

      {feedback && (
        <p
          className="professional-fees__feedback"
          role={feedbackIsError ? "alert" : "status"}
          aria-live={feedbackIsError ? "assertive" : "polite"}
        >
          {feedback}
        </p>
      )}

      {loadState === "loading" && (
        <div aria-busy="true">
          <Card className="professional-fees__state">
            <h3>Loading fee services</h3>
            <p className="hint">Retrieving your active assigned services.</p>
          </Card>
        </div>
      )}

      {loadState === "error" && (
        <div role="alert">
          <Card className="professional-fees__state">
            <h3>Unable to load fees</h3>
            <p className="hint">{loadError}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadFees()}
            >
              Try again
            </Button>
          </Card>
        </div>
      )}

      {loadState === "ready" && isFixedRate && (
        <Card className="professional-fees__state">
          <h3>Professional fees are set centrally</h3>
          <p className="hint">
            This facility uses fixed-rate fees. Service prices are managed by
            the facility, so no individual fee editor is available.
          </p>
        </Card>
      )}

      {loadState === "ready" && !isFixedRate && services.length === 0 && (
        <Card className="professional-fees__state">
          <h3>No active assigned services</h3>
          <p className="hint">
            There are no active services assigned to you. Ask an authorized
            coordinator to update your service assignments.
          </p>
        </Card>
      )}

      {loadState === "ready" && !isFixedRate && services.length > 0 && (
        <Card className="professional-fees__card">
          <div className="professional-fees__table-wrap">
            <table className="vesper-table professional-fees__table">
              <caption className="professional-fees__visually-hidden">
                Active services and professional fees
              </caption>
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Current fee</th>
                  <th scope="col">Allowed range</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => {
                  const isEditing = editingServiceId === service.service_id;
                  const serviceHistory =
                    history[service.service_practitioner_id];
                  const amountId = `professional-fee-amount-${service.service_id}`;
                  const effectiveFromId = `professional-fee-effective-from-${service.service_id}`;
                  return (
                    <Fragment key={service.service_practitioner_id}>
                      <tr>
                        <td>
                          <strong>{service.service_name}</strong>
                        </td>
                        <td>
                          {service.current_fee === null ? (
                            <span className="professional-fees__undeclared">
                              Not declared
                            </span>
                          ) : (
                            <span>
                              {formatAmount(
                                service.current_fee,
                                service.currency,
                              )}
                            </span>
                          )}
                          {service.current_fee_effective_from && (
                            <small>
                              Effective{" "}
                              {formatDate(service.current_fee_effective_from)}
                            </small>
                          )}
                        </td>
                        <td>{feeBoundsLabel(service)}</td>
                        <td className="professional-fees__actions">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-expanded={isEditing}
                            onClick={() =>
                              isEditing
                                ? setEditingServiceId(null)
                                : beginEditing(service)
                            }
                          >
                            {isEditing
                              ? "Close edit"
                              : service.current_fee === null
                                ? "Declare fee"
                                : "Set new fee"}
                          </Button>
                        </td>
                      </tr>
                      {isEditing && (
                        <tr className="professional-fees__edit-row">
                          <td colSpan={4}>
                            <form
                              className="professional-fees__form"
                              onSubmit={(event) => void saveFee(event, service)}
                            >
                              <div className="professional-fees__field">
                                <label htmlFor={amountId}>
                                  Professional fee ({service.currency})
                                </label>
                                <input
                                  id={amountId}
                                  name="amount"
                                  type="number"
                                  inputMode="decimal"
                                  min={service.min_professional_fee ?? 0}
                                  max={
                                    service.max_professional_fee ?? undefined
                                  }
                                  step="0.01"
                                  value={amount}
                                  onChange={(event) =>
                                    setAmount(event.target.value)
                                  }
                                  required
                                  autoFocus
                                />
                                <span>Allowed: {feeBoundsLabel(service)}</span>
                              </div>
                              <div className="professional-fees__field">
                                <label htmlFor={effectiveFromId}>
                                  Effective from (optional)
                                </label>
                                <input
                                  id={effectiveFromId}
                                  name="effectiveFrom"
                                  type="datetime-local"
                                  value={effectiveFrom}
                                  onChange={(event) =>
                                    setEffectiveFrom(event.target.value)
                                  }
                                />
                                <span>
                                  Leave blank to make this fee effective now.
                                </span>
                              </div>
                              <div className="professional-fees__form-actions">
                                <Button type="submit" disabled={saving}>
                                  {saving ? "Saving fee…" : "Save new fee"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={saving}
                                  onClick={() => setEditingServiceId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                      <tr className="professional-fees__history-row">
                        <td colSpan={4}>
                          <details
                            className="professional-fees__history"
                            onToggle={(event) => {
                              if (event.currentTarget.open)
                                void loadHistory(
                                  service.service_practitioner_id,
                                );
                            }}
                          >
                            <summary>
                              View fee history for {service.service_name}
                            </summary>
                            <div className="professional-fees__history-body">
                              {serviceHistory?.state === "loading" && (
                                <p role="status">Loading fee history…</p>
                              )}
                              {serviceHistory?.state === "error" && (
                                <div role="alert">
                                  <p>{serviceHistory.error}</p>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      void loadHistory(
                                        service.service_practitioner_id,
                                      )
                                    }
                                  >
                                    Try again
                                  </Button>
                                </div>
                              )}
                              {serviceHistory?.state === "ready" &&
                                serviceHistory.items.length === 0 && (
                                  <p>
                                    No fee changes have been recorded for this
                                    service.
                                  </p>
                                )}
                              {serviceHistory?.state === "ready" &&
                                serviceHistory.items.length > 0 && (
                                  <ol className="professional-fees__history-list">
                                    {serviceHistory.items.map((entry) => (
                                      <li key={entry.id}>
                                        <strong>
                                          {formatAmount(
                                            entry.amount,
                                            service.currency,
                                          )}
                                        </strong>
                                        <span>
                                          Effective{" "}
                                          {formatDate(entry.effective_from)}
                                        </span>
                                        <small>
                                          Recorded{" "}
                                          {formatDate(entry.created_at)}
                                        </small>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                            </div>
                          </details>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
