'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';

import { useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormSection } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { prixArticleSchema, type PrixArticleInput } from '@/lib/validation/catalogue';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string } | void;
};

type FournisseurOption = { id: string; code: string; nom: string };
type UniteOption = { id: string; code: string; symbole: string };

type Props = {
  defaultUniteId: string;
  unites: UniteOption[];
  fournisseurs: FournisseurOption[];
  onSubmit: (values: PrixArticleInput) => Promise<ServerActionResult>;
  onSuccess?: () => void;
};

const TODAY = () => new Date().toISOString().slice(0, 10);

export function PrixForm({ defaultUniteId, unites, fournisseurs, onSubmit, onSuccess }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(prixArticleSchema),
    defaultValues: {
      prixUnitaireHt: '0',
      uniteId: defaultUniteId,
      fournisseurId: null,
      referenceFournisseur: '',
      quantiteMin: null,
      validFrom: TODAY(),
      validTo: null,
      notes: '',
    },
  });
  useUnsavedChangesGuard({ isDirty: form.formState.isDirty });

  async function handleSubmit(values: PrixArticleInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onSubmit(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error ?? 'Enregistrement impossible.');
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success('Prix enregistré');
    form.reset({
      prixUnitaireHt: '0',
      uniteId: defaultUniteId,
      fournisseurId: null,
      referenceFournisseur: '',
      quantiteMin: null,
      validFrom: TODAY(),
      validTo: null,
      notes: '',
    });
    router.refresh();
    onSuccess?.();
  }

  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(handleSubmit)}
        className="grid max-w-3xl gap-4"
      >
        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}
        <FormSection number={1} title="Fournisseur" storageKey="prix:fournisseur">
          <FormField
            control={form.control}
            name="fournisseurId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fournisseur</FormLabel>
                <Select
                  value={field.value ?? '__ref__'}
                  onValueChange={(v) => field.onChange(v === '__ref__' ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Référence générique">
                        {(value) => {
                          if (!value || value === '__ref__') return 'Référence générique';
                          const f = fournisseurs.find((x) => x.id === value);
                          return f ? `${f.code} — ${f.nom}` : String(value);
                        }}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__ref__">Référence générique (catalogue interne)</SelectItem>
                    {fournisseurs.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.code} — {f.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Laisser « Référence générique » pour un prix non négocié avec un fournisseur
                  précis.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="referenceFournisseur"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Référence catalogue fournisseur (optionnel)</FormLabel>
                <FormControl>
                  <Input maxLength={100} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormDescription>
                  Code article chez le fournisseur (ex: SABLE-FIN-25KG).
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <FormSection number={2} title="Tarif" storageKey="prix:tarif">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              control={form.control}
              name="prixUnitaireHt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prix HT (€)</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="uniteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pour 1 unité</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Unité">
                          {(value) => {
                            const u = unites.find((x) => x.id === value);
                            return u ? `${u.code} (${u.symbole})` : 'Unité';
                          }}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {unites.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.code} ({u.symbole})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantiteMin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantité min (optionnel)</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="palier de remise"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>
        <FormSection number={3} title="Validité" storageKey="prix:validite">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="validFrom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valide à partir du</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="validTo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valide jusqu&apos;au (optionnel)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormDescription>Laisser vide = en cours.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>
        <FormSection number={4} title="Notes" storageKey="prix:notes">
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (optionnel)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer le prix'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
