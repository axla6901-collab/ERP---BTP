# ADR-013 — Socle RH + Pointage (M5.1 + M5.2)

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta

## Contexte

M1-M4 ont produit un ERP commercial + chantiers fonctionnel. Le module RH est le prochain pilier : sans la capacité de saisir des heures par employé/chantier, il est impossible de calculer la marge réelle d'un chantier ni de produire les exports paie.

Référence d'inspiration : projet `C:\Users\aacosta\Downloads\Claude\Pointage` (React/Vite/Electron) déjà en usage par l'utilisateur. Il propose :
- Saisie matrice mensuelle (collaborateur × jours)
- Multi-type de pointage : heures, kg acier, m³ béton (pour comparaison budget vs réel)
- Indemnités BTP : panier, grand panier, nuit
- Zones de déplacement Z1..Z5/GD/GE
- Multi-format d'import (Excel, Word, PDF) — reporté M5.3

erp-btp normalise ce modèle en tables relationnelles avec FK vers `chantiers` et `chantier_taches`, là où Pointage utilisait des strings encodées (`"Nom - Type - Société"`).

## Décision

### Modèle employes

Table normalisée avec **les attributs réels nécessaires en PME BTP** :
- Identité : nom, prénom, email, téléphone
- Contrat : `type_contrat` enum (CDI/CDD/INT/ALT/STAGE), `societe_interim` (obligatoire si INT via CHECK SQL), date_entree, date_sortie
- Métier : qualification (texte libre — maçon, chef d'équipe, conducteur…), zone_deplacement_defaut
- Paie : taux_horaire_brut, heures_hebdo_contractuelles (default 39)
- État : `actif` (boolean), soft delete via `deleted_at`
- Lien optionnel `utilisateur_id` vers la table `utilisateurs` (un employé peut être un user de l'app — chef de chantier, conducteur, etc.)

**Activation FK `utilisateurs.employe_id`** : la colonne UUID existait depuis M1.1 comme placeholder. M5.1 ajoute la vraie FK. Les chantiers M4 gardent `responsable_id` sur `utilisateurs.id` — la migration vers `employe_responsable_id` n'est pas urgente (un responsable a forcément un compte utilisateur).

### Modèle pointages

Une ligne = un fait métier unitaire : « tel employé, tel jour, telle ligne dans la matrice ».

Champs essentiels :
- `employe_id` FK NOT NULL
- `chantier_id` FK NULL — NULL pour les absences (CHECK SQL force la cohérence)
- `chantier_tache_id` FK NULL — optionnel (pointage sur une tâche précise quand pertinent)
- `date_pointage` DATE
- `type` enum `type_pointage` (heures par défaut + absence + 4 types budget : kg_acier_ha/ts, m3_beton_b16/b25)
- `quantite` NUMERIC(7,2) > 0
- `motif_absence` enum NULL — obligatoire si type=absence (CHECK SQL)
- `zone_deplacement` enum NULL — hérite de l'employé par défaut côté UI
- 3 booleans indemnités : `panier`, `grand_panier`, `nuit_panier_soir`

**CHECK SQL clés** :
- `type='absence' ↔ chantier_id IS NULL ET motif_absence IS NOT NULL` (cohérence absence/chantier/motif)
- `quantite > 0`

**UNIQUE partiel** : `(employe_id, date_pointage, COALESCE(chantier_id), type) WHERE deleted_at IS NULL` — empêche les doublons. Le `COALESCE` pour matcher quand `chantier_id IS NULL` (absences).

### Saisie matrice mensuelle

Inspirée directement de `Pointage.jsx` mais persistée. Une saisie = `saisirMatricePointages({ annee, mois, lignes })` où chaque ligne porte :
- couple `(employe_id, chantier_id, type, motif_absence?)`
- map `jours: { '1': h, '2': h, ... }` — clé = jour, valeur = quantité

**Sémantique du save** : pour chaque ligne, on **soft-delete** tous les pointages existants du mois sur ce couple (employe, chantier, type), puis on **INSERT** les nouvelles entrées (jours avec quantité > 0 uniquement). Le tout dans une seule transaction.

**Conséquences** :
- ✅ Idempotent : refaire la sauvegarde produit le même état
- ✅ UI simple : pas de diff client/serveur à calculer
- ⚠️ Si un pointage hors matrice (saisie unitaire ailleurs) existe pour ce couple/mois, il sera écrasé. Acceptable car la matrice est la source de vérité.

### Workflow et permissions

- `ROLES_RH_WRITE = ['admin', 'rh', 'comptable']` — données personnelles, accès restreint
- `ROLES_POINTAGE_WRITE = ['admin', 'rh', 'conducteur_travaux', 'chef_chantier']` — saisie terrain, plus large
- Lecture ouverte à tous les rôles authentifiés (statistiques par chantier nécessaires aux décisions)

### UI

- Section RH avec 4 onglets : Aperçu / Employés / Pointages (liste filtrée par mois) / Saisie matrice
- Dashboard `/rh` : 3 tuiles (employés actifs, pointages du mois, heures du mois)
- Liste pointages : filtres mois/année (les filtres employé/chantier/type viendront en M5.3+)
- Saisie matrice : table HTML native (pas de virtualisation — max ~600 cellules/mois acceptable)

## Conséquences

### Positives
- **Continuité** : tout ce qui se faisait dans Pointage est réutilisable, en plus structuré
- **Audit trail complet** : chaque pointage tracé, contrairement au JSON flat de Pointage
- **Pas de duplication** : un employé = une ligne dans `employes`, plus de format "Nom - Type - Société"
- **Référentiel partagé** : les chantiers sont les mêmes que dans `/chantiers`, pas une liste séparée à maintenir
- **Cohérence métier garantie** : CHECK SQL bloque les absences-avec-chantier, les pointages-sans-motif, etc.

### Négatives / Risques
- **Migration de données Pointage → erp-btp** : non couverte en M5.2 (l'utilisateur peut soit ressaisir, soit attendre M5.3 import). Cohérent avec la nature exploratoire de l'application erp-btp en M0.
- **Pas de Budget Pro** : reporté M5.4 (comparaison budget vs réel par chantier).
- **Pas d'export Excel** : reporté M5.3.
- **Pas de PWA/offline** : reporté M5.5 (gros chantier).
- **`responsable_id` chantier reste `utilisateurs.id`** : tant qu'un responsable a un compte utilisateur, c'est OK. Migration vers `employes.id` reportée — pas une priorité.

## Alternatives considérées

1. **Format "string encodée" comme Pointage** (`"Nom - Type - Société"`) — rejeté : non normalisable, impossible à requêter, divergence employé/saisie inéluctable. La table employes est ce qu'on doit avoir en première intention.
2. **Pointage = unique enregistrement à la journée** (pas multi-chantier/jour) — rejeté : un employé peut bouger entre 2 chantiers le même jour (cas réel BTP : matin chantier A, après-midi chantier B).
3. **Saisie unitaire uniquement (pas de matrice)** — rejeté : ergonomie catastrophique pour la saisie mensuelle (~600 saisies/mois pour 20 employés).
4. **Matrice DOM virtualisée (react-virtual)** — reporté : pas nécessaire pour ~600 cellules. À reconsidérer si > 50 employés actifs.
5. **Drag&drop pour copier des heures entre cellules** — reporté : ergonomie agréable mais complexité non triviale, M5.4 si besoin.

## Révision

À revisiter quand :
- M5.3 livrera l'import Excel — il faudra mapper l'ancien format Pointage (string encodée) vers les vraies entités
- M5.4 ajoutera le Budget Pro — utilisera les types `kg_acier_*` et `m3_beton_*` déjà dans l'enum `type_pointage`
- M5.5 attaquera la PWA / offline / IndexedDB — gros morceau (cf. ADR-004)
- M6 (facturation) consommera les heures pointées par chantier pour calculer la marge réelle
