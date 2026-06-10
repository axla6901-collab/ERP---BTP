/**
 * Types partagés des Server Actions du module Facturation.
 *
 * Le type `ActionResult<T>` est désormais centralisé dans
 * `@/lib/common/action-result`. Ce fichier reste comme alias rétrocompatible
 * pour les imports existants dans le module.
 */

export type { ActionResult } from '@/lib/common/action-result';
