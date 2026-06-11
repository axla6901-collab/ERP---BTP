import { ChantierApercu } from '@/components/dashboard/chantier-apercu';
import { ChantiersTimeline } from '@/components/dashboard/chantiers-timeline';
import { requireTenantContextWithMfa } from '@/lib/auth/tenant-guards';
import { genererFrise } from '@/lib/dashboard/compute';
import { lireApercuChantier, listerChantiersActifsTimeline } from '@/lib/dashboard/dashboard';

/** Date calendaire locale du serveur (ISO `AAAA-MM-JJ`). */
function isoAujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ chantier?: string }>;
}) {
  const ctx = await requireTenantContextWithMfa();
  const sp = await searchParams;
  const slug = ctx.entreprise.slug;

  const frise = genererFrise(isoAujourdhui());

  // En parallèle : la timeline + (si un chantier est demandé dans l'URL) son aperçu.
  const [timeline, apercuDemande] = await Promise.all([
    listerChantiersActifsTimeline(),
    sp.chantier ? lireApercuChantier(sp.chantier) : Promise.resolve(null),
  ]);

  // À défaut de sélection valide : 1er « en cours », sinon 1er actif.
  let apercu = apercuDemande;
  if (!apercu) {
    const fallbackId = timeline.find((c) => c.statut === 'en_cours')?.id ?? timeline[0]?.id ?? null;
    apercu = fallbackId ? await lireApercuChantier(fallbackId) : null;
  }

  return (
    <div className="space-y-6">
      <ChantiersTimeline
        chantiers={timeline}
        frise={frise}
        selectedId={apercu?.id ?? null}
        entrepriseSlug={slug}
      />

      {apercu ? (
        <ChantierApercu apercu={apercu} entrepriseSlug={slug} />
      ) : (
        <p className="rounded-xl border bg-card px-5 py-12 text-center text-sm text-muted-foreground shadow-sm">
          Sélectionnez un chantier dans la frise pour voir son aperçu — ou créez votre premier
          chantier.
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground/70">
        La racine de la navigation, c’est le chantier. Le catalogue, les tiers et l’administration
        restent accessibles depuis le menu latéral.
      </p>
    </div>
  );
}
