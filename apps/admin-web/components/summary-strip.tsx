export interface SummaryItem {
  detail: string;
  label: string;
  value: string;
}

export function SummaryStrip({ items }: { items: SummaryItem[] }) {
  return (
    <section className="summary-strip" aria-label="Summary">
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <small>{item.detail}</small>
        </div>
      ))}
    </section>
  );
}
