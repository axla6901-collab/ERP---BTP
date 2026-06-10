import 'server-only';

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize l'HTML produit par Tiptap avant insertion en base.
 *
 * Liste blanche pensée pour les Conditions Générales (texte mis en forme) :
 * - structure : p, br, h1-h4, ul/ol/li, blockquote, hr
 * - inline : strong, em, u, s, code, span
 * - liens : a (href http(s)/mailto/tel), avec rel forcé
 *
 * Refuse JS, événements inline, balises de média ou de structure HTML lourde.
 * `iframe`, `script`, `style`, `object`, `embed` sont retirés par défaut.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'span',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
];

const ALLOWED_ATTR = ['href', 'target', 'rel', 'class', 'data-color'];

export function sanitizeConditionsHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
    // Force rel=noopener noreferrer sur les liens externes
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
  });
}
