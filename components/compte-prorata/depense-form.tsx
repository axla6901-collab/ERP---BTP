'use client';

import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  compteProrataDepenseSchema,
  type CompteProrataDepenseInput,
} from '@/lib/validation/compte-prorata';

/** Catégories usuelles de dépenses communes (NF P03-001). Free-text autorisé via "Autre". */
export const CATEGORIES_DEPENSE_COMMUNE = [
  'Nettoyage',
  'Gardiennage',
  'Électricité',
  'Eau',
  'Base-vie / sanitaires',
  'Benne / évacuation',
  'Grue / levage',
  'Clôture / signalisation',
  'Divers',
] as const;

type ParticipantOption = { id: string; libelle: string };

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: unknown;
};

type Props = {
  compteProrataId: string;
  participants: ParticipantOption[];
  /** Date du jour (ISO) calculée côté serveur, pour le défaut sans décalage d'hydratation. */
  today: string;
  defaultValues?: Partial<CompteProrataDepenseInput> | undefined;
  onSubmit: (values: CompteProrataDepenseInput) => Promise<ServerActionResult>;
  onCancel?: () => void;
  submitLabel?: string;
};

export function DepenseForm({
  compteProrataId,
  participants,
  today,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Ajouter',
}: Props) {
  const form = useForm<CompteProrataDepenseInput>({
    resolver: typedZodResolver(compteProrataDepenseSchema),
    defaultValues: {
      id: defaultValues?.id,
      compteProrataId,
      avanceParParticipantId: defaultValues?.avanceParParticipantId ?? participants[0]?.id ?? '',
      dateDepense: defaultValues?.dateDepense ?? today,
      libelle: defaultValues?.libelle ?? '',
      categorie: defaultValues?.categorie ?? null,
      montantHt: defaultValues?.montantHt ?? ('' as unknown as number),
      notes: defaultValues?.notes ?? null,
    } as CompteProrataDepenseInput,
  });

  async function handle(values: CompteProrataDepenseInput) {
    const r = await onSubmit(values);
    if (!r.ok) {
      if (r.fieldErrors) {
        for (const [field, msgs] of Object.entries(r.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      if (r.error) form.setError('libelle', { type: 'server', message: r.error });
      return;
    }
    form.reset();
  }

  const libelleParticipant = (id: string) =>
    participants.find((p) => p.id === id)?.libelle ?? 'Choisir…';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handle)} className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="libelle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Libellé</FormLabel>
                <FormControl>
                  <Input placeholder="Location benne à gravats" maxLength={200} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="categorie"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Catégorie</FormLabel>
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>{(v) => (v as string) || 'Non catégorisé'}</SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">Non catégorisé</SelectItem>
                    {CATEGORIES_DEPENSE_COMMUNE.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
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
            name="montantHt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Montant HT (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
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
            name="dateDepense"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="avanceParParticipantId"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Avancée par</FormLabel>
                <Select value={field.value || ''} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>{(v) => libelleParticipant(v as string)}</SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {participants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
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
                <Textarea rows={2} {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={form.formState.isSubmitting}
            >
              Annuler
            </Button>
          )}
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Enregistrement…' : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
