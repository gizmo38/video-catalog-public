# 🎬 Video Catalog Electron

Application desktop Electron pour gérer, cataloguer et exporter vos collections vidéo avec système de sessions intelligent.

![Version](https://img.shields.io/badge/version-2.1.4-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Electron](https://img.shields.io/badge/electron-38.1.2-blue.svg)

> 📦 **Version publique disponible** : [video-catalog-public](https://github.com/gizmo38/video-catalog-public) - Téléchargez l'exécutable Windows depuis les [Releases](https://github.com/gizmo38/video-catalog-public/releases)

## ✨ Fonctionnalités principales

- 💾 **Sessions intelligentes** : Sauvegardez et chargez vos catalogues instantanément
- 🔍 **Scan récursif** : Détection automatique de tous formats vidéo
- 📊 **Interface moderne** : Tableau interactif avec tri, recherche et colonnes redimensionnables
- 📤 **Export multiple** : HTML interactif, Markdown, JSON
- ⚡ **Performance optimisée** : Gestion rapide de milliers de fichiers
- 🎨 **Design moderne** : Interface gradient avec animations fluides

## 🚀 Installation rapide

### Pour les développeurs

```bash
# Cloner et installer
git clone https://github.com/gizmo38/video-catalog-electron.git
cd video-catalog-electron
npm install

# Lancer l'application
npm start
```

**Prérequis** : [Node.js 16+](https://nodejs.org/) uniquement

### Pour les utilisateurs

Téléchargez la version portable depuis le [repository public](https://github.com/gizmo38/video-catalog-public/releases) - aucune installation requise !

#### ⚠️ Avertissement Windows SmartScreen

Au premier lancement, Windows peut afficher :
> **"Windows a protégé votre ordinateur"**

**C'est normal !** L'application n'est pas signée numériquement (certificat coûteux).

**Comment lancer l'application :**
1. Cliquez sur **"Informations complémentaires"**
2. Cliquez sur **"Exécuter quand même"**

✅ L'application est **sûre** et ne contient aucun virus. Code source disponible publiquement.

## 💡 Utilisation

### Démarrage rapide
1. **📁 Nouveau Scan** → Sélectionner dossiers vidéo
2. **💾 Sauver Session** → Nommer votre catalogue
3. **⚡ Charger Session** → Accès instantané à vos vidéos

### Fonctionnalités clés
- **Ctrl+F** : Recherche instantanée
- **Clic en-tête** : Trier colonnes
- **Glisser bordure** : Redimensionner colonnes
- **Actions vidéo** : Ouvrir, Explorer dossier, Copier chemin

## 🎯 Formats supportés

MP4 • AVI • MKV • MOV • WMV • FLV • M4V • WebM • OGV

## 📚 Documentation

- 📖 **[CLAUDE.md](CLAUDE.md)** - Documentation technique complète
  - Architecture détaillée
  - Guide d'installation avancé
  - Changelog complet v2.1.4
  - Patterns et conventions
  - Référence pour développeurs
  - Workflow de publication

- 🌐 **[Repository Public](https://github.com/gizmo38/video-catalog-public)** - Distribution end-user
  - Exécutables Windows portables
  - README orienté utilisateurs
  - Releases stables uniquement

## 🛠️ Scripts disponibles

```bash
npm start          # Lancer l'application
npm run dev        # Mode développement (DevTools)
npm run build      # Créer l'exécutable portable
npx playwright test # Tests automatisés
```

## 🏗️ Stack technique

- **Electron 38.1.2** - Framework desktop
- **Node.js natif** - Extraction métadonnées
- **HTML/CSS/JS** - Interface moderne
- **Playwright** - Tests E2E

## 🤝 Contribution

Les contributions sont les bienvenues !

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📝 Licence

MIT License - voir [LICENSE](LICENSE)

## 🆘 Support

- 📖 **Documentation technique** : [CLAUDE.md](CLAUDE.md)
- 🐛 **Issues** : [GitHub Issues](https://github.com/gizmo38/video-catalog-electron/issues)
- 💡 **Discussions** : [GitHub Discussions](https://github.com/gizmo38/video-catalog-electron/discussions)

---

<div align="center">
  <strong>Créé avec ❤️ pour simplifier la gestion de vos collections vidéo</strong>
</div>
