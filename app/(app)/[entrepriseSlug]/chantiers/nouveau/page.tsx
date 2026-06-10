import { ChantierForm } from '@/components/chantiers/chantier-form';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { creerChantier, listerResponsablesPossibles } from '@/lib/chantiers/chantiers';
import { ROLES_CHANTIER_WRITE } from '@/lib/chantiers/permissions';
import { listerClients } from '@/lib/commercial/clients';

function libelleClient(c: {
  type: string;
  raisonSociale: string | null;
  nom: string | null;
  prenom: string | null;
}): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '?';
  return [c.prenom, c.nom].filter(Boolean).join(' ') || '?';
}

export default async function NouveauChantierPage() {
  await requireAuthWithMfa(ROLES_CHANTIER_WRITE);
  const [clients, responsables] = await Promise.all([
    listerClients(),
    listerResponsablesPossibles(),
  ]);

  if (clients.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-medium">Nouveau chantier</h2>
        <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun client disponible. Crée d&apos;abord un client.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-medium">Nouveau chantier</h2>
      <ChantierForm
        clients={clients.map((c) => ({ id: c.id, code: c.code, libelle: libelleClient(c) }))}
        responsables={responsables}
        onSubmit={async (values) => {
          'use server';
          return creerChantier(values);
        }}
        successRedirect="/chantiers"
        hideStatut
      />
    </div>
  );
}
