import { useRef } from "react";

type PolicyType = "never" | "fixed" | "inactivity";

export interface ExpiryPolicyValue {
  expiry_policy_type: PolicyType;
  duration_months?: 1 | 3 | 12;
  custom_expires_at?: string;
}

interface ExpiryPolicySelectorProps {
  value: ExpiryPolicyValue;
  onChange: (value: ExpiryPolicyValue) => void;
}

const TYPE_OPTIONS: { type: PolicyType; label: string }[] = [
  { type: "never", label: "Never" },
  { type: "fixed", label: "Expire on date" },
  { type: "inactivity", label: "After inactivity" },
];

type DurationChoice = 1 | 3 | 12 | "custom";

const DURATION_OPTIONS: { value: DurationChoice; label: string }[] = [
  { value: 1, label: "1 month" },
  { value: 3, label: "3 months" },
  { value: 12, label: "12 months" },
  { value: "custom", label: "Custom" },
];

export function ExpiryPolicySelector({
  value,
  onChange,
}: ExpiryPolicySelectorProps) {
  const typeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const durationRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTypeChange = (type: PolicyType) => {
    if (type === "never" || type === "inactivity") {
      onChange({ expiry_policy_type: type });
    } else {
      onChange({ expiry_policy_type: "fixed", duration_months: 12 });
    }
  };

  const handleTypeKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = TYPE_OPTIONS.findIndex(
      (opt) => opt.type === value.expiry_policy_type,
    );
    let newIndex = currentIndex;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      newIndex = Math.min(currentIndex + 1, TYPE_OPTIONS.length - 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      newIndex = Math.max(currentIndex - 1, 0);
    } else {
      return;
    }

    const newType = TYPE_OPTIONS[newIndex];
    if (newType) {
      handleTypeChange(newType.type);
      typeRefs.current[newIndex]?.focus();
    }
  };

  const handleDurationSelect = (choice: DurationChoice) => {
    if (choice === "custom") {
      onChange({
        expiry_policy_type: "fixed",
        custom_expires_at: value.custom_expires_at ?? "",
      });
    } else {
      onChange({ expiry_policy_type: "fixed", duration_months: choice });
    }
  };

  const handleDurationKeyDown = (e: React.KeyboardEvent) => {
    const activeDuration: DurationChoice =
      value.custom_expires_at !== undefined
        ? "custom"
        : (value.duration_months ?? 12);
    const currentIndex = DURATION_OPTIONS.findIndex(
      (opt) => opt.value === activeDuration,
    );
    let newIndex = currentIndex;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      newIndex = Math.min(currentIndex + 1, DURATION_OPTIONS.length - 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      newIndex = Math.max(currentIndex - 1, 0);
    } else {
      return;
    }

    const newDuration = DURATION_OPTIONS[newIndex];
    if (newDuration) {
      handleDurationSelect(newDuration.value);
      durationRefs.current[newIndex]?.focus();
    }
  };

  const useCustomDate =
    value.expiry_policy_type === "fixed" &&
    value.custom_expires_at !== undefined;

  const typeIndex = Math.max(
    0,
    TYPE_OPTIONS.findIndex((opt) => opt.type === value.expiry_policy_type),
  );
  const typeTransform = `translateX(${typeIndex * 100}%)`;

  const activeDuration: DurationChoice = useCustomDate
    ? "custom"
    : (value.duration_months ?? 12);
  const durationIndex = Math.max(
    0,
    DURATION_OPTIONS.findIndex((opt) => opt.value === activeDuration),
  );
  const durationTransform = `translateX(${durationIndex * 100}%)`;

  return (
    <fieldset className="expiry-selector">
      <legend className="expiry-selector__legend">Expiry Policy</legend>

      <div
        className="expiry-pill glass--subtle"
        role="radiogroup"
        aria-label="Expiry type"
        onKeyDown={handleTypeKeyDown}
      >
        {TYPE_OPTIONS.map((opt, i) => (
          <button
            key={opt.type}
            ref={(el) => {
              typeRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value.expiry_policy_type === opt.type}
            tabIndex={value.expiry_policy_type === opt.type ? 0 : -1}
            className={`expiry-pill__option${value.expiry_policy_type === opt.type ? " expiry-pill__option--active" : ""}`}
            onClick={() => handleTypeChange(opt.type)}
          >
            {opt.label}
          </button>
        ))}
        <div
          className="expiry-pill__slider"
          style={{ transform: typeTransform }}
        />
      </div>

      {value.expiry_policy_type === "fixed" && (
        <div className="expiry-selector__fixed-options">
          <div
            className="expiry-pill expiry-pill--4 glass--subtle"
            role="radiogroup"
            aria-label="Duration"
            onKeyDown={handleDurationKeyDown}
          >
            {DURATION_OPTIONS.map((opt, i) => (
              <button
                key={opt.value}
                ref={(el) => {
                  durationRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={activeDuration === opt.value}
                tabIndex={activeDuration === opt.value ? 0 : -1}
                className={`expiry-pill__option${activeDuration === opt.value ? " expiry-pill__option--active" : ""}`}
                onClick={() => handleDurationSelect(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <div
              className="expiry-pill__slider"
              style={{ transform: durationTransform }}
            />
          </div>

          {useCustomDate && (
            <input
              type="date"
              className="expiry-selector__date-input"
              value={
                value.custom_expires_at
                  ? value.custom_expires_at.split("T")[0]
                  : ""
              }
              onChange={(e) =>
                onChange({
                  expiry_policy_type: "fixed",
                  custom_expires_at: e.target.value
                    ? `${e.target.value}T23:59:59.999Z`
                    : "",
                })
              }
              min={new Date().toISOString().split("T")[0]}
              aria-label="Custom expiry date"
            />
          )}
        </div>
      )}

      {value.expiry_policy_type === "inactivity" && (
        <p className="expiry-selector__info">
          This alias will expire after 12 months of no access.
        </p>
      )}
    </fieldset>
  );
}
