export default function AdminRouteLoading() {
  return (
    <div className="route-skeleton" aria-label="Loading workspace" aria-live="polite" aria-busy="true">
      <div className="route-skeleton__header" />
      <div className="route-skeleton__grid">
        <div className="route-skeleton__card" />
        <div className="route-skeleton__card" />
        <div className="route-skeleton__card" />
      </div>
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}
