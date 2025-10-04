const { app, BrowserWindow, dialog, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Garde une référence globale de l'objet window
let mainWindow;

function createWindow() {
  // Créer la fenêtre du navigateur
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    show: false
  });

  // Charger l'index.html de l'application
  mainWindow.loadFile('index-sessions.html');

  // Afficher la fenêtre quand elle est prête
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Ouvrir les DevTools en mode développement
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Raccourci clavier pour ouvrir/fermer les DevTools (Ctrl+Shift+I ou Cmd+Opt+I)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.shift && input.key === 'I') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Émis quand la fenêtre est fermée
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Cette méthode sera appelée quand Electron aura fini de s'initialiser
app.whenReady().then(() => {
  createWindow();
});

// Quitter quand toutes les fenêtres sont fermées
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Gestionnaires IPC

// Sélection de dossiers multiples
ipcMain.handle('select-folders', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Sélectionner les dossiers à scanner',
      properties: ['openDirectory', 'multiSelections'],
      buttonLabel: 'Sélectionner'
    });
    
    return {
      canceled: result.canceled,
      filePaths: result.filePaths || []
    };
  } catch (error) {
    console.error('Erreur lors de la sélection des dossiers:', error);
    return { canceled: true, filePaths: [], error: error.message };
  }
});

// Scan des vidéos dans les dossiers sélectionnés
ipcMain.handle('scan-videos', async (event, folders) => {
  console.log('🔍 Démarrage du scan pour les dossiers:', folders);

  const videoExtensions = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.m4v', '.webm', '.ogv'];
  const videos = [];
  let totalFiles = 0;
  let processedFiles = 0;

  try {
    // Fonction récursive pour scanner les dossiers
    async function scanDirectory(dirPath) {
      try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (videoExtensions.includes(ext)) {
              videos.push(fullPath);
            }
          }
        }
      } catch (error) {
        console.error(`Erreur lors du scan du dossier ${dirPath}:`, error);
      }
    }

    // Scanner tous les dossiers sélectionnés
    for (const folder of folders) {
      await scanDirectory(folder);
    }

    totalFiles = videos.length;
    const videoMetadata = [];

    // Traiter les vidéos par lots pour éviter la surcharge
    const batchSize = 5;
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize);
      const batchPromises = batch.map(async (videoPath) => {
        try {
          const metadata = await getVideoMetadata(videoPath);
          processedFiles++;
          
          // Envoyer le progrès au renderer
          event.sender.send('scan-progress', {
            processed: processedFiles,
            total: totalFiles,
            current: videoPath ? path.basename(videoPath) : 'Fichier inconnu',
            success: !metadata.error
          });
          
          return metadata;
        } catch (error) {
          console.error(`❌ Erreur critique pour ${videoPath ? path.basename(videoPath) : 'fichier inconnu'}:`, error.message);
          processedFiles++;
          
          // Envoyer le progrès même en cas d'erreur
          event.sender.send('scan-progress', {
            processed: processedFiles,
            total: totalFiles,
            current: videoPath ? path.basename(videoPath) : 'Fichier inconnu',
            success: false,
            error: error.message
          });
          
          // Retourner des métadonnées par défaut en cas d'erreur critique
          try {
            const stats = require('fs').statSync(videoPath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            
            return {
              name: path.basename(videoPath),
              path: getRelativePath(videoPath),
              absolutePath: videoPath,
              extension: path.extname(videoPath).toLowerCase(),
              size: `${fileSizeMB} MB`,
              sizeBytes: stats.size,
              duration: 'N/A',
              videoCodec: 'N/A',
              audioCodec: 'N/A',
              folder: path.dirname(videoPath),
              error: true
            };
          } catch (fsError) {
            return {
              name: path.basename(videoPath),
              path: getRelativePath(videoPath),
              absolutePath: videoPath,
              extension: path.extname(videoPath).toLowerCase(),
              size: 'N/A',
              sizeBytes: 0,
              duration: 'N/A',
              videoCodec: 'N/A',
              audioCodec: 'N/A',
              folder: path.dirname(videoPath),
              error: true
            };
          }
        }
      });

      const batchResults = await Promise.all(batchPromises);
      videoMetadata.push(...batchResults.filter(Boolean));
    }

    return {
      success: true,
      videos: videoMetadata,
      total: totalFiles
    };

  } catch (error) {
    console.error('Erreur lors du scan des vidéos:', error);
    return {
      success: false,
      error: error.message,
      videos: [],
      total: 0
    };
  }
});

