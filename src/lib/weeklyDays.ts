/**
 * Parser for the `selected_days_for_weekly` column on orders.
 *
 * The column has shipped in multiple shapes:
 *   - canonical:        '[{"dayCode":1,"qty":2}, ...]'
 *   - Flutter toString: '[{dayCode:1, qty:2}, ...]'   (unquoted keys)
 *   - flat-int array:   '[5,1,3]'                     (qty implied = 1)
 *   - flat-string:      '["5","1","3"]'               (qty implied = 1)
 *
 * `dayCode` uses the 0=Sunday..6=Saturday convention (matches JS
 * Date.getDay() and the Flutter app's selectedValueDays).
 */

export interface WeeklyDay {
  dayCode: number;
  qty: number;
}

export function parseWeeklyDays(raw: unknown): WeeklyDay[] {
  if (raw == null || raw === '') return [];

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        const fixed = raw.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
        parsed = JSON.parse(fixed);
      } catch {
        return [];
      }
    }
  }

  if (!Array.isArray(parsed)) return [];

  const out: WeeklyDay[] = [];
  for (const entry of parsed) {
    if (typeof entry === 'number' && Number.isFinite(entry)) {
      out.push({ dayCode: entry, qty: 1 });
    } else if (typeof entry === 'string') {
      const n = Number(entry);
      if (Number.isFinite(n)) out.push({ dayCode: n, qty: 1 });
    } else if (entry && typeof entry === 'object' && 'dayCode' in entry) {
      const obj = entry as Record<string, unknown>;
      const dc = Number(obj.dayCode);
      const rawQty = obj.qty == null ? 1 : obj.qty;
      const q = Number(rawQty);
      if (Number.isFinite(dc)) {
        out.push({
          dayCode: dc,
          qty: Number.isFinite(q) && q > 0 ? q : 1,
        });
      }
    }
  }
  return out;
}
