import { PinIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import type { AnnonceAffichee } from '@/lib/test-sirh/annonces/types';
import {
  libelleAudience,
  LIBELLES_STATUT_ANNONCE,
  statutAnnonce,
  type StatutAnnonce,
} from '@/lib/test-sirh/annonces/visibilite';
import { formatDateFr } from '@/lib/test-sirh/format';
import { cn } from '@/lib/utils';
import {
  LIBELLES_CATEGORIE_ANNONCE,
  type CategorieAnnonce,
} from '@/lib/validation/test-sirh/enums';

export const TON_CATEGORIE_ANNONCE: Record<CategorieAnnonce, BadgeTone> = {
  information: 'sky',
  securite: 'rose',
  evenement: 'violet',
  rh: 'orange',
  autre: 'neutral',
};

export const TON_STATUT_ANNONCE: Record<StatutAnnonce, BadgeTone> = {
  en_ligne: 'emerald',
  programmee: 'sky',
  brouillon: 'neutral',
  expiree: 'slate',
};

/**
 * Fil d'actualité des annonces internes (server-compatible : utilisable dans
 * une page serveur — « Mon espace », tableau de bord — comme dans un composant
 * client). L'ordre fourni est conservé (cf. `listerAnnoncesVisibles` : épinglées
 * d'abord puis les plus récentes). Contenu en texte brut : retours à la ligne
 * conservés, aucun HTML interprété.
 */
export function FilAnnonces({
  annonces,
  today,
  compact = false,
  afficherStatut = false,
  vide = 'Aucune annonce pour le moment.',
  renderActions,
}: {
  annonces: AnnonceAffichee[];
  /** Date du jour (ISO) — statut programmée / expirée. */
  today: string;
  /** Contenu tronqué à 4 lignes (encarts de tableau de bord). */
  compact?: boolean;
  /** Badge de statut (brouillon, programmée, expirée) — vue gestionnaire. */
  afficherStatut?: boolean;
  vide?: ReactNode;
  /** Actions par annonce (composant client uniquement). */
  renderActions?: (annonce: AnnonceAffichee) => ReactNode;
}) {
  if (annonces.length === 0) return <SirhVide>{vide}</SirhVide>;

  return (
    <ul className="space-y-3">
      {annonces.map((a) => {
        const statut = statutAnnonce(a, today);
        return (
          <li key={a.id}>
            <article
              className={cn(
                'rounded-xl border bg-card p-4 shadow-sm',
                a.epinglee &&
                  'border-amber-300 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/10',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {a.epinglee && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                    <PinIcon className="size-3.5" aria-hidden="true" />
                    Épinglée
                  </span>
                )}
                <Badge tone={TON_CATEGORIE_ANNONCE[a.categorie]}>
                  {LIBELLES_CATEGORIE_ANNONCE[a.categorie]}
                </Badge>
                {afficherStatut && statut !== 'en_ligne' && (
                  <Badge tone={TON_STATUT_ANNONCE[statut]} shape="pill">
                    {LIBELLES_STATUT_ANNONCE[statut]}
                  </Badge>
                )}
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDateFr(a.datePublication)}
                  {a.dateExpiration ? ` → ${formatDateFr(a.dateExpiration)}` : ''}
                </span>
                {renderActions && (
                  <div className="ml-auto flex items-center gap-1">{renderActions(a)}</div>
                )}
              </div>
              <h3 className="mt-2 font-semibold">{a.titre}</h3>
              <p
                className={cn(
                  'mt-1 whitespace-pre-line break-words text-sm text-foreground/90',
                  compact && 'line-clamp-4',
                )}
              >
                {a.contenu}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {libelleAudience(a)}
                {a.auteur ? ` · par ${a.auteur}` : ''}
              </p>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
