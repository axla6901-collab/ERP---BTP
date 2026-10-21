'use client';

import { UserPlusIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { LIBELLES_SOURCE_CANDIDAT, SOURCES_CANDIDAT } from '@/lib/validation/test-sirh/enums';
import {
  ajoutCandidatureSchema,
  type AjoutCandidatureInput,
} from '@/lib/validation/test-sirh/recrutement';

const OPTIONS_SOURCE = optionsDepuisEnum(SOURCES_CANDIDAT, LIBELLES_SOURCE_CANDIDAT);

type Mode = AjoutCandidatureInput['mode'];
const OPTIONS_MODE: Array<{ value: Mode; label: string }> = [
  { value: 'existant', label: 'Candidat du vivier' },
  { value: 'nouveau', label: 'Nouveau candidat' },
];

export type ActionAjouterCandidature = (
  input: AjoutCandidatureInput,
) => Promise<ActionResult<{ id: string; candidatId: string }>>;

function valeursAjout(offreId: string, today: string, mode: Mode): AjoutCandidatureInput {
  return {
    offreId,
    mode,
    candidatId: null,
    nom: null,
    prenom: null,
    email: null,
    telephone: null,
    source: 'candidature_spontanee',
    consentementRgpd: false,
    dateCandidature: today,
    commentaire: null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offreId: string;
  /** Candidats du vivier pas encore positionnés sur l'offre. */
  candidats: OptionListe[];
  today: string;
  onSubmit: ActionAjouterCandidature;
};

/** Ajout d'un candidat à l'offre : candidat existant du vivier OU création rapide. */
export function AjoutCandidatureDialog({
  open,
  onOpenChange,
  offreId,
  candidats,
  today,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const modeInitial: Mode = candidats.length > 0 ? 'existant' : 'nouveau';
  const form = useForm<AjoutCandidatureInput>({
    resolver: typedZodResolver(ajoutCandidatureSchema),
    defaultValues: valeursAjout(offreId, today, modeInitial),
  });
  const mode = form.watch('mode');

  useEffect(() => {
    if (open) {
      form.reset(valeursAjout(offreId, today, modeInitial));
      setErreur(null);
    }
  }, [open, offreId, today, modeInitial, form]);

  async function handleSubmit(values: AjoutCandidatureInput) {
    setErreur(null);
    const r = await onSubmit(values);
    if (!r.ok) {
      setErreur(r.error);
      if (r.fieldErrors) {
        for (const [field, msgs] of Object.entries(r.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success('Candidat ajouté au pipeline');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Ajouter un candidat</DialogTitle>
          <DialogDescription>
            La candidature démarre à l’étape « Nouvelle » du pipeline.
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

            <SegmentedControl<Mode>
              options={OPTIONS_MODE}
              value={mode}
              onChange={(v) => form.setValue('mode', v, { shouldValidate: false })}
              aria-label="Type de candidat"
            />

            {mode === 'existant' ? (
              <FormField
                control={form.control}
                name="candidatId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Candidat</FormLabel>
                    <OptionSelect
                      options={candidats}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune={candidats.length > 0 ? 'Choisir un candidat…' : 'Vivier vide'}
                      aria-label="Candidat du vivier"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="prenom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prénom</FormLabel>
                        <FormControl>
                          <Input maxLength={100} {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom</FormLabel>
                        <FormControl>
                          <Input maxLength={100} {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            maxLength={200}
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
                    name="telephone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Téléphone</FormLabel>
                        <FormControl>
                          <Input maxLength={30} {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Source</FormLabel>
                        <OptionSelect
                          options={OPTIONS_SOURCE}
                          value={field.value}
                          onChange={(v) => field.onChange(v ?? 'candidature_spontanee')}
                          autoriserAucune={false}
                          aria-label="Source du candidat"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="consentementRgpd"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 sm:pt-6">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="!mt-0">Consentement RGPD recueilli</FormLabel>
                      </FormItem>
                    )}
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="dateCandidature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de candidature</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="commentaire"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Commentaire</FormLabel>
                    <FormControl>
                      <Textarea rows={2} maxLength={2000} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={form.formState.isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Ajout…' : 'Ajouter au pipeline'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton « Ajouter un candidat » + sa modale (bandeau de la page pipeline). */
export function BoutonAjoutCandidature(props: Omit<Props, 'open' | 'onOpenChange'>) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOuvert(true)}>
        <UserPlusIcon className="mr-1 size-4" /> Ajouter un candidat
      </Button>
      <AjoutCandidatureDialog {...props} open={ouvert} onOpenChange={setOuvert} />
    </>
  );
}
