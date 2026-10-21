'use client';

import { BuildingIcon, UserIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import {
  TeleversementDocument,
  type ActionsTeleversement,
} from '@/components/test-sirh/televersement-document';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import type { CibleDocumentSirh } from '@/lib/test-sirh/stockage';
import {
  televersementDocumentSchema,
  type TeleversementDocumentInput,
} from '@/lib/validation/test-sirh/documents';

export type OptionDossierGed = OptionListe & { visibleSalarie: boolean };

type ValeursInitiales = {
  cibleType?: 'employe' | 'entreprise' | undefined;
  employeId?: string | null | undefined;
  dossierId?: string | null | undefined;
};

/** Valeurs initiales : TOUTES les clés présentes (visibilité héritée du dossier). */
export function valeursTeleversementParDefaut(
  initiales: ValeursInitiales,
  dossiers: readonly OptionDossierGed[],
): TeleversementDocumentInput {
  const dossier = dossiers.find((d) => d.id === initiales.dossierId) ?? null;
  return {
    cibleType: initiales.cibleType ?? 'employe',
    employeId: initiales.employeId ?? null,
    titre: null,
    dossierId: dossier?.id ?? null,
    dateDocument: null,
    dateExpiration: null,
    visibleSalarie: dossier?.visibleSalarie ?? false,
    signatureRequise: false,
    notes: null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employes: readonly OptionListe[];
  dossiers: readonly OptionDossierGed[];
  /** Pré-sélections (filtres courants de la GED). */
  initiales?: ValeursInitiales;
  /** `preparerUploadSirh` + `creerDocumentSirh` (wrappers `'use server'`). */
  actions: ActionsTeleversement;
};

/**
 * Dépôt d'un document dans la GED : on renseigne d'abord le rattachement
 * (salarié ou entreprise), le dossier, les dates et la visibilité, puis on
 * choisit le fichier — `TeleversementDocument` l'envoie dans MinIO et les
 * métadonnées saisies sont jointes à l'enregistrement.
 */
export function DocumentTeleversementDialog({
  open,
  onOpenChange,
  employes,
  dossiers,
  initiales = {},
  actions,
}: Props) {
  const form = useForm<TeleversementDocumentInput>({
    resolver: typedZodResolver(televersementDocumentSchema),
    defaultValues: valeursTeleversementParDefaut(initiales, dossiers),
  });
  const { cibleType: cibleInit, employeId: employeInit, dossierId: dossierInit } = initiales;

  useEffect(() => {
    if (open) {
      form.reset(
        valeursTeleversementParDefaut(
          { cibleType: cibleInit, employeId: employeInit, dossierId: dossierInit },
          dossiers,
        ),
      );
    }
  }, [open, cibleInit, employeInit, dossierInit, dossiers, form]);

  const cibleType = form.watch('cibleType');
  const employeId = form.watch('employeId');
  const visibleSalarie = form.watch('visibleSalarie');
  const cible: CibleDocumentSirh =
    cibleType === 'employe' && employeId
      ? { type: 'employe', id: employeId }
      : { type: 'entreprise' };

  /** Contrôle le formulaire AVANT l'envoi du fichier, puis joint les métadonnées saisies. */
  const actionsAvecMetadonnees: ActionsTeleversement = {
    preparerUpload: async (c, contentType, filename, tailleBytes) => {
      const valide = await form.trigger();
      if (!valide) {
        return { ok: false, error: 'Complétez le formulaire avant de choisir le fichier.' };
      }
      return actions.preparerUpload(c, contentType, filename, tailleBytes);
    },
    creerDocument: (input) => {
      const v = form.getValues();
      return actions.creerDocument({
        ...input,
        titre: v.titre?.trim() || input.titre,
        dossierId: v.dossierId || null,
        dateDocument: v.dateDocument || null,
        dateExpiration: v.dateExpiration || null,
        visibleSalarie: v.visibleSalarie,
        signatureRequise: v.signatureRequise,
        notes: v.notes?.trim() || null,
      });
    },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Téléverser un document</DialogTitle>
          <DialogDescription>
            Pièce d’un salarié (contrat, attestation, habilitation…) ou document d’entreprise
            (règlement intérieur, accord, note de service). PDF ou image, 25 Mo maximum.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Rattachement</span>
              <SegmentedControl<'employe' | 'entreprise'>
                aria-label="Rattachement du document"
                size="md"
                value={cibleType}
                onChange={(v) => {
                  form.setValue('cibleType', v);
                  if (v === 'entreprise') form.setValue('employeId', null);
                  form.clearErrors('employeId');
                }}
                options={[
                  { value: 'employe', label: 'Salarié', icon: <UserIcon className="size-4" /> },
                  {
                    value: 'entreprise',
                    label: 'Entreprise',
                    icon: <BuildingIcon className="size-4" />,
                  },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {cibleType === 'employe' && (
                <FormField
                  control={form.control}
                  name="employeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Collaborateur</FormLabel>
                      <OptionSelect
                        options={employes}
                        value={field.value}
                        onChange={field.onChange}
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
                name="dossierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dossier</FormLabel>
                    <OptionSelect
                      options={dossiers}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        const dossier = dossiers.find((d) => d.id === v);
                        if (dossier) form.setValue('visibleSalarie', dossier.visibleSalarie);
                      }}
                      libelleAucune="Sans dossier"
                      aria-label="Dossier"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="titre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titre (par défaut : nom du fichier)</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateDocument"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date du document</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateExpiration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date d’expiration</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="visibleSalarie"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Visible par le salarié</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="signatureRequise"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Signature requise</FormLabel>
                  </FormItem>
                )}
              />
            </div>
            {cibleType === 'entreprise' && visibleSalarie && (
              <p className="text-xs text-muted-foreground">
                Document d’entreprise visible par tous les salariés (Mon espace).
              </p>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={1000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
              <TeleversementDocument
                cible={cible}
                actions={actionsAvecMetadonnees}
                libelleBouton="Choisir le fichier et téléverser"
                onTeleverse={(doc) => {
                  toast.success(`Document « ${doc.titre} » téléversé`);
                  onOpenChange(false);
                }}
              />
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
