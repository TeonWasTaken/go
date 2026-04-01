import { useRef } from "react";

interface ScopeToggleProps {
  isPrivate: boolean;
  onChange: (isPrivate: boolean) => void;
}

export function ScopeToggle({ isPrivate, onChange }: ScopeToggleProps) {
  const privateRef = useRef<HTMLButtonElement>(null);
  const globalRef = useRef<HTMLButtonElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(true);
      privateRef.current?.focus();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(false);
      globalRef.current?.focus();
    }
  };

  return (
    <div className="scope-toggle-wrapper">
      <span className="form-field__label">Target Audience</span>
      <div
        className="scope-toggle glass--subtle"
        role="radiogroup"
        aria-label="Link scope"
        onKeyDown={handleKeyDown}
      >
        <button
          ref={privateRef}
          type="button"
          role="radio"
          aria-checked={isPrivate}
          tabIndex={isPrivate ? 0 : -1}
          className={`scope-toggle__option ${isPrivate ? "scope-toggle__option--active" : ""}`}
          onClick={() => onChange(true)}
        >
          🔒 Private (Just You)
        </button>
        <button
          ref={globalRef}
          type="button"
          role="radio"
          aria-checked={!isPrivate}
          tabIndex={!isPrivate ? 0 : -1}
          className={`scope-toggle__option ${!isPrivate ? "scope-toggle__option--active" : ""}`}
          onClick={() => onChange(false)}
        >
          🌐 Global (All Staff)
        </button>
        <div
          className="scope-toggle__slider"
          style={{
            transform: isPrivate ? "translateX(0)" : "translateX(100%)",
          }}
        />
      </div>
    </div>
  );
}
