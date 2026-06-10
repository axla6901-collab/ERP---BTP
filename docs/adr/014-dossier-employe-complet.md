# ADR-014 — Dossier employé BTP complet (M5.4)

- **Statut** : Accepté
- **Date** : 2026-05-21
- **Décideur** : @aacosta

## Contexte

M5.1 a posé un socle employés minimal (10 champs). Insuffisant pour un usage réel : il manque l'identité civile, l'adresse personnelle, la situation familiale, la paie, le médical, la carte BTP, les habilitations CACES/AIPR/électriques, les permis, et les documents administratifs (CV, contrats, justificatifs).

Cette itération porte la table `employes` à ~50 colonnes et ajoute 3 tables filles (`employe_habilitations`, `employe_permis`, `employe_documents`).

## Décision

### Élargissement table `employes`

Champs ajoutés, regroupés thématiquement :
- **Identité civile** : date_naissance, lieu_naissance, nationalité, numero_secu (CHECK 13-15 chiffres), sexe
- **Adresse perso** : ligne1/ligne2, code_postal (CHECK 5 digits FR), ville, pays
- **Contact urgence** : nom + téléphone + relation
- **Famille** : situation_familiale (enum), nombre_enfants (CHECK 0-20)
- **Contrat avancé** : matricule (UNIQUE partiel), date_embauche, date_fin_contrat, coefficient, classification (enum ouvrier/etam/cadre/apprenti), salaire_mensuel_brut, convention_collective
- **Banque** : iban (CHECK ISO format), bic
- **Médical** : date_derniere_visite, date_prochaine_visite, aptitude (enum)
- **Carte BTP** : numero, date_validite

Renommage : `telephone` → `telephone_mobile`, ajout de `telephone_fixe` séparé. Les imports antérieurs gardent leur valeur sous `telephone_mobile` (présomption raisonnable pour un employé BTP).

### Tables séparées

**`employe_habilitations`** — chaque habilitation a sa propre date d'obtention/validité.
- Enum `type_habilitation` couvre les principales habilitations BTP : CACES R482 (engins de chantier A→G), R489 (chariots élévateurs 1A/1B/3/5/6), AIPR (concepteur/encadrant/opérateur), électrique (B0/BE/B1V/B2V/BR/BC/HF), SST, et `autre` pour les cas spécifiques.
- Index sur `date_validite` pour générer les alertes d'échéance (M9 ou plus tôt).
- ON DELETE CASCADE sur `employe_id` : si on supprime hard un employé (hors-scope M5), les habilitations partent.

**`employe_permis`** — un permis par catégorie.
- Enum `categorie_permis` : B, BE, C, C1, C1E, CE, D, D1, D1E, DE.
- UNIQUE partiel `(employe_id, categorie) WHERE deleted_at IS NULL` : impossible d'avoir 2 fois le même permis.

**`employe_documents`** — métadonnées + clé MinIO.
- Stockage du fichier dans MinIO via presigned upload URL (cf. `lib/storage/s3.ts`).
- DB ne stocke que `minio_key`, `mime_type`, `taille_bytes` (max 25 Mo via Server Action).
- Enum `type_document_employe` : cv, photo, contrat, attestations, carte_identite, passeport, titre_sejour, justificatif_domicile, rib, carte_vitale, carte_btp, diplome, certificat_medical, autre.
- `date_validite` optionnelle (titres de séjour, certificats médicaux, etc.).

### Architecture upload

Flux en deux temps pour éviter de transiter le fichier par le Server Action (Next.js limite ~10 Mo via FormData) :

1. Client demande une presigned URL via `preparerUploadDocument(employeId, contentType, filename, tailleBytes)` — vérifie taille max + génère la clé MinIO.
2. Client fait `fetch(uploadUrl, { method: 'PUT', body: file })` direct vers MinIO.
3. Client appelle `enregistrerDocument(employeId, { libelle, type, mimeType, tailleBytes, minioKey, ... })` qui insère les métadonnées.

