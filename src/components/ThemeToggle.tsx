import { useTheme } from "./ThemeProvider";

type ThemeMode = "light" | "dark" | "system";

const options: { value: ThemeMode; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "⚙️" },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <fieldset
      className="theme-toggle"
      role="radiogroup"
      aria-label="Theme preference"
    >
      <legend className="sr-only">Theme preference</legend>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={mode === opt.value}
          aria-label={`${opt.label} theme`}
          className={`theme-toggle__btn${mode === opt.value ? " theme-toggle__btn--active" : ""}`}
          onClick={() => setMode(opt.value)}
        >
          <span className="theme-toggle__icon" aria-hidden="true">
            {opt.icon}
          </span>
        </button>
      ))}
    </fieldset>
  );
}
