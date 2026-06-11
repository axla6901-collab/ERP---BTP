'use client';

import {
  BookOpenIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  FolderPlusIcon,
  PackageIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useFieldArray,
  useForm,
  useWatch,
  type FieldErrors,
  type UseFormReturn,
} from 'react-hook-form';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';

import {
  DpgfImportZone,
  type DpgfImportZoneHandle,
} from '@/components/commercial/dpgf-import-dialog';
import { DupliquerDevisDialog } from '@/components/commercial/dupliquer-devis-dialog';
import { PostesInternesEditor } from '@/components/commercial/postes-internes-editor';
import { TotauxDevis } from '@/components/commercial/totaux-devis';
import { WorkflowDevis } from '@/components/commercial/workflow-devis';
import type {
  DpgfAnalyse,
  DpgfImportResult,
  LigneDpgfPreview,
  MappingDpgf,
} from '@/lib/commercial/import-dpgf';
import {
  calculerContributionsLigne,
  calculerPuDepuisComposants,
  calculerTotauxDevis,
} from '@/lib/commercial/calculs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormSection } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  devisSchema,
  type ComposantLigneInput,
  type DevisInput,
  type LigneDevisInput,
  type StatutDevis,
} from '@/lib/validation/commercial';

type ServerActionResult = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
  data?: { id: string; numero?: string } | void;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type ClientOption = {
  id: string;
  code: string;
  libelle: string;
  adresseLigne1: string;
  adresseLigne2: string | null;
  codePostal: string;
  ville: string;
  email: string | null;
};

type ArticleOption = {
  id: string;
  code: string;
  libelle: string;
  uniteVenteSymbole: string | null;
  prixCourant: string | null;
};

type UniteOption = {
  symbole: string;
  libelle: string;
};

type Props = {
  clients: ClientOption[];
  articles: ArticleOption[];
  /** Liste des unités catalogue (symbole + libellé) pour le combobox unité
   *  des lignes. Si vide, un Input texte libre est utilisé en fallback. */
  unites?: UniteOption[];
  defaultValues?: Partial<DevisInput>;
  onSubmit: (values: DevisInput) => Promise<ServerActionResult>;
  // `| undefined` explicite : le caller peut passer `undefined` pour
  // gater le bouton d'import sur la permission COMMERCIAL_DEVIS_IMPORT_DPGF
  // (cf. exactOptionalPropertyTypes activé dans tsconfig).
  analyserDpgfAction?:
    | ((fichierBase64: string, nomFichier: string) => Promise<ActionResult<DpgfAnalyse>>)
    | undefined;
  importerDpgfAction?:
    | ((
        fichierBase64: string,
        nomFichier: string,
        mapping: MappingDpgf,
      ) => Promise<ActionResult<DpgfImportResult>>)
    | undefined;
  // `| undefined` explicite : le caller passe `true` si l'utilisateur a la
  // permission COMMERCIAL_DEVIS_POSTES_INTERNES (cochable dans la matrice
  // /administration/roles). Sinon l'éditeur des postes internes ventilés
  // est masqué. Les postes existants sont néanmoins conservés dans le form
  // state via `defaultValues.postesInternes` et préservés à l'identique
  // côté server action (cf. lib/commercial/devis.ts > mettreAJourDevis).
  peutGererPostesInternes?: boolean | undefined;
  /** URL de redirection après succès. Si `successRedirectAppendId` est true et
   *  que l'action a renvoyé un id (cas création), `${successRedirect}/${id}` est
   *  utilisée à la place — pour atterrir sur le détail du document créé.
   *  String-only car les Server Components ne peuvent pas passer de fonction à
   *  un Client Component sans `'use server'`. */
  successRedirect: string;
  successRedirectAppendId?: boolean | undefined;
  // Props workflow : rendus dans <WorkflowDevis> en haut du form pour
  // regrouper toutes les actions (statuts + Importer DPGF + Annuler +
  // Enregistrer) sur une seule barre sticky.
  workflowStatutCourant: StatutDevis;
  workflowDevisId?: string | undefined;
  /** Numéro du devis transmis à <WorkflowDevis> pour affichage dans la
   *  barre sticky. Absent en création (numéro pas encore généré). */
  workflowNumero?: string | undefined;
  workflowReadOnly?: boolean | undefined;
  workflowChangerStatutAction?:
    | ((id: string, nouveau: StatutDevis) => Promise<{ ok: boolean; error?: string }>)
    | undefined;
  /** Server action de duplication. Si fourni, affiche le bouton « Dupliquer »
   *  dans la barre workflow et ouvre un dialog. Reçoit le mode choisi. */
  workflowDupliquerAction?:
    | ((
        mode: 'meme_client' | 'autre_client',
      ) => Promise<{ ok: boolean; error?: string; data?: { id: string; numero: string } }>)
    | undefined;
  /** L'utilisateur a-t-il la permission COMMERCIAL_DEVIS_VERSION ?
   *  Détermine si l'option « Nouvelle version pour ce client » est
   *  sélectionnable dans le dialog de duplication. */
  workflowPeutVersionner?: boolean | undefined;
};

const TAUX_TVA_OPTIONS = [
  { value: '20.00', label: '20 %' },
  { value: '10.00', label: '10 %' },
  { value: '5.50', label: '5,5 %' },
  { value: '2.10', label: '2,1 %' },
  { value: '0.00', label: '0 % (auto-liq.)' },
];

/** Valeur sentinelle pour le Select TVA d'un composant libre représentant
 *  « hériter de la ligne parente » (null en form state). Évite les pièges
 *  de Select avec value="" (base-ui ne le supporte pas proprement). */
const INHERIT_SENTINEL = '__inherit__';

const TODAY = () => new Date().toISOString().slice(0, 10);
const PLUS_30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const LABELS_CHAMPS_DEVIS: Record<string, string> = {
  clientId: 'Client',
  dateDevis: 'Date du devis',
  dateValidite: 'Date de validité',
  objet: 'Objet',
  conditionsGenerales: 'Conditions générales',
  notes: 'Notes',
  designation: 'Désignation',
  quantite: 'Quantité',
  unite: 'Unité',
  prixUnitaireHt: 'Prix unitaire HT',
  tauxTva: 'Taux TVA',
  remisePourcent: 'Remise %',
  articleId: 'Article catalogue',
  quantiteParUnite: 'Quantité par unité',
  libelle: 'Libellé',
  montantHt: 'Montant HT',
  chapitreOrdre: 'Chapitre',
  portee: 'Portée',
  poids: 'Poids',
  ordreLigne: 'Ordre de ligne',
  remiseGlobaleType: 'Type de remise globale',
  remiseGlobaleValeur: 'Remise globale',
};

function humaniserCheminErreur(chemin: string): string {
  const parts = chemin.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    const suivant = parts[i + 1];
    if (p === 'lignes' && suivant !== undefined) {
      out.push(`Ligne ${Number(suivant) + 1}`);
      i += 1;
    } else if (p === 'composants' && suivant !== undefined) {
      out.push(`composant ${Number(suivant) + 1}`);
      i += 1;
    } else if (p === 'postesInternes' && suivant !== undefined) {
      out.push(`Poste interne ${Number(suivant) + 1}`);
      i += 1;
    } else if (p === 'repartitions' && suivant !== undefined) {
      out.push(`répartition ${Number(suivant) + 1}`);
      i += 1;
    } else {
      out.push(LABELS_CHAMPS_DEVIS[p] ?? p);
    }
  }
  return out.join(' — ');
}

