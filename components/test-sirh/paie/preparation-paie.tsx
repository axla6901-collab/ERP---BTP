'use client';

import { DownloadCloudIcon, PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { ExportCsvSirh } from '@/components/test-sirh/export-csv';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ActionResult } from '@/lib/common/action-result';
import { formatEuro, formatNombre } from '@/lib/test-sirh/format';
import { resumeImport, type SourceImport } from '@/lib/test-sirh/paie/generation';
import { libellePeriode, periodeModifiable } from '@/lib/test-sirh/paie/periodes';
import type { LigneSynthese } from '@/lib/test-sirh/paie/synthese';
import type { ResultatImportPaie } from '@/lib/test-sirh/paie/variables';
import {
  LIBELLES_TYPE_VARIABLE_PAIE,
  type SourceVariable,
  type StatutPeriodePaie,
  type TypeVariablePaie,
} from '@/lib/validation/test-sirh/enums';
import type { VariablePaieInput } from '@/lib/validation/test-sirh/paie';

import { SourceVariableBadge } from './statut-periode-badge';
import { SynthesePaieTable } from './synthese-paie-table';
import { VariablePaieDialog, type VariableEditee } from './variable-paie-dialog';

/** Variable affichée (sérialisable, cf. `VariablePaieVue`). */
export type VariablePaieLigne = {
  id: string;
  employeId: string;
  employeNom: string;
  employePrenom: string;
  matricule: string | null;
  typeVariable: TypeVariablePaie;
  libelle: string;
  codeRubrique: string | null;
  quantite: string | null;
  montant: string | null;
  source: SourceVariable;
  commentaire: string | null;
  /** Variable importée dont l'élément d'origine n'est plus valide (à revoir). */
  sourceObsolete?: boolean;
};

export type ActionsPreparationPaie = {
  enregistrer: (input: VariablePaieInput) => Promise<ActionResult<{ id: string }>>;
  supprimer: (id: string) => Promise<ActionResult>;
  importer: (periodeId: string) => Promise<ActionResult<ResultatImportPaie>>;
};

type Props = {
  periode: { id: string; annee: number; mois: number; statut: StatutPeriodePaie };
  variables: VariablePaieLigne[];
  synthese: LigneSynthese[];
  /** CSV prêt à télécharger (généré côté serveur). */
  csv: string;
  /** Aperçu des éléments validés non encore importés. */
  aImporter: Record<SourceImport, number>;
  employes: readonly OptionListe[];
  actions: ActionsPreparationPaie;
};

type Vue = 'variables' | 'synthese';

type Groupe = {
  employeId: string;
  nom: string;
  matricule: string | null;
  variables: VariablePaieLigne[];
  montant: number;
};

/**
 * Préparation de paie d'une période (Factorial payroll/Supplement +
 * compensations/PayrollRun) : variables par collaborateur, import idempotent des
 * éléments validés, synthèse et export CSV.
 */
