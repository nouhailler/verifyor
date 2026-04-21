# Guide d'installation — Verifyor

---

## ⚠️ Prérequis obligatoire : Node.js 22.5+

Verifyor utilise `node:sqlite`, un module **natif Node.js disponible uniquement à partir de la version 22.5.0**.

| Version Node.js | Fonctionne ? | Raison |
|-----------------|:------------:|--------|
| 18.x LTS        | ❌ | `node:sqlite` absent |
| 20.x LTS        | ❌ | `node:sqlite` absent |
| 21.x            | ❌ | `node:sqlite` absent |
| **22.5.0+** ✅  | **Oui** | `node:sqlite` introduit en 22.5.0 |
| **22.x LTS**    | **Oui** | Version recommandée |

### Vérifier votre version actuelle

```bash
node --version
```

Si la version est `v22.5.0` ou plus récente, **vous pouvez passer directement à l'installation du paquet**.

---

## Pourquoi le script nodesource peut bloquer

Lancer `setup_20.x` (ou toute version inférieure à votre Node.js actuel) configure APT pour **rétrograder** Node.js. Sur un système avec Node.js 22 déjà présent, APT tente d'installer Node.js 20 par-dessus — ce qui est soit refusé, soit corrupteur.

**Règle simple** : ne jamais installer une version nodesource *inférieure* à celle déjà présente.

---

## Installer ou mettre à jour Node.js sans conflit

Utilisez ce script qui vérifie d'abord votre version avant de faire quoi que ce soit :

```bash
bash <(curl -fsSL https://github.com/nouhailler/verifyor/raw/main/scripts/install-node.sh)
```

Ou copiez-le manuellement :

```bash
#!/usr/bin/env bash
set -euo pipefail

MIN_MAJOR=22
MIN_MINOR=5
INSTALL_MAJOR=22

# Lire la version actuelle de Node.js
if command -v node >/dev/null 2>&1; then
  CURRENT=$(node -e "const v=process.versions.node.split('.'); process.exit((+v[0]>${MIN_MAJOR}||+v[0]===${MIN_MAJOR}&&+v[1]>=${MIN_MINOR})?0:1)" 2>/dev/null && echo "ok" || echo "old")
  CURRENT_VER=$(node --version)
else
  CURRENT="absent"
  CURRENT_VER="(non installé)"
fi

echo "Node.js détecté : ${CURRENT_VER}"

if [ "$CURRENT" = "ok" ]; then
  echo "✓ Node.js ${CURRENT_VER} est compatible — aucune action nécessaire."
  exit 0
fi

echo "→ Installation de Node.js ${INSTALL_MAJOR}.x..."
curl -fsSL https://deb.nodesource.com/setup_${INSTALL_MAJOR}.x | sudo -E bash -
sudo apt-get install -y nodejs
echo "✓ Node.js $(node --version) installé."
```

---

## Installation depuis le paquet Debian

### Étape 1 — Vérifier Node.js

```bash
bash <(curl -fsSL https://github.com/nouhailler/verifyor/raw/main/scripts/install-node.sh)
```

### Étape 2 — Télécharger le paquet

```bash
wget https://github.com/nouhailler/verifyor/releases/latest/download/verifyor_2.0.0_all.deb
```

### Étape 3 — Installer

```bash
sudo dpkg -i verifyor_2.0.0_all.deb
```

Si des dépendances APT manquent :

```bash
sudo apt-get install -f
```

### Étape 4 — Configurer les clés API

```bash
sudo nano /opt/verifyor/.env
```

Contenu minimal :

```env
PORT=3000
VERIFYOR_DEFAULT_PROVIDER=auto

# Optionnel — laisser vide pour utiliser uniquement le moteur local
ZEROBOUNCE_API_KEY=
ABSTRACT_API_KEY=
HUNTER_API_KEY=
GRAVATAR_API_KEY=
```

> Le moteur local (DNS/MX/SMTP) fonctionne sans aucune clé API.

### Étape 5 — Démarrer

```bash
verifyor
```

Puis ouvrir dans le navigateur : **http://localhost:3000**

---

## Installation depuis les sources

```bash
# Prérequis : Node.js 22.5+
git clone https://github.com/nouhailler/verifyor.git
cd verifyor
npm install
cp .env.example .env
# Éditer .env avec vos clés API
npm start
```

---

## Pages disponibles après démarrage

| URL | Description |
|-----|-------------|
| `http://localhost:3000/` | Dashboard principal — vérification email |
| `http://localhost:3000/admin/db` | Administration — historique des analyses |
| `http://localhost:3000/search/db` | Recherche multi-critères dans la base |
| `http://localhost:3000/settings` | Configuration des clés API et du provider |

---

## Désinstallation (paquet Debian)

```bash
sudo dpkg -r verifyor
```

Les données SQLite dans `/var/lib/verifyor/` sont conservées. Pour les supprimer aussi :

```bash
sudo rm -rf /var/lib/verifyor
```

---

## Construire le paquet Debian depuis les sources

```bash
git clone https://github.com/nouhailler/verifyor.git
cd verifyor
npm install         # Node.js 22.5+ requis
./scripts/build-deb.sh
# → dist/verifyor_2.0.0_all.deb
```

---

## Vérification de l'installation

```bash
# Vérifier le binaire
which verifyor

# Vérifier Node.js (doit afficher v22.5.0 ou plus récent)
node --version

# Tester l'API
curl http://localhost:3000/api/verification/providers
```

---

## Dépannage

### Le port 3000 est déjà utilisé

```bash
PORT=3001 verifyor
```

### Erreur `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`

Votre version de Node.js est inférieure à 22.5.0.

```bash
node --version   # doit afficher v22.5.x ou plus
```

Mettre à jour Node.js avec le script fourni :

```bash
bash <(curl -fsSL https://github.com/nouhailler/verifyor/raw/main/scripts/install-node.sh)
```

### Conflit APT après avoir lancé `setup_20.x` ou `setup_18.x`

Si vous avez lancé par erreur le script nodesource pour une version inférieure à celle installée, nettoyez avant de recommencer :

```bash
# Supprimer le dépôt nodesource incorrect
sudo rm -f /etc/apt/sources.list.d/nodesource.list
sudo apt-get update

# Puis réinstaller proprement Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### SMTP handshake échoue

Le port 25 sortant peut être bloqué par certains FAI ou réseaux d'entreprise. Le moteur local dégrade automatiquement vers DNS/MX uniquement — la vérification continue de fonctionner, avec un signal `smtp_unreachable` dans le résultat.

### Permissions sur `/opt/verifyor/.env`

```bash
sudo chmod 600 /opt/verifyor/.env
```
