import Link from 'next/link';
import { MapPinIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { toneStatutChantier } from '@/lib/dashboard/compute';
import type { ActiviteItem, ApercuChantier, MembreEquipe } from '@/lib/dashboard/dashboard';
import { cn } from '@/lib/utils';

// ── Formatage ──────────────────────────────────────────────

function formatEuro(n: number): string {
  return n.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}

function formatDateFr(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, j] = iso.split('-');
  return `${j}/${m}/${a}`;
}

function tempsRelatif(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `aujourd'hui · ${hh}`;
  const hier = new Date(now);
  hier.setDate(now.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return `hier · ${hh}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} · ${hh}`;
}

const DOT_ACTIVITE: Record<ActiviteItem['ton'], string> = {
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  neutral: 'bg-neutral-400',
};

// ── KPI card ───────────────────────────────────────────────

function Kpi({
  label,
  value,
  children,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {children}
    </div>
  );
}

// ── Onglets contextuels (liens vers les vraies pages) ──────

function Onglets({ slug, chantierId }: { slug: string; chantierId: string }) {
  const fiche = `/${slug}/chantiers/${chantierId}`;
  const items: { label: string; href: string | null }[] = [
    { label: 'Aperçu', href: null },
    { label: 'Fiche chantier', href: fiche },
    { label: 'Planning', href: `${fiche}/planning` },
    { label: 'Devis', href: `${fiche}?tab=devis` },
    { label: 'Factures', href: `${fiche}?tab=factures` },
    { label: 'Pointages', href: `/${slug}/rh/pointages` },
  ];
  return (
    <nav className="flex gap-1 overflow-x-auto border-b px-3">
      {items.map((it) =>
        it.href === null ? (
          <span
            key={it.label}
            aria-current="page"
            className="whitespace-nowrap border-b-2 border-amber-500 px-3 py-2.5 text-sm font-medium text-amber-700"
          >
            {it.label}
          </span>
        ) : (
          <Link
            key={it.label}
            href={it.href}
            className="whitespace-nowrap px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {it.label}
          </Link>
        ),
      )}
    </nav>
  );
}

// ── Équipe ─────────────────────────────────────────────────

function LigneEquipe({ membre }: { membre: MembreEquipe }) {
  const presentation: Record<MembreEquipe['presence'], { libelle: string; classe: string }> = {
    present: { libelle: '● présent', classe: 'text-emerald-600' },
    autre_chantier: { libelle: '● autre chantier', classe: 'text-sky-600' },
    absent: { libelle: `○ ${membre.detail ?? 'absent'}`, classe: 'text-muted-foreground' },
    inconnu: { libelle: '○ non pointé', classe: 'text-muted-foreground' },
  };
  const p = presentation[membre.presence];
  const initiale = membre.nom.charAt(0).toUpperCase();
  return (
    <li className="flex items-center justify-between px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-full bg-amber-100 text-xs font-medium text-amber-800">
          {initiale}
        </span>
        <span className="truncate">{membre.nom}</span>
      </div>
      <span className={cn('whitespace-nowrap text-xs', p.classe)}>{p.libelle}</span>
    </li>
  );
}

// ── Composant principal ────────────────────────────────────

export function ChantierApercu({
  apercu,
  entrepriseSlug,
}: {
  apercu: ApercuChantier;
  entrepriseSlug: string;
}) {
  const { marge, pointageSemaine: pt } = apercu;
  const adr = apercu.adresse;
  const adresseComplete = [
    adr.ligne1,
    adr.ligne2,
    [adr.codePostal, adr.ville].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <section className="mt-6 rounded-xl border bg-card shadow-sm">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              apercu.statut === 'en_cours' ? 'bg-amber-500' : 'bg-neutral-300',
            )}
          />
          <h2 className="truncate text-lg font-semibold">{apercu.libelle}</h2>
          <Badge tone={toneStatutChantier(apercu.statut)}>{apercu.statutLibelle}</Badge>
          {apercu.enRetard && <Badge tone="rose">En retard</Badge>}
          <span className="truncate text-xs text-muted-foreground">
            Réf. {apercu.numero} · Client&nbsp;: {apercu.clientNom}
          </span>
        </div>
        <Link
          href={`/${entrepriseSlug}/chantiers/${apercu.id}`}
          className="rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
        >
          Ouvrir la fiche
        </Link>
      </div>

      <Onglets slug={entrepriseSlug} chantierId={apercu.id} />

      <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-3">
        {/* Colonne principale : KPI + activité */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Avancement */}
            <Kpi
              label="Avancement"
              value={apercu.avancementPourcent !== null ? `${apercu.avancementPourcent}%` : '—'}
            >
              {apercu.avancementPourcent !== null ? (
                <div className="mt-2 h-1.5 rounded bg-muted">
                  <div
                    className="h-full rounded bg-amber-500"
                    style={{ width: `${apercu.avancementPourcent}%` }}
                  />
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">aucune tâche planifiée</div>
              )}
            </Kpi>

            {/* Marge */}
            <Kpi
              label="Marge actuelle"
              value={
                marge.marge !== null ? (
                  <span className={marge.marge >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                    {marge.marge >= 0 ? '+' : ''}
                    {formatEuro(marge.marge)}
                  </span>
                ) : (
                  '—'
                )
              }
            >
              {marge.marge !== null ? (
                <div className="mt-1 space-y-0.5">
                  {marge.margePct !== null && (
                    <div className={cn('text-xs', marge.marge >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                      {marge.margePct >= 0 ? '+' : ''}
                      {marge.margePct}% vs prévision
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground">hors achats &amp; sous-traitance</div>
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">budget non renseigné</div>
              )}
            </Kpi>

            {/* Reste à faire */}
            <Kpi
              label="Reste à faire"
              value={
                apercu.joursRestants === null
                  ? '—'
                  : apercu.joursRestants < 0
                    ? `−${Math.abs(apercu.joursRestants)} j`
                    : `${apercu.joursRestants} j`
              }
            >
              <div
                className={cn(
                  'mt-1 text-xs',
                  apercu.enRetard ? 'text-rose-600' : 'text-muted-foreground',
                )}
              >
                {apercu.dateLivraison
                  ? `livraison ${formatDateFr(apercu.dateLivraison)}`
                  : 'fin non planifiée'}
              </div>
            </Kpi>

            {/* Pointage semaine */}
            <Kpi label="Pointage cette sem." value={`${pt.heuresReelles} h`}>
              <div className="mt-1 text-xs text-muted-foreground">
                {pt.capaciteEquipe !== null
                  ? `équipe ~${pt.capaciteEquipe} h/sem.`
                  : `${pt.nbIntervenants} intervenant${pt.nbIntervenants > 1 ? 's' : ''}`}
              </div>
            </Kpi>
          </div>

          {/* Activité */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-2.5 text-sm font-medium">Activité de la semaine</div>
            {apercu.activite.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Aucune activité enregistrée cette semaine.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {apercu.activite.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT_ACTIVITE[a.ton])} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        {a.acteur && <span className="font-medium">{a.acteur}</span>} {a.texte}
                      </div>
                      <div className="text-xs text-muted-foreground">{tempsRelatif(a.timestamp)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Colonne latérale : localisation + équipe */}
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border">
            <div className="border-b px-4 py-2.5 text-sm font-medium">Localisation</div>
            <div className="relative h-40 bg-gradient-to-br from-emerald-100 via-emerald-50 to-sky-100">
              <div className="absolute inset-0 grid place-items-center">
                {adresseComplete ? (
                  <div className="flex items-center gap-1 rounded-full bg-amber-500 px-2 py-1 text-xs font-medium text-white shadow-lg">
                    <MapPinIcon className="size-3.5" /> {adr.ville ?? apercu.libelle}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Adresse non renseignée</span>
                )}
              </div>
            </div>
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {adresseComplete || 'Renseignez l’adresse du chantier dans sa fiche.'}
            </div>
          </div>

          <div className="rounded-lg border">
            <div className="border-b px-4 py-2.5 text-sm font-medium">Équipe sur chantier</div>
            {apercu.equipe.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Aucun ouvrier affecté (via le planning).
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {apercu.equipe.map((m) => (
                  <LigneEquipe key={m.utilisateurId} membre={m} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
