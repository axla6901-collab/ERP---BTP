'use client';

import { ClipboardListIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  OptionSelect,
  optionsDepuisEnum,
  type OptionListe,
} from '@/components/test-sirh/option-select';
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
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import type { ResultatEnregistrementContrat } from '@/lib/test-sirh/collaborateurs/contrats-actions';
import {
  appliquerPoste,
  appliquerPrefillFicheRh,
  HEURES_HEBDO_DEFAUT,
  valeursContratParDefaut,
  type ContratEditable,
  type OptionPosteContrat,
  type PrefillFicheRh,
} from '@/lib/test-sirh/collaborateurs/saisie-contrat';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  contratSchema,
  TYPES_CONTRAT_MOTIF_RECOURS,
  type ContratInput,
} from '@/lib/validation/test-sirh/collaborateurs';
import {
  CATEGORIES_PROFESSIONNELLES,
  LIBELLES_CATEGORIE_PROFESSIONNELLE,
  LIBELLES_MOTIF_FIN_CONTRAT,
  LIBELLES_TEMPS_TRAVAIL,
  LIBELLES_TYPE_CONTRAT,
  MOTIFS_FIN_CONTRAT,
  TEMPS_TRAVAIL,
  TYPES_CONTRAT,
  TYPES_CONTRAT_A_TERME,
  type CategorieProfessionnelle,
  type MotifFinContrat,
  type TempsTravail,
  type TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';

const OPTIONS_TYPE = optionsDepuisEnum(TYPES_CONTRAT, LIBELLES_TYPE_CONTRAT);
const OPTIONS_TEMPS = optionsDepuisEnum(TEMPS_TRAVAIL, LIBELLES_TEMPS_TRAVAIL);
const OPTIONS_CATEGORIE = optionsDepuisEnum(
  CATEGORIES_PROFESSIONNELLES,
  LIBELLES_CATEGORIE_PROFESSIONNELLE,
);
const OPTIONS_MOTIF_FIN = optionsDepuisEnum(MOTIFS_FIN_CONTRAT, LIBELLES_MOTIF_FIN_CONTRAT);

export type OptionsContrat = {
  postes: readonly OptionPosteContrat[];
  sites: readonly OptionListe[];
  societes: readonly OptionListe[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeId: string;
  /** Version à modifier ; `null` = nouvelle version. */
  contrat: ContratEditable | null;
  today: string;
  /** Droit PAIE : affiche et transmet la rémunération. */
  avecRemuneration: boolean;
  options: OptionsContrat;
  /** Champs « contrat » de la fiche RH (bouton de pré-remplissage), ou null. */
  prefill: PrefillFicheRh | null;
  onSubmit: (values: ContratInput) => Promise<ActionResult<ResultatEnregistrementContrat>>;
};

function Rubrique({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {titre}
      </legend>
      {children}
    </fieldset>
  );
}

/**
 * Modale de création / modification d'une version de contrat (Factorial
 * ContractVersion + Compensation). Les salaires ne sont rendus qu'avec le droit
 * PAIE ; sans ce droit ils ne sont ni affichés ni envoyés.
 */
export function ContratDialog({
  open,
  onOpenChange,
  employeId,
  contrat,
  today,
  avecRemuneration,
  options,
  prefill,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(contrat?.id);

  const form = useForm<ContratInput>({
    resolver: typedZodResolver(contratSchema),
    defaultValues: valeursContratParDefaut(employeId, contrat, today),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursContratParDefaut(employeId, contrat, today));
      setErreur(null);
    }
  }, [open, employeId, contrat, today, form]);

  const typeContrat = form.watch('typeContrat');
  const tempsTravail = form.watch('tempsTravail');
  const motifRecours = form.watch('motifRecours');
  const aTerme = TYPES_CONTRAT_A_TERME.includes(typeContrat);
  const motifRequis = TYPES_CONTRAT_MOTIF_RECOURS.includes(typeContrat);

  const optionsPostes: OptionListe[] = options.postes.map((p) => ({ id: p.id, label: p.label }));

  function choisirPoste(posteId: string | null) {
    const poste = options.postes.find((p) => p.id === posteId) ?? null;
    const suivant = appliquerPoste(form.getValues(), poste);
    const opts = { shouldDirty: true } as const;
    form.setValue('posteId', suivant.posteId, opts);
    form.setValue('intitulePoste', suivant.intitulePoste, opts);
    form.setValue('categorie', suivant.categorie, opts);
    form.setValue('niveau', suivant.niveau, opts);
    form.setValue('coefficient', suivant.coefficient, opts);
  }

  function choisirTempsTravail(valeur: TempsTravail) {
    form.setValue('tempsTravail', valeur, { shouldDirty: true });
    if (valeur === 'forfait_jours') {
      form.setValue('heuresHebdo', null);
    } else {
      form.setValue('joursForfait', null);
      if (!form.getValues('heuresHebdo')) form.setValue('heuresHebdo', HEURES_HEBDO_DEFAUT);
    }
  }

  function preRemplir() {
    if (!prefill) return;
    form.reset(appliquerPrefillFicheRh(form.getValues(), prefill, avecRemuneration));
    toast.success('Formulaire pré-rempli depuis la fiche RH');
  }

  async function handleSubmit(values: ContratInput) {
    setErreur(null);
    setIsSubmitting(true);
    // Sans droit PAIE, la rémunération n'est jamais transmise.
    const payload = avecRemuneration
      ? values
      : { ...values, salaireBrutMensuel: null, tauxHoraireBrut: null };
    const result = await onSubmit(payload);
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
    const close = result.data.versionsCloses[0];
    toast.success(
      enEdition ? 'Contrat mis à jour' : 'Contrat enregistré',
      close
        ? { description: `La version précédente a été close au ${formatDateFr(close.dateFin)}.` }
        : undefined,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {enEdition ? 'Modifier la version de contrat' : 'Nouveau contrat'}
          </DialogTitle>
          <DialogDescription>
            {enEdition
              ? 'Corrige la version existante. Pour un avenant, créez plutôt une nouvelle version.'
              : 'Nouvelle version (embauche, avenant, renouvellement) : une version en cours sera close la veille de son début.'}
          </DialogDescription>
        </DialogHeader>

        {!enEdition && prefill && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2">
            <span className="text-xs text-muted-foreground">
              Reprendre le type, les dates, la qualification et le temps de travail saisis sur la
              fiche RH.
            </span>
            <Button type="button" variant="outline" size="sm" onClick={preRemplir}>
              <ClipboardListIcon className="mr-1 size-3.5" />
              Pré-remplir depuis la fiche RH
            </Button>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-5">
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            <Rubrique titre="Contrat">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="typeContrat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type de contrat</FormLabel>
                      <OptionSelect
                        options={OPTIONS_TYPE}
                        value={field.value}
                        onChange={(v) => field.onChange((v as TypeContratSirh | null) ?? 'cdi')}
                        autoriserAucune={false}
                        aria-label="Type de contrat"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {(motifRequis || Boolean(motifRecours)) && (
                  <FormField
                    control={form.control}
                    name="motifRecours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Motif de recours{motifRequis ? ' (obligatoire)' : ''}</FormLabel>
                        <FormControl>
                          <Input
                            maxLength={500}
                            placeholder="Accroissement temporaire d’activité, remplacement…"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="dateDebut"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de début</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
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
                      <FormLabel>Date de fin{aTerme ? ' (requise)' : ''}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dateFinPeriodeEssai"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fin de période d’essai</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {enEdition && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="motifFin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Motif de fin</FormLabel>
                        <OptionSelect
                          options={OPTIONS_MOTIF_FIN}
                          value={field.value}
                          onChange={(v) => field.onChange((v as MotifFinContrat | null) ?? null)}
                          libelleAucune="— Contrat non terminé —"
                          aria-label="Motif de fin"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </Rubrique>

            <Rubrique titre="Poste & classification">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="posteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Poste du catalogue</FormLabel>
                      <OptionSelect
                        options={optionsPostes}
                        value={field.value}
                        onChange={choisirPoste}
                        libelleAucune="— Aucun —"
                        aria-label="Poste du catalogue"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="intitulePoste"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intitulé du poste (figé)</FormLabel>
                      <FormControl>
                        <Input maxLength={120} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="categorie"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Catégorie</FormLabel>
                      <OptionSelect
                        options={OPTIONS_CATEGORIE}
                        value={field.value}
                        onChange={(v) =>
                          field.onChange((v as CategorieProfessionnelle | null) ?? null)
                        }
                        libelleAucune="— Non précisée —"
                        aria-label="Catégorie"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="niveau"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Niveau / position</FormLabel>
                      <FormControl>
                        <Input maxLength={20} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="coefficient"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Coefficient</FormLabel>
                      <FormControl>
                        <Input maxLength={20} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Rubrique>

            <Rubrique titre="Temps de travail">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="tempsTravail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Régime</FormLabel>
                      <OptionSelect
                        options={OPTIONS_TEMPS}
                        value={field.value}
                        onChange={(v) =>
                          choisirTempsTravail((v as TempsTravail | null) ?? 'temps_plein')
                        }
                        autoriserAucune={false}
                        aria-label="Régime de temps de travail"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {tempsTravail === 'forfait_jours' ? (
                  <FormField
                    control={form.control}
                    name="joursForfait"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Jours du forfait (par an)</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="numeric"
                            placeholder="218"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name="heuresHebdo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Heures hebdomadaires</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </Rubrique>

            <Rubrique titre="Rattachement">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="societeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Société employeuse</FormLabel>
                      <OptionSelect
                        options={options.societes}
                        value={field.value}
                        onChange={field.onChange}
                        libelleAucune="— Aucune —"
                        aria-label="Société employeuse"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="siteId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Site</FormLabel>
                      <OptionSelect
                        options={options.sites}
                        value={field.value}
                        onChange={field.onChange}
                        libelleAucune="— Aucun —"
                        aria-label="Site du contrat"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="conventionCollective"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Convention collective</FormLabel>
                      <FormControl>
                        <Input maxLength={120} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Rubrique>

            {avecRemuneration && (
              <Rubrique titre="Rémunération (confidentiel)">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="salaireBrutMensuel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salaire brut mensuel (€)</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tauxHoraireBrut"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Taux horaire brut (€)</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </Rubrique>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={2000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer le contrat'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
