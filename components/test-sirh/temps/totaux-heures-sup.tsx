import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { formatHeures } from '@/lib/test-sirh/format';
import { libelleMajoration, type TotauxHeuresSup } from '@/lib/test-sirh/temps/heures-sup';

/**
 * Totaux du mois par taux de majoration (demandes approuvées et en attente).
 * Server-compatible.
 */
export function TotauxHeuresSupTable({ totaux }: { totaux: TotauxHeuresSup }) {
  if (totaux.lignes.length === 0) {
    return <SirhVide>Aucune heure supplémentaire approuvée ou en attente ce mois-ci.</SirhVide>;
  }
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Taux</th>
            <th className="px-3 py-2 text-right font-medium">Approuvées</th>
            <th className="px-3 py-2 text-right font-medium">En attente</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {totaux.lignes.map((l) => (
            <tr key={l.majorationPct}>
              <td className="px-3 py-2">
                <span className="font-medium">{libelleMajoration(l.majorationPct)}</span>
                <span className="block text-xs text-muted-foreground">
                  {l.nb} demande{l.nb > 1 ? 's' : ''}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatHeures(l.heuresApprouvees)}
                {l.heuresRecuperees > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    dont {formatHeures(l.heuresRecuperees)} en repos
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {formatHeures(l.heuresEnAttente)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-muted/20">
          <tr>
            <td className="px-3 py-2 font-medium">Total</td>
            <td className="px-3 py-2 text-right font-medium tabular-nums">
              {formatHeures(totaux.total.heuresApprouvees)}
              <span className="block text-xs font-normal text-muted-foreground">
                {formatHeures(totaux.total.heuresPayees)} à payer
              </span>
            </td>
            <td className="px-3 py-2 text-right font-medium tabular-nums">
              {formatHeures(totaux.total.heuresEnAttente)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
