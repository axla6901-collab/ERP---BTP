'use client';

import { CarIcon, ReceiptIcon, UtensilsIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  OptionSelect,
  optionsDepuisEnum,
  type OptionListe,
} from '@/components/test-sirh/option-select';
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
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { formatDateFr, formatEuro, formatNombre, versNombre } from '@/lib/test-sirh/format';
import {
  ANNEE_BAREME_KILOMETRIQUE,
  TAUX_TVA_FRAIS,
  categorieParDefaut,
  categoriesPourNature,
  estTauxElectrique,
  montantForfait,
  montantHt,
  montantIndemniteKm,
  tauxKmPremiereTranche,
  tvaDepuisTtc,
} from '@/lib/test-sirh/notes-frais/calculs';
import {
  LIBELLES_CATEGORIE_FRAIS,
  type CategorieFrais,
  type NatureFrais,
  type StatutFrais,
} from '@/lib/validation/test-sirh/enums';
import { noteFraisSchema, type NoteFraisInput } from '@/lib/validation/test-sirh/notes-frais';

/** Note existante à modifier (sous-ensemble de `NoteFraisLigne`). */
export type NoteFraisEditable = {
  id: string;
  employeId: string;
  dateDepense: string;
  nature: NatureFrais;
  categorie: CategorieFrais;
  libelle: string;
  montantTtc: number;
  montantTva: number | null;
  distanceKm: number | null;
  puissanceFiscale: number | null;
  tauxKm: number | null;
  nbForfaits: number | null;
  montantUnitaire: number | null;
  chantierId: string | null;
  justificatifDocumentId: string | null;
  justificatifTitre: string | null;
};

export type ResultatEnregistrementNoteFrais = ActionResult<{ id: string; statut: StatutFrais }>;

/** Server actions passées par la page (wrappers inline `'use server'`). */
export type ActionsNoteFraisDialog = {
  enregistrerBrouillon: (input: NoteFraisInput) => Promise<ResultatEnregistrementNoteFrais>;
  soumettre: (input: NoteFraisInput) => Promise<ResultatEnregistrementNoteFrais>;
  /** Téléversement du justificatif (`preparerUploadSirh` + `creerDocumentSirh`) ; absent = pas de pièce. */
  televersement?: ActionsTeleversement | undefined;
};

const LIBELLES_NATURE_COURTS: Record<NatureFrais, string> = {
  depense: 'Dépense',
  indemnite_km: 'Kilomètres',
  forfait: 'Forfait',
};

const PLACEHOLDERS_LIBELLE: Record<NatureFrais, string> = {
  depense: 'Ex. Déjeuner équipe — chantier Les Tilleuls',
  indemnite_km: 'Ex. Dépôt → chantier Les Tilleuls (aller-retour)',
  forfait: 'Ex. Paniers semaine 42',
};

function enTexte(v: number | null | undefined, decimales?: number): string | null {
  if (v === null || v === undefined) return null;
  return decimales === undefined ? String(v) : v.toFixed(decimales);
}

