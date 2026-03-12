"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import type { DynamicFormData, DynamicFormField } from "./types";

interface FormSchema {
  theme: string;
  intro: string;
  fields: DynamicFormField[];
}

interface Props {
  form: FormSchema;
  onSubmit: (data: DynamicFormData) => void;
  disabled?: boolean;
}

export function DynamicForm({ form, onSubmit, disabled = false }: Props) {
  const [values, setValues] = useState<Record<string, string | string[]>>({});

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fields = form.fields.map((f) => ({
      id: f.id,
      label: f.label,
      value: values[f.id] ?? (f.type === "multiple" ? [] : ""),
    }));
    onSubmit({ theme: form.theme, fields });
  }

  function setValue(id: string, val: string | string[]) {
    setValues((prev) => ({ ...prev, [id]: val }));
  }

  function toggleMultiple(id: string, option: string) {
    const current = (values[id] as string[]) ?? [];
    setValue(
      id,
      current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option],
    );
  }

  return (
    <form onSubmit={handleSubmit} style={S.card}>
      <div style={S.theme}>{form.theme}</div>
      <p style={S.intro}>{form.intro}</p>

      <div style={S.fields}>
        {form.fields.map((field) => (
          <div key={field.id} style={S.fieldGroup}>
            <label style={S.label}>
              {field.label}
              {field.required && <span style={S.required}> *</span>}
            </label>

            {field.type === "text" && (
              <input
                type="text"
                placeholder={field.placeholder}
                value={(values[field.id] as string) ?? ""}
                onChange={(e) => setValue(field.id, e.target.value)}
                disabled={disabled}
                required={field.required}
                style={S.input}
              />
            )}

            {field.type === "textarea" && (
              <textarea
                placeholder={field.placeholder}
                value={(values[field.id] as string) ?? ""}
                onChange={(e) => setValue(field.id, e.target.value)}
                disabled={disabled}
                required={field.required}
                rows={3}
                style={S.textarea}
              />
            )}

            {(field.type === "choice" || field.type === "multiple") &&
              field.options && (
                <div style={S.choiceGroup}>
                  {field.options.map((opt) => {
                    const selected =
                      field.type === "choice"
                        ? (values[field.id] as string) === opt
                        : ((values[field.id] as string[]) ?? []).includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          field.type === "choice"
                            ? setValue(field.id, opt)
                            : toggleMultiple(field.id, opt)
                        }
                        style={S.choiceBtn(selected)}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        ))}
      </div>

      <button type="submit" disabled={disabled} style={S.submit(disabled)}>
        Confirmer →
      </button>
    </form>
  );
}

// ─── Styles ────────────────────────────────────────────────────
const S: Record<string, any> = {
  card: {
    background: "#0d0d1a",
    border: "1px solid #2a2a3a",
    borderRadius: "10px",
    padding: "18px 20px",
    marginTop: "8px",
    marginBottom: "4px",
  } as CSSProperties,

  theme: {
    fontFamily: "Space Mono",
    fontSize: "10px",
    color: "#6c63ff",
    letterSpacing: "0.15em",
    marginBottom: "8px",
    textTransform: "uppercase",
  } as CSSProperties,

  intro: {
    fontSize: "13px",
    color: "#a0a0bc",
    lineHeight: 1.6,
    fontWeight: 300,
    marginBottom: "16px",
    margin: "0 0 16px 0",
  } as CSSProperties,

  fields: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    marginBottom: "16px",
  } as CSSProperties,

  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  } as CSSProperties,

  label: {
    fontSize: "12px",
    color: "#c0c0d8",
    fontWeight: 400,
  } as CSSProperties,

  required: {
    color: "#6c63ff",
  } as CSSProperties,

  input: {
    background: "#0a0a14",
    border: "1px solid #1e1e2e",
    borderRadius: "6px",
    padding: "8px 12px",
    color: "#e0e0f0",
    fontFamily: "DM Sans",
    fontSize: "13px",
    width: "100%",
    outline: "none",
  } as CSSProperties,

  textarea: {
    background: "#0a0a14",
    border: "1px solid #1e1e2e",
    borderRadius: "6px",
    padding: "8px 12px",
    color: "#e0e0f0",
    fontFamily: "DM Sans",
    fontSize: "13px",
    width: "100%",
    resize: "vertical",
    outline: "none",
  } as CSSProperties,

  choiceGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  } as CSSProperties,

  choiceBtn: (selected: boolean): CSSProperties => ({
    padding: "5px 12px",
    background: selected ? "#6c63ff1a" : "transparent",
    border: `1px solid ${selected ? "#6c63ff" : "#2a2a3a"}`,
    borderRadius: "5px",
    color: selected ? "#a0a0ff" : "#7c7c9a",
    fontFamily: "DM Sans",
    fontSize: "12px",
    cursor: "pointer",
    transition: "all 0.15s",
  }),

  submit: (disabled: boolean): CSSProperties => ({
    padding: "8px 18px",
    background: disabled ? "#1e1e2e" : "#6c63ff",
    border: "none",
    borderRadius: "6px",
    color: disabled ? "#4a4a6a" : "#fff",
    fontFamily: "DM Sans",
    fontSize: "12px",
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "background 0.15s",
  }),
};
