import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PageToolbar } from '@/components/layout/page-toolbar';
import { SirhBloc, SirhVide } from '@/components/test-sirh/sirh-bloc';
import {
  EtapeCandidatureBadge,
  StatutOffreBadge,
} from '@/components/test-sirh/recrutement/badges-recrutement';
import { DocumentsCandidat } from '@/components/test-sirh/recrutement/documents-candidat';
import { FicheCandidatActions } from '@/components/test-sirh/recrutement/fiche-candidat-actions';
import { NoteEtoiles } from '@/components/test-sirh/recrutement/note-etoiles';
import { aujourdhuiIso } from '@/lib/test-sirh/calendrier';
import { baseSirh, exigerContexteSirhPage } from '@/lib/test-sirh/contexte';
import { formatDateFr, nomComplet } from '@/lib/test-sirh/format';
import { peutGererSirh, peutLireSirh, ROLES_SIRH_LECTURE } from '@/lib/test-sirh/permissions';
import { enregistrerCandidat, supprimerCandidat } from '@/lib/test-sirh/recrutement/candidats';
import { formatEntretien } from '@/lib/test-sirh/recrutement/fuseau';
import { DELAI_RGPD_MOIS } from '@/lib/test-sirh/recrutement/pipeline';
import { lireCandidat } from '@/lib/test-sirh/recrutement/queries';
import {
  creerDocumentSirh,
  preparerUploadSirh,
  supprimerDocumentSirh,
  urlTelechargementDocumentSirh,
} from '@/lib/test-sirh/stockage';
import { LIBELLES_MOTIF_REFUS, LIBELLES_SOURCE_CANDIDAT } from '@/lib/validation/test-sirh/enums';

