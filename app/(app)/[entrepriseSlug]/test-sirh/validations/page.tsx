import { PageToolbar } from '@/components/layout/page-toolbar';
import { AbsencesValidationListe } from '@/components/test-sirh/absences/absences-validation-liste';
import { NotesFraisValidationListe } from '@/components/test-sirh/notes-frais/notes-frais-validation-liste';
import { SirhBloc } from '@/components/test-sirh/sirh-bloc';
import { HeuresSupValidationListe } from '@/components/test-sirh/temps/heures-sup-validation-liste';
import { StatCard, StatGrid } from '@/components/ui/stat-card';
import { deciderAbsence } from '@/lib/test-sirh/absences/demandes';
import { listerAbsencesEnAttente } from '@/lib/test-sirh/absences/queries';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatEuro, formatHeures } from '@/lib/test-sirh/format';
import { deciderNoteFrais } from '@/lib/test-sirh/notes-frais/actions';
import { listerNotesFraisEnAttente } from '@/lib/test-sirh/notes-frais/queries';
import { peutGererSirh, ROLES_SIRH_VALIDATION } from '@/lib/test-sirh/permissions';
import { urlTelechargementDocumentSirh } from '@/lib/test-sirh/stockage';
import { deciderHeuresSup } from '@/lib/test-sirh/temps/heures-sup-actions';
import { listerHeuresSupEnAttente } from '@/lib/test-sirh/temps/queries';

/**
 * Test SIRH › Validations (Factorial approvals) : boîte de réception unique des
 * demandes à décider — absences, heures supplémentaires, notes de frais.
 * Chaque domaine applique ses propres règles (pas d'auto-validation hors RH…).
 */
export default async function ValidationsPage() {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_VALIDATION);
  const base = baseSirh(ctx);

  const [absences, heuresSup, notesFrais] = await Promise.all([
    listerAbsencesEnAttente(),
    listerHeuresSupEnAttente(),
    listerNotesFraisEnAttente(),
  ]);
  const total = absences.length + heuresSup.length + notesFrais.length;
  const montantFrais = notesFrais.reduce((acc, n) => acc + n.montantTtc, 0);
  const heuresDemandees = heuresSup.reduce((acc, h) => acc + h.dureeHeures, 0);

  const obtenirUrl = async (id: string) => {
    'use server';
    return urlTelechargementDocumentSirh(id);
  };

  return (
    <div className="space-y-5">
      <PageToolbar
        title="Validations"
        subtitle={
          total === 0
            ? 'Aucune demande en attente'
            : `${total} demande${total > 1 ? 's' : ''} en attente de décision`
        }
        backHref={base}
        backLabel="Test SIRH"
      />

      <StatGrid>
        <StatCard
          label="Absences"
          value={absences.length}
          tone={absences.length > 0 ? 'amber' : 'default'}
          hint="congés, RTT, événements familiaux…"
        />
        <StatCard
          label="Heures supplémentaires"
          value={heuresSup.length}
          tone={heuresSup.length > 0 ? 'amber' : 'default'}
          hint={`${formatHeures(heuresDemandees)} demandées`}
        />
        <StatCard
          label="Notes de frais"
          value={notesFrais.length}
          tone={notesFrais.length > 0 ? 'amber' : 'default'}
          hint={formatEuro(montantFrais)}
        />
        <StatCard
          label="Total"
          value={total}
          tone={total > 0 ? 'rose' : 'emerald'}
          hint={total > 0 ? 'à traiter' : 'tout est à jour'}
        />
      </StatGrid>

      <SirhBloc
        title="Absences"
        description="Le solde du compteur avant / après la demande est indiqué pour les types décomptés."
      >
        <AbsencesValidationListe
          absences={absences}
          estGestionnaire={peutGererSirh(ctx.utilisateur.role)}
          actions={{
            decider: async (input) => {
              'use server';
              return deciderAbsence(input);
            },
            obtenirUrlJustificatif: obtenirUrl,
          }}
          emptyMessage="Aucune demande d’absence en attente."
        />
      </SirhBloc>

      <SirhBloc
        title="Heures supplémentaires"
        description="Majoration et compensation (paiement ou repos) déclarées par le demandeur."
      >
        <HeuresSupValidationListe
          demandes={heuresSup}
          onDecider={async (input) => {
            'use server';
            return deciderHeuresSup(input);
          }}
          messageVide="Aucune demande d’heures supplémentaires en attente."
        />
      </SirhBloc>

      <SirhBloc
        title="Notes de frais"
        description="Justificatifs consultables avant décision ; un refus exige un motif."
      >
        <NotesFraisValidationListe
          notes={notesFrais}
          actions={{
            decider: async (input) => {
              'use server';
              return deciderNoteFrais(input);
            },
            urlTelechargement: obtenirUrl,
          }}
          emptyMessage="Aucune note de frais en attente."
        />
      </SirhBloc>
    </div>
  );
}
