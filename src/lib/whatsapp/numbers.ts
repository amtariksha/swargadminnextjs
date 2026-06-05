import { supabaseAdmin } from "@/lib/whatsapp/supabase";

// Bootstrap default until each org marks a number primary — swarg's main
// "Customer Care" line (917996196111), the number the Node backend actually
// SENDS from. Override per-deploy with WA_PRIMARY_NUMBER, or per-org with the
// integrated_numbers.is_primary flag (the proper multi-tenant mechanism).
const DEFAULT_PRIMARY_NUMBER = "917996196111";

interface IntegratedNumberRow {
  number?: string | null;
  provider?: string | null;
  is_primary?: boolean | null;
}

/**
 * Resolve the PRIMARY WhatsApp integrated number for template sync + sends.
 *
 * Preference order:
 *   1. integrated_numbers.is_primary = true   (per-org, operator-set; multi-tenant)
 *   2. the number matching env WA_PRIMARY_NUMBER (default 917996196111)
 *   3. the first msg91-provider active number
 *   4. the first active number
 *
 * Fixes the prior bug where the OLDEST msg91 number won (`order created_at asc`
 * + first msg91), which picked …66111 instead of the sending number 917996196111
 * when a tenant has two numbers. Selecting "*" keeps this graceful before the
 * is_primary migration is applied (the column is simply absent → undefined).
 */
export async function getPrimaryIntegratedNumber(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("integrated_numbers")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(20);

  const rows = (data || []) as IntegratedNumberRow[];

  const primary = rows.find((n) => n.is_primary === true);
  if (primary?.number) return String(primary.number);

  const want = (process.env.WA_PRIMARY_NUMBER || DEFAULT_PRIMARY_NUMBER).trim();
  if (want) {
    const match = rows.find((n) => String(n.number) === want);
    if (match?.number) return String(match.number);
  }

  const msg91 = rows.find((n) => !n.provider || n.provider === "msg91");
  return String(msg91?.number || rows[0]?.number || "");
}
