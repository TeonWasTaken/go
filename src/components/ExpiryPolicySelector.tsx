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

const DURATION_OPTIONS: { value: 1 | 3 | 12; label: string }[] = [
  { value: 1, label: "1 month" },
  { value: 3, label: "3 months" },
  { value: 12, label: "12 months" },
];

export function ExpiryPolicySelector({
  value,
  onChange,
}: ExpiryPolicySelectorProps) {
  const handleTypeChange = (type: PolicyType) => {
    if (type === "never" || type === "inactivity") {
      onChange({ expiry_policy_type: type });
    } else {
      onChange({ expiry_policy_type: "fixed", duration_months: 12 });
    }
  };

  const useCustomDate =
    value.expiry_policy_type === "fixed" &&
    value.custom_expires_at !== undefined;

  return (
    <fieldset className="expiry-selector">
      <legend className="expiry-selector__legend">Expiry Policy</legend>

      <div
        className="expiry-selector__types"
        role="radiogroup"
        aria-label="Expiry type"
      >
        {[
          { type: "never" as const, label: "Never" },
          { type: "fixed" as const, label: "Expire on date" },
          { type: "inactivity" as const, label: "After inactivity" },
        ].map((opt) => (
          <button
            key={opt.type}
            type="button"
            role="radio"
            aria-checked={value.expiry_policy_type === opt.type}
            className={`expiry-selector__type-btn${value.expiry_policy_type === opt.type ? " expiry-selector__type-btn--active" : ""}`}
            onClick={() => handleTypeChange(opt.type)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {value.expiry_policy_type === "fixed" && (
        <div className="expiry-selector__fixed-options">
          <div className="expiry-selector__toggle-row">
            <label className="expiry-selector__toggle-label">
              <input
                type="checkbox"
                checked={useCustomDate}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange({
                      expiry_policy_type: "fixed",
                      custom_expires_at: "",
                    });
                  } else {
                    onChange({
                      expiry_policy_type: "fixed",
                      duration_months: 12,
                    });
                  }
                }}
              />
              Use custom date
            </label>
          </div>

          {useCustomDate ? (
            <input
              type="date"
              className="expiry-selector__date-input"
              value={value.custom_expires_at ?? ""}
              onChange={(e) =>
                onChange({
                  expiry_policy_type: "fixed",
                  custom_expires_at: e.target.value
                    ? new Date(e.target.value).toISOString()
                    : "",
                })
              }
              min={new Date().toISOString().split("T")[0]}
              aria-label="Custom expiry date"
            />
          ) : (
            <div
              className="expiry-selector__durations"
              role="radiogroup"
              aria-label="Duration"
            >
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={value.duration_months === opt.value}
                  className={`expiry-selector__dur-btn${value.duration_months === opt.value ? " expiry-selector__dur-btn--active" : ""}`}
                  onClick={() =>
                    onChange({
                      expiry_policy_type: "fixed",
                      duration_months: opt.value,
                    })
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
