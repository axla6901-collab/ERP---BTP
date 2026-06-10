import { FamilleForm } from '@/components/catalogue/famille-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerFamille, listerFamilles } from '@/lib/catalogue/familles';
import { ROLES_CATALOGUE_WRITE } from '@/lib/catalogue/permissions';

export default async function NouvelleFamillePage() {
  await requireAuthWithMfa(ROLES_CATALOGUE_WRITE);
  const familles = await listerFamilles();

  return (
    <FamilleForm
      titre="Nouvelle famille"
      parentsDisponibles={familles.map((f) => ({ id: f.id, code: f.code, libelle: f.libelle }))}
      onSubmit={async (values) => {
        'use server';
        return creerFamille(values);
      }}
      successRedirect="/catalogue/familles"
    />
  );
}