/** Test SIRH › Recrutement › Fiche candidat (Factorial ats/Candidate). */
export default async function FicheCandidatPage({
  params,
}: {
  params: Promise<{ entrepriseSlug: string; candidatId: string }>;
}) {
  const ctx = await exigerContexteSirhPage(ROLES_SIRH_LECTURE);
  const { candidatId } = await params;
  const candidat = await lireCandidat(candidatId);
  if (!candidat) notFound();

  const base = baseSirh(ctx);
  const today = aujourdhuiIso();
  const role = ctx.utilisateur.role;
  const peutGerer = peutGererSirh(role);
  const nom = nomComplet(candidat.prenom, candidat.nom);
  const lienVivier = `${base}/recrutement/candidats`;

  return (
    <div className="space-y-5">
      <PageToolbar
        title={nom}
        subtitle={`${LIBELLES_SOURCE_CANDIDAT[candidat.source]} · ${candidat.nbCandidatures} candidature${candidat.nbCandidatures > 1 ? 's' : ''}`}
        backHref={lienVivier}
        backLabel="Vivier de candidats"
        actions={
          peutGerer ? (
            <FicheCandidatActions
              candidat={{
                id: candidat.id,
                nom: candidat.nom,
                prenom: candidat.prenom,
                email: candidat.email,
                telephone: candidat.telephone,
                ville: candidat.ville,
                source: candidat.source,
                consentementRgpd: candidat.consentementRgpd,
                dateConsentement: candidat.dateConsentement,
                notes: candidat.notes,
              }}
              today={today}
              lienVivier={lienVivier}
              actions={{
                enregistrer: async (input) => {
                  'use server';
                  return enregistrerCandidat(input);
                },
                supprimer: async (id) => {
                  'use server';
                  return supprimerCandidat(id);
                },
              }}
            />
          ) : undefined
        }
      />

      {candidat.aPurger && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
        >
          <p className="font-semibold">Dossier à purger (RGPD)</p>
          <p>
            Aucune activité depuis plus de {DELAI_RGPD_MOIS} mois (dernière le{' '}
            {formatDateFr(candidat.derniereActivite)}). Supprimez ce dossier candidat, ou recueillez
            à nouveau son consentement s’il reste dans le vivier.
          </p>
        </div>
      )}
      {candidat.employeId && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          Candidat embauché :{' '}
          <Link
            href={`${base}/collaborateurs/${candidat.employeId}`}
            className="font-medium underline underline-offset-4"
          >
            ouvrir le dossier collaborateur
          </Link>
          .
        </div>
      )}

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <SirhBloc title="Identité & coordonnées">
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Nom</dt>
                <dd className="font-medium">{nom}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd>
                  {candidat.email ? (
                    <a href={`mailto:${candidat.email}`} className="hover:underline">
                      {candidat.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Téléphone</dt>
                <dd>{candidat.telephone ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Ville</dt>
                <dd>{candidat.ville ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Source</dt>
                <dd>{LIBELLES_SOURCE_CANDIDAT[candidat.source]}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dans le vivier depuis</dt>
                <dd className="tabular-nums">{formatDateFr(candidat.createdAt)}</dd>
              </div>
            </dl>
            {candidat.notes && (
              <p className="mt-4 whitespace-pre-line border-t pt-3 text-sm text-muted-foreground">
                {candidat.notes}
              </p>
            )}
          </SirhBloc>

          <SirhBloc
            title="Historique des candidatures"
            description="Offres sur lesquelles le candidat a été positionné."
            bodyClassName="p-0"
          >
            {candidat.candidatures.length === 0 ? (
              <div className="p-4">
                <SirhVide>Aucune candidature : positionnez ce candidat depuis une offre.</SirhVide>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Offre</th>
                      <th className="px-4 py-2 text-left font-medium">Candidature</th>
                      <th className="px-4 py-2 text-left font-medium">Étape</th>
                      <th className="px-4 py-2 text-left font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {candidat.candidatures.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2">
                          <Link
                            href={`${base}/recrutement/offres/${c.offreId}`}
                            className="font-medium hover:underline"
                          >
                            {c.offreTitre}
                          </Link>
                          <span className="ml-2 inline-block align-middle">
                            <StatutOffreBadge statut={c.offreStatut} />
                          </span>
                          {c.offreReference && (
                            <span className="block text-xs text-muted-foreground">
                              {c.offreReference}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 tabular-nums">
                          {formatDateFr(c.dateCandidature)}
                          {c.dateEntretien && (
                            <span className="block text-xs text-muted-foreground">
                              entretien {formatEntretien(c.dateEntretien)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <EtapeCandidatureBadge etape={c.etape} />
                          {c.motifRefus && (
                            <span className="block text-xs text-muted-foreground">
                              {LIBELLES_MOTIF_REFUS[c.motifRefus]}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <NoteEtoiles note={c.note} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SirhBloc>
        </div>

        <aside className="space-y-5 lg:w-80 lg:shrink-0">
          <SirhBloc
            title="RGPD"
            description={`Conservation : ${DELAI_RGPD_MOIS} mois sans activité.`}
          >
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Consentement</dt>
                <dd>
                  {candidat.consentementRgpd
                    ? `Oui, recueilli le ${formatDateFr(candidat.dateConsentement)}`
                    : 'Non recueilli'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Dernière activité</dt>
                <dd className="tabular-nums">{formatDateFr(candidat.derniereActivite)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Conservation jusqu’au</dt>
                <dd className="tabular-nums">
                  {candidat.employeId
                    ? 'Sans objet (embauché·e)'
                    : formatDateFr(candidat.dateLimiteRgpd)}
                </dd>
              </div>
            </dl>
          </SirhBloc>

          <SirhBloc title="CV & documents">
            <DocumentsCandidat
              candidatId={candidat.id}
              documents={candidat.documents}
              peutGerer={peutGerer}
              peutTelecharger={peutLireSirh(role)}
              actions={{
                preparerUpload: async (cible, contentType, filename, tailleBytes) => {
                  'use server';
                  return preparerUploadSirh(cible, contentType, filename, tailleBytes);
                },
                creerDocument: async (input) => {
                  'use server';
                  return creerDocumentSirh(input);
                },
                obtenirUrl: async (id) => {
                  'use server';
                  return urlTelechargementDocumentSirh(id);
                },
                supprimer: async (id) => {
                  'use server';
                  return supprimerDocumentSirh(id);
                },
              }}
            />
          </SirhBloc>
        </aside>
      </div>
    </div>
  );
}
