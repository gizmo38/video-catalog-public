const { contextBridge, ipcRenderer } = require('electron');

// Exposer les APIs sécurisées au renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Sélection de dossiers
  selectFolders: () => ipcRenderer.invoke('select-folders'),
  selectItems: () => ipcRenderer.invoke('select-items'),

  // Scan des vidéos
  scanVideos: (folders) => ipcRenderer.invoke('scan-videos', folders),

  // Sessions
  loadLastSession: () => ipcRenderer.invoke('load-last-session'),
  saveSession: (sessionData) => ipcRenderer.invoke('save-session', sessionData),
  loadSession: (sessionId) => ipcRenderer.invoke('load-session', sessionId),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', sessionId),
  updateSession: (sessionId, videos, selectedPaths) => ipcRenderer.invoke('update-session', sessionId, videos, selectedPaths),

  // Génération du HTML et exports
  generateHTML: (videos, options) => ipcRenderer.invoke('generate-html', videos, options),
  generateHTMLLinks: (videos, options) => ipcRenderer.invoke('generate-html-links', videos, options),
  generateMarkdown: (videos, options) => ipcRenderer.invoke('generate-markdown', videos, options),

  // Actions sur fichiers
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  copyPath: (path) => ipcRenderer.invoke('copy-path', path),

  // Actions sur fichiers

  // Import/Export de sessions
  exportSessionToFile: (sessionData) => ipcRenderer.invoke('export-session-to-file', sessionData),
  importSessionFromFile: () => ipcRenderer.invoke('import-session-from-file'),

  // Version de l'application
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Écouter les événements de progression
  onScanProgress: (callback) => {
    ipcRenderer.on('scan-progress', (event, data) => callback(data));
  },

  // Supprimer les listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
