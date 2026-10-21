'use client';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { AttributionLigne } from '@/lib/test-sirh/materiel/queries';

export type MaterielAvecHistorique = {
  id: string;
  libelle: string;
  numeroSerie: string | null;
  historique: AttributionLigne[];
};

/** Historique des remises / retours d'un matériel (traçabilité des dotations EPI). */
export function HistoriqueMaterielDialog({
  materiel,
  onClose,
}: {
  /** `null` = modale fermée. */
  materiel: MaterielAvecHistorique | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={materiel !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Historique des attributions</DialogTitle>
          {materiel && (
            <DialogDescription>
              {materiel.libelle}
              {materiel.numeroSerie && ` · n° ${materiel.numeroSerie}`}
            </DialogDescription>
          )}
        </DialogHeader>
        {materiel && materiel.historique.length === 0 ? (
          <SirhVide>Ce matériel n’a jamais été attribué.</SirhVide>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Collaborateur</th>
                  <th className="px-4 py-2 font-medium">Remise</th>
                  <th className="px-4 py-2 font-medium">Retour</th>
                  <th className="px-4 py-2 font-medium">Décharge</th>
                  <th className="px-4 py-2 font-medium">Commentaire</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {materiel?.historique.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium">{a.employeNom}</td>
                    <td className="px-4 py-2">
                      <span className="tabular-nums">{formatDateFr(a.dateRemise)}</span>
                      {a.etatRemise && (
                        <span className="block text-xs text-muted-foreground">{a.etatRemise}</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {a.dateRetour ? (
                        <>
                          <span className="tabular-nums">{formatDateFr(a.dateRetour)}</span>
                          {a.etatRetour && (
                            <span className="block text-xs text-muted-foreground">
                              {a.etatRetour}
                            </span>
                          )}
                        </>
                      ) : (
                        <Badge tone="emerald">En cours</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {a.dechargeSignee ? (
                        <Badge tone="emerald" shape="pill">
                          Signée
                        </Badge>
                      ) : (
                        <Badge tone="amber" shape="pill">
                          Non signée
                        </Badge>
                      )}
                    </td>
                    <td className="whitespace-pre-line px-4 py-2 text-xs text-muted-foreground">
                      {a.commentaire ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