export function PreparationPaie({
  periode,
  variables,
  synthese,
  csv,
  aImporter,
  employes,
  actions,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [vue, setVue] = useState<Vue>('variables');
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [editee, setEditee] = useState<VariableEditee | null>(null);

  const modifiable = periodeModifiable(periode.statut);
  const nbAImporter = aImporter.absence + aImporter.heures_sup + aImporter.note_frais;
  const nbObsoletes = variables.filter((v) => v.sourceObsolete).length;

  const groupes = useMemo(() => {
    const map = new Map<string, Groupe>();
    for (const v of variables) {
      const g = map.get(v.employeId) ?? {
        employeId: v.employeId,
        nom: `${v.employeNom} ${v.employePrenom}`.trim(),
        matricule: v.matricule,
        variables: [],
        montant: 0,
      };
      g.variables.push(v);
      g.montant += Number(v.montant ?? 0) || 0;
      map.set(v.employeId, g);
    }
    return [...map.values()];
  }, [variables]);

  function ouvrir(v: VariablePaieLigne | null) {
    setEditee(
      v
        ? {
            id: v.id,
            employeId: v.employeId,
            typeVariable: v.typeVariable,
            libelle: v.libelle,
            codeRubrique: v.codeRubrique,
            quantite: v.quantite,
            montant: v.montant,
            commentaire: v.commentaire,
            source: v.source,
          }
        : null,
    );
    setDialogOuvert(true);
  }

  function importer() {
    startTransition(async () => {
      const r = await actions.importer(periode.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const deja =
        r.data.dejaImportees > 0
          ? ` (${r.data.dejaImportees} déjà présent${r.data.dejaImportees > 1 ? 's' : ''})`
          : '';
      toast.success(`Import terminé : ${resumeImport(r.data.importees)}${deja}.`);
    });
  }

  return (
    <div className="space-y-4">
      {!modifiable && (
        <Alert>
          <AlertDescription>
            Période clôturée : les variables sont en lecture seule. Un gestionnaire RH peut la
            rouvrir si une correction est nécessaire.
          </AlertDescription>
        </Alert>
      )}

      {nbObsoletes > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            {nbObsoletes > 1
              ? `${nbObsoletes} variables importées n’ont plus d’élément d’origine valide`
              : '1 variable importée n’a plus d’élément d’origine valide'}{' '}
            (absence ou heures sup. annulées, note de frais refusée…) :{' '}
            {modifiable
              ? 'supprimez-les ou corrigez-les avant la clôture.'
              : 'rouvrez la période pour les corriger.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl<Vue>
          aria-label="Affichage"
          value={vue}
          onChange={setVue}
          options={[
            { value: 'variables', label: `Variables (${variables.length})` },
            { value: 'synthese', label: 'Synthèse par collaborateur' },
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {modifiable && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={importer}
              disabled={isPending}
              title={
                nbAImporter > 0
                  ? `À importer : ${resumeImport(aImporter)}`
                  : 'Aucun nouvel élément validé à importer'
              }
            >
              <DownloadCloudIcon className="mr-1 size-4" />
              {isPending ? 'Import…' : `Importer les éléments validés (${nbAImporter})`}
            </Button>
          )}
          {modifiable && (
            <Button type="button" size="sm" onClick={() => ouvrir(null)}>
              <PlusIcon className="mr-1 size-4" /> Ajouter une variable
            </Button>
          )}
          <ExportCsvSirh
            contenu={csv}
            nomFichier={`variables-paie-${libellePeriode(periode)}`}
            disabled={variables.length === 0}
          />
        </div>
      </div>

      {modifiable && nbAImporter > 0 && (
        <p className="text-sm text-muted-foreground">
          Éléments validés en attente d’import :{' '}
          <span className="font-medium text-foreground">{resumeImport(aImporter)}</span>.
        </p>
      )}

      {vue === 'synthese' ? (
        <SynthesePaieTable lignes={synthese} />
      ) : groupes.length === 0 ? (
        <SirhVide>
          Aucune variable pour cette période. Importez les éléments validés (absences, heures sup.,
          notes de frais) ou ajoutez une variable.
        </SirhVide>
      ) : (
        <div className="space-y-3">
          {groupes.map((g) => (
            <section key={g.employeId} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <div className="min-w-0">
                  <span className="font-semibold text-orange-700">{g.nom}</span>
                  {g.matricule && (
                    <span className="ml-2 text-xs text-muted-foreground">{g.matricule}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {g.variables.length} variable{g.variables.length > 1 ? 's' : ''} ·{' '}
                  {formatEuro(g.montant)}
                </span>
              </div>
              <div className="overflow-x-auto border-t">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Libellé</th>
                      <th className="px-4 py-2 font-medium">Rubrique</th>
                      <th className="px-4 py-2 text-right font-medium">Quantité</th>
                      <th className="px-4 py-2 text-right font-medium">Montant</th>
                      <th className="px-4 py-2 font-medium">Origine</th>
                      {modifiable && <th className="px-4 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {g.variables.map((v) => (
                      <tr
                        key={v.id}
                        className={
                          v.sourceObsolete ? 'bg-rose-50/60 dark:bg-rose-950/20' : undefined
                        }
                      >
                        <td className="whitespace-nowrap px-4 py-2">
                          {LIBELLES_TYPE_VARIABLE_PAIE[v.typeVariable]}
                        </td>
                        <td className="px-4 py-2">
                          {v.libelle}
                          {v.commentaire && (
                            <span className="block max-w-[320px] truncate text-xs text-muted-foreground">
                              {v.commentaire}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{v.codeRubrique ?? '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {formatNombre(v.quantite)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {v.montant === null ? '—' : formatEuro(v.montant)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <SourceVariableBadge source={v.source} />
                            {v.sourceObsolete && (
                              <Badge
                                tone="rose"
                                title="L’élément d’origine n’est plus approuvé : supprimez ou corrigez la variable."
                              >
                                Source annulée
                              </Badge>
                            )}
                          </div>
                        </td>
                        {modifiable && (
                          <td className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => ouvrir(v)}
                                title="Modifier"
                                aria-label={`Modifier ${v.libelle}`}
                              >
                                <PencilIcon className="size-3.5" />
                              </Button>
                              <BoutonConfirmation
                                libelle="Supprimer"
                                question="Supprimer cette variable ?"
                                libelleConfirmer="Supprimer"
                                messageSucces="Variable supprimée"
                                onConfirm={() => actions.supprimer(v.id)}
                              />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {modifiable && (
        <VariablePaieDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          periodeId={periode.id}
          variable={editee}
          employes={employes}
          onSubmit={actions.enregistrer}
        />
      )}
    </div>
  );
}
