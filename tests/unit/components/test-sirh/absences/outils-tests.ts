import { createElement, type ChangeEvent } from 'react';

import type { OptionListe } from '@/components/test-sirh/option-select';

/**
 * Outils partagés des tests de composants du domaine Absences (fichier non
 * exécuté par Vitest : pas de suffixe `.test`).
 */

/** Polyfills des API navigateur absentes de jsdom et utilisées par Base UI. */
export function installerPolyfillsJsdom(): void {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  if (!('PointerEvent' in window)) {
    // Le Switch Base UI construit un PointerEvent au clic.
    (window as unknown as { PointerEvent: unknown }).PointerEvent = class extends MouseEvent {};
    (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = (
      window as unknown as { PointerEvent: unknown }
    ).PointerEvent;
  }
}

type PropsSelect = {
  options: readonly OptionListe[];
  value: string | null;
  onChange: (value: string | null) => void;
  autoriserAucune?: boolean;
  libelleAucune?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

/**
 * Remplace `OptionSelect` (Select Base UI, peu manipulable sous jsdom) par un
 * `<select>` natif de même contrat : `fireEvent.change` suffit à choisir.
 */
export function OptionSelectNatif(props: PropsSelect) {
  const avecAucune = props.autoriserAucune !== false;
  return createElement(
    'select',
    {
      id: props.id,
      'aria-label': props['aria-label'],
      disabled: props.disabled,
      value: props.value ?? '',
      onChange: (e: ChangeEvent<HTMLSelectElement>) => props.onChange(e.target.value || null),
    },
    avecAucune ? createElement('option', { value: '' }, props.libelleAucune ?? '—') : null,
    ...props.options.map((o) => createElement('option', { key: o.id, value: o.id }, o.label)),
  );
}
