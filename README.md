# Verifyor

Verifyor est un MVP de verification d'adresses email construit en Node.js avec un backend Express et une interface statique en HTML/CSS/JS.

L'application prend une adresse email, interroge ZeroBounce cote serveur, puis affiche une synthese exploitable dans une interface dashboard: delivrabilite, score, risque, suggestion de correction, type d'adresse et quelques enrichissements heuristiques.

## Stack

- Node.js
- Express
- dotenv
- frontend statique sans framework
- ZeroBounce pour la verification email

## Structure

- [server.js](/home/homardsheriff/codex-workspace/verifyor/server.js): serveur Express, endpoint API, appel ZeroBounce, cache memoire, mapping des reponses
- [app.js](/home/homardsheriff/codex-workspace/verifyor/app.js): logique frontend, fetch API, rendu des resultats, historique, aide contextuelle
- [index.html](/home/homardsheriff/codex-workspace/verifyor/index.html): page unique, structure UI et styles
- [test/server.test.js](/home/homardsheriff/codex-workspace/verifyor/test/server.test.js): tests backend et endpoints Express
- [CONTEXT.md](/home/homardsheriff/codex-workspace/verifyor/CONTEXT.md): etat detaille du projet et points d'attention

## Installation

Prerequis:

- Node.js 18+ recommande
- une cle API ZeroBounce

Installation locale:

```bash
npm install
cp .env.example .env
```

Puis renseigner dans `.env`:

```env
PORT=3000
ZEROBOUNCE_API_KEY=your_zerobounce_api_key
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
- cache serveur en memoire sur 5 minutes
- suggestion de correction si ZeroBounce renvoie `did_you_mean`
- historique local de session sur 5 recherches
- vue dashboard avec sections techniques et metier
- enrichissement heuristique du profil et du risque
- export PDF reel cote serveur depuis le resultat courant
- tests backend via `node --test`

## Limites actuelles

- pas de base de donnees
- pas d'authentification
- cache non persistant
- plusieurs enrichissements sont heuristiques et pas garantis

## Securite

- `.env` est ignore par git et ne doit pas etre committe
- seule la cle de demonstration dans `.env.example` doit rester versionnee
- si une vraie cle a deja ete exposee hors machine locale, il faut la faire tourner

## Tests

```bash
npm test
```

## Prochaines etapes probables

- separer davantage le CSS et le HTML
- extraire la logique metier du fichier `server.js`
- enrichir la suite de tests frontend et end-to-end
- ameliorer la qualite des enrichissements
