import { PageToolbar } from '@/components/layout/page-toolbar';
import { HorairesSection } from '@/components/test-sirh/temps/horaires-section';
import { OngletsTemps } from '@/components/test-sirh/temps/onglets-temps';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { peutGererSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { enregistrerHoraire, supprimerHoraire } from '@/lib/test-sirh/temps/horaires';
import { compterHeuresSupEnAttente, listerHoraires } from '@/lib/test-sirh/temps/queries';
import type { HoraireInput } from '@/lib/validation/test-sirh/temps';

/** Test SIRH › Temps de travail › Horaires (Factorial work_schedule/Schedule). */
export default async function HorairesPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const [horaires, heuresSupEnAttente] = await Promise.all([
    listerHoraires(),
    compterHeuresSupEnAttente(),
  ]);
  const base = baseSirh(ctx);
  const parDefaut = horaires.find((h) => h.parDefaut);

  return (
    <div className="space-y-4">
      <PageToolbar
        title="Temps de travail"
        subtitle={`${horaires.length} horaire${horaires.length > 1 ? 's' : ''}${
          parDefaut ? ` · par défaut : ${parDefaut.nom}` : ' · aucun horaire par défaut'
        }`}
        backHref={base}
        backLabel="Test SIRH"
      />
      <OngletsTemps base={base} actif="horaires" heuresSupEnAttente={heuresSupEnAttente} />
      <HorairesSection
        horaires={horaires}
        peutGerer={peutGererSirh(ctx.utilisateur.role)}
        actions={{
          enregistrer: async (input: HoraireInput) => {
            'use server';
            return enregistrerHoraire(input);
          },
          supprimer: async (id: string) => {
            'use server';
            return supprimerHoraire(id);
          },
        }}
      />
    </div>
  );
}
