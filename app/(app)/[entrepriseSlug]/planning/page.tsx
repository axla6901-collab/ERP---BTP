import { CalendarRangeIcon } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { CreerPlanningButton } from '@/components/planning/creer-planning-button';
import { PlanningVues } from '@/components/planning/planning-vues';
import { Card, CardContent } from '@/components/ui/card';
import { aPermission } from '@/lib/auth/guards';
import { requireTenantContext } from '@/lib/auth/tenant-guards';
import { PERM_PLANNING_VUE_ENSEMBLE } from '@/lib/planning/permissions';
import { lirePlanningChantier, listerChantiersPlanning } from '@/lib/planning/planning';
import type { PlanningChantierSommaire } from '@/lib/planning/planning';

export const dynamic = 'force-dynamic';

export default async function PlanningListePage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string }>;
}) {
  const { entrepriseSlug } = await params;
  const ctx = await requireTenantContext();
  if (!ctx.entreprise.planningActive) notFound();

  const chantiers = await listerChantiersPlanning();
  // Trie : chantiers en cours d'abord, puis prospect, suspendu, terminé, annulé.
  const ordreStatut: Record<PlanningChantierSommaire['statut'], number> = {
    en_cours: 0,
    prospect: 1,
    suspendu: 2,
    termine: 3,
    annule: 4,
  };
  const chantiersTries = [...chantiers].sort((a, b) => {
    const d = ordreStatut[a.statut] - ordreStatut[b.statut];
    if (d !== 0) return d;
    return a.numero.localeCompare(b.numero);
  });

  // Sépare les chantiers selon l'état de leur planning : seuls ceux qui ont
  // au moins une tâche enregistrée apparaissent dans les vues. Les autres
  // alimentent la modale du bouton « Créer un planning ».
  const chantiersAvecPlanning = chantiersTries.filter((c) => c.nbTaches > 0);
  const chantiersSansPlanning = chantiersTries.filter((c) => c.nbTaches === 0);

  // Date du jour calculée côté serveur (page force-dynamic) : SSR et hydratation
  // partagent la même valeur → la frise s'ancre à M-1 sans décalage d'hydratation.
  const today = new Date().toISOString().slice(0, 10);

  // Droit d'accès à la vue d'ensemble multi-chantier (matrice RBAC, migr. 0055).
  // Sans ce droit, l'utilisateur ne dispose que de la vue « Liste ».
  const peutVueEnsemble = await aPermission(
    ctx.utilisateur.roleId,
    PERM_PLANNING_VUE_ENSEMBLE,
  );

  return (
    <div className="space-y-6">
      <PageToolbar
        title={
          <span className="inline-flex items-center gap-2">
            <CalendarRangeIcon className="size-5 text-amber-600" />
            Planning
          </span>
        }
        subtitle={`${chantiersAvecPlanning.length} chantier(s) planifié(s)`}
        actions={
          <CreerPlanningButton
            chantiersSansPlanning={chantiersSansPlanning}
            entrepriseSlug={entrepriseSlug}
          />
        }
      />

      {chantiersTries.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucun chantier dans cette société. Créez-en un depuis le module
            <Link
              href={`/${entrepriseSlug}/chantiers`}
              className="ml-1 underline underline-offset-4"
            >
              Chantiers
            </Link>{' '}
            pour pouvoir établir son planning.
          </CardContent>
        </Card>
      ) : chantiersAvecPlanning.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucun chantier n&apos;a encore de planning. Cliquez sur «&nbsp;Créer un
            planning&nbsp;» pour démarrer le diagramme de Gantt d&apos;un chantier.
          </CardContent>
        </Card>
      ) : (
        <PlanningVues
          chantiers={chantiersAvecPlanning}
          entrepriseSlug={entrepriseSlug}
          today={today}
          peutVueEnsemble={peutVueEnsemble}
          chargerTaches={async (id) => {
            'use server';
            const donnees = await lirePlanningChantier(id);
            return donnees?.taches ?? null;
          }}
        />
      )}
    </div>
  );
}
