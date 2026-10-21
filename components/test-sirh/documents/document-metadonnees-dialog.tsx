'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  documentMetadonneesSchema,
  type DocumentMetadonneesInput,
} from '@/lib/validation/test-sirh/documents';

export type DocumentEditable = {
  id: string;
  titre: string;
  dossierId: string | null;
  dateDocument: string | null;
  dateExpiration: string | null;
  visibleSalarie: boolean;
  signatureRequise: boolean;
  notes: string | null;
};

/** Valeurs initiales : TOUTES les clés présentes. */
export function valeursMetadonneesParDefaut(
  doc: DocumentEditable | null,
): DocumentMetadonneesInput {
  return {
    id: doc?.id ?? '',
    titre: doc?.titre ?? '',
    dossierId: doc?.dossierId ?? null,
    dateDocument: doc?.dateDocument ?? null,
    dateExpiration: doc?.dateExpiration ?? null,
    visibleSalarie: doc?.visibleSalarie ?? false,
    signatureRequise: doc?.signatureRequise ?? false,
    notes: doc?.notes ?? null,
  };
}

type Props = {
  /** Document à modifier ; `null` = modale fermée. */
  documentEdite: DocumentEditable | null;
  onClose: () => void;
  dossiers: readonly OptionListe[];
  onSubmit: (values: DocumentMetadonneesInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modification des métadonnées d'un document (titre, dossier, dates, visibilité, signature). */
export function DocumentMetadonneesDialog({ documentEdite, onClose, dossiers, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<DocumentMetadonneesInput>({
    resolver: typedZodResolver(documentMetadonneesSchema),
    defaultValues: valeursMetadonneesParDefaut(documentEdite),
  });

  useEffect(() => {
    if (documentEdite) {
      form.reset(valeursMetadonneesParDefaut(documentEdite));
      setErreur(null);
    }
  }, [documentEdite, form]);

  async function handleSubmit(values: DocumentMetadonneesInput) {
    setErreur(null);
    setIsSubmitting(true);
    const r = await onSubmit(values);
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
    toast.success('Document mis à jour');
    onClose();
  }

  return (
    <Dialog open={documentEdite !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier le document</DialogTitle>
          <DialogDescription>
            Le fichier n’est pas modifié : seulement son classement.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4" noValidate>
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}
            <FormField
              control={form.control}
              name="titre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titre</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dossierId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dossier</FormLabel>
                  <OptionSelect
                    options={dossiers}
                    value={field.value}
                    onChange={field.onChange}
                    libelleAucune="Sans dossier"
                    aria-label="Dossier"
                  />
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
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
