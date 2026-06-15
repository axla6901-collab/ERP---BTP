import 'server-only';

import { asc, like } from 'drizzle-orm';

import { codesPostaux } from '@/db/schema/geo';
// `codes_postaux` est un référentiel GLOBAL (sans entreprise_id, sans RLS) :
// `withTenant` n'a pas de sens ici (aucun GUC tenant à poser). Lecture directe
// via `db` assumée et limitée à ce référentiel transverse.
// eslint-disable-next-line no-restricted-imports
import { db } from '@/lib/db/client';

import { normaliserRecherche } from './codes-postaux-format';

/**
 * Recherche dans le référentiel géographique (codes postaux ↔ communes).
 * Table GLOBALE non scopée tenant : aucune ouverture de contexte `withTenant`
 * n'est nécessaire (cf. db/schema/geo.ts).
 */

export type CommuneSuggestion = {
  codePostal: string;
  /** Libellé d'acheminement = ligne « ville » à reporter dans l'adresse. */
  commune: string;
  codeInsee: string;
  departement: string;
  latitude: number | null;
  longitude: number | null;
};

const LIMITE_DEFAUT = 8;
const LIMITE_MAX = 20;

/** Vrai si le terme ressemble à un (début de) code postal. */
function estCodePostal(terme: string): boolean {
  return /^\d{2,5}$/.test(terme);
}

/**
 * Recherche unifiée par préfixe : si le terme est numérique on cherche par code
 * postal, sinon par nom de commune normalisé. Retourne [] sous 2 caractères.
 */
export async function rechercherCommunes(
  terme: string,
  limite = LIMITE_DEFAUT,
): Promise<CommuneSuggestion[]> {
  const q = terme.trim();
  if (q.length < 2) return [];

  const limiteSure = Math.min(Math.max(Math.trunc(limite) || LIMITE_DEFAUT, 1), LIMITE_MAX);

  const condition = estCodePostal(q)
    ? like(codesPostaux.codePostal, `${q}%`)
    : like(codesPostaux.recherche, `${normaliserRecherche(q)}%`);

  const rows = await db
    .select({
      codePostal: codesPostaux.codePostal,
      commune: codesPostaux.libelleAcheminement,
      codeInsee: codesPostaux.codeCommuneInsee,
      departement: codesPostaux.departement,
      latitude: codesPostaux.latitude,
      longitude: codesPostaux.longitude,
    })
    .from(codesPostaux)
    .where(condition)
    .orderBy(asc(codesPostaux.codePostal), asc(codesPostaux.libelleAcheminement))
    .limit(limiteSure);

  // postgres-js renvoie les numeric en string : on reconvertit en number.
  return rows.map((r) => ({
    codePostal: r.codePostal,
    commune: r.commune,
    codeInsee: r.codeInsee,
    departement: r.departement,
    latitude: r.latitude === null ? null : Number(r.latitude),
    longitude: r.longitude === null ? null : Number(r.longitude),
  }));
}
