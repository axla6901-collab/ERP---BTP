import { Badge } from '@/components/ui/badge';
import { statutExpiration, statutSignature } from '@/lib/test-sirh/documents/regles';
import { formatDateFr } from '@/lib/test-sirh/format';

/** Date d'expiration + badge « Expiré » (rose) / « Expire bientôt » (ambre, ≤ 30 j). */
export function ExpirationDocument({
  dateExpiration,
  today,
}: {
  dateExpiration: string | null;
  today: string;
}) {
  const statut = statutExpiration(dateExpiration, today);
  if (statut === 'sans') return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="tabular-nums">{formatDateFr(dateExpiration)}</span>
      {statut === 'expire' && <Badge tone="rose">Expiré</Badge>}
      {statut === 'bientot' && <Badge tone="amber">Expire bientôt</Badge>}
    </span>
  );
}

/** Signature : « À signer » (ambre), « Signé le … » (vert) ou rien si non requise. */
export function SignatureDocument({
  signatureRequise,
  signeLe,
}: {
  signatureRequise: boolean;
  signeLe: string | null;
}) {
  const statut = statutSignature({ signatureRequise, signeLe });
  if (statut === 'signe') return <Badge tone="emerald">Signé le {formatDateFr(signeLe)}</Badge>;
  if (statut === 'a_signer') return <Badge tone="amber">À signer</Badge>;
  return <span className="text-muted-foreground">—</span>;
}
