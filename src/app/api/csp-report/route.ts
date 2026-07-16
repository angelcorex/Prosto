import { NextResponse, type NextRequest } from 'next/server';

import { limitRequest } from '@/lib/rate-limit/ip';

export const runtime = 'nodejs';

/**
 * CSP violation report sink.
 *
 * The Content-Security-Policy-Report-Only header (set in middleware) tells the
 * browser to POST a JSON report here whenever something WOULD have been blocked.
 * We log a compact line per violation so we can see, before enforcing, exactly
 * which scripts/styles/connections the policy needs to allow — then tighten the
 * policy and flip the header to enforcing.
 *
 * Browsers send one of two shapes:
 *  - legacy `report-uri`:  { "csp-report": { "violated-directive", "blocked-uri", ... } }
 *  - modern `report-to`:   [ { "type":"csp-violation", "body": { ... } } ]
 * We accept both and never trust the contents (log-only, no DB write).
 */
export async function POST(request: NextRequest) {
  // Reports are attacker-spoofable; cap the volume so this can't be a log-flood
  // DoS vector. Best-effort per-IP.
  const limited = limitRequest(request, 'csp-report', 60, 10_000);
  if (limited) return limited;

  try {
    const body = await request.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reports: any[] = Array.isArray(body) ? body : [body?.['csp-report'] ?? body];
    for (const r of reports.slice(0, 10)) {
      const v = r?.body ?? r ?? {};
      const directive = v['violated-directive'] ?? v['effectiveDirective'] ?? v['effective-directive'] ?? '?';
      const blocked = v['blocked-uri'] ?? v['blockedURL'] ?? v['blocked-url'] ?? '?';
      const doc = v['document-uri'] ?? v['documentURL'] ?? '?';
      // Keep it to a single, greppable line — no payload echoing beyond these fields.
      console.warn(`[csp-report] directive=${directive} blocked=${blocked} doc=${doc}`);
    }
  } catch {
    /* malformed report — ignore */
  }
  // 204: nothing to return to the browser.
  return new NextResponse(null, { status: 204 });
}
