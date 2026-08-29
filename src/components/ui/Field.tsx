"use client";

import { useId } from "react";

const CONTROL =
  "min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm outline-none " +
  "placeholder:text-muted focus:border-brand disabled:opacity-60";

function Label({
  htmlFor,
  label,
  optional,
  hint,
}: {
  htmlFor: string;
  label: string;
  optional?: boolean;
  hint?: string;
}) {
  return (
    <>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted">
        {label}
        {optional && <span className="font-normal"> (optional)</span>}
      </label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </>
  );
}

/**
 * A labelled text input.
 *
 * Every field on the user record is optional in the database except the name,
 * so `optional` is marked explicitly rather than required being marked: a form
 * where almost everything carries an asterisk teaches you to ignore asterisks.
 */
export function Field({
  label,
  value,
  onChange,
  type = "text",
  optional = false,
  hint,
  placeholder,
  disabled = false,
  autoComplete = "off",
  inputMode,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "tel" | "date";
  optional?: boolean;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  error?: string | null;
}) {
  const id = useId();

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} label={label} optional={optional} hint={hint} />
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-errormessage={error ? `${id}-error` : undefined}
        className={`${CONTROL} ${error ? "border-danger" : ""}`}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** A labelled select. An empty value renders as the placeholder option. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  optional = false,
  hint,
  placeholder = "Not set",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  optional?: boolean;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} label={label} optional={optional} hint={hint} />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={CONTROL}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * A text input that suggests values already in use, without restricting to
 * them. Position is free text that behaves like an enum in practice, which is
 * exactly what a datalist is for: type anything, or pick what a colleague typed.
 */
export function SuggestField({
  label,
  value,
  onChange,
  suggestions,
  optional = false,
  hint,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  optional?: boolean;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const listId = `${id}-list`;

  return (
    <div className="grid gap-1">
      <Label htmlFor={id} label={label} optional={optional} hint={hint} />
      <input
        id={id}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={CONTROL}
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </div>
  );
}
