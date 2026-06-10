'use client';

import { useForm } from 'react-hook-form';

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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import {
  compteProrataParticipantSchema,
  type CompteProrataParticipantInput,
} from '@/lib/validation/compte-prorata';

type SousTraitantOption = { id: string; code: string; nom: string };

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: unknown;
};

type Props = {
  compteProrataId: string;
  sousTraitants: SousTraitantOption[];
  defaultValues?: Partial<CompteProrataParticipantInput> | undefined;
  onSubmit: (values: CompteProrataParticipantInput) => Promise<ServerActionResult>;
  onCancel?: () => void;
  submitLabel?: string;
};

export function ParticipantForm({
  compteProrataId,
  sousTraitants,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Ajouter',
}: Props) {
  const form = useForm<CompteProrataParticipantInput>({
    resolver: typedZodResolver(compteProrataParticipantSchema),
    defaultValues: {
      id: defaultValues?.id,
      compteProrataId,
      sousTraitantId: defaultValues?.sousTraitantId ?? null,
      libelle: defaultValues?.libelle ?? '',
      montantMarcheHt: defaultValues?.montantMarcheHt ?? 0,
      quotePartPctManuel: defaultValues?.quotePartPctManuel ?? null,
      estGestionnaire: defaultValues?.estGestionnaire ?? false,
      notes: defaultValues?.notes ?? null,
    } as CompteProrataParticipantInput,
  });

  async function handle(values: CompteProrataParticipantInput) {
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

  const libelleSt = (id: string | null) =>
    id ? (sousTraitants.find((s) => s.id === id)?.nom ?? '—') : 'Lot « maison » / libre';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handle)} className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="sousTraitantId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sous-traitant (optionnel)</FormLabel>
                <Select
                  value={field.value ?? ''}
                  onValueChange={(v) => {
                    if (v === '__none__') {
                      field.onChange(null);
                      return;
                    }
                    field.onChange(v);
                    // Pré-remplit le libellé avec le nom du ST si vide.
                    const st = sousTraitants.find((s) => s.id === v);
                    if (st && !form.getValues('libelle')?.trim()) {
                      form.setValue('libelle', st.nom);
                    }
                  }}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue>{(v) => libelleSt((v as string) || null)}</SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="__none__">Lot « maison » / libre</SelectItem>
                    {sousTraitants.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nom}
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
            name="libelle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Libellé du lot</FormLabel>
                <FormControl>
                  <Input placeholder="Lot gros œuvre" maxLength={200} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="montantMarcheHt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Montant de marché HT (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    {...field}
                    value={field.value ?? 0}
                  />
                </FormControl>
                <FormDescription>Base du prorata si aucune quote-part manuelle.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="quotePartPctManuel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quote-part manuelle (%)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    inputMode="decimal"
                    placeholder="Auto"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormDescription>Laisser vide pour répartir au prorata du marché.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="estGestionnaire"
          render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">Gestionnaire / pilote du compte</FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />

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