/** Valeurs initiales : TOUTES les clés présentes (convention des schémas SIRH). */
export function valeursNoteFraisParDefaut(
  note: NoteFraisEditable | null,
  employeId: string | null,
  today: string,
): NoteFraisInput {
  return {
    id: note?.id,
    employeId: note?.employeId ?? employeId ?? '',
    dateDepense: note?.dateDepense ?? today,
    nature: note?.nature ?? 'depense',
    categorie: note?.categorie ?? 'repas',
    libelle: note?.libelle ?? '',
    montantTtc: note && note.nature === 'depense' ? enTexte(note.montantTtc, 2) : null,
    montantTva: enTexte(note?.montantTva, 2),
    distanceKm: enTexte(note?.distanceKm),
    puissanceFiscale: note?.puissanceFiscale ?? null,
    vehiculeElectrique: note ? estTauxElectrique(note.puissanceFiscale, note.tauxKm) : false,
    tauxKm: enTexte(note?.tauxKm, 3),
    nbForfaits: enTexte(note?.nbForfaits),
    montantUnitaire: enTexte(note?.montantUnitaire, 2),
    chantierId: note?.chantierId ?? null,
    justificatifDocumentId: note?.justificatifDocumentId ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Note à modifier ; `null` = création. */
  note: NoteFraisEditable | null;
  /** Salarié imposé (Mon espace, dossier collaborateur) : le sélecteur est masqué. */
  employeFixe?: OptionListe | null | undefined;
  /** Salariés sélectionnables (gestion RH) — ignoré si `employeFixe`. */
  employes?: readonly OptionListe[] | undefined;
  chantiers: readonly OptionListe[];
  /** Date du jour (serveur) : valeur par défaut et borne maximale. */
  today: string;
  /** Dossier GED où ranger les justificatifs téléversés (« Justificatifs »). */
  dossierJustificatifsId?: string | null | undefined;
  actions: ActionsNoteFraisDialog;
};

/**
 * Saisie d'une note de frais (Factorial Expense / Mileage / PerDiem) : dépense
 * sur justificatif, indemnités kilométriques (taux du barème proposé,
 * modifiable) ou forfait. Enregistrement en brouillon ou soumission directe.
 */
export function NoteFraisDialog({
  open,
  onOpenChange,
  note,
  employeFixe = null,
  employes = [],
  chantiers,
  today,
  dossierJustificatifsId = null,
  actions,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justificatifTitre, setJustificatifTitre] = useState<string | null>(null);
  const [tauxManuel, setTauxManuel] = useState(false);
  const enEdition = Boolean(note?.id);
  const employeFixeId = employeFixe?.id ?? null;

  const form = useForm<NoteFraisInput>({
    resolver: typedZodResolver(noteFraisSchema),
    defaultValues: valeursNoteFraisParDefaut(note, employeFixeId, today),
  });

  useEffect(() => {
    if (!open) return;
    const valeurs = valeursNoteFraisParDefaut(note, employeFixeId, today);
    form.reset(valeurs);
    setErreur(null);
    setJustificatifTitre(note?.justificatifTitre ?? null);
    // Taux saisi à la main (≠ barème) : on ne l'écrase pas au changement de puissance.
    const cv = versNombre(valeurs.puissanceFiscale);
    const taux = versNombre(valeurs.tauxKm);
    setTauxManuel(
      cv !== null &&
        taux !== null &&
        Math.abs(taux - tauxKmPremiereTranche(cv, valeurs.vehiculeElectrique)) > 0.0005,
    );
  }, [open, note, employeFixeId, today, form]);

  const nature = form.watch('nature');
  const employeId = form.watch('employeId');
  const cv = versNombre(form.watch('puissanceFiscale'));
  const distance = versNombre(form.watch('distanceKm'));
  const taux = versNombre(form.watch('tauxKm'));
  const nbForfaits = versNombre(form.watch('nbForfaits'));
  const unitaire = versNombre(form.watch('montantUnitaire'));
  const ttc = versNombre(form.watch('montantTtc'));
  const tva = versNombre(form.watch('montantTva'));
  const justificatifId = form.watch('justificatifDocumentId');
  const libelle = form.watch('libelle');
  const dateDepense = form.watch('dateDepense');
  const categorie = form.watch('categorie');

  /**
   * Taux de la 1re tranche du barème, recalculé à chaque saisie de la puissance
   * ou de la case « électrique » tant qu'il n'a pas été modifié à la main.
   * (Recalcul piloté par les événements : un effet relirait des valeurs
   * périmées à la réouverture de la modale et écraserait un taux personnalisé.)
   */
  function recalculerTaux(puissance: unknown, vehiculeElectrique: boolean, manuel = tauxManuel) {
    if (manuel) return;
    const n = versNombre(puissance as string | number | null | undefined);
    if (n === null || n < 1) return;
    form.setValue('tauxKm', tauxKmPremiereTranche(n, vehiculeElectrique).toFixed(3));
  }

  function changerNature(v: NatureFrais) {
    form.setValue('nature', v);
    if (!categoriesPourNature(v).includes(form.getValues('categorie'))) {
      form.setValue('categorie', categorieParDefaut(v));
    }
    form.clearErrors();
    if (v === 'indemnite_km') {
      recalculerTaux(form.getValues('puissanceFiscale'), form.getValues('vehiculeElectrique'));
    }
  }

  async function envoyer(values: NoteFraisInput, soumettre: boolean) {
    setErreur(null);
    setIsSubmitting(true);
    const r = await (soumettre ? actions.soumettre(values) : actions.enregistrerBrouillon(values));
    setIsSubmitting(false);
    if (!r.ok) {
      setErreur(r.error);
      if (r.fieldErrors) {
        for (const [champ, msgs] of Object.entries(r.fieldErrors)) {
          if (msgs?.[0]) form.setError(champ as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success(soumettre ? 'Note de frais soumise à validation' : 'Brouillon enregistré');
    onOpenChange(false);
  }

  const montantCalcule =
    nature === 'indemnite_km'
      ? montantIndemniteKm(distance ?? 0, taux ?? 0)
      : nature === 'forfait'
        ? montantForfait(nbForfaits ?? 0, unitaire ?? 0)
        : null;

  const optionsCategorie = optionsDepuisEnum(
    categoriesPourNature(nature),
    LIBELLES_CATEGORIE_FRAIS,
  );
  const titrePiece = `Justificatif — ${libelle?.trim() || LIBELLES_CATEGORIE_FRAIS[categorie]} (${formatDateFr(dateDepense)})`;
  const employeValide = /^[0-9a-f-]{36}$/i.test(employeId ?? '');
  const televersement = actions.televersement;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {enEdition ? 'Modifier la note de frais' : 'Nouvelle note de frais'}
          </DialogTitle>
          <DialogDescription>
            Dépense sur justificatif, indemnités kilométriques ou forfait (panier, grand
            déplacement). Une note soumise part en validation.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => envoyer(v, true))}
            className="grid gap-4"
            noValidate
          >
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {employeFixe ? (
                <div className="grid gap-2">
                  <span className="text-sm font-medium">Collaborateur</span>
                  <span className="text-sm">{employeFixe.label}</span>
                </div>
              ) : (
                <FormField
                  control={form.control}
                  name="employeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Collaborateur</FormLabel>
                      <OptionSelect
                        options={employes}
                        value={field.value || null}
                        onChange={(v) => field.onChange(v ?? '')}
                        libelleAucune="Choisir…"
                        aria-label="Collaborateur"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="dateDepense"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de la dépense</FormLabel>
                    <FormControl>
                      <Input type="date" max={today} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">Nature</span>
              <SegmentedControl<NatureFrais>
                aria-label="Nature de la note"
                size="md"
                value={nature}
                onChange={changerNature}
                options={[
                  {
                    value: 'depense',
                    label: LIBELLES_NATURE_COURTS.depense,
                    icon: <ReceiptIcon className="size-4" />,
                  },
                  {
                    value: 'indemnite_km',
                    label: LIBELLES_NATURE_COURTS.indemnite_km,
                    icon: <CarIcon className="size-4" />,
                  },
                  {
                    value: 'forfait',
                    label: LIBELLES_NATURE_COURTS.forfait,
                    icon: <UtensilsIcon className="size-4" />,
                  },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="categorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie</FormLabel>
                    <OptionSelect
                      options={optionsCategorie}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? categorieParDefaut(nature))}
                      autoriserAucune={false}
                      aria-label="Catégorie"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="libelle"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Libellé</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={200}
                        placeholder={PLACEHOLDERS_LIBELLE[nature]}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {nature === 'depense' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="montantTtc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Montant TTC (€)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="montantTva"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>dont TVA (€)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <div className="flex flex-wrap items-center gap-1">
                        {TAUX_TVA_FRAIS.map((t) => (
                          <Button
                            key={t}
                            type="button"
                            variant="outline"
                            size="xs"
                            disabled={!ttc}
                            onClick={() =>
                              form.setValue('montantTva', tvaDepuisTtc(ttc ?? 0, t).toFixed(2), {
                                shouldValidate: true,
                              })
                            }
                          >
                            {formatNombre(t)} %
                          </Button>
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {ttc !== null && ttc > 0 && (
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Montant HT : {formatEuro(montantHt(ttc, tva))}
                  </p>
                )}
              </div>
            )}

            {nature === 'indemnite_km' && (
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="distanceKm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Distance (km)</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="puissanceFiscale"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Puissance fiscale (CV)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={50}
                            step={1}
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              const v = e.target.value === '' ? null : e.target.value;
                              field.onChange(v);
                              recalculerTaux(v, form.getValues('vehiculeElectrique'));
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tauxKm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Taux (€/km)</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="decimal"
                            name={field.name}
                            ref={field.ref}
                            onBlur={field.onBlur}
                            value={field.value ?? ''}
                            onChange={(e) => {
                              setTauxManuel(true);
                              field.onChange(e.target.value);
                            }}
                          />
                        </FormControl>
                        {tauxManuel && cv !== null && cv >= 1 && (
                          <button
                            type="button"
                            className="w-fit text-xs text-orange-700 underline-offset-2 hover:underline"
                            onClick={() => {
                              setTauxManuel(false);
                              recalculerTaux(
                                form.getValues('puissanceFiscale'),
                                form.getValues('vehiculeElectrique'),
                                false,
                              );
                            }}
                          >
                            Revenir au barème
                          </button>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="vehiculeElectrique"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(coche) => {
                            field.onChange(coche);
                            recalculerTaux(form.getValues('puissanceFiscale'), coche);
                          }}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Véhicule 100 % électrique (+ 20 %)</FormLabel>
                    </FormItem>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Taux proposé : 1re tranche du barème kilométrique URSSAF{' '}
                  {ANNEE_BAREME_KILOMETRIQUE} (≤ 5 000 km/an), modifiable.
                </p>
              </div>
            )}

            {nature === 'forfait' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="nbForfaits"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de forfaits</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="montantUnitaire"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Montant unitaire (€)</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {montantCalcule !== null && (
              <p
                className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200"
                data-testid="montant-calcule"
              >
                Montant calculé :{' '}
                <strong className="tabular-nums">{formatEuro(montantCalcule)}</strong>
                {nature === 'indemnite_km' && distance !== null && taux !== null && (
                  <span className="text-xs">
                    {' '}
                    ({formatNombre(distance, 1)} km × {formatNombre(taux, 3)} €/km)
                  </span>
                )}
              </p>
            )}

            <FormField
              control={form.control}
              name="chantierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Imputation chantier (facultatif)</FormLabel>
                  <OptionSelect
                    options={chantiers}
                    value={field.value}
                    onChange={field.onChange}
                    libelleAucune="Aucun chantier"
                    aria-label="Chantier"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {televersement && (
              <FormField
                control={form.control}
                name="justificatifDocumentId"
                render={() => (
                  <FormItem>
                    <FormLabel>
                      Justificatif {nature === 'depense' ? '(ticket, facture…)' : '(facultatif)'}
                    </FormLabel>
                    {justificatifId ? (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="truncate">{justificatifTitre ?? 'Pièce jointe'}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => {
                            form.setValue('justificatifDocumentId', null);
                            setJustificatifTitre(null);
                          }}
                        >
                          <XIcon className="size-3" /> Retirer
                        </Button>
                      </div>
                    ) : employeValide ? (
                      <TeleversementDocument
                        cible={{ type: 'employe', id: employeId }}
                        actions={televersement}
                        dossierId={dossierJustificatifsId}
                        visibleSalarie
                        titre={titrePiece}
                        libelleBouton="Joindre le justificatif"
                        onTeleverse={(doc) => {
                          form.setValue('justificatifDocumentId', doc.id);
                          setJustificatifTitre(doc.titre);
                        }}
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Choisissez d’abord le collaborateur pour joindre une pièce.
                      </p>
                    )}
                    <FormMessage />
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
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={form.handleSubmit((v) => envoyer(v, false))}
              >
                Enregistrer en brouillon
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : 'Soumettre'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
