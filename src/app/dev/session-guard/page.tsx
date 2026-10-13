import { notFound } from "next/navigation";
import { SessionGuard } from "@/components/staff/session-guard";
import { DevAutosaveForm } from "./form";

export const dynamic = "force-dynamic";

// Browser test page for the inactivity guard and autosave (tests only: exists when MW_TEST_PAGES=1).
export default async function DevSessionGuard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (process.env.MW_TEST_PAGES !== "1") notFound();
  const sp = await searchParams;
  const t = Number(sp.t ?? 8);
  const w = Number(sp.w ?? 3);
  return (
    <main style={{ minHeight: "300vh", padding: 16 }}>
      <h1>Session guard test</h1>
      <DevAutosaveForm />
      <SessionGuard timeoutSeconds={t} warningSeconds={w} />
    </main>
  );
}
