import Link from 'next/link';

import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';
import { StatutSousTraitantBadge } from '@/components/tiers/statut-sous-traitant-badge';
import {
  formaterDateFr,
  type StatutPilier,
  type SyntheseConformite,
} from '@/lib/sous-traitance/fiche-synthese';
import type { StatutSousTraitant } from '@/lib/validation/tiers';
import { cn } from '@/lib/utils';

/**
 * Rail contextuel (zone D) de la fiche sous-traitant — lecture seule, dérivé des
 * données de la fiche (cf. maquette `gabarit-sous-traitant.html`) : synthèse de
 * conformité (carte mise en avant), cascade & retenue, statut/méta, contacts,
 * historique. Composant présentational : tous les calculs sont faits en amont.
 */

export type HistoriqueRailItem = {
  id: string;
  label: string;
  ton: 'emerald' | 'amber' | 'rose' | 'slate';
  /** Horodatage déjà formaté (ex. « 14/06 · 16:40 »). */
  quand: string;
  par: string | null;
};

type Props = {
  conformite: SyntheseConformite;
  cascade: {
    rang: number;
    max: number;
    depassement: boolean;
    parent: { libelle: string; href: string } | null;
    retenuePct: string;
  };
  meta: {
    statut: StatutSousTraitant;
    actif: boolean;
    /** YYYY-MM-DD. */
    creeLe: string | null;
    creePar: string | null;
    modifieLe: string | null;
    modifiePar: string | null;
  };
  contacts: {
    actifs: number;
    total: number;
    gererHref: string;
    /** Liste résumée des contacts (principal d'abord), pour la mini-liste du rail. */
    items: { id: string; nom: string; fonction: string | null; principal: boolean }[];
  };
  historique: HistoriqueRailItem[];
};

const DOT_PILIER: Record<StatutPilier, string> = {
  ok: 'bg-emerald-500',
  attention: 'bg-amber-500',
  manquant: 'bg-rose-500',
};

const DOT_HISTORIQUE: Record<HistoriqueRailItem['ton'], string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
};

const NUM_NIVEAU: Record<SyntheseConformite['niveau'], string> = {
  conforme: 'text-emerald-700',
  vigilance: 'text-amber-700',
  non_conforme: 'text-rose-600',
};

function CarteRail({
  titre,
  chip,
  children,
  footer,
  className,
}: {
  titre: string;
  chip?: React.ReactNode;
  children: React.ReactNode;
  /** Pied de carte isolé par son propre filet (ex. lien « Gérer les contacts »). */
  footer?: React.ReactNode;
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
      {footer ? <div className="border-t px-4 py-2.5">{footer}</div> : null}
    </section>
  );
}

export function SousTraitantRail({ conformite, cascade, meta, contacts, historique }: Props) {
  return (
    <div className="space-y-5">
      {/* Carte mise en avant — synthèse de conformité (jamais un prix) */}
      <section className="overflow-hidden rounded-xl bg-amber-50 ring-1 ring-amber-200">
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <h3 className="font-heading font-semibold text-orange-700">Synthèse de conformité</h3>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-300">
            loi 75-1334
          </span>
        </div>
        <div className="px-4 pb-2 pt-1">
          <div
            className={cn(
              'font-heading text-3xl font-semibold tabular-nums',
              NUM_NIVEAU[conformite.niveau],
            )}
          >
            {conformite.label} · {conformite.piliersAJour}/{conformite.total}
          </div>
          <p className="mt-1 text-xs text-amber-800/80">
            Piliers à jour sur les {conformite.total} piliers de la sous-traitance.
          </p>
        </div>
        <ul className="space-y-2 px-4 pb-3 text-sm">
          {conformite.piliers.map((p) => (
            <li key={p.cle} className="flex items-start gap-2">
              <span
                className={cn('mt-1 size-1.5 shrink-0 rounded-full', DOT_PILIER[p.statut])}
                aria-hidden
              />
              <span>
                {p.libelle}
                <br />
                <span className="text-xs text-muted-foreground">{p.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {conformite.alertes.length > 0 && (
          <div className="mx-4 mb-3 space-y-1 rounded-md bg-rose-100 px-3 py-2 text-xs font-medium text-rose-600">
            {conformite.alertes.map((a) => (
              <p key={a}>⚠ {a}</p>
            ))}
          </div>
        )}
        <p className="border-t border-amber-100 px-4 py-2 text-xs text-amber-800/80">
          Synthèse dérivée des pièces (zone Vigilance) — non saisissable.
        </p>
      </section>

      {/* Cascade & retenue de garantie */}
      <CarteRail
        titre="Cascade & retenue de garantie"
        chip={
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-800 ring-1 ring-orange-300">
            cascade
          </span>
        }
      >
        <div className="space-y-2 text-sm">
          <div
            className={cn(
              'font-heading text-xl font-semibold tabular-nums',
              cascade.depassement ? 'text-rose-700' : 'text-orange-800',
            )}
          >
            Rang {cascade.rang} / {cascade.max}
          </div>
          <p className="text-xs text-muted-foreground">
            {cascade.parent ? (
              <>
                sous{' '}
                <Link
                  href={cascade.parent.href}
                  className="font-medium text-orange-700 underline underline-offset-2"
                >
                  {cascade.parent.libelle}
                </Link>
              </>
            ) : (
              'Donneur d’ordre direct (rang 1, sans parent sous-traitant).'
            )}
          </p>
          <div className="flex justify-between gap-2 pt-1">
            <span className="text-muted-foreground">Retenue de garantie par défaut</span>
            <span className="font-medium tabular-nums text-foreground">{cascade.retenuePct} %</span>
          </div>
          <p className="pt-1 text-xs text-amber-800/80">
            {cascade.max} niveaux max (loi 75-1334) — reprise sur contrats &amp; factures. Non
            saisissable ici.
          </p>
        </div>
      </CarteRail>

      {/* Statut & méta */}
      <CarteRail titre="Statut & méta" chip={<StatutActifBadge actif={meta.actif} />}>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>Statut d’agrément</span>
            <StatutSousTraitantBadge statut={meta.statut} />
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            Statut technique = archivage, distinct de l’agrément (cycle de référencement).
          </p>
          <div className="flex justify-between gap-2 border-t pt-2">
            <span>Créé</span>
            <span className="text-right text-foreground">
              {formaterDateFr(meta.creeLe)}
              {meta.creePar ? ` · ${meta.creePar}` : ''}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span>Modifié</span>
            <span className="text-right text-foreground">
              {formaterDateFr(meta.modifieLe)}
              {meta.modifiePar ? ` · ${meta.modifiePar}` : ''}
            </span>
          </div>
        </div>
      </CarteRail>

      {/* Contacts */}
      <CarteRail
        titre="Contacts"
        chip={
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{contacts.actifs}</span> actifs /{' '}
            {contacts.total}
          </span>
        }
        footer={
          <Link
            href={contacts.gererHref}
            className="text-sm font-medium text-orange-700 hover:underline"
          >
            Gérer les contacts →
          </Link>
        }
      >
        {contacts.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun contact enregistré.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {contacts.items.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  {c.nom}
                  {c.fonction ? (
                    <span className="text-xs text-muted-foreground"> · {c.fonction}</span>
                  ) : null}
                </span>
                {c.principal ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                    principal
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
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
