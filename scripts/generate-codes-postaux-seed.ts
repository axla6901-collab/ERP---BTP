/**
 * Génère le seed SQL du référentiel des codes postaux (`db/seeds/codes_postaux.sql`).
 *
 * Source : « Base officielle des codes postaux » de La Poste, publiée sur
 * data.gouv.fr (jeu `laposte-hexasmal`, Licence Ouverte / Etalab), enrichie des
 * centroïdes de communes via l'API officielle geo.api.gouv.fr (IGN/Etalab).
 *
 * Conforme à l'exigence d'autonomie du projet : open data téléchargé UNE FOIS,
 * transformé en seed SQL versionnable, puis chargé en local. Aucune dépendance
 * réseau au runtime de l'application.
 *
 * Usage :
 *   pnpm db:seed:codes-postaux                 # télécharge tout + enrichissement GPS
 *   pnpm db:seed:codes-postaux -- --source ./laposte_hexasmal.csv
 *   pnpm db:seed:codes-postaux -- --no-geo     # sans coordonnées GPS
 *   pnpm db:seed:codes-postaux -- --limit 200  # échantillon (debug)
 *
 * Le fichier produit s'applique ensuite via le workflow migrations du projet :
 *   docker exec -i erp-btp-postgres psql -U app_migrator -d erpbtp < db/seeds/codes_postaux.sql
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  COLONNES_COPY,
  decoderCsv,
  parseHexasmalCsv,
  versLigneCopy,
  versSeed,
  type CodePostalSeed,
} from '@/lib/geo/codes-postaux-format';

const URL_LAPOSTE = 'https://datanova.laposte.fr/data-fair/api/v1/datasets/laposte-hexasmal/raw';
const URL_CENTROIDES =
  'https://geo.api.gouv.fr/communes?fields=code,centre&format=json&geometry=centre';

// `pnpm db:seed:codes-postaux` s'exécute depuis la racine du projet ; on n'utilise
// pas import.meta.dirname (undefined sous la transpilation CJS de tsx).
const RACINE = process.cwd();
const CACHE_CSV = resolve(RACINE, 'db/seeds/.cache/laposte_hexasmal.csv');
const SORTIE = resolve(RACINE, 'db/seeds/codes_postaux.sql');

type Options = { source: string | null; avecGeo: boolean; limite: number | null; sortie: string };

function lireOptions(): Options {
  const args = process.argv.slice(2);
  const opts: Options = { source: null, avecGeo: true, limite: null, sortie: SORTIE };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--source') opts.source = args[++i] ?? null;
    else if (a === '--no-geo') opts.avecGeo = false;
    else if (a === '--limit') opts.limite = Number(args[++i]);
    else if (a === '--out') opts.sortie = resolve(process.cwd(), args[++i] ?? SORTIE);
  }
  return opts;
}

/** Récupère le CSV La Poste : --source explicite, sinon cache local, sinon téléchargement. */
async function chargerCsv(source: string | null): Promise<string> {
  if (source) {
    console.log(`Lecture du CSV fourni : ${source}`);
    return decoderCsv(readFileSync(resolve(process.cwd(), source)));
  }
  if (existsSync(CACHE_CSV)) {
    console.log(`Lecture du CSV en cache : ${CACHE_CSV}`);
    return decoderCsv(readFileSync(CACHE_CSV));
  }
  console.log(`Téléchargement du CSV officiel La Poste…\n  ${URL_LAPOSTE}`);
  const reponse = await fetch(URL_LAPOSTE);
  if (!reponse.ok) throw new Error(`Téléchargement La Poste échoué : HTTP ${reponse.status}`);
  // Octets bruts mis en cache tels quels (fichier La Poste en Latin‑1) ;
  // le décodage est fait par decoderCsv, en lecture comme en téléchargement.
  const octets = Buffer.from(await reponse.arrayBuffer());
  mkdirSync(dirname(CACHE_CSV), { recursive: true });
  writeFileSync(CACHE_CSV, octets);
  console.log(`  → mis en cache (${(octets.length / 1_000_000).toFixed(1)} Mo)`);
  return decoderCsv(octets);
}

/** Récupère les centroïdes de communes (code INSEE → lat/long) via geo.api.gouv.fr. */
async function chargerCentroides(): Promise<Map<string, { latitude: number; longitude: number }>> {
  const map = new Map<string, { latitude: number; longitude: number }>();
  console.log(`Téléchargement des centroïdes de communes…\n  ${URL_CENTROIDES}`);
  const reponse = await fetch(URL_CENTROIDES);
  if (!reponse.ok)
    throw new Error(`Téléchargement geo.api.gouv.fr échoué : HTTP ${reponse.status}`);
  const communes = (await reponse.json()) as Array<{
    code: string;
    centre?: { coordinates?: [number, number] };
  }>;
  for (const c of communes) {
    const coords = c.centre?.coordinates;
    if (!coords) continue;
    const [lon, lat] = coords;
    map.set(c.code, {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
    });
  }
  console.log(`  → ${map.size} communes géolocalisées`);
  return map;
}

function construireSql(seeds: CodePostalSeed[]): string {
  const lignes = seeds.map(versLigneCopy);
  return [
    '-- db/seeds/codes_postaux.sql',
    '-- AUTO-GÉNÉRÉ par scripts/generate-codes-postaux-seed.ts — NE PAS ÉDITER À LA MAIN.',
    '-- Source : Base officielle des codes postaux (La Poste, data.gouv.fr, Licence Ouverte)',
    '-- enrichie des centroïdes de communes (geo.api.gouv.fr / IGN).',
    `-- ${seeds.length} lignes.`,
    '',
    'BEGIN;',
    '',
    'TRUNCATE TABLE codes_postaux;',
    '',
    `COPY codes_postaux (${COLONNES_COPY.join(', ')}) FROM stdin;`,
    ...lignes,
    '\\.',
    '',
    'COMMIT;',
    '',
  ].join('\n');
}

async function main() {
  const opts = lireOptions();

  const csv = await chargerCsv(opts.source);
  let lignes = parseHexasmalCsv(csv);
  console.log(`CSV parsé : ${lignes.length} lignes.`);
  if (opts.limite && opts.limite > 0) lignes = lignes.slice(0, opts.limite);

  let centroides = new Map<string, { latitude: number; longitude: number }>();
  if (opts.avecGeo) {
    try {
      centroides = await chargerCentroides();
    } catch (err) {
      console.warn(
        `⚠️  Enrichissement GPS ignoré (${(err as Error).message}). ` +
          'Les colonnes latitude/longitude resteront NULL.',
      );
    }
  }

  // Déduplication sur la clé unique (code_postal, code INSEE, ligne 5).
  const vues = new Set<string>();
  const seeds: CodePostalSeed[] = [];
  for (const ligne of lignes) {
    const cle = `${ligne.codePostal}|${ligne.codeCommuneInsee}|${ligne.ligne5 ?? ''}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    seeds.push(versSeed(ligne, centroides.get(ligne.codeCommuneInsee)));
  }

  const avecCoords = seeds.filter((s) => s.latitude !== null).length;
  const sql = construireSql(seeds);
  mkdirSync(dirname(opts.sortie), { recursive: true });
  writeFileSync(opts.sortie, sql, 'utf8');

  console.log(
    `\n✅ Seed écrit : ${opts.sortie}\n` +
      `   ${seeds.length} communes/codes postaux, dont ${avecCoords} géolocalisées.\n\n` +
      'Application en base :\n' +
      `   docker exec -i erp-btp-postgres psql -U app_migrator -d erpbtp < db/seeds/codes_postaux.sql`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
