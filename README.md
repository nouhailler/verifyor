<div align="center">

<img src="packaging/verifyor.svg" alt="Verifyor" width="96" height="96"/>

# Verifyor

**Plateforme locale de vérification et d'intelligence email**

[![Version](https://img.shields.io/badge/version-2.0.0-1a2b3c?style=flat-square)](https://github.com/nouhailler/verifyor/releases/latest)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/licence-MIT-006d37?style=flat-square)](LICENSE)
[![Debian](https://img.shields.io/badge/paquet-.deb-A80030?style=flat-square&logo=debian&logoColor=white)](https://github.com/nouhailler/verifyor/releases/latest)

*Vérifier une adresse email ne suffit plus. Verifyor explique **pourquoi** elle est valide, qui en est probablement propriétaire, et quel risque elle représente.*

[📦 Télécharger le .deb](https://github.com/nouhailler/verifyor/releases/latest) • [📖 Guide d'installation](INSTALL.md) • [🗂 Contexte projet](CONTEXT.md)

</div>

---

## ✨ Fonctionnalités

### 🔍 Vérification email multi-provider

| Provider | Mode | Description |
|----------|------|-------------|
| `local` | Gratuit, sans clé | DNS/MX + SMTP handshake avancé |
| `zerobounce` | API payante | Vérification cloud ZeroBounce |
| `abstract` | API freemium | Vérification cloud Abstract |
| `auto` | **Recommandé** | Essaie ZeroBounce → Abstract → local |

> En mode `auto`, si les APIs externes sont indisponibles ou sans crédit, Verifyor dégrade silencieusement vers le moteur local.

### 📡 Moteur local DNS/MX/SMTP

- Résolution MX, analyse de cohérence, détection de domaine parqué
- SMTP handshake avancé avec classification :
  `mailbox_exists` · `accept_all` · `greylisting` · `tempfail` · `mailbox_not_found` · `smtp_unreachable`
- Détection `catch-all probable`

### 🛡 Analyse DNS & sécurité domaine

`SPF` · `DKIM` · `DMARC` · `BIMI` · `MTA-STS` · `TLS-RPT`

### 📊 Score explicable

Chaque analyse produit 4 sous-scores :

| Sous-score | Description |
|-----------|-------------|
| `deliverability` | Probabilité que l'email soit livrable |
| `fraud_risk` | Signaux d'usage frauduleux ou jetable |
| `identity_confidence` | Fiabilité de l'identité associée |
| `domain_trust` | Réputation et maturité du domaine |

Niveau de confiance global : `high confidence` · `medium confidence` · `low confidence`

### 🏢 Enrichissement B2B — Hunter.io

- Recherche par domaine (pattern email détecté, emails publics probables)
- Données entreprise : taille, secteur, technos, signaux de recrutement
- Segmentation et contexte commercial

### 👤 Enrichissement social

- **Gravatar** — avatar et profil public associés à l'adresse email
- **LinkedIn matching** — matching pragmatique depuis les signaux publics

### 📝 Annotations manuelles

Tags libres + note textuelle sur chaque analyse, persistés en SQLite.

### 📄 Export PDF enrichi

Rapport complet incluant : synthèse executive · niveau de confiance · drapeaux de risque · sous-scores · signaux DNS/SMTP · sources utilisées · annotations.

### 🗄 Historique SQLite local

- Page admin `/admin/db` — consultation de toutes les analyses
- Page recherche `/search/db` — filtres multi-critères avancés

---

## 🚀 Installation rapide

> **⚠️ Prérequis obligatoire : Node.js 22.5+**
> Verifyor utilise `node:sqlite`, un module natif disponible uniquement à partir de Node.js 22.5.0.
> Node.js 18, 20 ou 21 ne suffit pas — voir [INSTALL.md](INSTALL.md) pour vérifier et mettre à jour sans conflit.

### Via le paquet Debian (recommandé)

```bash
# 1. Vérifier / installer Node.js 22 (sans conflit avec une version existante)
bash <(curl -fsSL https://github.com/nouhailler/verifyor/raw/main/scripts/install-node.sh)

# 2. Télécharger le paquet
wget https://github.com/nouhailler/verifyor/releases/latest/download/verifyor_2.0.0_all.deb

# 3. Installer
sudo dpkg -i verifyor_2.0.0_all.deb

# 4. Configurer vos clés API (optionnel)
sudo nano /opt/verifyor/.env

# 5. Lancer
verifyor
```

> Guide complet : [INSTALL.md](INSTALL.md)

### Via les sources

```bash
git clone https://github.com/nouhailler/verifyor.git
cd verifyor
npm install
cp .env.example .env
npm start
```

## PWA Netlify sans backend

Une version PWA statique peut être construite pour Netlify :

```bash
npm run build:netlify
```

Netlify utilise `netlify.toml` et publie uniquement `dist/netlify`.

Cette version ne déploie aucune Netlify Function et ne persiste rien dans le cloud. Les recherches et annotations sont conservées uniquement dans le `localStorage` du navigateur.

Limites du mode PWA statique :

- SMTP sur le port 25 désactivé ;
- pas de base SQLite ou cloud ;
- pas de ZeroBounce, Abstract, Hunter ou Gravatar côté serveur ;
- pas de résolution DNS/MX serveur depuis le navigateur ;
- export PDF remplacé par un export JSON local sans backend.

---

## ⚙️ Configuration

Copier `.env.example` vers `.env` et renseigner les variables :

```env
PORT=3000
VERIFYOR_DEFAULT_PROVIDER=auto

# Providers cloud (optionnels — le moteur local fonctionne sans clé)
ZEROBOUNCE_API_KEY=
ABSTRACT_API_KEY=

# Enrichissement B2B et social (optionnels)
HUNTER_API_KEY=
GRAVATAR_API_KEY=

# Chemin personnalisé pour la base SQLite (optionnel)
VERIFYOR_DB_PATH=data/verifyor.sqlite
```

---

## 🌐 Pages & Endpoints

### Pages web

| URL | Description |
|-----|-------------|
| `http://localhost:3000/` | Dashboard principal |
| `http://localhost:3000/admin/db` | Historique des analyses |
| `http://localhost:3000/search/db` | Recherche multi-critères |
| `http://localhost:3000/settings` | Configuration clés API |

### API REST

<details>
<summary><strong>Vérification & Dashboard</strong></summary>

```http
GET  /api/verify?email=user@example.com&provider=auto
GET  /api/analyses?limit=5
GET  /api/dashboard/summary
GET  /api/verification/providers
```
</details>

<details>
<summary><strong>Administration & Recherche</strong></summary>

```http
GET  /api/admin/history?limit=100
GET  /api/admin/analyses/:id
POST /api/admin/analyses/:id/annotations
GET  /api/admin/search?domain=example.com&status=valid&...
```
</details>

<details>
<summary><strong>Intelligence B2B & Social</strong></summary>

```http
POST /api/intelligence/hunter
POST /api/intelligence/gravatar
POST /api/intelligence/linkedin-match
```
</details>

<details>
<summary><strong>Configuration & Export</strong></summary>

```http
GET  /api/settings
POST /api/settings
POST /api/report/pdf
```
</details>

---

## 🏗 Architecture

```
verifyor/
├── server.js                      # Bootstrap HTTP, routes Express
├── app.js                         # Logique frontend principale
├── index.html                     # Dashboard principal
├── search-db.html / search-db.js  # Recherche multi-critères
├── admin-db.html / admin-db.js    # Administration historique
├── settings.html / settings.js    # Configuration clés API
├── styles.css                     # Styles globaux
├── lib/
│   ├── db.js                      # Persistance SQLite, recherche, annotations
│   └── settings.js                # Lecture/écriture .env
├── services/
│   ├── verification-service.js    # Vérification email, DNS, SMTP, scoring
│   ├── intelligence-service.js    # Hunter, Gravatar, LinkedIn matching
│   ├── report-service.js          # Génération PDF
│   └── provider-status.js         # État runtime des providers
└── packaging/
    ├── verifyor.svg               # Icône application
    └── deb/                       # Structure paquet Debian
```

---

## 🗄 Base de données

Chemin par défaut :

```
data/verifyor.sqlite
```

Personnalisable via :

```env
VERIFYOR_DB_PATH=/chemin/vers/verifyor.sqlite
```

La base est ignorée par Git. Lors d'une installation `.deb`, elle est stockée dans `/var/lib/verifyor/verifyor.sqlite`.

---

## 📦 Construire le paquet Debian

```bash
npm install        # si pas encore fait
./scripts/build-deb.sh
# → dist/verifyor_2.0.0_all.deb
```

---

## 🧪 Tests

```bash
npm test
```

---

## ⚠️ Limites connues

- Le SMTP handshake dépend de l'accès sortant sur le port `25` (bloqué chez certains FAI)
- Les enrichissements externes dépendent des crédits API disponibles
- Le matching LinkedIn est indirect (pas d'API officielle de recherche arbitraire)
- `node:sqlite` est marqué expérimental avant Node.js 22.5.0

---

## 🔒 Sécurité

- `.env` est ignoré par Git — **ne jamais committer une vraie clé API**
- Si une clé a circulé hors de la machine locale, la faire tourner immédiatement
- En production, restreindre les permissions sur `/opt/verifyor/.env` : `chmod 600`

---

## 🗂 Contexte projet

Pour reprendre le projet en session future : [CONTEXT.md](CONTEXT.md)
