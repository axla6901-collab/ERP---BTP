import {
  BadgeCheckIcon,
  BriefcaseIcon,
  CalendarOffIcon,
  ClipboardCheckIcon,
  ClockIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  HardHatIcon,
  ListChecksIcon,
  MegaphoneIcon,
  NetworkIcon,
  ReceiptIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from 'lucide-react';
import Link from 'next/link';

import type { Role } from '@/lib/auth/rbac';
import {
  ROLES_SIRH_LECTURE,
  ROLES_SIRH_PAIE,
  ROLES_SIRH_VALIDATION,
} from '@/lib/test-sirh/permissions';

type Tuile = {
  href: string;
  titre: string;
  description: string;
  icone: React.ComponentType<{ className?: string }>;
  /** Rôles autorisés ; absent = tous les rôles. */
  roles?: readonly Role[];
};

/**
 * Rubriques du module Test SIRH (miroir des sous-menus de la sidebar), avec
 * le namespace Factorial dont chacune reprend le périmètre fonctionnel.
 */
export const TUILES_SIRH: readonly Tuile[] = [
  {
    href: '/mon-espace',
    titre: 'Mon espace',
    description: 'Mes compteurs, demandes d’absence, notes de frais, tâches et documents.',
    icone: UserIcon,
  },
  {
    href: '/validations',
    titre: 'Validations',
    description: 'Absences, heures supplémentaires et notes de frais à approuver.',
    icone: BadgeCheckIcon,
    roles: ROLES_SIRH_VALIDATION,
  },
  {
    href: '/collaborateurs',
    titre: 'Collaborateurs',
    description: 'Dossiers, contrats, registre unique du personnel.',
    icone: UsersIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/organisation',
    titre: 'Organisation',
    description: 'Sites, équipes et catalogue des postes.',
    icone: NetworkIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/absences',
    titre: 'Absences',
    description: 'Demandes, calendrier d’équipe, compteurs, jours fériés.',
    icone: CalendarOffIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/temps',
    titre: 'Temps de travail',
    description: 'Badgeages, heures supplémentaires, horaires.',
    icone: ClockIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/paie',
    titre: 'Paie',
    description: 'Périodes, variables de paie, export vers le logiciel de paie.',
    icone: WalletIcon,
    roles: ROLES_SIRH_PAIE,
  },
  {
    href: '/notes-frais',
    titre: 'Notes de frais',
    description: 'Dépenses, indemnités kilométriques, forfaits chantier.',
    icone: ReceiptIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/recrutement',
    titre: 'Recrutement',
    description: 'Offres, pipeline de candidatures, vivier de candidats.',
    icone: BriefcaseIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/entretiens',
    titre: 'Entretiens',
    description: 'Campagnes, comptes rendus, objectifs, suivi légal.',
    icone: ClipboardCheckIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/formation',
    titre: 'Formation',
    description: 'Catalogue, sessions, habilitations et recyclages.',
    icone: GraduationCapIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/onboarding',
    titre: 'Onboarding & tâches',
    description: 'Parcours d’arrivée et de départ, tâches RH.',
    icone: ListChecksIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/materiel',
    titre: 'Matériel & EPI',
    description: 'Dotations, EPI, outillage, contrôles périodiques.',
    icone: HardHatIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/documents',
    titre: 'Documents',
    description: 'GED RH : dossiers, pièces salariés, documents d’entreprise.',
    icone: FolderOpenIcon,
    roles: ROLES_SIRH_LECTURE,
  },
  {
    href: '/annonces',
    titre: 'Annonces',
    description: 'Communication interne, consignes de sécurité.',
    icone: MegaphoneIcon,
  },
];

/** Grille de tuiles d'accès aux rubriques visibles pour le rôle. */
export function TuilesModules({ base, role }: { base: string; role: Role }) {
  const visibles = TUILES_SIRH.filter((t) => !t.roles || t.roles.includes(role));
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {visibles.map(({ href, titre, description, icone: Icone }) => (
        <Link
          key={href}
          href={`${base}${href}`}
          className="group flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/40"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 group-hover:bg-amber-200">
            <Icone className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-medium">{titre}</span>
            <span className="block text-xs text-muted-foreground">{description}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
