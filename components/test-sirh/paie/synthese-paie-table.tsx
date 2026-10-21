import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { formatEuro, formatHeures, formatNombre } from '@/lib/test-sirh/format';
import type { LigneSynthese } from '@/lib/test-sirh/paie/synthese';

const tiret = <span className="text-muted-foreground">—</span>;

function heures(n: number) {
  return n > 0 ? formatHeures(n) : tiret;
}

function euros(n: number) {
  return n !== 0 ? formatEuro(n) : tiret;
}

/**
 * Synthèse de la préparation de paie par collaborateur : absences par type,
 * heures sup. 25 % / 50 % / autres, primes et indemnités, frais. Server-compatible.
 */
export function SynthesePaieTable({ lignes }: { lignes: readonly LigneSynthese[] }) {
  if (lignes.length === 0) {
    return <SirhVide>Aucune variable : la synthèse apparaîtra après saisie ou import.</SirhVide>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Collaborateur</th>
            <th className="px-4 py-2 font-medium">Absences</th>
            <th className="px-4 py-2 text-right font-medium">HS 25 %</th>
            <th className="px-4 py-2 text-right font-medium">HS 50 %</th>
            <th className="px-4 py-2 text-right font-medium">HS autres</th>
            <th className="px-4 py-2 text-right font-medium">Primes</th>
            <th className="px-4 py-2 text-right font-medium">Frais</th>
            <th className="px-4 py-2 text-right font-medium">Autres</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {lignes.map((l) => (
            <tr key={l.employe.id}>
              <td className="px-4 py-2">
                <span className="font-medium">{`${l.employe.nom} ${l.employe.prenom}`.trim()}</span>
                {l.employe.matricule && (
                  <span className="ml-2 text-xs text-muted-foreground">{l.employe.matricule}</span>
                )}
              </td>
              <td className="px-4 py-2">
                {l.absences.length === 0 ? (
                  tiret
                ) : (
                  <ul className="space-y-0.5 text-xs">
                    {l.absences.map((a) => (
                      <li key={a.libelle}>
                        {a.libelle} :{' '}
                        <span className="font-medium tabular-nums">{formatNombre(a.quantite)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{heures(l.heuresSup25)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{heures(l.heuresSup50)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{heures(l.heuresSupAutres)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{euros(l.primes)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{euros(l.frais)}</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {l.nbAutres > 0 ? formatNombre(l.nbAutres) : tiret}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
