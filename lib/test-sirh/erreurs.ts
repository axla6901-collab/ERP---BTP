/**
 * Traduction des erreurs Postgres en messages FR lisibles — module PUR.
 *
 * Drizzle enveloppe l'erreur postgres-js (`DrizzleQueryError`) : le SQLSTATE
 * est porté par `err.cause.code` (cf. mémoire « unwrap e.cause »). On regarde
 * donc l'erreur puis sa cause.
 */

type AvecCode = { code?: unknown; cause?: unknown; constraint_name?: unknown };

/** SQLSTATE de l'erreur (ou de sa cause), sinon null. */
export function codeErreurPg(err: unknown): string | null {
  let courant: unknown = err;
  for (let i = 0; i < 3 && typeof courant === 'object' && courant !== null; i++) {
    const e = courant as AvecCode;
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
    courant = e.cause;
  }
  return null;
}

/** Nom de la contrainte violée (si exposé par le driver), sinon null. */
export function contrainteErreurPg(err: unknown): string | null {
  let courant: unknown = err;
  for (let i = 0; i < 3 && typeof courant === 'object' && courant !== null; i++) {
    const e = courant as AvecCode;
    if (typeof e.constraint_name === 'string') return e.constraint_name;
    courant = e.cause;
  }
  return null;
}

export type MessagesContraintes = {
  /** 23505 — doublon (index unique). */
  unicite?: string;
  /** 23503 — référence absente ou encore utilisée. */
  reference?: string;
  /** 23514 — contrainte CHECK. */
  controle?: string;
};

/**
 * Message lisible pour une violation de contrainte connue, ou `null` si
 * l'erreur n'en est pas une (l'appelant doit alors la relancer).
 */
export function messageErreurContrainte(
  err: unknown,
  messages: MessagesContraintes = {},
): string | null {
  switch (codeErreurPg(err)) {
    case '23505':
      return messages.unicite ?? 'Un enregistrement identique existe déjà.';
    case '23503':
      return messages.reference ?? 'Élément lié introuvable ou encore utilisé ailleurs.';
    case '23514':
      return messages.controle ?? 'Données incohérentes (contrôle de cohérence refusé).';
    default:
      return null;
  }
}
