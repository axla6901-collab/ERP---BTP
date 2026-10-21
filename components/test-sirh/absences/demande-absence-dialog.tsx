'use client';

import { PaperclipIcon, XIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect } from '@/components/test-sirh/option-select';
import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
import {
  TeleversementDocument,
  type ActionsTeleversement,
} from '@/components/test-sirh/televersement-document';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { calculerDureeDemande, datesFeriesApplicables } from '@/lib/test-sirh/absences/regles';
import {
  formatDuree,
  messageSoldeInsuffisant,
  trouverCompteurApplicable,
} from '@/lib/test-sirh/absences/soldes';
import type {
  ContexteDemandeAbsence,
  ResultatDemandeAbsence,
} from '@/lib/test-sirh/absences/types';
import { estDateIso } from '@/lib/test-sirh/calendrier';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  demandeAbsenceSchema,
  type DemandeAbsenceInput,
} from '@/lib/validation/test-sirh/absences';
import { LIBELLES_UNITE_DECOMPTE } from '@/lib/validation/test-sirh/enums';

export type ActionsDemandeAbsence = {
  demander: (input: DemandeAbsenceInput) => Promise<ActionResult<ResultatDemandeAbsence>>;
  /** Téléversement du justificatif (cible : fiche de l'employé). */
  televersement: ActionsTeleversement;
};

export type DemandeAbsenceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Types, employés, fériés, soldes (cf. `chargerContexteDemandeAbsence`). */
  contexte: ContexteDemandeAbsence;
  /** Date du jour ISO, calculée côté serveur. */
  today: string;
  /** Employé imposé (Mon espace, dossier) : pas de sélecteur d'employé. */
  employeFixeId?: string | null | undefined;
  /** Gestionnaire RH : propose « Approuver directement ». */
  peutApprouverDirectement?: boolean | undefined;
  /** Pré-remplissage (ex. clic sur un jour du calendrier). */
  valeursInitiales?:
    | Partial<Pick<DemandeAbsenceInput, 'employeId' | 'typeAbsenceId' | 'dateDebut' | 'dateFin'>>
    | undefined;
  actions: ActionsDemandeAbsence;
  onEnregistree?: ((resultat: ResultatDemandeAbsence) => void) | undefined;
};

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursDemandeParDefaut(p: {
  employeId: string;
  typeAbsenceId: string;
  dateDebut: string;
  dateFin: string;
}): DemandeAbsenceInput {
  return {
    employeId: p.employeId,
    typeAbsenceId: p.typeAbsenceId,
    dateDebut: p.dateDebut,
    dateFin: p.dateFin < p.dateDebut ? p.dateDebut : p.dateFin,
    demiJourneeDebut: false,
    demiJourneeFin: false,
    dureeHeures: null,
    motif: null,
    justificatifDocumentId: null,
    approuverDirectement: false,
  };
}

type ChoixJournee = 'journee' | 'matin' | 'apres_midi';

/**
 * Dialogue de demande d'absence (Factorial Leave) réutilisable : liste des
 * absences, Mon espace, dossier collaborateur. La durée est calculée EN DIRECT
 * (`compterJoursAbsence` : unité du type, fériés chômés du site de l'employé) ;
 * unité « heures » → durée saisie. Le serveur recalcule et fait foi.
 */
export function DemandeAbsenceDialog({
  open,
  onOpenChange,
  contexte,
  today,
  employeFixeId,
  peutApprouverDirectement = false,
  valeursInitiales,
  actions,
  onEnregistree,
}: DemandeAbsenceDialogProps) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justificatifTitre, setJustificatifTitre] = useState<string | null>(null);

  const employeInitial =
    employeFixeId ??
    valeursInitiales?.employeId ??
    (contexte.employes.length === 1 ? contexte.employes[0]?.id : undefined) ??
    '';
  const typeInitial = valeursInitiales?.typeAbsenceId ?? contexte.types[0]?.id ?? '';
  const debutInitial = valeursInitiales?.dateDebut ?? today;
  const finInitiale = valeursInitiales?.dateFin ?? debutInitial;
  const defauts = useMemo(
    () =>
      valeursDemandeParDefaut({
        employeId: employeInitial,
        typeAbsenceId: typeInitial,
        dateDebut: debutInitial,
        dateFin: finInitiale,
      }),
    [employeInitial, typeInitial, debutInitial, finInitiale],
  );

  const form = useForm<DemandeAbsenceInput>({
    resolver: typedZodResolver(demandeAbsenceSchema),
    defaultValues: defauts,
  });

  useEffect(() => {
    if (open) {
      form.reset(defauts);
      setErreur(null);
      setJustificatifTitre(null);
    }
  }, [open, defauts, form]);

  const [
    employeId,
    typeAbsenceId,
    dateDebut,
    dateFin,
    demiJourneeDebut,
    demiJourneeFin,
    dureeHeures,
  ] = useWatch({
    control: form.control,
    name: [
      'employeId',
      'typeAbsenceId',
      'dateDebut',
      'dateFin',
      'demiJourneeDebut',
      'demiJourneeFin',
      'dureeHeures',
    ],
  });

  const type = contexte.types.find((t) => t.id === typeAbsenceId) ?? null;
  const employe = contexte.employes.find((e) => e.id === employeId) ?? null;
  const enHeures = type?.uniteDecompte === 'heures';
  const unJour = dateDebut === dateFin;
  const datesValides = estDateIso(dateDebut) && estDateIso(dateFin) && dateFin >= dateDebut;

  // Sur une seule journée, « commence l'après-midi » + « finit à midi » est impossible.
  useEffect(() => {
    if (unJour && demiJourneeDebut && demiJourneeFin) form.setValue('demiJourneeFin', false);
  }, [unJour, demiJourneeDebut, demiJourneeFin, form]);

  const duree = useMemo(() => {
    if (!type || !datesValides) return null;
    return calculerDureeDemande({
      dateDebut,
      dateFin,
      demiJourneeDebut: enHeures ? false : demiJourneeDebut,
      demiJourneeFin: enHeures ? false : demiJourneeFin,
      unite: type.uniteDecompte,
      feries: datesFeriesApplicables(contexte.feries, employe?.siteId ?? null),
      dureeHeures,
    });
  }, [
    type,
    datesValides,
    dateDebut,
    dateFin,
    demiJourneeDebut,
    demiJourneeFin,
    enHeures,
    contexte.feries,
    employe,
    dureeHeures,
  ]);

  const compteur =
    type?.avecSolde && employeId && estDateIso(dateDebut)
      ? trouverCompteurApplicable(contexte.soldes, {
          employeId,
          typeAbsenceId: type.id,
          date: dateDebut,
        })
      : null;
  const alerteSolde =
    type && compteur && duree !== null
      ? messageSoldeInsuffisant(compteur.soldePrevisionnel, duree, type.uniteDecompte)
      : null;

  const optionsTypes = contexte.types.map((t) => ({ id: t.id, label: t.label }));
  const optionsEmployes = contexte.employes.map((e) => ({ id: e.id, label: e.label }));
  const employeFixe = employeFixeId
    ? (contexte.employes.find((e) => e.id === employeFixeId) ?? null)
    : null;

  const choixJournee: ChoixJournee = demiJourneeDebut
    ? 'apres_midi'
    : demiJourneeFin
      ? 'matin'
      : 'journee';

  function choisirJournee(choix: ChoixJournee) {
    form.setValue('demiJourneeDebut', choix === 'apres_midi');
    form.setValue('demiJourneeFin', choix === 'matin');
  }

  async function handleSubmit(values: DemandeAbsenceInput) {
    setErreur(null);
    if (type?.justificatifRequis && !values.justificatifDocumentId) {
      form.setError('justificatifDocumentId', {
        type: 'manual',
        message: 'Justificatif obligatoire pour ce type d’absence.',
      });
      return;
    }
    if (enHeures && !values.dureeHeures) {
      form.setError('dureeHeures', {
        type: 'manual',
        message: 'Durée en heures requise pour ce type d’absence.',
      });
      return;
    }
    setIsSubmitting(true);
    const result = await actions.demander({
      ...values,
      demiJourneeDebut: enHeures ? false : values.demiJourneeDebut,
      demiJourneeFin: enHeures ? false : values.demiJourneeFin,
      dureeHeures: enHeures ? values.dureeHeures : null,
      approuverDirectement:
        peutApprouverDirectement && type?.necessiteValidation ? values.approuverDirectement : false,
    });
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error);
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success(
      result.data.statut === 'approuvee'
        ? 'Absence enregistrée (approuvée)'
        : 'Demande d’absence envoyée pour validation',
    );
    if (result.data.avertissement) toast.warning(result.data.avertissement);
    onOpenChange(false);
    onEnregistree?.(result.data);
  }

  const aucunType = contexte.types.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvelle demande d’absence</DialogTitle>
          <DialogDescription>
            Congés, RTT, arrêt, événement familial… La durée est décomptée selon le type d’absence,
            hors week-ends et jours fériés chômés.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            {aucunType && (
              <Alert>
                <AlertTitle>Aucun type d’absence actif</AlertTitle>
                <AlertDescription>
                  Les types d’absence se paramètrent dans Absences › Paramètres.
                </AlertDescription>
              </Alert>
            )}

            {employeFixeId ? (
              <p className="text-sm">
                <span className="text-muted-foreground">Collaborateur : </span>
                <span className="font-medium">{employeFixe?.label ?? '—'}</span>
              </p>
            ) : (
              <FormField
                control={form.control}
                name="employeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Collaborateur</FormLabel>
                    <OptionSelect
                      options={optionsEmployes}
                      value={field.value || null}
                      onChange={(v) => {
                        field.onChange(v ?? '');
                        form.setValue('justificatifDocumentId', null);
                        setJustificatifTitre(null);
                      }}
                      libelleAucune="Choisir un collaborateur…"
                      aria-label="Collaborateur"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="typeAbsenceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type d’absence</FormLabel>
                  <div className="flex items-center gap-2">
                    {type && (
                      <PastilleCouleur
                        couleur={type.couleur}
                        className="inline-block size-3 shrink-0 rounded-full"
                      />
                    )}
                    <OptionSelect
                      options={optionsTypes}
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? '')}
                      autoriserAucune={false}
                      aria-label="Type d’absence"
                    />
                  </div>
                  {type && !type.necessiteValidation && (
                    <p className="text-xs text-muted-foreground">
                      Ce type ne nécessite pas de validation : l’absence sera enregistrée comme
                      approuvée.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateDebut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Du</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        onChange={(e) => {
                          field.onChange(e);
                          const fin = form.getValues('dateFin');
                          if (estDateIso(e.target.value) && (!fin || fin < e.target.value)) {
                            form.setValue('dateFin', e.target.value);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateFin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Au</FormLabel>
                    <FormControl>
                      <Input type="date" min={dateDebut || undefined} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {enHeures ? (
              <FormField
                control={form.control}
                name="dureeHeures"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Durée (heures)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="ex. 7,5"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : unJour ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium">Journée</span>
                <SegmentedControl<ChoixJournee>
                  aria-label="Journée"
                  value={choixJournee}
                  onChange={choisirJournee}
                  options={[
                    { value: 'journee', label: 'Journée entière' },
                    { value: 'matin', label: 'Matin' },
                    { value: 'apres_midi', label: 'Après-midi' },
                  ]}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <span className="text-sm font-medium">Début</span>
                  <SegmentedControl<'matin' | 'apres_midi'>
                    aria-label="Début de l’absence"
                    value={demiJourneeDebut ? 'apres_midi' : 'matin'}
                    onChange={(v) => form.setValue('demiJourneeDebut', v === 'apres_midi')}
                    options={[
                      { value: 'matin', label: 'Matin' },
                      { value: 'apres_midi', label: 'Après-midi' },
                    ]}
                  />
                </div>
                <div className="grid gap-2">
                  <span className="text-sm font-medium">Fin</span>
                  <SegmentedControl<'soir' | 'midi'>
                    aria-label="Fin de l’absence"
                    value={demiJourneeFin ? 'midi' : 'soir'}
                    onChange={(v) => form.setValue('demiJourneeFin', v === 'midi')}
                    options={[
                      { value: 'soir', label: 'Fin de journée' },
                      { value: 'midi', label: 'Midi' },
                    ]}
                  />
                </div>
              </div>
            )}
            {form.formState.errors.demiJourneeFin?.message && (
              <p className="text-sm text-destructive">
                {form.formState.errors.demiJourneeFin.message}
              </p>
            )}

            <div
              className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
              data-testid="duree-calculee"
            >
              {!type || !datesValides ? (
                <span className="text-muted-foreground">
                  Choisissez un type et des dates valides.
                </span>
              ) : duree === null ? (
                <span className="text-muted-foreground">Saisissez la durée en heures.</span>
              ) : duree === 0 ? (
                <span className="text-amber-800 dark:text-amber-300">
                  Aucun jour décompté sur cette période (week-end ou jours fériés).
                </span>
              ) : (
                <span>
                  Durée décomptée :{' '}
                  <strong className="tabular-nums">{formatDuree(duree, type.uniteDecompte)}</strong>
                  <span className="text-muted-foreground">
                    {' '}
                    · {LIBELLES_UNITE_DECOMPTE[type.uniteDecompte]}
                  </span>
                </span>
              )}
              {type?.avecSolde && employeId && (
                <div className="mt-1 text-xs" data-testid="solde-indicatif">
                  {compteur ? (
                    <span className="text-muted-foreground">
                      Solde disponible (en attente déduites) :{' '}
                      <span className="font-medium tabular-nums text-foreground">
                        {formatDuree(compteur.soldePrevisionnel, type.uniteDecompte)}
                      </span>{' '}
                      · période du {formatDateFr(compteur.periodeDebut)} au{' '}
                      {formatDateFr(compteur.periodeFin)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Aucun compteur ne couvre cette date : le solde ne sera pas vérifié.
                    </span>
                  )}
                </div>
              )}
              {alerteSolde && (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  {alerteSolde} La demande reste possible et sera signalée au valideur.
                </p>
              )}
            </div>

            <FormField
              control={form.control}
              name="justificatifDocumentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Justificatif {type?.justificatifRequis ? '(obligatoire)' : '(facultatif)'}
                  </FormLabel>
                  {field.value ? (
                    <div className="flex items-center gap-2 text-sm">
                      <PaperclipIcon className="size-4 text-muted-foreground" />
                      <span className="truncate">{justificatifTitre ?? 'Pièce jointe'}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label="Retirer le justificatif"
                        onClick={() => {
                          field.onChange(null);
                          setJustificatifTitre(null);
                        }}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <TeleversementDocument
                      cible={{ type: 'employe', id: employeId }}
                      actions={actions.televersement}
                      onTeleverse={(doc) => {
                        field.onChange(doc.id);
                        setJustificatifTitre(doc.titre);
                        form.clearErrors('justificatifDocumentId');
                      }}
                      dossierId={contexte.dossierJustificatifsId}
                      visibleSalarie
                      libelleBouton="Joindre un justificatif"
                      disabled={!employeId}
                    />
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="motif"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motif / commentaire</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={1000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {peutApprouverDirectement && type?.necessiteValidation && (
              <FormField
                control={form.control}
                name="approuverDirectement"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Approuver directement (saisie RH)</FormLabel>
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting || aucunType}>
                {isSubmitting ? 'Envoi…' : 'Enregistrer la demande'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
