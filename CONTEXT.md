# Verifyor - Contexte actuel

Date de mise a jour: 2026-04-13

## Vue d'ensemble

Verifyor est actuellement un MVP Node.js/Express tres compact:

- backend dans `server.js`
- frontend statique dans `index.html` + `app.js` + `styles.css`
- pas de framework front
- persistence SQLite locale pour les analyses dashboard et enrichissements
- tests backend presents
- depot Git initialise et pousse sur GitHub: `nouhailler/verifyor`
- README present

L'application sert a verifier une adresse email via l'API ZeroBounce et a presenter le resultat dans une interface dashboard.

## Ce qui est deja en place

### Backend

`server.js` expose:

- un serveur Express
- un endpoint `GET /api/verify?email=...`
- un endpoint `POST /api/report/pdf`
- des endpoints dashboard `/api/analyses` et `/api/dashboard/summary`
- des endpoints d'intelligence `/api/intelligence/hunter`, `/api/intelligence/gravatar`, `/api/intelligence/linkedin-match`
- le service des fichiers statiques depuis la racine
- un fallback `GET *` vers `index.html`

Le backend:

- charge la config via `dotenv`
- attend `PORT`, `ZEROBOUNCE_API_KEY`, et optionnellement `HUNTER_API_KEY` / `GRAVATAR_API_KEY`
- appelle `https://api.zerobounce.net/v2/validate`
- met en cache les reponses 5 minutes en memoire (`Map`)
- normalise et valide l'email cote serveur
- exporte maintenant l'application et les fonctions coeur pour les tests
- delegue maintenant la logique metier a des modules `services/*` et `lib/db.js`

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

Le backend sait aussi generer un PDF simple sans dependance externe a partir du resultat de verification courant.

Il sait aussi:

- sauvegarder les analyses et enrichissements en SQLite
- charger un snapshot dashboard recent
- interroger Hunter pour l'intelligence B2B
- interroger Gravatar pour les profils publics
- produire un matching LinkedIn pragmatique a partir de signaux publics

### Frontend

Le frontend est une single page statique assez riche:

- saisie et validation live de l'email
- appel de `/api/verify`
- historique recent charge depuis SQLite
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
  - module `B2B email intelligence`
  - module `Gravatar lookup`
  - module `LinkedIn matching`

Le bouton PDF est maintenant branche au backend et telecharge un vrai fichier `.pdf`.

## Ce qui semble fonctionnel aujourd'hui

- la syntaxe JS est valide: `node --check server.js` et `node --check app.js` passent
- les dependances sont deja installees (`node_modules` present)
- la structure du MVP est exploitable telle quelle
- l'API ZeroBounce est branchee cote serveur
- `npm test` passe

## Limites / trous actuels

### 1. Historique Git tres recent

Le projet est maintenant versionne, mais l'historique disponible reste minimal a ce stade.

En pratique:

- le depot Git existe bien
- un premier import a ete pousse sur GitHub
- l'historique anterieur a cet import n'est pas reconstructible automatiquement

Ce fichier documente donc surtout l'etat courant du projet.

### 2. Persistence simple mais locale

Les analyses du dashboard et les enrichissements sont maintenant sauvegardes en SQLite locale.

Limites:

- pas de migration formelle
- pas de replication
- pas de gestion multi-instance
- base locale ignoree par Git

### 3. Heuristiques "metier" encore approximatives

Plusieurs enrichissements sont heuristiques et non issus d'une vraie source d'intelligence:

- estimation de l'age du domaine
- distinction `free` / `corporate`
- deduction du nom depuis le local-part de l'email
- score fallback
- matching LinkedIn non officiel, construit a partir de Hunter/Gravatar/signaux publics

Ces choix sont utiles pour le MVP mais doivent etre consideres comme approximatifs.

### 4. Pas de gestion avancee des erreurs / observabilite

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
- `index.html`: structure complete de l'interface
- `styles.css`: styles separes du HTML
- `lib/db.js`: base SQLite locale
- `services/verification-service.js`: logique ZeroBounce et enrichissements coeur
- `services/report-service.js`: PDF
- `services/intelligence-service.js`: Hunter, Gravatar, LinkedIn matching pragmatique
- `test/server.test.js`: tests backend et endpoints Express en memoire
- `.env.example`: variables attendues
- `.env`: configuration locale active
- `package.json`: scripts `start` et `test`

## Comment relancer rapidement

1. Verifier que `ZEROBOUNCE_API_KEY` est correcte dans `.env`
2. Optionnel: renseigner `HUNTER_API_KEY` et `GRAVATAR_API_KEY`
3. Lancer `npm start`
4. Ouvrir `http://localhost:3000`
5. Tester une adresse email depuis l'interface
6. Utiliser les modules B2B / Gravatar / LinkedIn matching
7. Lancer `npm test` pour verifier le backend

## Prochaines etapes logiques

Si l'objectif est de faire evoluer Verifyor au-dela du MVP, les priorites raisonnables sont:

1. ajouter une authentification et des roles
2. stabiliser la couche SQLite avec migrations et retention
3. enrichir progressivement l'historique Git avec des changements atomiques
4. ajouter des tests frontend ou end-to-end
5. renforcer la qualite des enrichissements metier
6. brancher une integration LinkedIn officielle consent-based si necessaire

## Resume court

Verifyor est aujourd'hui un MVP fonctionnel de verification email branche a ZeroBounce, avec persistence SQLite locale, export PDF, base de tests backend, et trois modules d'intelligence additionnels: Hunter-like B2B, Gravatar et LinkedIn matching pragmatique. Les principaux manques sont maintenant surtout l'auth, des tests plus larges, et une eventuelle integration LinkedIn officielle si tu veux un matching garanti par OAuth.
