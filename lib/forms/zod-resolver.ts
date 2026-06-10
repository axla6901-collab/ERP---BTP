import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * Aligne le resolver Zod sur le type de SORTIE du schéma plutôt que sur
 * son entrée. Nécessaire dès qu'un schéma utilise `z.preprocess` /
 * `.transform()` : sans ça, `field.value` est inféré comme `unknown` (puis
 * `{}` à l'usage), parce que zodResolver renvoie `Resolver<z.input<T>, …>`.
 */
export function typedZodResolver<TFieldValues extends FieldValues>(
  schema: ZodType<TFieldValues, unknown>,
): Resolver<TFieldValues> {
  return zodResolver(schema as never) as unknown as Resolver<TFieldValues>;
}
