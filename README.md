# Verifyor

Verifyor est une application de verification et d'intelligence email construite en Node.js avec un backend Express, une interface statique HTML/CSS/JS et une persistance SQLite locale.

L'application prend une adresse email, interroge ZeroBounce cote serveur, puis affiche une synthese exploitable dans une interface dashboard: delivrabilite, score, risque, suggestion de correction, type d'adresse et quelques enrichissements heuristiques.

## Stack

- Node.js
- Express
- dotenv
- SQLite locale via `node:sqlite`
- frontend statique sans framework
- ZeroBounce pour la verification email
- Abstract pour la verification email alternative
- Hunter pour l'intelligence B2B
- Gravatar pour les profils publics

## Structure

- [server.js](/home/homardsheriff/codex-workspace/verifyor/server.js): bootstrap HTTP et routes Express
- [app.js](/home/homardsheriff/codex-workspace/verifyor/app.js): logique frontend, fetch API, rendu des resultats, historique, aide contextuelle
- [index.html](/home/homardsheriff/codex-workspace/verifyor/index.html): page unique et structure UI
- [styles.css](/home/homardsheriff/codex-workspace/verifyor/styles.css): styles extraits du HTML
- [lib/db.js](/home/homardsheriff/codex-workspace/verifyor/lib/db.js): persistence SQLite dashboard et enrichissements
- [services/verification-service.js](/home/homardsheriff/codex-workspace/verifyor/services/verification-service.js): logique ZeroBounce et enrichissements email
- [services/report-service.js](/home/homardsheriff/codex-workspace/verifyor/services/report-service.js): generation PDF
- [services/intelligence-service.js](/home/homardsheriff/codex-workspace/verifyor/services/intelligence-service.js): Hunter, Gravatar et matching LinkedIn pragmatique
- [test/server.test.js](/home/homardsheriff/codex-workspace/verifyor/test/server.test.js): tests backend et endpoints Express
- [CONTEXT.md](/home/homardsheriff/codex-workspace/verifyor/CONTEXT.md): etat detaille du projet et points d'attention

## Installation

Prerequis:

- Node.js 18+ recommande
- une cle API ZeroBounce
- optionnel: une cle API Hunter
- optionnel: une cle API Gravatar
- optionnel: une cle API Abstract

Installation locale:

```bash
npm install
cp .env.example .env
```

Puis renseigner dans `.env`:

```env
PORT=3000
ZEROBOUNCE_API_KEY=your_zerobounce_api_key
HUNTER_API_KEY=test-api-key
GRAVATAR_API_KEY=
ABSTRACT_API_KEY=
VERIFYOR_DEFAULT_PROVIDER=auto
```

## Lancement

```bash
npm start
```

Ensuite ouvrir:

```text
http://localhost:3000
```

## API

Le backend expose un endpoint:

```http
GET /api/verify?email=user@example.com
```

et un endpoint d'export:

```http
POST /api/report/pdf
Content-Type: application/json
```

et des endpoints d'intelligence:

```http
GET  /api/analyses?limit=5
GET  /api/dashboard/summary
GET  /api/verification/providers
GET  /api/admin/history?limit=100
POST /api/intelligence/hunter
POST /api/intelligence/gravatar
POST /api/intelligence/linkedin-match
```

Page d'administration:

```text
/admin/db
```

Exemples de champs renvoyes:

- `status`
- `sub_status`
- `mx_found`
- `smtp_valid`
- `quality_score`
- `score`
- `risk`
- `did_you_mean`
- `email_type`
- `provider_type`
- `firstname`
- `lastname`
- `full_name`

## Fonctionnalites actuelles

- validation email cote client et cote serveur
- verification reelle via ZeroBounce
- verification alternative via Abstract
- verification locale DNS/MX sans API externe
- mode `auto` qui essaie ZeroBounce, puis Abstract, puis fallback local
- cache serveur en memoire sur 5 minutes
- suggestion de correction si ZeroBounce renvoie `did_you_mean`
- sauvegarde des analyses en SQLite et affichage sur le dashboard
- vue dashboard avec sections techniques et metier
- enrichissement heuristique du profil et du risque
- export PDF reel cote serveur depuis le resultat courant
- bouton `B2B email intelligence` alimente par Hunter
- bouton `Gravatar lookup` pour avatar et profil public
- bouton `LinkedIn matching` base sur des signaux publics disponibles
- page `/admin/db` pour consulter la base et l'historique des recherches
- tests backend via `node --test`

## Limites actuelles

- pas d'authentification
- plusieurs enrichissements sont heuristiques et pas garantis
- le matching LinkedIn n'utilise pas une API officielle de recherche arbitraire
- le mode local DNS/MX ne remplace pas une verification SMTP ou une reputation provider

## Securite

- `.env` est ignore par git et ne doit pas etre committe
- seule la cle de demonstration dans `.env.example` doit rester versionnee
- si une vraie cle a deja ete exposee hors machine locale, il faut la faire tourner

## Tests

```bash
npm test
```

## Prochaines etapes probables

- enrichir la suite de tests frontend et end-to-end
- ameliorer la qualite des enrichissements
- ajouter une vraie auth et des permissions
