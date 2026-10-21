/**
 * Helpers PURS de construction des listes d'options des sélecteurs du dossier
 * collaborateur (importables côté client comme serveur).
 */

export type OptionSimple = { id: string; label: string };

/**
 * Garantit que la valeur courante figure dans les options : les référentiels ne
 * renvoient que les éléments ACTIFS, or une affectation peut pointer vers un
 * site / poste / horaire désactivé depuis. Sans cela le sélecteur afficherait
 * « — » tout en conservant l'identifiant.
 */
export function garantirOption(
  options: readonly OptionSimple[],
  id: string | null | undefined,
  label: string | null | undefined,
  suffixe = ' (inactif)',
): OptionSimple[] {
  const liste = options.map((o) => ({ id: o.id, label: o.label }));
  if (!id || liste.some((o) => o.id === id)) return liste;
  return [...liste, { id, label: `${label ?? 'Élément'}${suffixe}` }];
}

/**
 * Options d'employés pour un sélecteur de personne (manager, responsable…) :
 * employés actifs, plus la valeur courante si elle est inactive (« (sorti) »),
 * en excluant éventuellement un employé (soi-même).
 */
export function optionsEmployes(
  employes: ReadonlyArray<OptionSimple & { actif: boolean }>,
  opts: { valeurCourante?: string | null; exclure?: string | null } = {},
): OptionSimple[] {
  return employes
    .filter((e) => e.id !== opts.exclure)
    .filter((e) => e.actif || e.id === opts.valeurCourante)
    .map((e) => ({ id: e.id, label: e.actif ? e.label : `${e.label} (sorti)` }));
}
