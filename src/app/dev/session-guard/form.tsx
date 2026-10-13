"use client";

import { useCallback, useState } from "react";
import { SaveStatusText, useAutosave } from "@/lib/staff/autosave";

export function DevAutosaveForm() {
  const [v, setV] = useState("");
  const read = useCallback(() => (v ? { note: v } : null), [v]);
  const draft = useAutosave("dev:test-form", read, 300);
  return (
    <div>
      <input
        id="note"
        value={v}
        onChange={(e) => {
          setV(e.target.value);
          draft.changed();
        }}
      />
      <p id="status">
        <SaveStatusText status={draft.status} savedAt={draft.savedAt} />
      </p>
    </div>
  );
}
