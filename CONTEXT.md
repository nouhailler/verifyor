# Verifyor - Contexte actuel

Date de mise a jour: 2026-04-13

## Vue d'ensemble

Verifyor est actuellement un MVP Node.js/Express tres compact:

- backend dans `server.js`
- frontend statique dans `index.html` + `app.js`
- pas de framework front
- pas de base de donnees
- pas de tests
- depot Git initialise et pousse sur GitHub: `nouhailler/verifyor`
- README present

L'application sert a verifier une adresse email via l'API ZeroBounce et a presenter le resultat dans une interface dashboard.

## Ce qui est deja en place

### Backend

`server.js` expose:

- un serveur Express
- un endpoint `GET /api/verify?email=...`
- le service des fichiers statiques depuis la racine
- un fallback `GET *` vers `index.html`

Le backend:

- charge la config via `dotenv`
- attend `PORT` et `ZEROBOUNCE_API_KEY`
- appelle `https://api.zerobounce.net/v2/validate`
- met en cache les reponses 5 minutes en memoire (`Map`)
- normalise et valide l'email cote serveur

Le mapping ZeroBounce vers le payload frontend est deja enrichi:

- `status`, `sub_status`
- `mx_found`, `smtp_valid`
- `disposable`, `toxic`
- `quality_score`
- suggestion `did_you_mean`
- type d'email `personal` / `professional`
- type de provider `free` / `corporate`
- estimation grossiere de l'age du domaine
- niveau de risque `low` / `medium` / `high`
- inference de prenom / nom a partir de l'email quand ZeroBounce ne renvoie rien

Un score de secours est calcule si ZeroBounce renvoie un score inutilisable alors que l'adresse est `valid`.

### Frontend

Le frontend est une single page statique assez riche:

- saisie et validation live de l'email
- appel de `/api/verify`
- historique local en `sessionStorage` sur 5 recherches
- affichage detaille du resultat
- suggestion de correction si `did_you_mean`
- modal d'aide contextuelle
- sections UI:
  - verification technique
  - score de confiance
  - profil enrichi
  - section "IA" basee surtout sur le score
  - intelligence risque / recommandations
  - bouton d'export PDF

## Ce qui semble fonctionnel aujourd'hui

- la syntaxe JS est valide: `node --check server.js` et `node --check app.js` passent
- les dependances sont deja installees (`node_modules` present)
- la structure du MVP est exploitable telle quelle
- l'API ZeroBounce est branchee cote serveur

## Limites / trous actuels

### 1. Historique Git tres recent

Le projet est maintenant versionne, mais l'historique disponible reste minimal a ce stade.

En pratique:

- le depot Git existe bien
- un premier import a ete pousse sur GitHub
- l'historique anterieur a cet import n'est pas reconstructible automatiquement

Ce fichier documente donc surtout l'etat courant du projet.

### 2. Export PDF non implemente

Le bouton PDF existe dans l'UI, mais `handlePdfDownload()` n'exporte rien.

Etat reel:

- message de statut seulement
- aucun backend dedie
- aucun fichier PDF genere

### 3. Pas de tests

Il n'y a ni tests unitaires, ni tests d'integration, ni smoke tests automatises.

### 4. Pas de persistence

Le cache serveur est en memoire:

- perdu au restart
- non partage si plusieurs instances

L'historique utilisateur est en `sessionStorage`:

- limite au navigateur courant
- perdu si la session est effacee

### 5. Heuristiques "metier" encore approximatives

Plusieurs enrichissements sont heuristiques et non issus d'une vraie source d'intelligence:

- estimation de l'age du domaine
- distinction `free` / `corporate`
- deduction du nom depuis le local-part de l'email
- score fallback

Ces choix sont utiles pour le MVP mais doivent etre consideres comme approximatifs.

### 6. Pas de gestion avancee des erreurs / observabilite

- logs minimum via `console.error`
- pas de monitoring
- pas de tracing
- pas de rate limiting
- pas d'auth

## Risques immediats

### Cle API presente dans `.env`

Une vraie valeur `ZEROBOUNCE_API_KEY` est actuellement stockee dans `.env` a la racine.

Actions recommandees:

- ne pas committer ce fichier
- faire une rotation de cle si elle a deja circule
- conserver seulement `.env.example` dans le versioning

### Sandboxing local

Dans mon environnement, `npm start` n'a pas pu ouvrir le port 3000 a cause d'une restriction sandbox (`EPERM` sur `0.0.0.0:3000`).

Cela ne prouve pas que l'application est en panne chez toi: cela bloque seulement la verification de demarrage dans cet environnement de travail.

## Fichiers importants

- `server.js`: backend Express + appel ZeroBounce + mapping + cache
- `app.js`: logique UI, fetch API, rendu des cartes, aide, historique
- `index.html`: structure complete de l'interface et styles inline
- `.env.example`: variables attendues
- `.env`: configuration locale active
- `package.json`: projet Node minimal avec script `start`

## Comment relancer rapidement

1. Verifier que `ZEROBOUNCE_API_KEY` est correcte dans `.env`
2. Lancer `npm start`
3. Ouvrir `http://localhost:3000`
4. Tester une adresse email depuis l'interface

## Prochaines etapes logiques

Si l'objectif est de faire evoluer Verifyor au-dela du MVP, les priorites raisonnables sont:

1. sortir les styles inline de `index.html`
2. implementer un vrai export PDF
3. ajouter des tests sur `server.js`
4. mieux separer logique metier et rendu frontend
5. securiser la gestion des secrets
6. enrichir progressivement l'historique Git avec des changements atomiques

## Resume court

Verifyor est aujourd'hui un MVP fonctionnel de verification email branche a ZeroBounce, avec une UI dashboard assez avancee et un backend minimal. Le coeur "verification + enrichissement + affichage" est present. Les principaux manques sont surtout l'absence de tests, l'export PDF non fini et le besoin de mieux securiser la gestion des secrets locaux.
