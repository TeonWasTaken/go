import { useEffect, useRef, useState } from "react";

interface SearchBarProps {
  onSearch: (term: string) => void;
  onSubmit?: (term: string) => void;
  initialValue?: string;
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  onSubmit,
  initialValue = "",
  placeholder = "Search aliases…",
}: SearchBarProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search callback (300ms)
  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onSearch(value), 300);
    return () => clearTimeout(timerRef.current);
  }, [value, onSearch]);

  // "/" keyboard shortcut to focus
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (e.target as HTMLElement).tagName,
        )
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(value);
  };

  return (
    <form className="search-bar glass" onSubmit={handleSubmit}>
      <span className="search-bar__icon" aria-hidden="true">
        🔍
      </span>
      <input
        ref={inputRef}
        className="search-bar__input"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue("");
            onSearch("");
            inputRef.current?.blur();
          }
        }}
        placeholder={placeholder}
        aria-label="Search aliases"
      />
      <kbd className="search-bar__shortcut" aria-hidden="true">
        /
      </kbd>
    </form>
  );
}
