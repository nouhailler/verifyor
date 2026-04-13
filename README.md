# Verifyor 2.0.0

Verifyor est une plateforme locale de verification et d'intelligence email. Elle combine plusieurs providers externes, un moteur local DNS/MX/SMTP, une persistance SQLite, un dashboard d'analyse, une recherche avancée en base et des modules d'enrichissement B2B/social.

L'objectif n'est plus seulement de dire si une adresse semble valide, mais d'expliquer pourquoi, avec des sous-scores, des signaux techniques, des drapeaux de risque et un contexte metier exploitable.

## Principales fonctionnalites

- verification email via `ZeroBounce`, `Abstract`, ou moteur `local`
- mode `auto` avec fallback automatique vers le moteur local
- verification locale avec DNS/MX, analyse DNS et tentative de SMTP handshake avance
- classification SMTP: `mailbox_exists`, `accept_all`, `greylisting`, `tempfail`, `mailbox_not_found`, `smtp_unreachable`
- detection `catch-all probable`
- analyse DNS et securite de domaine: `SPF`, `DKIM`, `DMARC`, `BIMI`, `MTA-STS`, `TLS-RPT`
- typologie de domaine: domaine parque, domaine sans site web, MX incoherents, domaine estime recent
- score explicable avec sous-scores:
  - `deliverability`
  - `fraud_risk`
  - `identity_confidence`
  - `domain_trust`
- niveau de confiance: `high confidence`, `medium confidence`, `low confidence`
- enrichissement B2B via Hunter:
  - recherche par domaine
  - pattern detection
  - emails publics probables
  - enrichissement entreprise
  - segmentation entreprise
  - technologies et signaux de recrutement quand disponibles
- enrichissement social:
  - `Gravatar lookup`
  - `LinkedIn matching`
  - profils sociaux publics consolides quand disponibles
- annotations manuelles:
  - tags
  - note libre sur une analyse
- export PDF enrichi:
  - synthese executive
  - drapeaux de risque
  - sous-scores
  - sources utilisees
  - annotations
- historique SQLite local
- page admin DB
- page de recherche DB multi-criteres

## Stack

- Node.js
- Express
- dotenv
- SQLite locale via `node:sqlite`
- frontend statique HTML / CSS / JS
- ZeroBounce
- Abstract
- Hunter
- Gravatar

## Structure

- [server.js](/home/homardsheriff/codex-workspace/verifyor/server.js): bootstrap HTTP et routes Express
- [app.js](/home/homardsheriff/codex-workspace/verifyor/app.js): logique frontend principale
- [index.html](/home/homardsheriff/codex-workspace/verifyor/index.html): dashboard principal
- [search-db.html](/home/homardsheriff/codex-workspace/verifyor/search-db.html): recherche en base
- [search-db.js](/home/homardsheriff/codex-workspace/verifyor/search-db.js): filtres multi-champs et detail inline
- [admin-db.html](/home/homardsheriff/codex-workspace/verifyor/admin-db.html): consultation de la base
- [admin-db.js](/home/homardsheriff/codex-workspace/verifyor/admin-db.js): historique et detail admin
- [settings.html](/home/homardsheriff/codex-workspace/verifyor/settings.html): configuration locale
- [settings.js](/home/homardsheriff/codex-workspace/verifyor/settings.js): logique de parametrage
- [styles.css](/home/homardsheriff/codex-workspace/verifyor/styles.css): styles globaux
- [lib/db.js](/home/homardsheriff/codex-workspace/verifyor/lib/db.js): persistence SQLite, historique, recherche, annotations
- [lib/settings.js](/home/homardsheriff/codex-workspace/verifyor/lib/settings.js): lecture/ecriture de `.env`
- [services/verification-service.js](/home/homardsheriff/codex-workspace/verifyor/services/verification-service.js): verification email, DNS, SMTP, scoring
- [services/intelligence-service.js](/home/homardsheriff/codex-workspace/verifyor/services/intelligence-service.js): Hunter, Gravatar, LinkedIn matching
- [services/report-service.js](/home/homardsheriff/codex-workspace/verifyor/services/report-service.js): generation PDF
- [services/provider-status.js](/home/homardsheriff/codex-workspace/verifyor/services/provider-status.js): etat runtime des providers
- [test/server.test.js](/home/homardsheriff/codex-workspace/verifyor/test/server.test.js): tests backend
- [CONTEXT.md](/home/homardsheriff/codex-workspace/verifyor/CONTEXT.md): contexte de reprise

