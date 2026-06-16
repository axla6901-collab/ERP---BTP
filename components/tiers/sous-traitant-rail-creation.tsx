import { cn } from '@/lib/utils';

/**
 * Rail contextuel (zone D) de la fiche sous-traitant en CRÉATION — mêmes cartes
 * que la fiche existante (`SousTraitantRail`), mais à l'état « disponible après
 * enregistrement » : la synthèse de conformité, la cascade, les contacts et les
 * pièces dérivent toutes de données qui n'existent pas encore. Préserve la
 * structure 8/12 + 4/12 du gabarit (`maquettes/gabarit-sous-traitant.html`) et
 * évite le vide à droite. Composant présentational, lecture seule.
 */

function CarteVide({
  titre,
  chip,
  accent = false,
  children,
}: {
  titre: string;
  chip?: React.ReactNode;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl ring-1',
        accent ? 'bg-amber-50 ring-amber-200' : 'bg-card ring-foreground/10',
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h3 className="font-heading font-semibold text-orange-700">{titre}</h3>
        {chip}
      </div>
      <div
        className={cn(
          'border-t px-4 py-3 text-sm',
          accent ? 'text-amber-800/80' : 'text-muted-foreground',
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function SousTraitantRailCreation() {
  return (
    <div className="space-y-5">
      <CarteVide
        titre="Synthèse de conformité"
        accent
        chip={
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-300">
            loi 75-1334
          </span>
        }
      >
        Disponible après enregistrement : la conformité se calcule à partir des pièces téléversées
        (décennale, attestation URSSAF, agrément DC4) et des qualifications.
      </CarteVide>

      <CarteVide
        titre="Cascade & retenue de garantie"
        chip={
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-medium text-orange-800 ring-1 ring-orange-300">
            cascade
          </span>
        }
      >
        Le rang de cascade et la retenue de garantie par défaut s’afficheront une fois le
        sous-traitant créé.
      </CarteVide>

      <CarteVide titre="Contacts">
        Ajoutez des interlocuteurs après l’enregistrement, via la frame contacts.
      </CarteVide>

      <CarteVide titre="Vigilance & pièces">
        Téléversez les pièces administratives (loi 75-1334) une fois le sous-traitant créé : elles
        alimenteront la synthèse de conformité.
      </CarteVide>
    </div>
  );
}
