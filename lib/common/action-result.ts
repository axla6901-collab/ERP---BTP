/**
 * Type de retour standard des Server Actions du projet.
 *
 * Convention : toute Server Action mutante retourne un `ActionResult<T>` au
 * lieu de jeter, pour permettre une gestion d'erreur côté client uniforme
 * (toast, mise en évidence des champs en erreur, etc.).
 *
 * @example
 * export async function creerClient(input: ClientInput): Promise<ActionResult<{ id: string }>> {
 *   const parsed = clientSchema.safeParse(input);
 *   if (!parsed.success) {
 *     return { ok: false, error: 'Données invalides.', fieldErrors: parsed.error.flatten().fieldErrors };
 *   }
 *   // ...
 *   return { ok: true, data: { id } };
 * }
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };
