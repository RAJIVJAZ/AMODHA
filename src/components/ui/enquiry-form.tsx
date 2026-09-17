"use client";

import { useState, type FormEvent } from "react";
import { siteConfig } from "@/lib/site";

type Field = {
  name: string;
  label: string;
  type?: "text" | "tel" | "email" | "textarea" | "select";
  required?: boolean;
  options?: string[];
};

type EnquiryFormProps = {
  title: string;
  description?: string;
  fields: Field[];
  whatsappIntro: string;
};

export function EnquiryForm({ title, description, fields, whatsappIntro }: EnquiryFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  function handleChange(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const lines = [whatsappIntro, ""];
    for (const field of fields) {
      if (values[field.name]) {
        lines.push(`${field.label}: ${values[field.name]}`);
      }
    }
    const message = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/${siteConfig.contact.whatsapp}?text=${message}`, "_blank", "noopener,noreferrer");
    setSubmitted(true);
  }

  return (
    <div className="rounded-2xl border border-gold/20 bg-white p-6 shadow-sm sm:p-8">
      <h2 className="text-2xl font-bold text-brown">{title}</h2>
      {description ? <p className="mt-2 text-sm text-dark/70">{description}</p> : null}

      <form onSubmit={handleSubmit} className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {fields.map((field) => (
          <div
            key={field.name}
            className={field.type === "textarea" ? "sm:col-span-2 flex flex-col gap-1.5" : "flex flex-col gap-1.5"}
          >
            <label htmlFor={field.name} className="text-sm font-semibold text-brown">
              {field.label}
              {field.required ? <span className="text-accent-red"> *</span> : null}
            </label>
            {field.type === "textarea" ? (
              <textarea
                id={field.name}
                name={field.name}
                required={field.required}
                rows={4}
                onChange={(e) => handleChange(field.name, e.target.value)}
                className="rounded-lg border border-gold/30 px-3 py-2.5 text-sm text-dark focus:border-gold focus:outline-none"
              />
            ) : field.type === "select" ? (
              <select
                id={field.name}
                name={field.name}
                required={field.required}
                defaultValue=""
                onChange={(e) => handleChange(field.name, e.target.value)}
                className="rounded-lg border border-gold/30 px-3 py-2.5 text-sm text-dark focus:border-gold focus:outline-none"
              >
                <option value="" disabled>
                  Select an option
                </option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={field.name}
                name={field.name}
                type={field.type ?? "text"}
                required={field.required}
                onChange={(e) => handleChange(field.name, e.target.value)}
                className="rounded-lg border border-gold/30 px-3 py-2.5 text-sm text-dark focus:border-gold focus:outline-none"
              />
            )}
          </div>
        ))}

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent-red px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-red-dark sm:w-auto"
          >
            Send via WhatsApp
          </button>
          <p className="mt-3 text-xs text-dark/50">
            Submitting opens WhatsApp with your details pre-filled so our team can respond directly. You
            can also email us at{" "}
            <a href={`mailto:${siteConfig.contact.email}`} className="text-accent-red hover:underline">
              {siteConfig.contact.email}
            </a>
            .
          </p>
          {submitted ? (
            <p role="status" className="mt-2 text-sm font-medium text-green-700">
              WhatsApp opened in a new tab — please send the pre-filled message to complete your enquiry.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