// RHF errors : arbre dont les feuilles ont la forme { type, message, ref }.
// Les champs des lignes (designation, quantite, unite, PU, remise, tauxTva)
// sont rendus via `form.register` sans <FormField>, donc leurs erreurs ne
// s'affichent nulle part → on les remonte ici pour les surfacer dans l'Alert.
function aplatirErreursRhf(node: unknown, chemin = ''): string[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;
  if (typeof obj.message === 'string' && obj.message.length > 0) {
    return [`${humaniserCheminErreur(chemin)} : ${obj.message}`];
  }
  const out: string[] = [];
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      out.push(...aplatirErreursRhf(node[i], chemin ? `${chemin}.${i}` : String(i)));
    }
    return out;
  }
  for (const [cle, valeur] of Object.entries(obj)) {
    if (cle === 'ref' || cle === 'type' || cle === 'types') continue;
    out.push(...aplatirErreursRhf(valeur, chemin ? `${chemin}.${cle}` : cle));
  }
  return out;
}

/**
 * Grille partagée entre l'en-tête de colonnes et chaque ligne article du
 * devis. 8 colonnes :
 *   Désignation (large) · Qté · Unité · PU HT · TVA · Remise % · Montant HT · Actions
 */

function nouvelleSection(designation = 'Section'): LigneDevisInput {
  return {
    type: 'section',
    designation,
    articleId: null,
    quantite: null,
    unite: null,
    prixUnitaireHt: null,
    tauxTva: null,
    remisePourcent: null,
    notes: null,
    composants: [],
    origineDpgf: false,
  } as LigneDevisInput;
}

function nouvelleLigneLibre(): LigneDevisInput {
  return {
    type: 'libre',
    articleId: null,
    designation: '',
    quantite: '1',
    unite: 'u',
    prixUnitaireHt: '0',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants: [],
    origineDpgf: false,
  } as LigneDevisInput;
}

function nouvelleLigneArticleCatalogue(): LigneDevisInput {
  return {
    type: 'article_catalogue',
    articleId: '',
    designation: '',
    quantite: '1',
    unite: 'u',
    prixUnitaireHt: '0',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants: [],
    origineDpgf: false,
  } as LigneDevisInput;
}

function nouveauComposantCatalogue(): ComposantLigneInput {
  return {
    type: 'article_catalogue',
    articleId: '',
    designation: null,
    quantiteParUnite: '1',
    prixUnitaireHt: '0',
    tauxTva: null,
    remisePourcent: null,
    notes: null,
  } as ComposantLigneInput;
}

function nouveauComposantLibre(): ComposantLigneInput {
  return {
    type: 'libre',
    articleId: null,
    designation: '',
    quantiteParUnite: '1',
    prixUnitaireHt: '0',
    tauxTva: null,
    remisePourcent: null,
    notes: null,
  } as ComposantLigneInput;
}

/** Groupe les lignes par section : chaque section est suivie de ses
 *  articles jusqu'à la prochaine section. Renvoie la liste avec, pour
 *  chaque section, les indexes des articles inclus. Les articles
 *  positionnés avant toute section sont regroupés sous une section
 *  virtuelle (`null`). */
type GroupeSection = {
  /** Index de la section dans `lignes`, ou null pour les lignes orphelines. */
  sectionIdx: number | null;
  /** Indexes des lignes articles. */
  articleIdxs: number[];
};

function grouperParSection(lignes: LigneDevisInput[]): GroupeSection[] {
  const groupes: GroupeSection[] = [];
  let courant: GroupeSection = { sectionIdx: null, articleIdxs: [] };
  for (let i = 0; i < lignes.length; i++) {
    if (lignes[i]!.type === 'section') {
      if (courant.sectionIdx !== null || courant.articleIdxs.length > 0) {
        groupes.push(courant);
      }
      courant = { sectionIdx: i, articleIdxs: [] };
    } else {
      courant.articleIdxs.push(i);
    }
  }
  groupes.push(courant);
  return groupes;
}

/** Préfixe de position numérique d'une désignation de section
 *  (ex. "2.1.1 INSTALLATIONS" → "2.1.1"). Renvoie null si pas de préfixe. */
function extrairePositionSection(designation: string): string | null {
  const m = designation.match(/^(\d+(?:\.\d+)*)\s/);
  return m ? m[1]! : null;
}

function profondeurPosition(position: string | null): number {
  if (!position) return 1;
  return position.split('.').filter((s) => s !== '').length;
}

/** Noeud de l'arborescence des sections reconstruite pour le menu
 *  « Emplacement » : une section + ses sous-sections directes. */
export type NoeudSection = {
  sectionIdx: number;
  titre: string;
  enfants: NoeudSection[];
};

/** Reconstruit l'arborescence des sections (le modèle est plat : toutes les
 *  sections sont des lignes `type:'section'` à plat) à partir de la profondeur
 *  déduite du préfixe numérique de leur désignation (« 3.1.1 … » → niveau 3).
 *  Une section sans préfixe numérique est traitée comme un niveau 1. L'ordre
 *  des sections est respecté ; une section devient enfant de la dernière
 *  section ouverte de profondeur strictement inférieure. */
export function construireArbreSections(
  sections: GroupeSection[],
  lignes: LigneDevisInput[],
): NoeudSection[] {
  const racines: NoeudSection[] = [];
  const pile: { noeud: NoeudSection; profondeur: number }[] = [];
  for (const g of sections) {
    if (g.sectionIdx === null) continue;
    const designation = lignes[g.sectionIdx]?.designation?.trim() ?? '';
    const profondeur = profondeurPosition(extrairePositionSection(designation));
    const noeud: NoeudSection = {
      sectionIdx: g.sectionIdx,
      titre: designation || '(section sans titre)',
      enfants: [],
    };
    while (pile.length > 0 && pile[pile.length - 1]!.profondeur >= profondeur) {
      pile.pop();
    }
    if (pile.length > 0) {
      pile[pile.length - 1]!.noeud.enfants.push(noeud);
    } else {
      racines.push(noeud);
    }
    pile.push({ noeud, profondeur });
  }
  return racines;
}

/** Total HT d'un groupe = somme des montants HT de ses articles directs,
 *  en tenant compte des overrides TVA/remise par composant libre. */
function calculerTotalGroupe(articleIdxs: number[], lignes: LigneDevisInput[]): number {
  let total = 0;
  for (const i of articleIdxs) {
    const l = lignes[i];
    if (!l || l.type === 'section') continue;
    for (const c of calculerContributionsLigne(l)) total += c.ht;
  }
  return total;
}

