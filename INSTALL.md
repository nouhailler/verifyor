# Guide d'installation — Verifyor

## Installation depuis le paquet Debian (recommandée)

### Prérequis

| Prérequis | Version minimale |
|-----------|-----------------|
| Système   | Ubuntu 22.04 / Debian 12 ou plus récent |
| Node.js   | 18.x LTS ou plus récent |
| npm       | 8.x ou plus récent |

Installer Node.js si absent :

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Étape 1 — Télécharger le paquet

Télécharger `verifyor_2.0.0_all.deb` depuis la page des [releases GitHub](https://github.com/nouhailler/verifyor/releases/latest).

### Étape 2 — Installer

```bash
sudo dpkg -i verifyor_2.0.0_all.deb
```

Si des dépendances manquent :

```bash
sudo apt-get install -f
```

### Étape 3 — Configurer les clés API

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

### Étape 4 — Démarrer

```bash
verifyor
```

Puis ouvrir dans le navigateur : **http://localhost:3000**

---

## Installation depuis les sources

### Prérequis

- Node.js >= 18
- npm >= 8
- Git

### Cloner et installer

```bash
git clone https://github.com/nouhailler/verifyor.git
cd verifyor
npm install
cp .env.example .env
```

### Configurer

Éditer `.env` :

```env
PORT=3000
ZEROBOUNCE_API_KEY=votre_cle
ABSTRACT_API_KEY=votre_cle
HUNTER_API_KEY=votre_cle
GRAVATAR_API_KEY=
VERIFYOR_DEFAULT_PROVIDER=auto
```

### Démarrer

```bash
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
npm install
./scripts/build-deb.sh
```

Le paquet généré se trouve dans `dist/verifyor_2.0.0_all.deb`.

---

## Vérification de l'installation

```bash
# Vérifier le binaire
which verifyor

# Vérifier Node.js
node --version

# Tester les endpoints
curl http://localhost:3000/api/verification/providers
```

---

## Dépannage

**Le port 3000 est déjà utilisé**

```bash
PORT=3001 verifyor
```

**`node:sqlite` non disponible**

Ce module est intégré à Node.js >= 22.5.0. Avec Node.js 18–21, mettre à jour Node.js ou utiliser une installation depuis les sources avec une version compatible.

**SMTP handshake échoue**

Le port 25 sortant peut être bloqué par certains FAI ou réseaux d'entreprise. Le moteur local dégrade automatiquement vers DNS/MX uniquement.

**Permissions sur `/opt/verifyor/.env`**

```bash
sudo chmod 600 /opt/verifyor/.env
```
