import Link from 'next/link';

import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';
import { cn } from '@/lib/utils';

/** Tonalité d'une pastille / d'un point de statut dans le rail. */
export type RailTone = 'ok' | 'warn' | 'bad' | 'neutral';

const DOT_TONE: Record<RailTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-rose-500',
  neutral: 'bg-neutral-400',
};

const BADGE_TONE: Record<RailTone, string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-rose-100 text-rose-600',
  neutral: 'bg-muted text-muted-foreground',
};

const DOT_HISTORIQUE: Record<HistoriqueRailItem['ton'], string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
};

export type HistoriqueRailItem = {
  id: string;
  label: string;
  ton: 'emerald' | 'amber' | 'rose' | 'slate';
  /** Horodatage déjà formaté (ex. « 14/06 · 16:40 »). */
  quand: string;
  par: string | null;
};

export type FournisseurRailProps = {
  /** Synthèse tarifaire (carte mise en avant, dérivée des grilles). */
  synthese: {
    titrePrincipal: string;
    sousTitre: string;
    lignes: { label: string; detail: string; tone: RailTone }[];
  };
  /** Statut technique + ancrage métier (fournisseur préféré) + méta. */
  statut: {
    actif: boolean;
    nbArticlesPreferes: number;
    /** Date déjà formatée (JJ/MM/AAAA) ou null. */
    creeLe: string | null;
    creePar: string | null;
    modifieLe: string | null;
    modifiePar: string | null;
  };
  /** Résumé des contacts (le détail vit dans le bloc pleine largeur). */
  contacts: {
    actifs: number;
    total: number;
    principalNom: string | null;
    gererHref: string;
  };
  /** Conformité d'achat (vigilance L.8222-1), secondaire pour un fournisseur. */
  conformite: {
    items: { label: string; valeur: string; tone: RailTone }[];
    note: string;
  };
  /** Timeline d'audit de la fiche. */
  historique: HistoriqueRailItem[];
};

function CarteRail({
  titre,
  chip,
  children,
  className,
}: {
  titre: string;
  chip?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10', className)}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="font-heading font-semibold text-orange-700">{titre}</h3>
        {chip}
      </div>
      <div className="border-t px-4 py-3">{children}</div>
    </section>
  );
}

/**
 * Rail contextuel (zone D) de la fiche fournisseur — lecture seule, dérivé des
 * données de la fiche (cf. maquette `gabarit-fournisseur.html`) : synthèse
 * tarifaire (carte mise en avant, jamais une pièce administrative), statut/méta,
 * contacts, conformité d'achat, historique. Composant présentationnel : toute la
 * dérivation est faite côté page (Server Component).
 */
export function FournisseurRail({
  synthese,
  statut,
  contacts,
  conformite,
  historique,
}: FournisseurRailProps) {
  return (
    <div className="space-y-5">
      {/* Carte mise en avant : SYNTHÈSE TARIFAIRE (jamais une pièce administrative) */}
      <section className="overflow-hidden rounded-xl bg-amber-50 ring-1 ring-amber-200">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h3 className="font-heading font-semibold text-orange-700">Synthèse tarifaire</h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-300">
            relation d’achat
          </span>
        </div>
        <div className="px-4 pb-2 pt-1">
          <div className="font-heading text-2xl font-semibold tabular-nums text-amber-700">
            {synthese.titrePrincipal}
          </div>
          <p className="mt-1 text-xs text-amber-800/80">{synthese.sousTitre}</p>
        </div>
        {synthese.lignes.length > 0 && (
          <ul className="space-y-2 px-4 pb-3 text-sm">
            {synthese.lignes.map((l, i) => (
              <li key={`${l.label}-${i}`} className="flex items-start gap-2">
                <span
                  className={cn('mt-1 size-1.5 shrink-0 rounded-full', DOT_TONE[l.tone])}
                  aria-hidden
                />
                <span>
                  {l.label}
                  <br />
                  <span className="text-xs text-muted-foreground">{l.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-amber-100 px-4 py-2 text-xs text-amber-800/80">
          Synthèse dérivée des grilles tarifaires — non saisissable.
        </p>
      </section>

      {/* Statut & méta */}
      <CarteRail titre="Statut & méta" chip={<StatutActifBadge actif={statut.actif} />}>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>Fournisseur préféré</span>
            {statut.nbArticlesPreferes > 0 ? (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 ring-1 ring-orange-300">
                {statut.nbArticlesPreferes} article{statut.nbArticlesPreferes > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            Statut technique = archivage (soft-delete), distinct du référencement catalogue.
          </p>
          <div className="flex justify-between gap-2 border-t pt-2">
            <span>Créé</span>
            <span className="text-right text-foreground">
              {statut.creeLe ?? '—'}
              {statut.creePar ? ` · ${statut.creePar}` : ''}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Modifié</span>
            <span className="text-right text-foreground">
              {statut.modifieLe ?? '—'}
              {statut.modifiePar ? ` · ${statut.modifiePar}` : ''}
            </span>
          </div>
        </div>
      </CarteRail>

      {/* Contacts (résumé) */}
      <CarteRail
        titre="Contacts"
        chip={
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{contacts.actifs}</span> actifs /{' '}
            {contacts.total}
          </span>
        }
      >
        {contacts.total === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun contact enregistré.</p>
        ) : (
          <p className="text-sm">
            {contacts.principalNom ? (
              <>
                <span className="font-medium">{contacts.principalNom}</span>{' '}
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                  principal
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Aucun contact principal désigné.</span>
            )}
          </p>
        )}
        <div className="pt-2">
          <Link
            href={contacts.gererHref}
            className="text-sm font-medium text-orange-700 hover:underline"
          >
            Gérer les contacts →
          </Link>
        </div>
      </CarteRail>

      {/* Conformité d'achat (vigilance L.8222-1) */}
      <CarteRail titre="Conformité d’achat">
        <div className="space-y-2 text-sm">
          {conformite.items.map((item, i) => (
            <div key={`${item.label}-${i}`} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{item.label}</span>
              <span
                className={cn('rounded px-2 py-0.5 text-xs font-medium', BADGE_TONE[item.tone])}
              >
                {item.valeur}
              </span>
            </div>
          ))}
          <p className="pt-1 text-xs text-amber-800/80">{conformite.note}</p>
        </div>
      </CarteRail>

      {/* Historique */}
      <CarteRail titre="Historique">
        {historique.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun événement enregistré.</p>
        ) : (
          <ul className="space-y-2.5 text-xs">
            {historique.map((e) => (
              <li key={e.id} className="flex items-start gap-2">
                <span
                  className={cn('mt-1 size-1.5 shrink-0 rounded-full', DOT_HISTORIQUE[e.ton])}
                  aria-hidden
                />
                <span>
                  {e.label}
                  <br />
                  <span className="text-muted-foreground">
                    {e.quand}
                    {e.par ? ` · ${e.par}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CarteRail>
    </div>
  );
}