export function DevisEditor({
  clients,
  articles,
  unites = [],
  defaultValues,
  onSubmit,
  analyserDpgfAction,
  importerDpgfAction,
  peutGererPostesInternes,
  successRedirect,
  successRedirectAppendId,
  workflowStatutCourant,
  workflowDevisId,
  workflowNumero,
  workflowReadOnly,
  workflowChangerStatutAction,
  workflowDupliquerAction,
  workflowPeutVersionner = false,
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [erreur, setErreur] = useState<{ titre: string; details: string[] } | null>(null);
  const [sectionsRepliees, setSectionsRepliees] = useState<Set<number>>(new Set());
  const dpgfRef = useRef<DpgfImportZoneHandle>(null);
  const [dupliquerOuvert, setDupliquerOuvert] = useState(false);
  // Override explicite du flag dirty : utile pour les modifications qui
  // passent par `useFieldArray.replace()` (import DPGF) car cette méthode
  // RHF ne marque pas le formulaire dirty de façon fiable.
  const [dirtyOverride, setDirtyOverride] = useState(false);
  // True dès qu'un import DPGF a été appliqué ou que le devis chargé en
  // contient déjà. Sert à révéler l'encart « Postes internes ventilés »
  // automatiquement après import (les coûts internes complètent le DPGF
  // chiffré du prospect). Plus fiable qu'un watch sur lignes.origineDpgf
  // qui peut être à false sur la 1re ligne par défaut.
  const [dpgfImporte, setDpgfImporte] = useState(
    () => defaultValues?.lignes?.some((l) => l.origineDpgf) ?? false,
  );

  const form = useForm<DevisInput>({
    resolver: typedZodResolver(devisSchema),
    defaultValues: {
      clientId: defaultValues?.clientId ?? '',
      dateDevis: defaultValues?.dateDevis ?? TODAY(),
      dateValidite: defaultValues?.dateValidite ?? PLUS_30(),
      objet: defaultValues?.objet ?? '',
      conditionsGenerales: defaultValues?.conditionsGenerales ?? '',
      notes: defaultValues?.notes ?? '',
      lignes:
        defaultValues?.lignes && defaultValues.lignes.length > 0
          ? defaultValues.lignes
          : [nouvelleLigneLibre()],
      postesInternes: defaultValues?.postesInternes ?? [],
      remiseGlobaleType: defaultValues?.remiseGlobaleType ?? null,
      remiseGlobaleValeur: defaultValues?.remiseGlobaleValeur ?? null,
    },
  });

  const { fields, append, remove, replace, insert } = useFieldArray({
    control: form.control,
    name: 'lignes',
  });

  const lignesLive = form.watch('lignes') as LigneDevisInput[];
  const postesInternesLive = form.watch('postesInternes') ?? [];
  const remiseGlobaleType = form.watch('remiseGlobaleType') ?? null;
  const remiseGlobaleValeur = form.watch('remiseGlobaleValeur') ?? null;

  // Client sélectionné : pour afficher son adresse + e-mail à gauche des dates.
  const clientIdLive = form.watch('clientId');
  const clientSelectionne = clients.find((c) => c.id === clientIdLive) ?? null;

  // Tree mode actif dès qu'au moins une section existe.
  const enModeTree = lignesLive.some((l) => l.type === 'section');
  const groupes = useMemo(() => grouperParSection(lignesLive), [lignesLive]);

  // Total HT live du devis (montants client all-in : lignes + postes internes
  // ventilés) pour l'affichage dans l'en-tête de la section « Lignes du devis ».
  // Recalcul à chaque render (PAS de useMemo) : RHF mute son state interne sans
  // changer les références d'objets, donc un useMemo sur [lignesLive] resterait
  // figé sur une valeur périmée. Coût O(lignes×composants) négligeable — même
  // raison que `montantHt` dans <LigneArticleRow> et que <TotauxDevis>.
  // try/catch identique à <TotauxDevis> : une ligne en cours de saisie peut
  // être transitoirement invalide → on retombe sur 0.
  let totalHtDevis = 0;
  try {
    totalHtDevis = Number(calculerTotauxDevis(lignesLive, postesInternesLive).totalHt);
  } catch {
    totalHtDevis = 0;
  }

  function toggleSection(idx: number) {
    setSectionsRepliees((set) => {
      const ns = new Set(set);
      if (ns.has(idx)) ns.delete(idx);
      else ns.add(idx);
      return ns;
    });
  }

  const tousLesIdxSections = useMemo(
    () => groupes.filter((g) => g.sectionIdx !== null).map((g) => g.sectionIdx as number),
    [groupes],
  );

  // Direction du bouton « tout déplier / replier ». On la base sur « tout est
  // déjà déplié » (aucune section repliée) plutôt que sur « tout est replié » :
  // dès qu'AU MOINS une section est repliée — y compris en état mixte (section
  // parente ouverte, sous-sections repliées) — le bouton DÉPLIE tout. Il ne
  // replie tout que lorsque l'ensemble est déjà déplié. Sans ça, en état mixte
  // le bouton repliait tout (l'inverse de l'intention : ouvrir les sous-sections
  // visibles repliées), et masquait même les sous-sections sous leurs parents.
  const toutDeplie =
    tousLesIdxSections.length > 0 && tousLesIdxSections.every((idx) => !sectionsRepliees.has(idx));

  function toggleToutesLesSections() {
    if (toutDeplie) {
      setSectionsRepliees(new Set(tousLesIdxSections));
    } else {
      setSectionsRepliees(new Set());
    }
  }

  /** sectionIdx des groupes dont au moins une section ancêtre est repliée
   *  (déterminé via les préfixes de position DPGF, ex. "1.2" replié → "1.2.3" masqué). */
  const groupesMasques = useMemo(() => {
    const masques = new Set<number>();
    for (let i = 0; i < groupes.length; i++) {
      const g = groupes[i]!;
      if (g.sectionIdx === null) continue;
      if (!sectionsRepliees.has(g.sectionIdx)) continue;

      const ligne = lignesLive[g.sectionIdx]!;
      const posParent = extrairePositionSection(ligne.designation);
      if (posParent === null) continue;

      const prefixe = posParent + '.';
      for (let j = i + 1; j < groupes.length; j++) {
        const gj = groupes[j]!;
        if (gj.sectionIdx === null) continue;
        const sj = lignesLive[gj.sectionIdx]!;
        const posJ = extrairePositionSection(sj.designation);
        if (posJ !== null && posJ.startsWith(prefixe)) {
          masques.add(gj.sectionIdx);
        } else {
          break;
        }
      }
    }
    return masques;
  }, [groupes, lignesLive, sectionsRepliees]);

  function appliquerImportDpgf(lignes: LigneDpgfPreview[], mode: 'remplacer' | 'ajouter') {
    const nouvelles: LigneDevisInput[] = lignes.map((l): LigneDevisInput => {
      const libelle = l.position ? `${l.position} ${l.designation}` : l.designation;
      if (l.type === 'section') {
        return {
          ...nouvelleSection(libelle.slice(0, 200)),
          origineDpgf: true,
        } as LigneDevisInput;
      }
      return {
        type: 'libre',
        articleId: null,
        designation: libelle.slice(0, 500),
        quantite: l.quantite,
        unite: l.unite,
        prixUnitaireHt: '0',
        tauxTva: '20.00',
        remisePourcent: '0',
        notes: null,
        composants: [],
        origineDpgf: true,
      } as LigneDevisInput;
    });
    if (mode === 'remplacer') {
      replace(nouvelles);
    } else {
      for (const l of nouvelles) append(l);
    }
    // RHF v7 : `replace()` ne marque pas le form dirty. On force-marque via
    // un override local pour que la garde de navigation déclenche le dialog.
    setDirtyOverride(true);
    setDpgfImporte(true);
    toast.success(
      `${nouvelles.length} ligne${nouvelles.length > 1 ? 's' : ''} importée${nouvelles.length > 1 ? 's' : ''} du DPGF`,
    );
  }

  async function handleSubmit(values: DevisInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onSubmit(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur({
        titre: result.error ?? 'Enregistrement impossible.',
        details: [],
      });
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    setDirtyOverride(false);
    toast.success(
      result.data && 'numero' in result.data
        ? `Devis ${result.data.numero} créé`
        : 'Devis enregistré',
    );
    const resolvedId =
      result.data && typeof result.data === 'object' && 'id' in result.data
        ? (result.data as { id?: string }).id
        : undefined;
    const url =
      successRedirectAppendId && resolvedId
        ? `${successRedirect.replace(/\/$/, '')}/${resolvedId}`
        : successRedirect;
    router.push(url);
    router.refresh();
  }

  /** Surface les erreurs de validation Zod côté client, surtout celles des
   *  lignes (designation, quantite, unite, PU, remise, tauxTva) qui ne
   *  s'affichent nulle part car les Input des lignes n'utilisent pas
   *  <FormField>/<FormMessage>. Sans ce handler, le clic sur Enregistrer
   *  paraît « ne rien faire » : RHF bloque silencieusement la soumission. */
  function handleInvalid(errors: FieldErrors<DevisInput>) {
    const details = aplatirErreursRhf(errors).slice(0, 20);
    setErreur({
      titre:
        details.length === 0
          ? 'Le formulaire contient des erreurs.'
          : `Le formulaire contient ${details.length} erreur${details.length > 1 ? 's' : ''} — corrige les champs ci-dessous avant d'enregistrer.`,
      details,
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /** Total HT d'une section parente = ses articles directs +
   *  somme des totaux de toutes ses sous-sections (descendants), déduits
   *  du préfixe de position dans la désignation. */
  const { totauxRecursifs, profondeurParSection } = useMemo(() => {
    const totauxPropres = groupes.map((g) => calculerTotalGroupe(g.articleIdxs, lignesLive));
    const recursifs = new Map<number, number>();
    const profondeurs = new Map<number, number>();

    for (let i = 0; i < groupes.length; i++) {
      const g = groupes[i]!;
      if (g.sectionIdx === null) continue;
      const ligne = lignesLive[g.sectionIdx]!;
      const posParent = extrairePositionSection(ligne.designation);
      profondeurs.set(g.sectionIdx, profondeurPosition(posParent));

      let total = totauxPropres[i]!;
      if (posParent !== null) {
        const prefixe = posParent + '.';
        for (let j = i + 1; j < groupes.length; j++) {
          const gj = groupes[j]!;
          if (gj.sectionIdx === null) continue;
          const sj = lignesLive[gj.sectionIdx]!;
          const posJ = extrairePositionSection(sj.designation);
          if (posJ !== null && posJ.startsWith(prefixe)) {
            total += totauxPropres[j]!;
          } else {
            // positions DPGF séquentielles : dès qu'on sort de la sous-arbre, stop
            break;
          }
        }
      }
      recursifs.set(g.sectionIdx, total);
    }

    return { totauxRecursifs: recursifs, profondeurParSection: profondeurs };
  }, [groupes, lignesLive]);

  /** Insère une nouvelle ligne juste après la section donnée (ou en fin de
   *  devis si sectionIdx est null). La factory détermine le type (libre ou
   *  catalogue). */
  function ajouterLigneDansSection(
    sectionIdx: number | null,
    articleIdxs: number[],
    factory: () => LigneDevisInput,
  ) {
    const positionInsertion =
      articleIdxs.length > 0
        ? articleIdxs[articleIdxs.length - 1]! + 1
        : sectionIdx !== null
          ? sectionIdx + 1
          : fields.length;
    insert(positionInsertion, factory());
  }

  // Garde de navigation centralisée : beforeunload + dialog 3-options sur
  // les clics dans la sidebar et le bouton « Annuler ». Cf. NavigationGuardProvider.
  // `dirtyOverride` couvre les cas où RHF ne marque pas dirty correctement
  // (ex. après un useFieldArray.replace lors d'un import DPGF).
  const formIsDirty = form.formState.isDirty || dirtyOverride;
  useUnsavedChangesGuard({
    isDirty: formIsDirty,
    onSave: async () => {
      let succes = false;
      await form.handleSubmit(async (values) => {
        const r = await onSubmit(values);
        succes = r.ok;
        if (r.ok) {
          toast.success(
            r.data && 'numero' in r.data ? `Devis ${r.data.numero} créé` : 'Devis enregistré',
          );
        } else if (r.error) {
          setErreur({ titre: r.error, details: [] });
        }
      }, handleInvalid)();
      return succes;
    },
  });

  const peutImporterDpgf = !!(analyserDpgfAction && importerDpgfAction);

  return (
    <Form {...form}>
      <form
        id="devis-form"
        method="post"
        onSubmit={form.handleSubmit(handleSubmit, handleInvalid)}
        className="min-w-0 space-y-6"
      >
        <WorkflowDevis
          devisId={workflowDevisId}
          numero={workflowNumero}
          statutCourant={workflowStatutCourant}
          readOnly={workflowReadOnly}
          action={workflowChangerStatutAction}
          enregistrerLabel={isSubmitting ? 'Enregistrement…' : 'Enregistrer le devis'}
          enregistrerDisabled={isSubmitting}
          onImporterDpgf={peutImporterDpgf ? () => dpgfRef.current?.ouvrir() : undefined}
          onDupliquer={workflowDupliquerAction ? () => setDupliquerOuvert(true) : undefined}
        />
        {workflowDupliquerAction && (
          <DupliquerDevisDialog
            open={dupliquerOuvert}
            onClose={() => setDupliquerOuvert(false)}
            action={workflowDupliquerAction}
            peutVersionner={workflowPeutVersionner}
            onSuccess={(nouveauId) => {
              router.push(`/commercial/devis/${nouveauId}`);
              router.refresh();
            }}
          />
        )}

        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>
              <div>{erreur.titre}</div>
              {erreur.details.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-5">
                  {erreur.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}

        <FormSection
          number={1}
          title="Affaire / Client"
          storageKey="devis:affaire-client"
          rightSlot={
            <span className="font-mono text-lg font-semibold tabular-nums text-foreground sm:text-xl">
              {formatMontant(totalHtDevis)} € HT
            </span>
          }
        >
          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un client">
                        {(v) => {
                          if (!v) return 'Choisir un client';
                          const c = clients.find((x) => x.id === v);
                          return c ? `${c.code} — ${c.libelle}` : String(v);
                        }}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.libelle}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Partie gauche : adresse + e-mail du client sélectionné. */}
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Coordonnées client
              </div>
              {clientSelectionne ? (
                <div className="space-y-0.5">
                  <div className="font-medium text-foreground">{clientSelectionne.libelle}</div>
                  <div>{clientSelectionne.adresseLigne1}</div>
                  {clientSelectionne.adresseLigne2 && <div>{clientSelectionne.adresseLigne2}</div>}
                  <div>
                    {clientSelectionne.codePostal} {clientSelectionne.ville}
                  </div>
                  {clientSelectionne.email && (
                    <a
                      href={`mailto:${clientSelectionne.email}`}
                      className="mt-1 inline-block break-all text-primary underline underline-offset-4"
                    >
                      {clientSelectionne.email}
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Sélectionne un client pour afficher son adresse et son e-mail.
                </p>
              )}
            </div>

            {/* Partie droite : dates empilées les unes sous les autres. */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="dateDevis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date du devis</FormLabel>
                    <FormControl>
                      <Input type="date" className="w-44" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateValidite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valable jusqu&apos;au</FormLabel>
                    <FormControl>
                      <Input type="date" className="w-44" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
          <FormField
            control={form.control}
            name="objet"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Objet (optionnel)</FormLabel>
                <FormControl>
                  <Input
                    maxLength={200}
                    placeholder="Rénovation cuisine, agrandissement…"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {peutImporterDpgf && (
          <DpgfImportZone
            ref={dpgfRef}
            analyserAction={analyserDpgfAction!}
            importerAction={importerDpgfAction!}
            onConfirm={appliquerImportDpgf}
          />
        )}

        <FormSection
          number={2}
          title="Lignes du devis"
          storageKey="devis:lignes"
          bodyClassName="p-0"
          rightSlot={
            <div className="flex items-center gap-2 text-foreground">
              {tousLesIdxSections.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={toggleToutesLesSections}
                  aria-label={
                    toutDeplie ? 'Replier toutes les sections' : 'Déplier toutes les sections'
                  }
                  title={toutDeplie ? 'Tout replier' : 'Tout déplier'}
                >
                  {toutDeplie ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
                </Button>
              )}
              <MenuAjouterArticle
                label="Ajouter article catalogue"
                icon={BookOpenIcon}
                groupes={groupes}
                lignes={lignesLive}
                onAjouterFin={() => append(nouvelleLigneArticleCatalogue())}
                onAjouterDansSection={(sectionIdx) => {
                  const groupe = groupes.find((g) => g.sectionIdx === sectionIdx);
                  ajouterLigneDansSection(
                    sectionIdx,
                    groupe?.articleIdxs ?? [],
                    nouvelleLigneArticleCatalogue,
                  );
                }}
              />
              <MenuAjouterArticle
                label="Ajouter article libre"
                icon={PencilIcon}
                groupes={groupes}
                lignes={lignesLive}
                onAjouterFin={() => append(nouvelleLigneLibre())}
                onAjouterDansSection={(sectionIdx) => {
                  const groupe = groupes.find((g) => g.sectionIdx === sectionIdx);
                  ajouterLigneDansSection(
                    sectionIdx,
                    groupe?.articleIdxs ?? [],
                    nouvelleLigneLibre,
                  );
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => append(nouvelleSection())}
                aria-label="Ajouter une section"
                title="Ajouter une section"
              >
                <FolderPlusIcon />
              </Button>
            </div>
          }
        >
          <p className="px-4 py-1 text-xs text-muted-foreground sm:hidden" aria-hidden="true">
            Le tableau défile horizontalement.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] table-fixed">
              <colgroup>
                <col />
                <col style={{ width: '72px' }} />
                <col style={{ width: '72px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '100px' }} />
                <col style={{ width: '76px' }} />
                <col style={{ width: '140px' }} />
                <col style={{ width: '180px' }} />
              </colgroup>
              <thead className="bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="px-3 py-1.5 text-center">Désignation</th>
                  <th className="px-2 py-1.5 text-center">Qté</th>
                  <th className="px-2 py-1.5 text-center">Unité</th>
                  <th className="px-2 py-1.5 text-center">PU HT</th>
                  <th className="px-2 py-1.5 text-center">TVA</th>
                  <th className="px-2 py-1.5 text-center">Remise %</th>
                  <th className="px-2 py-1.5 text-center">Montant HT</th>
                  <th className="px-2 py-1.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => {
                  if (g.sectionIdx !== null && groupesMasques.has(g.sectionIdx)) {
                    return null;
                  }
                  return (
                    <GroupeRow
                      key={g.sectionIdx ?? `orphelins-${g.articleIdxs.join('-')}`}
                      groupe={g}
                      lignes={lignesLive}
                      articles={articles}
                      unites={unites}
                      form={form}
                      replie={g.sectionIdx !== null && sectionsRepliees.has(g.sectionIdx)}
                      onToggle={() => g.sectionIdx !== null && toggleSection(g.sectionIdx)}
                      onSupprimer={(idx) => remove(idx)}
                      totalSection={
                        g.sectionIdx !== null
                          ? (totauxRecursifs.get(g.sectionIdx) ?? 0)
                          : calculerTotalGroupe(g.articleIdxs, lignesLive)
                      }
                      profondeur={
                        g.sectionIdx !== null ? (profondeurParSection.get(g.sectionIdx) ?? 1) : 1
                      }
                      enModeTree={enModeTree}
                      dpgfImporte={dpgfImporte}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </FormSection>

        {peutGererPostesInternes && (
          <PostesInternesEditor form={form} forcerAffichage={dpgfImporte} />
        )}

        <div className="rounded-md border bg-muted/20 p-4">
          <div className="mb-1 text-sm font-medium">Remise globale</div>
          <p className="mb-3 text-xs text-muted-foreground">
            Remise appliquée directement sur le total HT, en plus des éventuelles remises par ligne.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="remiseGlobaleType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type de remise</FormLabel>
                  <Select
                    value={field.value ?? '__aucune__'}
                    onValueChange={(v) => {
                      if (!v) return;
                      if (v === '__aucune__') {
                        field.onChange(null);
                        form.setValue('remiseGlobaleValeur', null, { shouldDirty: true });
                      } else {
                        field.onChange(v);
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="Type de remise globale">
                        <SelectValue>
                          {(val) =>
                            val === 'pourcent'
                              ? 'Pourcentage (%)'
                              : val === 'montant'
                                ? 'Montant (€)'
                                : 'Aucune remise'
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__aucune__">Aucune remise</SelectItem>
                      <SelectItem value="pourcent">Pourcentage (%)</SelectItem>
                      <SelectItem value="montant">Montant (€)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="remiseGlobaleValeur"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {remiseGlobaleType === 'montant' ? 'Montant de la remise (€)' : 'Remise (%)'}
                  </FormLabel>
                  <FormControl>
                    <Input
                      className="text-right"
                      inputMode="decimal"
                      placeholder={remiseGlobaleType === 'montant' ? '0.00' : '0'}
                      disabled={remiseGlobaleType === null}
                      aria-label="Valeur de la remise globale"
                      {...field}
                      value={field.value ?? ''}
                      onChange={(e) =>
                        field.onChange(e.target.value === '' ? null : e.target.value)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <TotauxDevis
          lignes={lignesLive}
          postesInternes={postesInternesLive}
          remiseGlobale={{ type: remiseGlobaleType, valeur: remiseGlobaleValeur }}
        />

        <FormSection number={3} title="Notes &amp; conditions" storageKey="devis:notes">
          <FormField
            control={form.control}
            name="conditionsGenerales"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conditions générales (optionnel)</FormLabel>
                <FormControl>
                  <Textarea rows={4} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="mt-4">
                <FormLabel>Notes internes (non imprimées)</FormLabel>
                <FormControl>
                  <Textarea rows={2} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </form>
    </Form>
  );
}

// ─────────────────────────────────────────────────────────────
// Sous-composants : section + ligne article + composants
// ─────────────────────────────────────────────────────────────

function GroupeRow({
  groupe,
  lignes,
  articles,
  unites,
  form,
  replie,
  onToggle,
  onSupprimer,
  totalSection,
  profondeur,
  enModeTree,
  dpgfImporte,
}: {
  groupe: GroupeSection;
  lignes: LigneDevisInput[];
  articles: ArticleOption[];
  unites: UniteOption[];
  form: UseFormReturn<DevisInput>;
  replie: boolean;
  onToggle: () => void;
  onSupprimer: (idx: number) => void;
  totalSection: number;
  profondeur: number;
  enModeTree: boolean;
  dpgfImporte: boolean;
}) {
  const indentPx = Math.max(0, (profondeur - 1) * 16);
  const headerBg =
    profondeur === 1 ? 'bg-primary/15' : profondeur === 2 ? 'bg-primary/10' : 'bg-primary/5';
  // Seules les sections créées manuellement (origineDpgf = false) sont
  // supprimables. Les sections issues d'un import DPGF (flag persisté en BDD)
  // restent structurellement présentes : on ne peut pas les retirer
  // individuellement, il faut ré-importer un autre DPGF.
  const sectionLigne = groupe.sectionIdx !== null ? lignes[groupe.sectionIdx] : undefined;
  const sectionDesignation = sectionLigne?.designation ?? '';
  const estDpgfImporte =
    (sectionLigne as { origineDpgf?: boolean } | undefined)?.origineDpgf ?? false;
  return (
    <>
      {groupe.sectionIdx !== null && (
        <tr className={`${headerBg} border-b border-l-4 border-l-primary/60`}>
          <td colSpan={8}>
            <div
              className="flex items-center gap-2 py-2 pr-3"
              style={{ paddingLeft: `${12 + indentPx}px` }}
            >
              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-background/50"
                onClick={onToggle}
                aria-label={replie ? 'Déplier la section' : 'Replier la section'}
              >
                {replie ? (
                  <ChevronRightIcon className="size-4" />
                ) : (
                  <ChevronDownIcon className="size-4" />
                )}
              </button>
              <Input
                className={`flex-1 border-0 bg-transparent font-bold uppercase tracking-wide shadow-none focus-visible:bg-background/60 focus-visible:ring-1 ${
                  profondeur === 1 ? 'text-base' : 'text-sm'
                }`}
                placeholder="Titre de section (ex: Gros œuvre)"
                {...form.register(`lignes.${groupe.sectionIdx}.designation` as const)}
              />
              <span className="w-[165px] text-right font-mono text-sm font-semibold tabular-nums">
                {formatMontant(totalSection)} €
              </span>
              <div className="flex w-[68px] items-center justify-center">
                {!estDpgfImporte && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      const titre = sectionDesignation.trim() || 'cette section';
                      if (
                        window.confirm(`Supprimer la section « ${titre} » et tout son contenu ?`)
                      ) {
                        onSupprimer(groupe.sectionIdx!);
                      }
                    }}
                    aria-label="Supprimer la section"
                    title="Supprimer la section"
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}

      {!replie && (
        <>
          {groupe.articleIdxs.length === 0 && groupe.sectionIdx !== null && (
            <tr className="border-b">
              <td
                colSpan={8}
                className="py-2 pr-3 text-xs italic text-muted-foreground"
                style={{ paddingLeft: `${12 + indentPx}px` }}
              >
                Aucune ligne dans cette section.
              </td>
            </tr>
          )}
          {groupe.articleIdxs.map((idx) => {
            const ligne = lignes[idx]!;
            if (ligne.type === 'section') return null;
            return (
              <LigneArticleRow
                key={idx}
                idx={idx}
                articles={articles}
                unites={unites}
                form={form}
                onSupprimer={() => onSupprimer(idx)}
                indenter={groupe.sectionIdx !== null || enModeTree}
                dpgfImporte={dpgfImporte}
              />
            );
          })}
        </>
      )}
    </>
  );
}

function LigneArticleRow({
  idx,
  articles,
  unites,
  form,
  onSupprimer,
  indenter,
  dpgfImporte,
}: {
  idx: number;
  articles: ArticleOption[];
  unites: UniteOption[];
  form: UseFormReturn<DevisInput>;
  onSupprimer: () => void;
  indenter: boolean;
  dpgfImporte: boolean;
}) {
  const [composantsOuverts, setComposantsOuverts] = useState(false);

  // Abonnement direct au state de la ligne via useWatch. Indispensable car
  // RHF mute son state interne sans changer les références d'objets : si on
  // reçoit `ligne` en prop et qu'on memoize sur `[ligne]`, les calculs
  // (montantHt, PU dérivé) restent figés sur la valeur initiale. useWatch
  // garantit un re-render à chaque mutation du chemin.
  const ligne = useWatch({
    control: form.control,
    name: `lignes.${idx}` as const,
  }) as LigneDevisInput | undefined;

  const composantsFieldArray = useFieldArray({
    control: form.control,
    name: `lignes.${idx}.composants` as never,
  });

  // Si la ligne n'est pas encore montée (cas transitoire après un remove),
  // on retourne null pour éviter les accès undefined.
  if (!ligne || ligne.type === 'section') return null;

  const composants = (ligne.composants ?? []) as ComposantLigneInput[];

  function ajouterComposantCatalogue() {
    composantsFieldArray.append(nouveauComposantCatalogue() as never);
    setComposantsOuverts(true);
  }

  function ajouterComposantLibre() {
    composantsFieldArray.append(nouveauComposantLibre() as never);
    setComposantsOuverts(true);
  }

  function viderComposants() {
    if (
      composants.length > 0 &&
      !window.confirm(
        `Supprimer les ${composants.length} composant${composants.length > 1 ? 's' : ''} de cette ligne ?`,
      )
    ) {
      return;
    }
    composantsFieldArray.remove();
    setComposantsOuverts(false);
  }

  // Snapshot capturé hors closure : TS ne propage pas le narrowing de
  // `ligne` (useWatch retourne LigneDevisInput | undefined) dans la closure
  // de supprimerLigne, donc on l'extrait ici après l'early return.
  const designationLigne = ligne.designation;
  function supprimerLigne() {
    const libelle = designationLigne?.trim() || 'cette ligne';
    if (window.confirm(`Supprimer « ${libelle} » ?`)) {
      onSupprimer();
    }
  }

  // Recompute à chaque render (pas de useMemo) : RHF mute son état sans
  // changer les références d'objets, donc memoize sur [ligne] ou [composants]
  // garde des valeurs stales. Le calcul est O(composants), négligeable.
  const puDerive = composants.length > 0 ? calculerPuDepuisComposants(composants) : null;
  let montantHt = 0;
  for (const c of calculerContributionsLigne(ligne)) montantHt += c.ht;

  const estCatalogue = ligne.type === 'article_catalogue';
  const articleIdLigne = ligne.type === 'article_catalogue' ? (ligne.articleId ?? '') : '';

  function appliquerArticleSurLigne(articleId: string) {
    const a = articles.find((x) => x.id === articleId);
    if (!a) return;
    form.setValue(`lignes.${idx}.articleId` as never, articleId as never, {
      shouldDirty: true,
    });
    form.setValue(`lignes.${idx}.designation` as never, `${a.code} — ${a.libelle}` as never, {
      shouldDirty: true,
    });
    if (a.uniteVenteSymbole) {
      form.setValue(`lignes.${idx}.unite` as never, a.uniteVenteSymbole as never, {
        shouldDirty: true,
      });
    }
    if (a.prixCourant) {
      form.setValue(`lignes.${idx}.prixUnitaireHt` as never, a.prixCourant as never, {
        shouldDirty: true,
      });
    }
  }

  return (
    <>
      <tr className="border-b align-top">
        <td className="px-3 py-2">
          <div className="flex min-w-0 items-center gap-1">
            {indenter && <span className="w-4 shrink-0" aria-hidden />}
            {estCatalogue ? (
              <Select
                value={articleIdLigne}
                onValueChange={(v) => v && appliquerArticleSurLigne(v)}
              >
                <SelectTrigger className="w-full" aria-label="Article catalogue">
                  <SelectValue placeholder="Choisir un article catalogue">
                    {(v) => {
                      if (!v) return 'Choisir un article catalogue';
                      const a = articles.find((x) => x.id === v);
                      return a ? `${a.code} — ${a.libelle}` : String(v);
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {articles.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.libelle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Désignation"
                {...form.register(`lignes.${idx}.designation` as const)}
              />
            )}
          </div>
        </td>
        <td className="px-2 py-2">
          <Input
            className="text-right"
            inputMode="decimal"
            placeholder="0"
            {...form.register(`lignes.${idx}.quantite` as const)}
          />
        </td>
        <td className="px-2 py-2">
          {unites.length > 0 ? (
            <Select
              value={ligne.unite ?? ''}
              onValueChange={(v) =>
                form.setValue(`lignes.${idx}.unite` as never, v as never, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger className="w-full" aria-label="Unité">
                <SelectValue placeholder="Unité">{(v) => (v ? String(v) : 'Unité')}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {/* Si l'unité courante n'est pas dans le catalogue (ex.
                 *  import DPGF avec libellé custom), on l'ajoute en tête
                 *  pour qu'elle reste sélectionnable et visible. */}
                {ligne.unite && !unites.some((u) => u.symbole === ligne.unite) && (
                  <SelectItem value={ligne.unite}>{ligne.unite} (hors catalogue)</SelectItem>
                )}
                {unites.map((u) => (
                  <SelectItem key={u.symbole} value={u.symbole}>
                    {u.symbole} — {u.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="u"
              maxLength={20}
              {...form.register(`lignes.${idx}.unite` as const)}
            />
          )}
        </td>
        <td className="px-2 py-2">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            readOnly={composants.length > 0}
            aria-readonly={composants.length > 0}
            aria-label="Prix unitaire HT"
            title={
              composants.length > 0
                ? 'PU calculé depuis les composants — supprimez les composants pour saisir manuellement.'
                : 'Prix unitaire HT (saisie manuelle)'
            }
            {...(composants.length > 0
              ? {
                  value: puDerive ?? '0',
                  className: 'text-right bg-muted/40',
                  onChange: () => {},
                }
              : {
                  ...form.register(`lignes.${idx}.prixUnitaireHt` as const),
                  className: 'text-right',
                })}
          />
        </td>
        <td className="px-2 py-2">
          <Select
            value={(ligne as { tauxTva?: string }).tauxTva ?? '20.00'}
            onValueChange={(v) =>
              v &&
              form.setValue(`lignes.${idx}.tauxTva` as never, v as never, {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger className="w-full" aria-label="Taux de TVA">
              <SelectValue placeholder="TVA" />
            </SelectTrigger>
            <SelectContent>
              {TAUX_TVA_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className="px-2 py-2">
          <Input
            className="text-right"
            inputMode="decimal"
            placeholder="0"
            aria-label="Remise en pourcent"
            {...form.register(`lignes.${idx}.remisePourcent` as const)}
          />
        </td>
        <td className="px-2 py-2 text-right font-mono text-sm tabular-nums">
          {formatMontant(montantHt)} €
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center justify-center gap-0.5">
            {/* Boutons de gestion des composants (sous-détail de prix) :
             *  visibles uniquement quand un DPGF a été importé sur le devis.
             *  On les conserve aussi si la ligne porte déjà des composants
             *  (anciens devis), pour ne pas rendre ce contenu inaccessible. */}
            {(dpgfImporte || composants.length > 0) && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setComposantsOuverts((v) => !v)}
                  disabled={composants.length === 0}
                  aria-label="Afficher / masquer les composants"
                  title={
                    composants.length === 0
                      ? 'Aucun composant — utiliser 📖 ou ✏️ pour en ajouter'
                      : composantsOuverts
                        ? 'Masquer les composants'
                        : 'Afficher les composants'
                  }
                >
                  <PackageIcon className={composants.length > 0 ? 'text-primary' : undefined} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={ajouterComposantCatalogue}
                  aria-label="Ajouter un composant article catalogue"
                  title="Ajouter un composant article catalogue"
                >
                  <BookOpenIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={ajouterComposantLibre}
                  aria-label="Ajouter un composant libre"
                  title="Ajouter un composant libre"
                >
                  <PencilIcon />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={viderComposants}
                  disabled={composants.length === 0}
                  aria-label="Vider les composants"
                  title="Vider tous les composants"
                >
                  <Trash2Icon className="text-muted-foreground" />
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={supprimerLigne}
              aria-label="Supprimer la ligne"
              title="Supprimer la ligne"
            >
              <Trash2Icon />
            </Button>
          </div>
        </td>
      </tr>

      {composantsOuverts && composants.length > 0 && (
        <ComposantsRows
          ligneIdx={idx}
          articles={articles}
          form={form}
          fields={composantsFieldArray.fields}
          onRemove={(i) => {
            if (window.confirm('Supprimer ce composant ?')) {
              composantsFieldArray.remove(i);
            }
          }}
        />
      )}
    </>
  );
}

function ComposantsRows({
  ligneIdx,
  articles,
  form,
  fields,
  onRemove,
}: {
  ligneIdx: number;
  articles: ArticleOption[];
  form: UseFormReturn<DevisInput>;
  fields: { id: string }[];
  onRemove: (idx: number) => void;
}) {
  function appliquerArticle(idx: number, articleId: string) {
    const a = articles.find((x) => x.id === articleId);
    if (!a) return;
    form.setValue(`lignes.${ligneIdx}.composants.${idx}.articleId` as never, articleId as never, {
      shouldDirty: true,
    });
    if (a.prixCourant) {
      form.setValue(
        `lignes.${ligneIdx}.composants.${idx}.prixUnitaireHt` as never,
        a.prixCourant as never,
        { shouldDirty: true },
      );
    }
  }

  return (
    <>
      {fields.map((field, idx) => (
        <ComposantRow
          key={field.id}
          ligneIdx={ligneIdx}
          composantIdx={idx}
          articles={articles}
          form={form}
          onAppliquerArticle={(v) => appliquerArticle(idx, v)}
          onSupprimer={() => onRemove(idx)}
        />
      ))}
    </>
  );
}

function ComposantRow({
  ligneIdx,
  composantIdx,
  articles,
  form,
  onAppliquerArticle,
  onSupprimer,
}: {
  ligneIdx: number;
  composantIdx: number;
  articles: ArticleOption[];
  form: UseFormReturn<DevisInput>;
  onAppliquerArticle: (articleId: string) => void;
  onSupprimer: () => void;
}) {
  const composant = form.watch(
    `lignes.${ligneIdx}.composants.${composantIdx}` as never,
  ) as unknown as ComposantLigneInput | undefined;
  // TVA et remise de la ligne parente : utilisées comme valeurs visibles
  // (héritage par défaut) tant que le composant libre ne définit pas
  // d'override explicite.
  const lineTauxTva = form.watch(`lignes.${ligneIdx}.tauxTva` as never) as unknown as
    | string
    | null
    | undefined;
  const lineRemise = form.watch(`lignes.${ligneIdx}.remisePourcent` as never) as unknown as
    | string
    | null
    | undefined;
  const estLibre = composant?.type === 'libre';
  const articleId =
    composant && composant.type === 'article_catalogue' ? (composant.articleId ?? '') : '';
  const article = articles.find((a) => a.id === articleId);
  const uniteCatalogue = article?.uniteVenteSymbole ?? '';
  const qpu = Number(composant?.quantiteParUnite ?? '0');
  const pu = Number(composant?.prixUnitaireHt ?? '0');
  const contribution = Number.isFinite(qpu) && Number.isFinite(pu) ? qpu * pu : 0;

  return (
    <tr className="border-b border-l-4 border-l-primary/30 bg-muted/10 align-top">
      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <PackageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {estLibre ? (
            <Input
              placeholder="Désignation libre"
              maxLength={500}
              {...form.register(
                `lignes.${ligneIdx}.composants.${composantIdx}.designation` as const,
              )}
            />
          ) : (
            <Select value={articleId} onValueChange={(v) => v && onAppliquerArticle(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un article catalogue">
                  {(v) => {
                    if (!v) return 'Choisir un article catalogue';
                    const a = articles.find((x) => x.id === v);
                    return a ? `${a.code} — ${a.libelle}` : String(v);
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {articles.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.code} — {a.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </td>
      <td className="px-2 py-2">
        <Input
          className="text-right"
          inputMode="decimal"
          placeholder="0"
          aria-label="Quantité par unité de ligne"
          {...form.register(
            `lignes.${ligneIdx}.composants.${composantIdx}.quantiteParUnite` as const,
          )}
        />
      </td>
      <td className="px-2 py-2 text-center text-xs text-muted-foreground">
        {estLibre ? '' : uniteCatalogue}
      </td>
      <td className="px-2 py-2">
        <Input
          className="text-right"
          inputMode="decimal"
          placeholder="0.00"
          aria-label="Prix unitaire HT du composant"
          {...form.register(
            `lignes.${ligneIdx}.composants.${composantIdx}.prixUnitaireHt` as const,
          )}
        />
      </td>
      <td className="px-2 py-2">
        {estLibre ? (
          <Select
            value={composant?.tauxTva ?? INHERIT_SENTINEL}
            onValueChange={(v) =>
              form.setValue(
                `lignes.${ligneIdx}.composants.${composantIdx}.tauxTva` as never,
                (v === INHERIT_SENTINEL ? null : v) as never,
                { shouldDirty: true },
              )
            }
          >
            <SelectTrigger
              className={cn(
                'w-full',
                composant?.tauxTva === null && 'italic text-muted-foreground',
              )}
              aria-label="Taux TVA du composant (hérité de la ligne par défaut)"
              title={
                composant?.tauxTva === null
                  ? 'Valeur héritée de la ligne. Choisir un taux pour la remplacer.'
                  : 'Override du taux de la ligne. Choisir « Hériter » pour annuler.'
              }
            >
              <SelectValue>
                {(v) => {
                  const taux = !v || v === INHERIT_SENTINEL ? lineTauxTva : String(v);
                  const opt = TAUX_TVA_OPTIONS.find((o) => o.value === taux);
                  return opt?.label ?? taux ?? '—';
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT_SENTINEL}>Hériter de la ligne</SelectItem>
              {TAUX_TVA_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="block text-center text-xs text-muted-foreground" aria-hidden>
            —
          </span>
        )}
      </td>
      <td className="px-2 py-2">
        {estLibre ? (
          <Input
            className={cn(
              'text-right',
              composant?.remisePourcent === null && 'italic text-muted-foreground',
            )}
            inputMode="decimal"
            placeholder="0"
            aria-label="Remise % du composant (héritée de la ligne par défaut)"
            title={
              composant?.remisePourcent === null
                ? 'Valeur héritée de la ligne. Saisir une valeur pour la remplacer (vider pour réhériter).'
                : 'Override de la remise de la ligne. Vider le champ pour réhériter.'
            }
            value={composant?.remisePourcent ?? lineRemise ?? ''}
            onChange={(e) =>
              form.setValue(
                `lignes.${ligneIdx}.composants.${composantIdx}.remisePourcent` as never,
                (e.target.value.trim() === '' ? null : e.target.value) as never,
                { shouldDirty: true },
              )
            }
          />
        ) : (
          <span className="block text-center text-xs text-muted-foreground" aria-hidden>
            —
          </span>
        )}
      </td>
      <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
        {formatMontant(contribution)} €/u
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onSupprimer}
            aria-label="Supprimer ce composant"
          >
            <Trash2Icon />
          </Button>
        </div>
      </td>
    </tr>
  );
}

function MenuAjouterArticle({
  label,
  icon: Icon,
  groupes,
  lignes,
  onAjouterFin,
  onAjouterDansSection,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  groupes: GroupeSection[];
  lignes: LigneDevisInput[];
  onAjouterFin: () => void;
  onAjouterDansSection: (sectionIdx: number) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const sections = groupes.filter((g) => g.sectionIdx !== null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!detailsRef.current) return;
      if (!detailsRef.current.contains(e.target as Node)) {
        detailsRef.current.open = false;
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function fermer() {
    if (detailsRef.current) detailsRef.current.open = false;
  }

  const arbre = useMemo(() => construireArbreSections(sections, lignes), [sections, lignes]);
  const [sousSectionsRepliees, setSousSectionsRepliees] = useState<Set<number>>(new Set());

  function basculerNoeud(sectionIdx: number) {
    setSousSectionsRepliees((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(sectionIdx)) suivant.delete(sectionIdx);
      else suivant.add(sectionIdx);
      return suivant;
    });
  }

  function rendreNoeud(noeud: NoeudSection, niveau: number): React.ReactNode {
    const aEnfants = noeud.enfants.length > 0;
    const ouvert = !sousSectionsRepliees.has(noeud.sectionIdx);
    return (
      <div key={noeud.sectionIdx}>
        <div className="flex items-stretch" style={{ paddingLeft: niveau * 12 }}>
          {aEnfants ? (
            <button
              type="button"
              className="flex w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
              onClick={() => basculerNoeud(noeud.sectionIdx)}
              aria-label={ouvert ? 'Replier la sous-section' : 'Déplier la sous-section'}
              aria-expanded={ouvert}
            >
              {ouvert ? (
                <ChevronDownIcon className="size-3.5" />
              ) : (
                <ChevronRightIcon className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="w-6 shrink-0" aria-hidden />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 truncate rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={() => {
              onAjouterDansSection(noeud.sectionIdx);
              fermer();
            }}
          >
            {noeud.titre}
          </button>
        </div>
        {aEnfants && ouvert && noeud.enfants.map((enfant) => rendreNoeud(enfant, niveau + 1))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={onAjouterFin}
        aria-label={label}
        title={label}
      >
        <Icon />
      </Button>
    );
  }

  return (
    <details ref={detailsRef} className="relative">
      <summary
        className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[min(var(--radius-md),12px)] border border-input bg-background text-sm font-medium shadow-sm hover:bg-accent [&::-webkit-details-marker]:hidden [&::marker]:hidden"
        aria-label={label}
        title={label}
      >
        <Icon className="size-4" />
      </summary>
      <div className="absolute right-0 top-full z-20 mt-1 w-72 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
        <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Emplacement
        </div>
        <div className="max-h-64 overflow-y-auto">
          {arbre.map((noeud) => rendreNoeud(noeud, 0))}
        </div>
        <div className="my-1 border-t" />
        <button
          type="button"
          className="block w-full rounded-sm px-2 py-1.5 text-left text-sm font-medium hover:bg-accent"
          onClick={() => {
            onAjouterFin();
            fermer();
          }}
        >
          À la fin du devis
        </button>
      </div>
    </details>
  );
}
