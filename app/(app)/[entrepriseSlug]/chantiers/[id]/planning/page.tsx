import { notFound } from 'next/navigation';

import { GanttPlanning } from '@/components/planning/gantt-planning';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import {
  affecterOuvrierTache,
  appliquerCascadeTachesPlanning,
  creerTachePlanning,
  dupliquerNiveauPlanning,
  enregistrerTachePlanning,
  lirePlanningChantier,
  listerOuvriersAffectables,
  mettreAJourEquipeTache,
  restaurerTachePlanning,
  retirerOuvrierTache,
  supprimerTachePlanning,
} from '@/lib/planning/planning';

export const dynamic = 'force-dynamic';

export default async function PlanningChantierTabPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; id: string }>;
}) {
  const ctx = await requireTenantContext();
  if (!ctx.entreprise.planningActive) notFound();

  const { id } = await params;
  const [donnees, ouvriers] = await Promise.all([
    lirePlanningChantier(id),
    listerOuvriersAffectables(),
  ]);
  if (!donnees) notFound();

  return (
    <GanttPlanning
      donnees={donnees}
      ouvriers={ouvriers}
      handlers={{
        enregistrerTache: async (input) => {
          'use server';
          const r = await enregistrerTachePlanning(input);
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
        affecterOuvrier: async (tacheId, utilisateurId, heuresPrevues) => {
          'use server';
          const r = await affecterOuvrierTache({ tacheId, utilisateurId, heuresPrevues });
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
        majEquipe: async (id, heuresPrevues, heuresFaites) => {
          'use server';
          const r = await mettreAJourEquipeTache({ id, heuresPrevues, heuresFaites });
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
        retirerOuvrier: async (id) => {
          'use server';
          const r = await retirerOuvrierTache(id);
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
        creerTache: async (input) => {
          'use server';
          const r = await creerTachePlanning(input);
          return r.ok ? { ok: true, id: r.data.id } : { ok: false, error: r.error };
        },
        supprimerTache: async (id) => {
          'use server';
          const r = await supprimerTachePlanning(id);
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
        appliquerCascade: async (changes) => {
          'use server';
          const r = await appliquerCascadeTachesPlanning({ changes });
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
        restaurerTache: async (id) => {
          'use server';
          const r = await restaurerTachePlanning(id);
          return r.ok ? { ok: true } : { ok: false, error: r.error };
        },
        dupliquerNiveau: async (chantierId, niveau) => {
          'use server';
          const r = await dupliquerNiveauPlanning({ chantierId, niveau });
          return r.ok
            ? { ok: true, niveauCopie: r.data.niveauCopie, tacheIds: r.data.tacheIds }
            : { ok: false, error: r.error };
        },
      }}
    />
  );
}
