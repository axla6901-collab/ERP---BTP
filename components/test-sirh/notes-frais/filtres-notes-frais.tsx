'use client';

import { useRouter } from 'next/navigation';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { urlNotesFrais, type FiltresNotesFrais } from '@/lib/test-sirh/notes-frais/calculs';

/**
 * Filtres « collaborateur » et « mois » de la liste des notes de frais,
 * pilotés par l'URL (le filtre de statut reste celui des pastilles).
 */
export function FiltresNotesFraisBarre({
  base,
  filtres,
  employes,
}: {
  /** URL de la page (`/<slug>/test-sirh/notes-frais`). */
  base: string;
  filtres: FiltresNotesFrais;
  employes: readonly OptionListe[];
}) {
  const router = useRouter();

  function aller(changement: Partial<FiltresNotesFrais>) {
    router.push(urlNotesFrais(base, { ...filtres, ...changement }));
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
      <div className="grid w-full gap-1 sm:w-72">
        <Label className="text-xs text-muted-foreground">Collaborateur</Label>
        <OptionSelect
          options={employes}
          value={filtres.employeId}
          onChange={(v) => aller({ employeId: v })}
          libelleAucune="Tous les collaborateurs"
          aria-label="Filtrer par collaborateur"
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="filtre-mois-frais" className="text-xs text-muted-foreground">
          Mois de la dépense
        </Label>
        <Input
          id="filtre-mois-frais"
          type="month"
          className="w-44"
          value={filtres.mois ?? ''}
          onChange={(e) => aller({ mois: e.target.value || null })}
        />
      </div>
      {(filtres.employeId || filtres.mois) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => aller({ employeId: null, mois: null })}
        >
          Effacer les filtres
        </Button>
      )}
    </div>
  );
}
