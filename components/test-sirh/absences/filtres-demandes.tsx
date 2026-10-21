'use client';

import { useRouter } from 'next/navigation';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { hrefDemandes, type FiltresDemandes } from '@/lib/test-sirh/absences/filtres';
import { estDateIso } from '@/lib/test-sirh/calendrier';

type Props = {
  /** `/<slug>/test-sirh/absences`. */
  base: string;
  filtres: FiltresDemandes;
  employes: readonly OptionListe[];
};

/** Filtres employé / période de la liste des demandes (navigation par l'URL). */
export function FiltresDemandesAbsence({ base, filtres, employes }: Props) {
  const router = useRouter();
  const naviguer = (f: FiltresDemandes) => router.push(hrefDemandes(base, f));
  const actifs = Boolean(filtres.employeId || filtres.du || filtres.au);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid w-full gap-1 sm:w-64">
        <Label htmlFor="filtre-employe" className="text-xs text-muted-foreground">
          Collaborateur
        </Label>
        <OptionSelect
          id="filtre-employe"
          options={employes}
          value={filtres.employeId}
          onChange={(v) => naviguer({ ...filtres, employeId: v })}
          libelleAucune="Tous les collaborateurs"
          aria-label="Filtrer par collaborateur"
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="filtre-du" className="text-xs text-muted-foreground">
          Du
        </Label>
        <Input
          id="filtre-du"
          type="date"
          className="w-40"
          value={filtres.du ?? ''}
          onChange={(e) =>
            naviguer({ ...filtres, du: estDateIso(e.target.value) ? e.target.value : null })
          }
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="filtre-au" className="text-xs text-muted-foreground">
          Au
        </Label>
        <Input
          id="filtre-au"
          type="date"
          className="w-40"
          value={filtres.au ?? ''}
          onChange={(e) =>
            naviguer({ ...filtres, au: estDateIso(e.target.value) ? e.target.value : null })
          }
        />
      </div>
      {actifs && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => naviguer({ statut: filtres.statut, employeId: null, du: null, au: null })}
        >
          Réinitialiser
        </Button>
      )}
    </div>
  );
}
