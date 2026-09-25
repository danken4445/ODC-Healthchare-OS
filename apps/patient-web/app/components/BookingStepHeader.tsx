interface BookingStepHeaderProps {
  current: number;
  description: string;
  title: string;
  total?: number;
}

export function BookingStepHeader({ current, description, title, total = 3 }: BookingStepHeaderProps) {
  return (
    <header className="booking-step-header">
      <p>Step {current} of {total}</p>
      <div className="booking-progress" aria-label={`Step ${current} of ${total}`} role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={current}>
        {Array.from({ length: total }, (_, index) => <span className={index < current ? "is-complete" : ""} key={index} />)}
      </div>
      <h2>{title}</h2>
      <p className="hint">{description}</p>
    </header>
  );
}
