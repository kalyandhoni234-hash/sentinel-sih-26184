import { redirect } from "next/navigation";

/**
 * /health moved to /system in Phase 8 — the system & model-evaluation
 * workspace. This redirect preserves old links.
 */
export default function HealthRedirect() {
  redirect("/system");
}