## Installation

Prerequis:

- Node.js 18+ recommande
- cles API optionnelles selon les modules utilises

Installation locale:

```bash
npm install
cp .env.example .env
```

Exemple de configuration:

```env
PORT=3000
ZEROBOUNCE_API_KEY=
ABSTRACT_API_KEY=
HUNTER_API_KEY=test-api-key
GRAVATAR_API_KEY=
VERIFYOR_DEFAULT_PROVIDER=auto
```

## Lancement

```bash
npm start
```

Applications disponibles:

- `http://localhost:3000/`
- `http://localhost:3000/admin/db`
- `http://localhost:3000/search/db`
- `http://localhost:3000/settings`

## Base de donnees

Base SQLite locale par defaut:

```text
data/verifyor.sqlite
```

Tu peux changer le chemin avec:

```env
VERIFYOR_DB_PATH=/chemin/vers/verifyor.sqlite
```

## Providers de verification

Verifyor supporte 4 modes:

- `auto`
- `local`
- `zerobounce`
- `abstract`

Le mode `auto` essaie:

1. `ZeroBounce`
2. `Abstract`
3. `local`

Si les APIs externes ne sont pas disponibles ou que les cles sont invalides, Verifyor degrade vers le moteur local et l'indique explicitement dans l'UI.

## Endpoints principaux

Verification et dashboard:

```http
GET  /api/verify?email=user@example.com&provider=auto
GET  /api/analyses?limit=5
GET  /api/dashboard/summary
GET  /api/verification/providers
```

Administration et recherche:

```http
GET  /api/admin/history?limit=100
GET  /api/admin/analyses/:id
POST /api/admin/analyses/:id/annotations
GET  /api/admin/search?...filtres...
```

Intelligence:

```http
POST /api/intelligence/hunter
POST /api/intelligence/gravatar
POST /api/intelligence/linkedin-match
```

Configuration et export:

```http
GET  /api/settings
POST /api/settings
POST /api/report/pdf
```

## Recherche DB

La page `/search/db` permet de filtrer les analyses sur un champ ou une combinaison de champs, notamment:

- provider de verification
- statut et sous-statut
- domaine
- noms
- flags booleens
- scores exacts ou par bornes min/max
- recherche libre dans le payload JSON
- dates

Chaque resultat est cliquable et affiche un detail inline avec une lecture humaine du payload.

## PDF

Le rapport PDF comprend maintenant:

- synthese executive
- niveau de confiance
- drapeaux de risque
- details techniques
- sous-scores
- signaux DNS / SMTP
- sources utilisees
- tags et note d'analyse

## Tests

```bash
npm test
```

## Limites connues

- le `SMTP handshake avance` depend du reseau local et de l'acces sortant au port `25`
- certains enrichissements externes dependent du plan API et des credits restants
- le matching LinkedIn reste indirect et n'utilise pas une API officielle de recherche arbitraire
- plusieurs enrichissements B2B/social restent opportunistes: ils fonctionnent quand des signaux publics existent
- `node:sqlite` reste marque experimental par Node.js

## Securite

- `.env` est ignore par Git
- ne jamais committer une vraie cle API
- si une vraie cle a circule hors machine locale, il faut la faire tourner

## Release

Cette version correspond a `2.0.0`.