Download : presigned URL via `urlTelechargementDocument(id)`, expiration 10 min.

### Permissions

Tous les rôles `ROLES_RH_WRITE = ['admin', 'rh', 'comptable']` (inchangé). Le dossier contient des données sensibles (n° sécu, IBAN) qui ne doivent pas circuler aux autres rôles.

### UI

**Form employé** — refonte en **8 sections accordéon** (HTML `<details>` natif, pas de lib) :
1. Identité professionnelle (nom, prénom, matricule, qualif, classif, coef, contrat, dates, paie, zone)
2. Identité civile (naissance, sécu, sexe, nationalité)
3. Coordonnées (adresse + contacts + urgence)
4. Situation familiale
5. Banque
6. Médical
7. Carte BTP
8. Notes

**Composants dédiés** sur la page détail :
- `<HabilitationsList>` — liste + form inline d'ajout, suppression, badge statut validité (Valide / J-30 / Expirée)
- `<PermisList>` — idem
- `<DocumentsList>` — upload (input file + metadata), download via presigned URL, suppression soft

## Conséquences

### Positives
- **Dossier RH complet** : couvre tous les besoins d'une PME BTP française standard
- **Conformité légale** : carte BTP, visite médicale, habilitations sont des obligations réelles → désormais traçables
- **Alertes d'échéances possibles** : `date_validite` sur habilitations/permis/documents → M9 ajoutera un job d'alertes 30/15/7 jours avant
- **Upload sécurisé** : presigned URLs MinIO sans transit serveur → scalable et économique
- **Audit log RGPD-friendly** : chaque modification de données personnelles tracée

### Négatives / Risques
- **Taille de la table employes** : ~50 colonnes. Acceptable techniquement, mais le form devient long → mitigé par les sections accordéon.
- **N° sécu en clair** : pas de chiffrement at-rest spécifique en M5.4. À renforcer si requirements RGPD/audit poussés (M9). Pour l'instant, restriction aux rôles RH suffisante.
- **IBAN au format texte** : pas de validation cryptographique de la clé de contrôle (algorithme MOD-97). Acceptable pour la saisie initiale, à durcir en M6 si paiement automatisé.
- **Suppression documents MinIO** : la suppression DB est soft. Les objets MinIO restent jusqu'à un job de purge à écrire (M9 — rétention RGPD).
- **Pas d'historique des modifications du dossier** : on a `audit_log` mais pas de versioning fin par champ. Si besoin, table `employes_history` plus tard.

## Alternatives considérées

1. **Tout en une seule grande table avec arrays Postgres pour habilitations/permis** — rejeté : impossible de gérer une `date_validite` par habilitation, et pas d'index efficace sur les éléments d'un array.
2. **Stocker les documents en bytea dans Postgres** — rejeté : explosion de la taille DB, perte de l'asynchrone upload, dump/restore lent. MinIO + presigned URLs est l'approche standard.
3. **Tabs sur la page détail (au lieu de sections accordéon)** — rejeté : pas de composant Tabs shadcn installé, et l'accordéon HTML natif est suffisant.
4. **Coffre-fort RGPD séparé pour les données sensibles** — reporté : trop complexe pour M5.4, à reconsidérer si l'application est utilisée par > 1 entité.
5. **Champs custom par employeur** (extensible) — rejeté : YAGNI, le schéma fixe couvre les besoins métiers identifiés.

## Révision

À revisiter quand :
- Plus de 50 employés actifs régulièrement → dashboard d'alertes d'échéances (visite médicale, CACES, etc.) en M9
- L'application sert plusieurs entités → chiffrement at-rest des champs sensibles (numero_secu, iban)
- Multi-RH → permissions plus fines (lecture seule sur paie pour le conducteur de travaux)
- M6 (facturation/paie) → consommation du salaire mensuel pour pré-paie + IBAN pour SEPA
- M9 (documents administratifs entreprise) → factoriser la table `documents` (commune employes + chantiers + entreprise)
