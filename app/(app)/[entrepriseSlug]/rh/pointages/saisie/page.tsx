import { PageToolbar } from '@/components/layout/page-toolbar';
import { PointageMatrice } from '@/components/rh/pointage-matrice';
import { requireAuthWithMfa } from '@/lib/auth/guards';
import { listerChantiers } from '@/lib/chantiers/chantiers';
import { listerEmployesActifs } from '@/lib/rh/employes';
import { ROLES_POINTAGE_WRITE } from '@/lib/rh/permissions';
import { listerPointagesMois, saisirMatricePointages } from '@/lib/rh/pointages';
import type { MotifAbsence } from '@/lib/validation/rh';

type TypeMatrice = 'heures' | 'absence';
type LigneState = {
  employeId: string;
  chantierId: string | null;
  type: TypeMatrice;
  motifAbsence: MotifAbsence | null;
  jours: Record<string, string>;
};

export default async function PointageSaisiePage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string; mois?: string }>;
}) {
  await requireAuthWithMfa(ROLES_POINTAGE_WRITE);
  const sp = await searchParams;
  const now = new Date();
  const annee = sp.annee ? Number(sp.annee) : now.getFullYear();
  const mois = sp.mois ? Number(sp.mois) : now.getMonth() + 1;

  const [employes, chantiers, pointagesMois] = await Promise.all([
    listerEmployesActifs(),
    listerChantiers(),
    listerPointagesMois(annee, mois),
  ]);

  // Regrouper les pointages existants par (employe, chantier, type) → matrice.
  // On ne pré-remplit que les types saisis dans la matrice : "heures" + "absence".
  // Les budgets / % d'avancement (imports historiques) restent en DB mais ne
  // s'affichent pas dans cette UI dédiée à la saisie quotidienne.
  const groupes = new Map<string, LigneState>();
  for (const p of pointagesMois) {
    if (p.type !== 'heures' && p.type !== 'absence') continue;
    const cle = `${p.employeId}|${p.chantierId ?? 'absence'}|${p.type}`;
    let ligne = groupes.get(cle);
    if (!ligne) {
      ligne = {
        employeId: p.employeId,
        chantierId: p.chantierId,
        type: p.type as TypeMatrice,
        motifAbsence: (p.motifAbsence ?? null) as MotifAbsence | null,
        jours: {},
      };
      groupes.set(cle, ligne);
    }
    const day = Number(p.datePointage.slice(8, 10));
    ligne.jours[String(day)] = p.quantite;
  }
  const initialLignes = Array.from(groupes.values());

  return (
    <div className="space-y-6">
      <PageToolbar
        title="Saisie matrice mensuelle"
        subtitle={`${String(mois).padStart(2, '0')}/${annee}`}
      />
      <PointageMatrice
        annee={annee}
        mois={mois}
        employes={employes.map((e) => ({ id: e.id, nom: e.nom, prenom: e.prenom }))}
        chantiers={chantiers.map((c) => ({
          id: c.id,
          numero: c.numero,
          libelle: c.libelle,
        }))}
        initialLignes={initialLignes}
        onSubmit={async (input) => {
          'use server';
          return saisirMatricePointages(input);
        }}
      />
    </div>
  );
}
