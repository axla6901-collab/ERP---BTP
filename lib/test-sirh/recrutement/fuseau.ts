/**
 * Heure de Paris — déplacé dans le socle (`lib/test-sirh/fuseau.ts`) pour être
 * partagé par tous les domaines ; ré-export conservé pour les imports existants.
 */
export {
  dateHeureParis,
  decalageParisMinutes,
  formatEntretien,
  instantDepuisHeureParis,
} from '../fuseau';