// Fonction pour extraire les métadonnées basiques d'une vidéo
function getVideoMetadata(videoPath) {
  return new Promise((resolve, reject) => {
    if (!videoPath) {
      console.error('❌ videoPath manquant');
      return reject(new Error('Chemin vidéo manquant'));
    }

    try {
      const stats = require('fs').statSync(videoPath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      // Protection supplémentaire pour getRelativePath
      let safePath;
      try {
        safePath = getRelativePath(videoPath);
      } catch (pathError) {
        console.warn('⚠️ Erreur getRelativePath pour', videoPath, ':', pathError.message);
        safePath = videoPath || 'chemin-invalide';
      }

      resolve({
        name: path.basename(videoPath),
        path: safePath,
        absolutePath: videoPath,
        extension: path.extname(videoPath).toLowerCase(),
        size: `${fileSizeMB} MB`,
        sizeBytes: stats.size,
        duration: 'N/A',
        videoCodec: 'N/A',
        audioCodec: 'N/A',
        folder: path.dirname(videoPath),
        error: false
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Fonction pour formater la durée en HH:MM:SS
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Fonction pour obtenir le chemin relatif
function getRelativePath(fullPath) {
  // Vérifier que fullPath est défini
  if (!fullPath || typeof fullPath !== 'string') {
    console.warn('⚠️ getRelativePath: fullPath invalide:', fullPath);
    return fullPath || 'chemin-invalide';
  }

  try {
    // Convertir en chemin relatif sans lettre de lecteur
    const relativePath = path.relative(process.cwd(), fullPath);

    // Vérifier que relativePath est défini
    if (!relativePath || typeof relativePath !== 'string') {
      console.warn('⚠️ getRelativePath: relativePath invalide pour', fullPath);
      return fullPath;
    }

    return `./${relativePath.replace(/\\/g, '/')}`;
  } catch (error) {
    console.error('❌ Erreur dans getRelativePath pour', fullPath, ':', error.message);
    return fullPath;
  }
}

// Générer le fichier HTML du catalogue
ipcMain.handle('generate-html', async (event, videos, options = {}) => {
  try {
    const htmlContent = generateHTMLCatalog(videos, options);
    
    // Demander où sauvegarder le fichier
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Sauvegarder le catalogue HTML',
      defaultPath: `catalog_${new Date().toISOString().slice(0, 10)}.html`,
      filters: [
        { name: 'Fichiers HTML', extensions: ['html'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, htmlContent, 'utf8');
      return {
        success: true,
        filePath: result.filePath
      };
    }

    return { success: false, canceled: true };
  } catch (error) {
    console.error('Erreur lors de la génération du HTML:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Fonction pour formater la taille des fichiers
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Fonction pour générer le contenu HTML du catalogue
function generateMarkdownCatalog(videos, options) {
  const title = options.title || 'Catalogue Vidéo';
  const date = new Date().toLocaleDateString('fr-FR');

  let markdown = `# ${title}\n\n`;
  markdown += `*Généré le ${date}*\n\n`;
  markdown += `## Statistiques\n\n`;
  markdown += `- **Total de vidéos**: ${videos.length}\n`;

  if (videos.length > 0) {
    const totalSize = videos.reduce((sum, video) => sum + (video.sizeBytes || 0), 0);
    markdown += `- **Taille totale**: ${formatFileSize(totalSize)}\n`;

    const extensions = [...new Set(videos.map(v => v.extension).filter(ext => ext))];
    markdown += `- **Extensions**: ${extensions.join(', ')}\n\n`;

    markdown += `## Liste des vidéos\n\n`;
    markdown += `| Nom | Taille | Extension | Dossier |\n`;
    markdown += `|-----|--------|-----------|---------|\n`;

    videos.forEach(video => {
      const name = (video.name || 'N/A').replace(/[*_`\\|]/g, '\\$&');
      const folder = (video.folder || 'N/A').replace(/[*_`\\|]/g, '\\$&');
      const size = formatFileSize(video.sizeBytes || 0);
      const extension = (video.extension || '').replace('.', '');

      markdown += `| ${name} | ${size} | ${extension} | ${folder} |\n`;
    });
  }

  return markdown;
}

function generateHTMLCatalog(videos, options) {
  const title = options.title || 'Catalogue Vidéo';
  const date = new Date().toLocaleDateString('fr-FR');
  
  return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            font-weight: 300;
        }
        
        .header p {
            opacity: 0.8;
            font-size: 1.1em;
        }
        
        .controls {
            padding: 20px 30px;
            background: #f8f9fa;
            border-bottom: 1px solid #e9ecef;
        }
        
        .search-box {
            width: 100%;
            padding: 12px 20px;
            border: 2px solid #e9ecef;
            border-radius: 25px;
            font-size: 16px;
            outline: none;
            transition: border-color 0.3s;
        }
        
        .search-box:focus {
            border-color: #667eea;
        }
        
        .stats {
            margin-top: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }
        
        .stat-item {
            background: white;
            padding: 10px 20px;
            border-radius: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            font-weight: 500;
        }
        
        .table-container {
            overflow-x: auto;
            max-height: 70vh;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
        }
        
        th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 12px;
            text-align: left;
            font-weight: 600;
            position: sticky;
            top: 0;
            z-index: 10;
            cursor: pointer;
            user-select: none;
            transition: background 0.3s;
        }
        
        th:hover {
            background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
        }
        
        th::after {
            content: ' ↕';
            opacity: 0.5;
            font-size: 12px;
        }
        
        td {
            padding: 12px;
            border-bottom: 1px solid #e9ecef;
            vertical-align: middle;
        }
        
        tr:hover {
            background-color: #f8f9fa;
        }
        
        tr:nth-child(even) {
            background-color: #fdfdfd;
        }
        
        tr:nth-child(even):hover {
            background-color: #f0f0f0;
        }
        
        .play-link {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: #28a745;
            text-decoration: none;
            font-weight: 600;
            padding: 8px 15px;
            border-radius: 20px;
            background: #e8f5e8;
            transition: all 0.3s;
            border: 2px solid transparent;
        }
        
        .play-link:hover {
            background: #28a745;
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(40, 167, 69, 0.3);
        }
        
        .file-path {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #6c757d;
            background: #f8f9fa;
            padding: 4px 8px;
            border-radius: 4px;
            word-break: break-all;
        }
        
        .size-cell {
            text-align: right;
            font-weight: 500;
        }
        
        .duration-cell {
            font-family: 'Courier New', monospace;
            font-weight: 500;
        }
        
        .codec-cell {
            font-size: 12px;
            background: #e9ecef;
            padding: 4px 8px;
            border-radius: 12px;
            display: inline-block;
        }

        /* Styles pour les liens dans le tableau */
        .video-link {
            color: #2c3e50;
            text-decoration: none;
            font-weight: 500;
        }

        .video-link:hover {
            color: #667eea;
            text-decoration: underline;
        }

        .action-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 4px 8px;
            margin: 1px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            text-decoration: none;
            display: inline-block;
        }

        .action-btn:hover {
            opacity: 0.8;
            text-decoration: none;
        }

        .folder-btn {
            background: #17a2b8;
        }
        
        .error-row {
            background-color: #fff3cd !important;
        }
        
        .error-row:hover {
            background-color: #ffeaa7 !important;
        }
        
        .no-results {
            text-align: center;
            padding: 50px;
            color: #6c757d;
            font-size: 18px;
        }
        
        @media (max-width: 768px) {
            .header h1 {
                font-size: 2em;
            }
            
            .stats {
                flex-direction: column;
                align-items: stretch;
            }
            
            .stat-item {
                text-align: center;
            }
            
            table {
                font-size: 12px;
            }
            
            th, td {
                padding: 8px 6px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
            <p>Généré le ${date} • ${videos.length} vidéo${videos.length > 1 ? 's' : ''} trouvée${videos.length > 1 ? 's' : ''}</p>
        </div>
        
        <div class="controls">
            <input type="text" class="search-box" id="searchBox" placeholder="Rechercher par nom, codec, durée...">
            <div class="stats">
                <div class="stat-item">
                    <span id="visibleCount">${videos.length}</span> / ${videos.length} vidéos affichées
                </div>
                <div class="stat-item">
                    Taille totale: <span id="totalSize">${calculateTotalSize(videos)}</span>
                </div>
                <div class="stat-item">
                    Durée totale: <span id="totalDuration">${calculateTotalDuration(videos)}</span>
                </div>
            </div>
        </div>
        
        <div class="table-container">
            <table id="videoTable">
                <thead>
                    <tr style="background: #f8f9fa; border-bottom: 2px solid #e9ecef; position: sticky; top: 0; z-index: 10;">
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #495057; cursor: pointer; user-select: none;" onclick="sortTable(0)">
                            Nom ↕
                        </th>
                        <th style="padding: 10px; text-align: right; font-weight: 600; color: #495057; cursor: pointer; user-select: none;" onclick="sortTable(1)">
                            Taille ↕
                        </th>
                        <th style="padding: 10px; text-align: center; font-weight: 600; color: #495057; cursor: pointer; user-select: none;" onclick="sortTable(2)">
                            Extension ↕
                        </th>
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #495057;">
                            Dossier
                        </th>
                        <th style="padding: 10px; text-align: center; font-weight: 600; color: #495057;">
                            Actions
                        </th>
                    </tr>
                </thead>
                <tbody id="videoTableBody">
                    ${videos.map((video, index) => {
                        const rowClass = index % 2 === 0 ? 'style="background: #fdfdfd;"' : 'style="background: #fff;"';
                        const fullPath = video.folder || video.path || 'N/A';
                        const fileName = video.name || 'N/A';

                        return `
                        <tr ${rowClass} style="border-bottom: 1px solid #e9ecef;"
                            onmouseover="this.style.background='#f8f9fa'"
                            onmouseout="this.style.background='${index % 2 === 0 ? '#fdfdfd' : '#fff'}'"
                            data-name="${fileName.toLowerCase()}"
                            data-extension="${(video.extension || '').toLowerCase()}"
                            data-size="${video.sizeBytes || 0}">
                            <td style="padding: 8px; font-weight: 500; color: #2c3e50; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fileName}">
                                <a href="file://${video.absolutePath || video.path}" style="color: inherit; text-decoration: none;"
                                   onmouseover="this.style.color='#667eea'; this.style.textDecoration='underline'"
                                   onmouseout="this.style.color='#2c3e50'; this.style.textDecoration='none'">
                                    ${fileName}
                                </a>
                            </td>
                            <td style="padding: 8px; text-align: right; color: #495057; white-space: nowrap;" data-size="${video.sizeBytes || 0}">
                                ${video.size || formatFileSize(video.sizeBytes || 0)}
                            </td>
                            <td style="padding: 8px; text-align: center;">
                                <span style="background: #e9ecef; padding: 2px 6px; border-radius: 10px; font-size: 10px; text-transform: uppercase; color: #495057;">
                                    ${(video.extension || '').replace('.', '')}
                                </span>
                            </td>
                            <td dir="rtl" style="padding: 8px; color: #6c757d; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fullPath}">
                                ${fullPath}
                            </td>
                            <td style="padding: 8px; text-align: center; white-space: nowrap;">
                                <a href="file://${video.absolutePath || video.path}"
                                   style="background: #28a745; color: white; border: none; padding: 4px 8px; margin: 1px; border-radius: 3px; cursor: pointer; font-size: 11px; text-decoration: none; display: inline-block;"
                                   title="Ouvrir la vidéo">▶</a>
                                <a href="file://${video.folder}"
                                   style="background: #17a2b8; color: white; border: none; padding: 4px 8px; margin: 1px; border-radius: 3px; cursor: pointer; font-size: 11px; text-decoration: none; display: inline-block;"
                                   title="Ouvrir le dossier">📁</a>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            
            <div id="noResults" class="no-results" style="display: none;">
                Aucune vidéo ne correspond à votre recherche.
            </div>
        </div>
    </div>

    <script>
        // Fonction de recherche
        document.getElementById('searchBox').addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const rows = document.querySelectorAll('#videoTableBody tr');
            let visibleCount = 0;
            
            rows.forEach(row => {
                const name = row.dataset.name;
                const codec = row.dataset.codec;
                const duration = row.dataset.duration.toLowerCase();
                const size = row.dataset.size.toLowerCase();
                
                const isVisible = name.includes(searchTerm) || 
                                codec.includes(searchTerm) || 
                                duration.includes(searchTerm) || 
                                size.includes(searchTerm);
                
                row.style.display = isVisible ? '' : 'none';
                if (isVisible) visibleCount++;
            });
            
            document.getElementById('visibleCount').textContent = visibleCount;
            document.getElementById('noResults').style.display = visibleCount === 0 ? 'block' : 'none';
            document.querySelector('.table-container table').style.display = visibleCount === 0 ? 'none' : 'table';
        });
        
        // Fonction de tri
        let sortDirection = {};
        
        function sortTable(columnIndex) {
            const table = document.getElementById('videoTable');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            const isAscending = sortDirection[columnIndex] !== true;
            sortDirection = {};
            sortDirection[columnIndex] = isAscending;
            
            rows.sort((a, b) => {
                let aValue = a.cells[columnIndex].textContent.trim();
                let bValue = b.cells[columnIndex].textContent.trim();
                
                // Tri numérique pour la taille
                if (columnIndex === 1) {
                    aValue = parseFloat(aValue.replace(/[^0-9.]/g, '')) || 0;
                    bValue = parseFloat(bValue.replace(/[^0-9.]/g, '')) || 0;
                }
                
                // Tri par durée
                if (columnIndex === 2) {
                    aValue = timeToSeconds(aValue);
                    bValue = timeToSeconds(bValue);
                }
                
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return isAscending ? aValue - bValue : bValue - aValue;
                }
                
                return isAscending ? 
                    aValue.localeCompare(bValue) : 
                    bValue.localeCompare(aValue);
            });
            
            // Réorganiser les lignes
            rows.forEach(row => tbody.appendChild(row));
        }
        
        function timeToSeconds(timeString) {
            if (timeString === 'N/A') return 0;
            const parts = timeString.split(':');
            return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
        }
    </script>
</body>
</html>`;
}

// Fonctions utilitaires pour les statistiques
function calculateTotalSize(videos) {
  let totalMB = 0;
  videos.forEach(video => {
    if (video.size !== 'N/A') {
      const sizeMB = parseFloat(video.size.replace(/[^0-9.]/g, ''));
      if (!isNaN(sizeMB)) {
        totalMB += sizeMB;
      }
    }
  });
  
  if (totalMB >= 1024) {
    return `${(totalMB / 1024).toFixed(2)} GB`;
  }
  return `${totalMB.toFixed(2)} MB`;
}

function calculateTotalDuration(videos) {
  let totalSeconds = 0;
  videos.forEach(video => {
    if (video.duration !== 'N/A') {
      const parts = video.duration.split(':');
      if (parts.length === 3) {
        totalSeconds += parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
      }
    }
  });
  
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// ===============================
// Handlers IPC pour les sessions
// ===============================

// Handler pour select-items (alias pour select-folders)
ipcMain.handle('select-items', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'multiSelections'],
    title: 'Sélectionner des dossiers à scanner'
  });

  if (result.canceled) {
    return { canceled: true };
  }

  return {
    canceled: false,
    filePaths: result.filePaths
  };
});

// Handlers de sessions (pour l'instant, retourner des valeurs par défaut)
// Variables globales pour la gestion des sessions
const SESSIONS_DIR = path.join(__dirname, 'sessions');
const LAST_SESSION_FILE = path.join(SESSIONS_DIR, 'last-session.json');

// Assurer que le dossier sessions existe
async function ensureSessionsDir() {
  try {
    await fs.access(SESSIONS_DIR);
  } catch (error) {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  }
}

// Charger la dernière session
ipcMain.handle('load-last-session', async () => {
  try {
    await ensureSessionsDir();
    const lastSessionData = await fs.readFile(LAST_SESSION_FILE, 'utf-8');
    const session = JSON.parse(lastSessionData);
    return { success: true, session };
  } catch (error) {
    return { success: false, message: 'Aucune session précédente' };
  }
});

// Sauvegarder une session
ipcMain.handle('save-session', async (event, sessionData) => {
  try {
    await ensureSessionsDir();

    // Créer l'ID de session si pas présent
    if (!sessionData.id) {
      sessionData.id = `session_${Date.now()}`;
    }

    // Ajouter timestamps
    const now = new Date().toISOString();
    if (!sessionData.created) {
      sessionData.created = now;
    }
    sessionData.updated = now;

    // Sauvegarder dans un fichier spécifique
    const sessionFile = path.join(SESSIONS_DIR, `${sessionData.id}.json`);
    await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));

    // Mettre à jour la "dernière session"
    await fs.writeFile(LAST_SESSION_FILE, JSON.stringify(sessionData, null, 2));

    return {
      success: true,
      message: 'Session sauvegardée',
      sessionId: sessionData.id
    };
  } catch (error) {
    console.error('Erreur sauvegarde session:', error);
    return { success: false, message: 'Erreur lors de la sauvegarde' };
  }
});

// Charger une session spécifique
ipcMain.handle('load-session', async (event, sessionId) => {
  try {
    await ensureSessionsDir();
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
    const sessionData = await fs.readFile(sessionFile, 'utf-8');
    const session = JSON.parse(sessionData);

    // Mettre à jour comme dernière session utilisée
    await fs.writeFile(LAST_SESSION_FILE, sessionData);

    return { success: true, session };
  } catch (error) {
    return { success: false, message: 'Session non trouvée' };
  }
});

// Lister toutes les sessions
ipcMain.handle('list-sessions', async () => {
  try {
    await ensureSessionsDir();
    const files = await fs.readdir(SESSIONS_DIR);
    const sessionFiles = files.filter(f => f.endsWith('.json') && f !== 'last-session.json');

    const sessions = [];
    for (const file of sessionFiles) {
      try {
        const sessionData = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
        const session = JSON.parse(sessionData);
        sessions.push({
          id: session.id,
          name: session.name,
          created: session.created,
          updated: session.updated,
          totalVideos: session.videos ? session.videos.length : 0,
          totalSize: session.videos ? session.videos.reduce((sum, v) => sum + (v.sizeBytes || 0), 0) : 0
        });
      } catch (error) {
        console.error(`Erreur lecture session ${file}:`, error);
      }
    }

    // Trier par date de modification (plus récent en premier)
    sessions.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    return { success: true, sessions };
  } catch (error) {
    console.error('Erreur listage sessions:', error);
    return { success: true, sessions: [] };
  }
});

// Supprimer une session
ipcMain.handle('delete-session', async (event, sessionId) => {
  try {
    await ensureSessionsDir();
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);
    await fs.unlink(sessionFile);
    return { success: true, message: 'Session supprimée' };
  } catch (error) {
    return { success: false, message: 'Erreur lors de la suppression' };
  }
});

// Mettre à jour une session
ipcMain.handle('update-session', async (event, sessionId, videos, selectedPaths) => {
  try {
    await ensureSessionsDir();
    const sessionFile = path.join(SESSIONS_DIR, `${sessionId}.json`);

    // Charger la session existante
    const existingData = await fs.readFile(sessionFile, 'utf-8');
    const session = JSON.parse(existingData);

    // Mettre à jour les données
    session.videos = videos;
    session.selectedPaths = selectedPaths;
    session.updated = new Date().toISOString();

    // Sauvegarder
    await fs.writeFile(sessionFile, JSON.stringify(session, null, 2));
    await fs.writeFile(LAST_SESSION_FILE, JSON.stringify(session, null, 2));

    return { success: true, session: session };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handler pour récupérer la version de l'application
ipcMain.handle('get-app-version', async () => {
  const packageJson = require('./package.json');
  return { success: true, version: packageJson.version };
});

// Handlers pour l'export
ipcMain.handle('generate-html-links', async (event, videos, options) => {
  const htmlContent = generateHTMLCatalog(videos, options);

  // Demander où sauvegarder le fichier
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter le catalogue HTML',
    defaultPath: 'catalogue_videos.html',
    filters: [
      { name: 'Fichiers HTML', extensions: ['html'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return { success: false, message: 'Export annulé' };
  }

  try {
    await fs.writeFile(result.filePath, htmlContent, 'utf8');
    return { success: true, filePath: result.filePath, message: 'Catalogue HTML généré avec succès' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-markdown', async (event, videos, options) => {
  const markdownContent = generateMarkdownCatalog(videos, options);

  // Demander où sauvegarder le fichier
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Exporter le catalogue Markdown',
    defaultPath: 'catalogue_videos.md',
    filters: [
      { name: 'Fichiers Markdown', extensions: ['md'] },
      { name: 'Tous les fichiers', extensions: ['*'] }
    ]
  });

  if (result.canceled) {
    return { success: false, message: 'Export annulé' };
  }

  try {
    await fs.writeFile(result.filePath, markdownContent, 'utf8');
    return { success: true, filePath: result.filePath, message: 'Catalogue Markdown généré avec succès' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handlers pour les actions sur fichiers
ipcMain.handle('open-file', async (event, filePath) => {
  try {
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  try {
    await shell.showItemInFolder(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('copy-path', async (event, pathToCopy) => {
  try {
    clipboard.writeText(pathToCopy);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handler pour exporter une session vers un fichier
ipcMain.handle('export-session-to-file', async (event, sessionData) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Exporter la session',
      defaultPath: `${sessionData.name || 'session'}.json`,
      filters: [
        { name: 'Fichiers Session', extensions: ['json'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    // Écrire le fichier JSON
    await fs.writeFile(result.filePath, JSON.stringify(sessionData, null, 2), 'utf-8');

    return {
      success: true,
      filePath: result.filePath
    };
  } catch (error) {
    console.error('Erreur export session:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Handler pour importer une session depuis un fichier
ipcMain.handle('import-session-from-file', async (event) => {
  try {
    console.log('🔄 Import session - début...');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Importer une session',
      filters: [
        { name: 'Fichiers Session', extensions: ['json'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (result.canceled) {
      console.log('❌ Import annulé par utilisateur');
      return { canceled: true };
    }

    console.log('📁 Fichier sélectionné:', result.filePaths[0]);

    // Lire le fichier JSON
    const fileContent = await fs.readFile(result.filePaths[0], 'utf-8');
    console.log('📄 Contenu fichier lu, taille:', fileContent.length, 'caractères');

    const sessionData = JSON.parse(fileContent);
    console.log('🎯 JSON parsé avec succès');
    console.log('📊 Structure données:', {
      name: sessionData.name,
      hasVideos: !!sessionData.videos,
      videosIsArray: Array.isArray(sessionData.videos),
      videosCount: sessionData.videos ? sessionData.videos.length : 0,
      hasSelectedPaths: !!sessionData.selectedPaths
    });

    // Validation basique
    if (!sessionData.videos || !Array.isArray(sessionData.videos)) {
      console.error('❌ Validation échec: videos manquantes ou non-array');
      throw new Error('Format de fichier session invalide: données vidéos manquantes ou invalides');
    }

    console.log('✅ Validation réussie, retour des données');
    return {
      success: true,
      sessionData: sessionData,
      filePath: result.filePaths[0]
    };
  } catch (error) {
    console.error('💥 Erreur import session:', error.message);
    console.error('Stack:', error.stack);
    return {
      success: false,
      error: error.message
    };
  }
});
