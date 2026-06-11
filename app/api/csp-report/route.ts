import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

/**
 * Collecte des violations Content-Security-Policy (directives `report-uri` /
 * `report-to`, cf. `lib/security/csp.ts`).
 *
 * Endpoint PUBLIC et sans session : les violations peuvent provenir de pages non
 * authentifiées (`/login`). Il est exclu du middleware (matcher) pour ne pas être
 * redirigé vers `/login`. Ne renvoie pas de corps (204) et n'échoue jamais en
 * 5xx (un rapport illisible est ignoré). Logue côté serveur + Sentry (no-op sans
 * DSN), ce qui rend le mode `CSP_REPORT_ONLY=true` réellement exploitable.
 */
export const runtime = 'nodejs';

// Garde-fou anti-spam : un rapport CSP légitime fait quelques Ko.
const MAX_BODY_BYTES = 64 * 1024;

interface CspViolation {
  directive: string;
  blocked: string;
  document: string;
}

function normalize(report: Record<string, unknown> | null | undefined): CspViolation {
  const r = report ?? {};
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const value = r[key];
      if (typeof value === 'string' && value) return value;
    }
    return 'inconnue';
  };
  return {
    // Format legacy (report-uri) vs moderne (report-to / Reporting API).
    directive: pick('violated-directive', 'effectiveDirective', 'effective-directive'),
    blocked: pick('blocked-uri', 'blockedURL', 'blocked-url'),
    document: pick('document-uri', 'documentURL', 'document-url'),
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      // report-to : tableau `[{ type, body }, …]` ; report-uri : `{ "csp-report": {…} }`.
      const reports: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? parsed.map((entry) => (entry?.body ?? entry) as Record<string, unknown>)
        : [
            ((parsed as Record<string, unknown>)?.['csp-report'] ?? parsed) as Record<
              string,
              unknown
            >,
          ];

      for (const report of reports) {
        const v = normalize(report);
        console.warn(
          `[CSP] violation directive=${v.directive} blocked=${v.blocked} document=${v.document}`,
        );
        Sentry.captureMessage('CSP violation', {
          level: 'warning',
          extra: { ...v },
        });
      }
    }
  } catch {
    // Rapport illisible : on ignore (ne jamais renvoyer 5xx à un endpoint de report).
  }
  return new NextResponse(null, { status: 204 });
}
