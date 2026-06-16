import { StatutVehiculeBadge } from '@/components/flotte/statut-vehicule-badge';
import {
  joursAvantEcheance,
  niveauUrgenceEcheance,
  statutEcheance,
  type NiveauUrgence,
} from '@/lib/flotte/echeances';
import { formatDateFr, formatEuro, formatJours, formatNombre } from '@/lib/flotte/format';
import {
  LIBELLES_MODE_DETENTION,
  LIBELLES_TYPE_ECHEANCE,
  type ModeDetention,
  type StatutVehicule,
  type TypeEcheance,
} from '@/lib/validation/flotte';

type EcheanceLite = {
  id: string;
  typeEcheance: TypeEcheance;
  dateEcheance: string;
  seuilAlerteJours: number;
};

type Synthese = {
  coutEntretiens: number;
  sinistresOuverts: number;
  electrique: boolean;
  consoMoyenneLitres100: number | null;
  consoMoyenneKwh100: number | null;
};

type Props = {
  today: string;
  statut: StatutVehicule;
  kilometrageActuel: number;
  modeDetention: ModeDetention;
  loyerMensuelHt: string | null;
  echeances: EcheanceLite[];
  affectation: { employe: string | null; chantier: string | null; dateDebut: string } | null;
  synthese?: Synthese;
};

const DOT: Record<'expire' | 'a_renouveler' | 'a_jour', string> = {
  expire: 'bg-rose-500',
  a_renouveler: 'bg-amber-500',
  a_jour: 'bg-emerald-500',
};

const CARTE_URGENCE: Record<NiveauUrgence, string> = {
  critique: 'bg-rose-50 ring-rose-200 dark:bg-rose-950/20 dark:ring-rose-900/50',
  proche: 'bg-amber-50 ring-amber-200 dark:bg-amber-950/20 dark:ring-amber-900/50',
  ok: 'bg-card ring-black/10',
};

const TITRE_URGENCE: Record<NiveauUrgence, string> = {
  critique: 'text-rose-700 dark:text-rose-300',
  proche: 'text-amber-800 dark:text-amber-300',
  ok: 'text-orange-700',
};

function Carte({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`overflow-hidden rounded-xl ring-1 ${className ?? 'bg-card ring-black/10'}`}
    >
      {children}
    </section>
  );
}

/** Rail contextuel de la fiche véhicule (zone D) : prochaine échéance, statut, affectation, échéances. */
export function VehiculeRail({
  today,
  statut,
  kilometrageActuel,
  modeDetention,
  loyerMensuelHt,
  echeances,
  affectation,
  synthese,
}: Props) {
  // Prochaine échéance = la plus proche dans le temps.
  const triees = [...echeances].sort((a, b) => a.dateEcheance.localeCompare(b.dateEcheance));
  const prochaine = triees[0] ?? null;
  const niveau: NiveauUrgence = prochaine
    ? niveauUrgenceEcheance(prochaine.dateEcheance, prochaine.seuilAlerteJours, today)
    : 'ok';

  return (
    <>
      {/* Carte mise en avant : prochaine échéance */}
      <Carte className={`${CARTE_URGENCE[niveau]}`}>
        <div className="px-4 pb-1 pt-3">
          <h3 className={`font-semibold ${TITRE_URGENCE[niveau]}`}>Prochaine échéance</h3>
        </div>
        <div className="px-4 pb-3 pt-1">
          {prochaine ? (
            <>
              <div className={`text-xl font-semibold ${TITRE_URGENCE[niveau]}`}>
                {LIBELLES_TYPE_ECHEANCE[prochaine.typeEcheance]}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateFr(prochaine.dateEcheance)} ·{' '}
                <span className="font-medium">
                  {formatJours(joursAvantEcheance(prochaine.dateEcheance, today))}
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Aucune échéance enregistrée.</p>
          )}
        </div>
      </Carte>

      {/* Statut & disponibilité */}
      <Carte>
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="font-semibold text-orange-700">Statut</h3>
          <StatutVehiculeBadge statut={statut} />
        </div>
        <div className="space-y-2 border-t px-4 py-3 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-2">
            <span>Kilométrage</span>
            <span className="tabular-nums text-foreground">
              {formatNombre(kilometrageActuel)} km
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Détention</span>
            <span className="text-right text-foreground">
              {LIBELLES_MODE_DETENTION[modeDetention]}
              {loyerMensuelHt ? ` · ${formatEuro(loyerMensuelHt)}/mois` : ''}
            </span>
          </div>
        </div>
      </Carte>

      {/* Coûts & consommation */}
      {synthese && (
        <Carte>
          <div className="px-4 py-3">
            <h3 className="font-semibold text-orange-700">Coûts & consommation</h3>
          </div>
          <div className="space-y-2 border-t px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-2">
              <span>Entretiens (cumul)</span>
              <span className="tabular-nums text-foreground">
                {formatEuro(synthese.coutEntretiens)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Consommation moy.</span>
              <span className="tabular-nums text-foreground">
                {synthese.electrique
                  ? synthese.consoMoyenneKwh100 !== null
                    ? `${synthese.consoMoyenneKwh100} kWh/100 km`
                    : '—'
                  : synthese.consoMoyenneLitres100 !== null
                    ? `${synthese.consoMoyenneLitres100} L/100 km`
                    : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Sinistres ouverts</span>
              <span className="tabular-nums text-foreground">{synthese.sinistresOuverts}</span>
            </div>
          </div>
        </Carte>
      )}

      {/* Affectation courante */}
      <Carte>
        <div className="px-4 py-3">
          <h3 className="font-semibold text-orange-700">Affectation courante</h3>
        </div>
        <div className="space-y-2 border-t px-4 py-3 text-sm">
          {affectation ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Conducteur</span>
                <span className="font-medium">{affectation.employe ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Chantier</span>
                <span className="font-medium">{affectation.chantier ?? '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Depuis</span>
                <span className="tabular-nums text-foreground">
                  {formatDateFr(affectation.dateDebut)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Aucune affectation en cours.</p>
          )}
        </div>
      </Carte>

      {/* Échéances pastillées */}
      {echeances.length > 0 && (
        <Carte>
          <div className="px-4 py-3">
            <h3 className="font-semibold text-orange-700">Échéances</h3>
          </div>
          <ul className="space-y-2 border-t px-4 py-3 text-sm">
            {triees.map((e) => {
              const st = statutEcheance(e.dateEcheance, e.seuilAlerteJours, today);
              return (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${DOT[st]}`} />
                    {LIBELLES_TYPE_ECHEANCE[e.typeEcheance]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateFr(e.dateEcheance)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Carte>
      )}
    </>
  );
}
