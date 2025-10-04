// Variables globales pour la gestion des sessions
let currentSession = null;
let currentVideos = [];
let currentSelectedPaths = [];
let sessionsVisible = false;
let sessionToDelete = null;
let statsVisible = true; // Par défaut visible

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initialisation de l\'interface avec gestion de sessions');

    // Charger et afficher la version de l'application
    await loadAppVersion();

    // Restaurer l'état de visibilité des statistiques
    restoreStatsVisibility();

    // Essayer de charger la dernière session au démarrage
    await checkForLastSession();

    // Charger et afficher les sessions disponibles
    await loadSessionsList();

    // Listeners pour la modale de confirmation générique
    document.getElementById('confirmModalYes').addEventListener('click', () => {
        if (typeof confirmCallback === 'function') {
            confirmCallback();
        }
        closeConfirmationModal();
    });

    document.getElementById('confirmModalNo').addEventListener('click', () => {
        closeConfirmationModal();
    });
});

// Charger la version de l'application
async function loadAppVersion() {
    try {
        const result = await window.electronAPI.getAppVersion();
        if (result.success) {
            document.getElementById('versionInfo').textContent = `v${result.version}`;
        }
    } catch (error) {
        console.log('Version non disponible');
    }
}

// Vérifier s'il y a une session précédente
async function checkForLastSession() {
    try {
        const result = await window.electronAPI.loadLastSession();
        if (result.success) {
            // Session trouvée, proposer de la charger
            document.getElementById('lastSessionInfo').style.display = 'block';
            document.getElementById('loadLastBtn').style.background = '#28a745';
            document.getElementById('loadLastBtn').innerHTML = '⚡ Charger: ' + result.session.name;
        }
    } catch (error) {
        console.log('Aucune session précédente trouvée');
    }
}

// Charger la dernière session
async function loadLastSession() {
    try {
        showProgress('Chargement de la session...', 0);
        
        const result = await window.electronAPI.loadLastSession();
        if (result.success) {
            currentSession = result.session;
            currentVideos = result.session.videos || [];
            currentSelectedPaths = result.session.selectedPaths || [];
            
            updateUI();
            updateSessionInfo();
            
            hideProgress();
            console.log('✅ Session chargée:', result.session.name);
        } else {
            hideProgress();
            alert('❌ Aucune session précédente trouvée');
        }
    } catch (error) {
        hideProgress();
        console.error('Erreur lors du chargement de la session:', error);
        alert('❌ Erreur lors du chargement de la session: ' + error.message);
    }
}

// Lancer un nouveau scan
async function selectAndScanItems() {
    try {
        showProgress('Sélection des dossiers...', 0);
        
        const result = await window.electronAPI.selectItems();
        if (result.canceled) {
            hideProgress();
            return;
        }
        
        currentSelectedPaths = result.filePaths;
        showProgress('Scan en cours...', 10);
        
        // Écouter les événements de progression
        window.electronAPI.onScanProgress((progressData) => {
            const percentage = Math.round((progressData.processed / progressData.total) * 90) + 10;
            showProgress(
                `Analyse: ${progressData.current} (${progressData.processed}/${progressData.total})`,
                percentage
            );
        });
        
        const scanResult = await window.electronAPI.scanVideos(currentSelectedPaths);
        
        // Nettoyer les listeners
        window.electronAPI.removeAllListeners('scan-progress');
        
        if (scanResult.success) {
            currentVideos = scanResult.videos;
            currentSession = null; // Nouvelle session
            
            updateUI();
            hideProgress();
            
            console.log('✅ Scan terminé:', scanResult.total, 'vidéos trouvées');
            
            // Proposer de sauvegarder automatiquement
            if (scanResult.total > 0) {
                setTimeout(() => {
                    showConfirmationModal(
                        '💾 Sauvegarder la session ?',
                        '🎉 Scan terminé ! Voulez-vous sauvegarder cette nouvelle session ?',
                        () => {
                            showSaveSessionModal();
                        }
                    );
                }, 1000);
            }
        } else {
            hideProgress();
            alert('❌ Erreur lors du scan: ' + scanResult.error);
        }
    } catch (error) {
        hideProgress();
        console.error('Erreur lors du scan:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

// Afficher le modal de sauvegarde de session
function showSaveSessionModal() {
    if (!currentVideos || currentVideos.length === 0) {
        alert('⚠️ Aucune vidéo à sauvegarder. Effectuez d\'abord un scan.');
        return;
    }

    // Générer un nom par défaut
    let defaultName;
    if (currentSession) {
        defaultName = currentSession.name;
    } else {
        const folderNames = currentSelectedPaths.map(p => p.split('\\').pop()).slice(0, 2);
        defaultName = `Scan ${folderNames.join(', ')}`;
    }

    // Pré-remplir le champ avec le nom par défaut
    const input = document.getElementById('sessionNameInput');
    input.value = defaultName;
    document.getElementById('saveSessionModal').style.display = 'flex';

    // Focus sur le champ de saisie
    setTimeout(() => {
        try {
            if (input && input.focus) {
                input.focus();
                input.select();
            }
        } catch (error) {
            console.error('Erreur lors du focus sur sessionNameInput:', error);
        }
    }, 150);
}

// Fermer le modal de sauvegarde
function closeSaveSessionModal() {
    document.getElementById('saveSessionModal').style.display = 'none';
    document.getElementById('sessionNameInput').value = '';
}

// Confirmer la sauvegarde de la session
async function confirmSaveSession() {
    const sessionName = document.getElementById('sessionNameInput').value.trim();

    if (!sessionName) {
        alert('⚠️ Veuillez entrer un nom pour la session.');
        return;
    }

    try {
        // Vérifier si une session avec ce nom existe déjà
        const sessionsListResult = await window.electronAPI.listSessions();

        if (sessionsListResult.success && sessionsListResult.sessions.length > 0) {
            const existingSession = sessionsListResult.sessions.find(s => s.name === sessionName);

            // Si le nom existe et que ce n'est pas la session actuelle en cours de modification
            if (existingSession && (!currentSession || existingSession.id !== currentSession.id)) {
                // Demander confirmation pour écraser
                const shouldOverwrite = confirm(
                    `⚠️ Une session nommée "${sessionName}" existe déjà !\n\n` +
                    `📅 Créée le : ${new Date(existingSession.created).toLocaleDateString('fr-FR')}\n` +
                    `📹 Contient : ${existingSession.totalVideos} vidéos\n\n` +
                    `Voulez-vous l'écraser avec la nouvelle session ?`
                );

                if (!shouldOverwrite) {
                    // L'utilisateur a annulé, ne pas fermer la modal pour qu'il puisse changer le nom
                    return;
                }
            }
        }

        // Procéder à la sauvegarde
        const sessionData = {
            name: sessionName,
            selectedPaths: currentSelectedPaths,
            videos: currentVideos
        };

        const saveResult = await window.electronAPI.saveSession(sessionData);
        if (saveResult.success) {
            currentSession = {
                id: saveResult.sessionId,
                name: sessionName,
                selectedPaths: currentSelectedPaths,
                videos: currentVideos
            };

            updateSessionInfo();
            await loadSessionsList();
            closeSaveSessionModal();
            alert('✅ Session sauvegardée avec succès !');
        } else {
            alert('❌ Erreur lors de la sauvegarde de la session.');
        }
    } catch (error) {
        console.error('Erreur:', error);
        alert('❌ Erreur: ' + error.message);
    }
}


// Note: Les fonctions de mise à jour manuelle ont été supprimées car redondantes.
// La fonction "Ajouter dossiers" fait déjà automatiquement la mise à jour de la session.

// Ajouter des dossiers à la session existante
async function addFoldersToSession() {
    if (!currentSession) {
        alert('⚠️ Aucune session active. Chargez une session d\'abord.');
        return;
    }
    
    try {
        // 1. D'abord mettre à jour la session existante
        showProgress('Mise à jour de la session existante...', 0);
        
        // Rescanner les dossiers existants
        window.electronAPI.onScanProgress((progressData) => {
            const percentage = Math.round((progressData.processed / progressData.total) * 30);
            showProgress(
                `Vérification existants: ${progressData.current} (${progressData.processed}/${progressData.total})`,
                percentage
            );
        });
        
        const existingScanResult = await window.electronAPI.scanVideos(currentSession.selectedPaths);
        window.electronAPI.removeAllListeners('scan-progress');
        
        if (!existingScanResult.success) {
            hideProgress();
            alert('❌ Erreur lors de la mise à jour: ' + existingScanResult.error);
            return;
        }
        
        // 2. Sélectionner de nouveaux dossiers
        showProgress('Sélection de nouveaux dossiers...', 30);
        
        const result = await window.electronAPI.selectItems();
        if (result.canceled) {
            hideProgress();
            return;
        }
        
        // 3. Scanner les nouveaux dossiers
        showProgress('Scan des nouveaux dossiers...', 40);
        
        window.electronAPI.onScanProgress((progressData) => {
            const percentage = 40 + Math.round((progressData.processed / progressData.total) * 40);
            showProgress(
                `Scan nouveaux: ${progressData.current} (${progressData.processed}/${progressData.total})`,
                percentage
            );
        });
        
        const newScanResult = await window.electronAPI.scanVideos(result.filePaths);
        window.electronAPI.removeAllListeners('scan-progress');
        
        if (!newScanResult.success) {
            hideProgress();
            alert('❌ Erreur lors du scan: ' + newScanResult.error);
            return;
        }
        
        // 4. Détecter et filtrer les doublons
        showProgress('Détection des doublons...', 80);
        
        // Créer un Set des chemins existants pour comparaison rapide
        const existingPaths = new Set(existingScanResult.videos.map(v => v.absolutePath));
        
        // Filtrer les nouvelles vidéos (non doublons)
        const newVideos = newScanResult.videos.filter(v => !existingPaths.has(v.absolutePath));
        const duplicates = newScanResult.videos.filter(v => existingPaths.has(v.absolutePath));

        // Gérer les cas spéciaux (dossier vide ou que des doublons)
        if (newVideos.length === 0) {
            hideProgress();

            if (duplicates.length === 0) {
                // Cas 1: Dossier vide (0 nouvelles vidéos, 0 doublons)
                alert('ℹ️ Aucune vidéo trouvée dans ce dossier.');
            } else {
                // Cas 2: Que des doublons (0 nouvelles vidéos, mais des doublons)
                alert(`ℹ️ Toutes les vidéos de ce dossier sont déjà dans la session (${duplicates.length} doublon${duplicates.length > 1 ? 's' : ''} ignoré${duplicates.length > 1 ? 's' : ''}).`);
            }

            return; // Ne pas mettre à jour la session
        }

        // 5. Fusionner les vidéos (cas normal: nouvelles vidéos trouvées)
        const mergedVideos = [...existingScanResult.videos, ...newVideos];
        const mergedPaths = [...new Set([...currentSession.selectedPaths, ...result.filePaths])];

        // 6. Mettre à jour la session
        showProgress('Mise à jour de la session...', 90);
        
        const updateResult = await window.electronAPI.updateSession(
            currentSession.id,
            mergedVideos,
            mergedPaths
        );
        
        if (updateResult.success) {
            // Mettre à jour la session locale
            currentSession = updateResult.session;
            currentVideos = mergedVideos;
            currentSelectedPaths = mergedPaths;
            
            updateUI();
            updateSessionInfo();
            hideProgress();
            
            await loadSessionsList();
            
            // Afficher le résumé dans un modal
            showAddSummaryModal(mergedVideos, newVideos, duplicates);
        } else {
            hideProgress();
            alert('❌ Erreur lors de la mise à jour: ' + updateResult.error);
        }
    } catch (error) {
        hideProgress();
        console.error('Erreur lors de l\'ajout de dossiers:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

// Basculer l'affichage du panneau des sessions
async function toggleSessionsPanel() {
    const panel = document.getElementById('sessionsPanel');
    sessionsVisible = !sessionsVisible;
    
    if (sessionsVisible) {
        await loadSessionsList();
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}

// Charger la liste des sessions
async function loadSessionsList() {
    try {
        const result = await window.electronAPI.listSessions();
        const sessionsList = document.getElementById('sessionsList');
        
        if (result.success && result.sessions.length > 0) {
            sessionsList.innerHTML = result.sessions.map(session => `
                <div class="session-item">
                    <div class="session-details">
                        <h4>${session.name}</h4>
                        <small>📅 Créé: ${new Date(session.created).toLocaleDateString('fr-FR')}</small>
                        <small>📹 ${session.totalVideos} vidéos • ${formatFileSize(session.totalSize)}</small>
                    </div>
                    <div class="session-item-actions">
                        <button class="btn btn-primary btn-sm" onclick="loadSpecificSession('${session.id}')">
                            📂 Charger
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="showDeleteSessionModal('${session.id}', '${session.name}')">
                            🗑️ Suppr.
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            sessionsList.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">📁 Aucune session sauvegardée</p>';
        }
    } catch (error) {
        console.error('Erreur lors du chargement des sessions:', error);
        document.getElementById('sessionsList').innerHTML = 
            '<p style="text-align: center; color: #dc3545; padding: 20px;">❌ Erreur lors du chargement</p>';
    }
}

// Charger une session spécifique
async function loadSpecificSession(sessionId) {
    try {
        showProgress('Chargement de la session...', 50);
        
        const result = await window.electronAPI.loadSession(sessionId);
        if (result.success) {
            currentSession = result.session;
            currentVideos = result.session.videos || [];
            currentSelectedPaths = result.session.selectedPaths || [];
            
            updateUI();
            updateSessionInfo();
            hideProgress();
            toggleSessionsPanel(); // Fermer le panneau
            
            console.log('✅ Session chargée:', result.session.name);
        } else {
            hideProgress();
            alert('❌ Erreur lors du chargement: ' + result.error);
        }
    } catch (error) {
        hideProgress();
        console.error('Erreur lors du chargement de la session:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

// Afficher le modal de suppression
function showDeleteSessionModal(sessionId, sessionName) {
    sessionToDelete = sessionId;
    document.getElementById('deleteSessionName').textContent = sessionName;
    document.getElementById('deleteSessionModal').style.display = 'flex';
}

// Confirmer la suppression
async function confirmDeleteSession() {
    if (!sessionToDelete) return;
    
    try {
        const result = await window.electronAPI.deleteSession(sessionToDelete);
        if (result.success) {
            await loadSessionsList();
            closeDeleteModal();
            alert('✅ Session supprimée avec succès');
        } else {
            alert('❌ Erreur lors de la suppression: ' + result.error);
        }
    } catch (error) {
        console.error('Erreur lors de la suppression:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

// Fermer le modal de suppression
function closeDeleteModal() {
    document.getElementById('deleteSessionModal').style.display = 'none';
    sessionToDelete = null;
}

// Générer Markdown
async function generateMarkdown() {
    if (!currentVideos || currentVideos.length === 0) {
        alert('⚠️ Aucune vidéo à exporter. Effectuez d\'abord un scan ou chargez une session.');
        return;
    }
    
    try {
        const options = {
            title: currentSession ? currentSession.name : 'Catalogue Vidéo'
        };
        
        const result = await window.electronAPI.generateMarkdown(currentVideos, options);
        if (result.success) {
            alert('✅ Export Markdown généré avec succès !\n📁 ' + result.filePath);
        } else if (!result.canceled) {
            alert('❌ Erreur lors de la génération: ' + result.error);
        }
    } catch (error) {
        console.error('Erreur lors de la génération Markdown:', error);
        alert('❌ Erreur: ' + error.message);
    }
}


// Générer HTML avec liens
async function generateHTMLLinks() {
    if (!currentVideos || currentVideos.length === 0) {
        alert('⚠️ Aucune vidéo à exporter. Effectuez d\'abord un scan ou chargez une session.');
        return;
    }
    
    try {
        const options = {
            title: currentSession ? currentSession.name + ' (Liens)' : 'Catalogue Vidéo (Liens)'
        };
        
        const result = await window.electronAPI.generateHTMLLinks(currentVideos, options);
        if (result.success) {
            alert('✅ Catalogue HTML avec liens généré avec succès !\n📁 ' + result.filePath);
        } else if (!result.canceled) {
            alert('❌ Erreur lors de la génération: ' + result.error);
        }
    } catch (error) {
        console.error('Erreur lors de la génération HTML:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

// Fonctions utilitaires pour l'interface

function showProgress(message, percentage) {
    const container = document.getElementById('progressContainer');
    const fill = document.getElementById('progressFill');
    const text = document.getElementById('progressText');
    
    container.style.display = 'block';
    fill.style.width = percentage + '%';
    text.textContent = message;
}

function hideProgress() {
    document.getElementById('progressContainer').style.display = 'none';
}

function updateSessionStatus(message, className) {
    const status = document.getElementById('sessionStatus');
    status.textContent = message;
    status.className = `session-status ${className}`;
}

// Alias pour la compatibilité
function updateSessionButtons() {
    updateSessionInfo();
}

function updateSessionInfo() {
    // Vérifications de sécurité pour éviter les erreurs "Cannot set properties of null"
    const sessionDetailsEl = document.getElementById('sessionDetails');
    const sessionNameEl = document.getElementById('sessionName');
    const sessionStatsEl = document.getElementById('sessionStats');
    const saveSessionBtn = document.getElementById('saveSessionBtn');
    const addFoldersBtn = document.getElementById('addFoldersBtn');
    const exportFileBtn = document.getElementById('exportFileBtn');
    
    if (currentSession) {
        updateSessionStatus(`📚 ${currentSession.name}`, 'session-loaded');
        
        if (sessionNameEl) sessionNameEl.textContent = currentSession.name;
        if (sessionStatsEl) sessionStatsEl.textContent = `${currentVideos.length} vidéos`;
        
        if (sessionDetailsEl) sessionDetailsEl.style.display = 'block';
        
        // Activer les boutons de session avec vérifications
        if (saveSessionBtn) saveSessionBtn.disabled = false;
        if (addFoldersBtn) addFoldersBtn.disabled = false;
        if (exportFileBtn) exportFileBtn.disabled = false;
    } else {
        updateSessionStatus('📂 Aucune session chargée', 'session-none');
        if (sessionDetailsEl) sessionDetailsEl.style.display = 'none';
        
        // Activer seulement le bouton de sauvegarde si il y a des vidéos
        if (saveSessionBtn) saveSessionBtn.disabled = !currentVideos || currentVideos.length === 0;
        if (addFoldersBtn) addFoldersBtn.disabled = true;
        if (exportFileBtn) exportFileBtn.disabled = !currentVideos || currentVideos.length === 0;
    }
}

function updateUI() {
    if (currentVideos && currentVideos.length > 0) {
        // Vérifications de sécurité pour éviter les erreurs "Cannot set properties of null"
        const totalVideosEl = document.getElementById('totalVideos');
        const totalSizeEl = document.getElementById('totalSize');
        const totalExtensionsEl = document.getElementById('totalExtensions');
        const statsEl = document.getElementById('stats');
        const videosSectionEl = document.getElementById('videosSection');
        const generateLinksBtn = document.getElementById('generateLinksBtn');
        const generateMdBtn = document.getElementById('generateMdBtn');
        
        // Mettre à jour les statistiques uniquement si les éléments existent
        if (totalVideosEl) totalVideosEl.textContent = currentVideos.length;
        if (totalSizeEl) totalSizeEl.textContent = calculateTotalSize(currentVideos);
        if (totalExtensionsEl) totalExtensionsEl.textContent = getUniqueExtensions(currentVideos).length;
        
        // Afficher les statistiques
        if (statsEl) statsEl.style.display = 'flex';
        
        // Afficher la section des vidéos
        displayVideosTable();
        if (videosSectionEl) videosSectionEl.style.display = 'block';
        
        // Activer les boutons de génération avec vérification
        if (generateLinksBtn) generateLinksBtn.disabled = false;
        if (generateMdBtn) generateMdBtn.disabled = false;
    } else {
        // Vérifications de sécurité pour masquer les éléments
        const statsEl = document.getElementById('stats');
        const videosSectionEl = document.getElementById('videosSection');
        const generateLinksBtn = document.getElementById('generateLinksBtn');
        const generateMdBtn = document.getElementById('generateMdBtn');
        
        // Cacher les statistiques et vidéos
        if (statsEl) statsEl.style.display = 'none';
        if (videosSectionEl) videosSectionEl.style.display = 'none';
        
        // Désactiver les boutons de génération avec vérification
        if (generateLinksBtn) generateLinksBtn.disabled = true;
        if (generateMdBtn) generateMdBtn.disabled = true;
    }
    
    updateSessionInfo();
}

// Afficher le tableau des vidéos
function displayVideosTable() {
    const tbody = document.getElementById('videosTableBody');
    
    // Réinitialiser la recherche
    const searchBox = document.getElementById('videoSearchBox');
    if (searchBox) {
        searchBox.value = '';
    }
    
    if (!currentVideos || currentVideos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #6c757d;">Aucune vidéo trouvée</td></tr>';
        return;
    }
    
    tbody.innerHTML = currentVideos.map((video, index) => {
        const fullPath = video.folder || 'N/A';
        const rowClass = index % 2 === 0 ? 'background: #fdfdfd;' : '';
        const safePath = (video.absolutePath || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        
        return `<tr style="${rowClass} border-bottom: 1px solid #e9ecef;" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='${index % 2 === 0 ? '#fdfdfd' : '#fff'}'" data-index="${index}">
            <td style="padding: 8px; font-weight: 500; color: #2c3e50; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${video.name}">
                ${video.name}
            </td>
            <td style="padding: 8px; text-align: right; color: #495057; white-space: nowrap;" data-size="${video.sizeBytes || 0}">${video.size}</td>
            <td style="padding: 8px; text-align: center;">
                <span style="background: #e9ecef; padding: 2px 6px; border-radius: 10px; font-size: 10px; text-transform: uppercase; color: #495057;">
                    ${(video.extension || '').replace('.', '')}
                </span>
            </td>
            <td dir="rtl" style="padding: 8px; color: #6c757d; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fullPath}">
                ${fullPath}
            </td>
            <td style="padding: 8px; text-align: center; white-space: nowrap;">
                <button onclick="openVideoFile('${safePath}')" style="background: #28a745; color: white; border: none; padding: 2px 4px; margin: 1px; border-radius: 3px; cursor: pointer; font-size: 9px;" title="Ouvrir la vidéo">▶</button>
                <button onclick="openVideoFolder('${safePath}')" style="background: #17a2b8; color: white; border: none; padding: 2px 4px; margin: 1px; border-radius: 3px; cursor: pointer; font-size: 9px;" title="Ouvrir le dossier">📁</button>
                <button onclick="copyVideoPath('${safePath}')" style="background: #6c757d; color: white; border: none; padding: 2px 4px; margin: 1px; border-radius: 3px; cursor: pointer; font-size: 9px;" title="Copier le chemin">📋</button>
            </td>
        </tr>`;
    }).join('');
    
    // Stocker les vidéos pour le tri
    window.currentDisplayedVideos = currentVideos;
    
    // Initialiser le redimensionnement des colonnes si pas déjà fait
    if (!columnResizingInitialized) {
        setTimeout(() => {
            initColumnResizing();
            columnResizingInitialized = true;
        }, 100);
    }
}

// Basculer la visibilité de la table des vidéos
function toggleVideosVisibility() {
    const container = document.getElementById('videosContainer');
    const btn = document.getElementById('toggleVideosBtn');
    
    if (container.style.display === 'none') {
        container.style.display = 'block';
        btn.innerHTML = '👁️ Masquer';
    } else {
        container.style.display = 'none';
        btn.innerHTML = '👁️ Afficher';
    }
}

// Filtrer les vidéos selon la recherche
function filterVideos() {
    const searchBox = document.getElementById('videoSearchBox');
    const searchTerm = searchBox.value.toLowerCase();
    const rows = document.querySelectorAll('#videosTableBody tr');
    let visibleCount = 0;
    let totalCount = 0;
    
    // Appliquer un style quand il y a du texte
    if (searchTerm) {
        searchBox.style.borderColor = '#667eea';
        searchBox.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)';
    } else {
        searchBox.style.borderColor = '#e9ecef';
        searchBox.style.boxShadow = 'none';
    }
    
    rows.forEach(row => {
        // Ignorer la ligne "Aucune vidéo trouvée"
        if (row.querySelector('td[colspan]')) {
            return;
        }
        
        totalCount++;
        const text = row.textContent.toLowerCase();
        const isVisible = text.includes(searchTerm);
        row.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
    });
    
    // Mettre à jour le titre et le compteur
    const header = document.querySelector('.videos-header h3');
    const resultCount = document.getElementById('searchResultCount');
    
    if (searchTerm) {
        header.innerHTML = `📹 Vidéos filtrées : ${visibleCount} / ${totalCount}`;
        resultCount.textContent = `${visibleCount} résultat${visibleCount > 1 ? 's' : ''}`;
        resultCount.style.display = 'inline';
        
        // Changer la couleur selon les résultats
        if (visibleCount === 0) {
            resultCount.style.color = '#dc3545';
        } else if (visibleCount < 5) {
            resultCount.style.color = '#ffc107';
        } else {
            resultCount.style.color = '#28a745';
        }
    } else {
        header.innerHTML = `📹 Vidéos trouvées`;
        resultCount.style.display = 'none';
    }
    
    // Si aucun résultat, afficher un message
    if (searchTerm && visibleCount === 0) {
        const tbody = document.getElementById('videosTableBody');
        if (!document.getElementById('noResultsRow')) {
            const noResultsRow = document.createElement('tr');
            noResultsRow.id = 'noResultsRow';
            noResultsRow.innerHTML = '<td colspan="5" style="text-align: center; padding: 20px; color: #dc3545; font-style: italic;">🔍 Aucune vidéo ne correspond à votre recherche</td>';
            tbody.appendChild(noResultsRow);
        }
    } else {
        // Supprimer le message "aucun résultat" s'il existe
        const noResultsRow = document.getElementById('noResultsRow');
        if (noResultsRow) {
            noResultsRow.remove();
        }
    }
}

function calculateTotalSize(videos) {
    let totalMB = 0;
    videos.forEach(video => {
        if (video.sizeBytes && !isNaN(video.sizeBytes)) {
            totalMB += video.sizeBytes / (1024 * 1024);
        }
    });
    
    return formatFileSize(totalMB * 1024 * 1024);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getUniqueExtensions(videos) {
    const extensions = new Set();
    videos.forEach(video => {
        if (video.extension && video.extension !== 'N/A') {
            extensions.add(video.extension.toLowerCase());
        }
    });
    return Array.from(extensions);
}

// Fonctions pour les actions des boutons du tableau
async function openVideoFile(videoPath) {
    try {
        const result = await window.electronAPI.openFile(videoPath);
        if (!result.success) {
            alert('❌ Erreur lors de l\'ouverture: ' + (result.error || 'Erreur inconnue'));
        }
    } catch (error) {
        console.error('Erreur lors de l\'ouverture du fichier:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

async function openVideoFolder(videoPath) {
    try {
        const result = await window.electronAPI.openFolder(videoPath);
        if (!result.success) {
            alert('❌ Erreur lors de l\'ouverture du dossier: ' + (result.error || 'Erreur inconnue'));
        }
    } catch (error) {
        console.error('Erreur lors de l\'ouverture du dossier:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

async function copyVideoPath(videoPath) {
    try {
        const result = await window.electronAPI.copyPath(videoPath);
        if (result.success) {
            // Notification discrète
            showTempMessage('📋 Chemin copié !');
        } else {
            alert('❌ Erreur lors de la copie: ' + (result.error || 'Erreur inconnue'));
        }
    } catch (error) {
        console.error('Erreur lors de la copie:', error);
        alert('❌ Erreur: ' + error.message);
    }
}

// Afficher un message temporaire
function showTempMessage(message) {
    const existing = document.getElementById('tempMessage');
    if (existing) existing.remove();
    
    const msgDiv = document.createElement('div');
    msgDiv.id = 'tempMessage';
    msgDiv.textContent = message;
    msgDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 10000;
        font-weight: 500;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(msgDiv);
    
    setTimeout(() => {
        msgDiv.style.transition = 'opacity 0.5s';
        msgDiv.style.opacity = '0';
        setTimeout(() => msgDiv.remove(), 500);
    }, 2000);
}

// Gestion du tri des colonnes
let currentSortColumn = null;
let currentSortOrder = 'asc'; // 'asc' ou 'desc'

window.sortTable = function(column) {
    console.log('Tri demandé pour la colonne:', column);
    if (!currentVideos || currentVideos.length === 0) return;
    
    // Si on clique sur la même colonne, inverser l'ordre
    if (currentSortColumn === column) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortOrder = 'asc';
    }
    
    // Copier le tableau pour le trier
    let sortedVideos = [...currentVideos];
    
    // Fonction de comparaison selon la colonne
    sortedVideos.sort((a, b) => {
        let valueA, valueB;
        let isNumeric = false;
        
        switch(column) {
            case 'name':
                valueA = a.name.toLowerCase();
                valueB = b.name.toLowerCase();
                break;
            case 'size':
                valueA = parseSizeToBytes(a.size);
                valueB = parseSizeToBytes(b.size);
                isNumeric = true;
                break;
            case 'extension':
                valueA = a.extension.toLowerCase();
                valueB = b.extension.toLowerCase();
                break;
            case 'folder':
                valueA = a.folder.toLowerCase();
                valueB = b.folder.toLowerCase();
                break;
            default:
                return 0;
        }
        
        const direction = currentSortOrder === 'asc' ? 1 : -1;

        if (isNumeric) {
            return (valueA - valueB) * direction;
        }
        
        // Utiliser localeCompare pour un tri naturel qui gère mieux les nombres et caractères spéciaux
        return valueA.localeCompare(valueB, undefined, { numeric: true, sensitivity: 'base' }) * direction;
    });
    
    // Réafficher le tableau trié
    currentVideos = sortedVideos;
    displayVideosTable();
    
    // Mettre à jour les indicateurs de tri dans les en-têtes
    updateSortIndicators(column);
};

// Fonction pour convertir la taille en octets
function parseSizeToBytes(sizeStr) {
    const match = sizeStr.match(/([0-9.]+)\s*([KMGT]?B)/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    const multipliers = {
        'B': 1,
        'KB': 1024,
        'MB': 1024 * 1024,
        'GB': 1024 * 1024 * 1024,
        'TB': 1024 * 1024 * 1024 * 1024
    };
    
    return value * (multipliers[unit] || 1);
}

// Fonction pour mettre à jour les indicateurs de tri
function updateSortIndicators(sortedColumn) {
    // Réinitialiser tous les indicateurs
    const headers = document.querySelectorAll('th[onclick^="sortTable"] .sort-indicator');
    headers.forEach(indicator => {
        indicator.textContent = ' ↕';
    });
    
    // Mettre à jour l'indicateur de la colonne triée
    const columnIndex = {
        'name': 0,
        'size': 1,
        'extension': 2,
        'folder': 3
    }[sortedColumn];
    
    if (columnIndex !== undefined) {
        const indicator = document.querySelectorAll('th[onclick^="sortTable"] .sort-indicator')[columnIndex];
        if (indicator) {
            indicator.textContent = currentSortOrder === 'asc' ? ' ↑' : ' ↓';
        }
    }
}

// Afficher le modal de résumé d'ajout
function showAddSummaryModal(totalVideos, newVideos, duplicates) {
    const content = document.getElementById('addSummaryContent');

    let html = '<div style="background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #28a745;">';
    html += `<h4 style="margin: 0 0 10px 0; color: #155724;">✅ Session "${currentSession.name}" mise à jour automatiquement</h4>`;
    html += '<ul style="list-style: none; padding: 0; margin: 0;">';
    html += `<li style="padding: 5px 0;"><strong>📁 Total vidéos dans la session :</strong> ${totalVideos.length}</li>`;
    html += `<li style="padding: 5px 0; color: #28a745;"><strong>➕ Nouvelles vidéos ajoutées :</strong> ${newVideos.length}</li>`;
    if (duplicates.length > 0) {
        html += `<li style="padding: 5px 0; color: #856404;"><strong>🔁 Doublons ignorés :</strong> ${duplicates.length}</li>`;
    }
    html += '</ul>';
    html += '<p style="margin: 10px 0 0 0; padding-top: 10px; border-top: 1px solid #c3e6cb; color: #155724; font-size: 13px;">';
    html += '💡 <strong>Pas besoin de re-sauvegarder</strong> — La session a été mise à jour automatiquement.';
    html += '</p>';
    html += '</div>';
    
    if (newVideos.length > 0) {
        html += '<div style="margin-top: 15px;">';
        html += '<h4 style="color: #2c3e50;">Nouvelles vidéos ajoutées :</h4>';
        html += '<div style="max-height: 200px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 5px; padding: 10px;">';
        html += '<ul style="list-style: none; padding: 0; margin: 0; font-size: 13px;">';
        newVideos.forEach(video => {
            html += `<li style="padding: 3px 0; border-bottom: 1px solid #f0f0f0; color: #2c3e50;">🎥 ${video.name} <span style="color: #6c757d;">(${video.size})</span></li>`;
        });
        html += '</ul>';
        html += '</div>';
        html += '</div>';
    }
    
    if (duplicates.length > 0) {
        html += '<details style="margin-top: 15px;">';
        html += '<summary style="cursor: pointer; color: #6c757d;">Voir les doublons ignorés (' + duplicates.length + ')</summary>';
        html += '<div style="margin-top: 10px; max-height: 150px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 5px; padding: 10px;">';
        html += '<ul style="list-style: none; padding: 0; margin: 0; font-size: 12px;">';
        duplicates.forEach(video => {
            html += `<li style="padding: 2px 0; color: #6c757d;">🔁 ${video.name}</li>`;
        });
        html += '</ul>';
        html += '</div>';
        html += '</details>';
    }
    
    content.innerHTML = html;
    document.getElementById('addSummaryModal').style.display = 'flex';
}

function closeAddSummaryModal() {
    document.getElementById('addSummaryModal').style.display = 'none';
}

// Gestion des fermetures de modals par clic extérieur
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        if (e.target.id === 'saveSessionModal') closeSaveSessionModal();
        if (e.target.id === 'deleteSessionModal') closeDeleteModal();
        if (e.target.id === 'addSummaryModal') closeAddSummaryModal();
    }
});

// Variables globales pour le redimensionnement
let currentResizing = null;
let resizeStartX = 0;
let resizeStartWidth = 0;

// Gestion du redimensionnement des colonnes
function initColumnResizing() {
    const table = document.getElementById('videosTable');
    if (!table) return;

    // Supprimer les event listeners existants pour éviter les conflits
    cleanupResizeListeners();

    // Rendre le tableau redimensionnable
    table.style.tableLayout = 'fixed';

    const headers = table.querySelectorAll('thead th');

    headers.forEach((header, index) => {
        // Ne pas rendre la dernière colonne (Actions) redimensionnable
        if (index === headers.length - 1) {
            header.style.resize = 'none';
            return;
        }

        // Nettoyer l'ancien handle s'il existe
        const existingHandle = header.querySelector('.resize-handle');
        if (existingHandle) {
            existingHandle.remove();
        }

        // Ajouter les styles pour le redimensionnement
        header.style.position = 'relative';
        header.style.resize = 'none'; // Désactiver le resize CSS natif
        header.style.overflow = 'hidden';
        header.style.minWidth = '50px';

        // Créer une barre de redimensionnement visible
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle';
        resizeHandle.style.cssText = `
            position: absolute;
            right: 0;
            top: 0;
            bottom: 0;
            width: 5px;
            background: transparent;
            cursor: col-resize;
            user-select: none;
            z-index: 10;
        `;

        // Stocker l'index pour référence
        resizeHandle.dataset.columnIndex = index;
        header.appendChild(resizeHandle);

        // Event listeners pour cette colonne spécifique
        resizeHandle.addEventListener('mousedown', (e) => {
            startColumnResize(e, header, index);
        });

        // Empêcher le clic de se propager à l'en-tête et de déclencher le tri
        resizeHandle.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Hover effect
        resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.background = 'rgba(222, 226, 230, 0.8)';
        });

        resizeHandle.addEventListener('mouseleave', () => {
            if (currentResizing !== header) {
                resizeHandle.style.background = 'transparent';
            }
        });
    });

    // Event listeners globaux (une seule fois)
    setupGlobalResizeListeners();

    // Charger les largeurs sauvegardées
    loadColumnWidths();
}

function startColumnResize(e, header, columnIndex) {
    currentResizing = header;
    resizeStartX = e.pageX;
    resizeStartWidth = header.offsetWidth;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    // Mettre en évidence la barre de redimensionnement
    const handle = header.querySelector('.resize-handle');
    if (handle) {
        handle.style.background = '#007bff';
    }

    e.preventDefault();
    e.stopPropagation();
}

function setupGlobalResizeListeners() {
    // Event listener pour mousemove
    document.addEventListener('mousemove', handleMouseMove);

    // Event listener pour mouseup
    document.addEventListener('mouseup', handleMouseUp);
}

function cleanupResizeListeners() {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
}

function handleMouseMove(e) {
    if (!currentResizing) return;

    const diff = e.pageX - resizeStartX;
    const newWidth = resizeStartWidth + diff;

    if (newWidth > 50) {
        currentResizing.style.width = newWidth + 'px';

        // Ajuster la largeur de la colonne correspondante
        const table = document.getElementById('videosTable');
        const colgroup = table.querySelector('colgroup');
        const columnIndex = parseInt(currentResizing.querySelector('.resize-handle').dataset.columnIndex);

        if (colgroup && colgroup.children[columnIndex]) {
            colgroup.children[columnIndex].style.width = newWidth + 'px';
        }
    }
}

function handleMouseUp() {
    if (currentResizing) {
        // Restaurer le curseur
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Restaurer la couleur de la barre
        const handle = currentResizing.querySelector('.resize-handle');
        if (handle) {
            handle.style.background = 'transparent';
        }

        // Sauvegarder les largeurs
        saveColumnWidths();

        // Réinitialiser
        currentResizing = null;
        resizeStartX = 0;
        resizeStartWidth = 0;
    }
}

function saveColumnWidths() {
    const table = document.getElementById('videosTable');
    if (!table) return;
    
    const headers = table.querySelectorAll('thead th');
    const widths = [];
    
    headers.forEach(header => {
        widths.push(header.offsetWidth);
    });
    
    localStorage.setItem('tableColumnWidths', JSON.stringify(widths));
}

function loadColumnWidths() {
    const table = document.getElementById('videosTable');
    if (!table) return;
    
    const savedWidths = localStorage.getItem('tableColumnWidths');
    if (!savedWidths) return;
    
    try {
        const widths = JSON.parse(savedWidths);
        const headers = table.querySelectorAll('thead th');
        const colgroup = table.querySelector('colgroup');
        
        headers.forEach((header, index) => {
            if (widths[index]) {
                header.style.width = widths[index] + 'px';
                if (colgroup && colgroup.children[index]) {
                    colgroup.children[index].style.width = widths[index] + 'px';
                }
            }
        });
    } catch (e) {
        console.error('Erreur lors du chargement des largeurs de colonnes:', e);
    }
}

// Appeler initColumnResizing après l'affichage initial du tableau
let columnResizingInitialized = false;

// Fonction pour exporter la session vers un fichier
async function exportSessionToFile() {
    if (!currentVideos || currentVideos.length === 0) {
        alert('⚠️ Aucune vidéo à exporter. Effectuez d\'abord un scan.');
        return;
    }

    try {
        const sessionData = {
            name: currentSession ? currentSession.name : `Export_${new Date().toLocaleDateString('fr-FR')}`,
            selectedPaths: currentSelectedPaths,
            videos: currentVideos,
            exportDate: new Date().toISOString(),
            totalVideos: currentVideos.length,
            version: '2.0.0'
        };

        const result = await window.electronAPI.exportSessionToFile(sessionData);

        if (result.canceled) {
            // Utilisateur a annulé, ne rien faire
            return;
        }

        if (result.success) {
            alert(`✅ Session exportée avec succès !\n📁 ${result.filePath}`);
        } else {
            alert(`❌ Erreur lors de l'export: ${result.error}`);
        }
    } catch (error) {
        console.error('Erreur export session:', error);
        alert('❌ Erreur lors de l\'export de la session');
    }
}

// Fonction pour importer une session depuis un fichier
async function importSessionFromFile() {
    try {
        console.log('🔄 Début import session depuis fichier...');
        const result = await window.electronAPI.importSessionFromFile();
        console.log('📊 Résultat backend:', result);

        if (result.canceled) {
            console.log('❌ Import annulé par l\'utilisateur');
            return; // Utilisateur a annulé
        }

        if (result.success && result.sessionData) {
            console.log('✅ Données reçues:', result.sessionData);
            const sessionData = result.sessionData;

            // Validation des données importées
            console.log('🔍 Validation des données...');
            console.log('Videos présentes:', !!sessionData.videos);
            console.log('Videos est array:', Array.isArray(sessionData.videos));
            console.log('Nombre de vidéos:', sessionData.videos ? sessionData.videos.length : 'N/A');

            if (!sessionData.videos || !Array.isArray(sessionData.videos)) {
                console.error('❌ Validation échouée: données vidéos invalides');
                alert('❌ Fichier de session invalide : données vidéos manquantes');
                return;
            }

            // Confirmer l'import
            const confirmation = confirm(`📥 Importer la session "${sessionData.name}" ?\n\n` +
                `• ${sessionData.totalVideos || sessionData.videos.length} vidéos\n` +
                `• Exportée le : ${new Date(sessionData.exportDate).toLocaleDateString('fr-FR')}\n\n` +
                `⚠️ Cela remplacera la session courante.`);

            if (confirmation) {
                // Charger la session importée
                currentVideos = sessionData.videos;
                currentSelectedPaths = sessionData.selectedPaths || [];
                currentSession = {
                    id: `imported_${Date.now()}`,
                    name: sessionData.name,
                    selectedPaths: currentSelectedPaths
                };

                // Mettre à jour l'interface
                updateSessionStatus(`📥 Session importée: ${sessionData.name}`, 'session-loaded');
                updateUI(); // Utilise updateUI() au lieu de updateVideosTable()
                updateSessionButtons();

                alert(`✅ Session "${sessionData.name}" importée avec succès !`);
            }
        } else {
            console.error('❌ Échec import:', result);
            alert(`❌ Erreur lors de l'import: ${result.error || 'Fichier invalide'}`);
        }
    } catch (error) {
        console.error('💥 Exception import session:', error);
        console.error('Stack trace:', error.stack);
        alert('❌ Erreur lors de l\'import de la session: ' + error.message);
    }
}

// Fonctions pour la confirmation du nouveau scan
function confirmNewScan() {
    // Afficher le modal de confirmation
    document.getElementById('newScanModal').style.display = 'flex';
}

function closeNewScanModal() {
    // Fermer le modal de confirmation
    document.getElementById('newScanModal').style.display = 'none';
}

function proceedWithNewScan() {
    // Fermer le modal et procéder au scan
    closeNewScanModal();
    selectAndScanItems();
}

// =============================================
// MODAL DE CONFIRMATION GÉNÉRIQUE
// =============================================
let confirmCallback = null;

function showConfirmationModal(title, text, onConfirm) {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalText').innerHTML = text; // Use innerHTML to allow for simple formatting
    confirmCallback = onConfirm;
    document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirmationModal() {
    document.getElementById('confirmModal').style.display = 'none';
    confirmCallback = null;
}

// =============================================
// BASCULER LA VISIBILITÉ DES STATISTIQUES
// =============================================

// Fonction pour basculer la visibilité des statistiques
function toggleStatsVisibility() {
    const progressSummary = document.getElementById('progressSummary');
    const toggleBtn = document.getElementById('toggleStatsBtn');
    const icon = document.getElementById('toggleStatsIcon');
    const text = document.getElementById('toggleStatsText');

    if (!progressSummary || !toggleBtn || !icon || !text) {
        console.error('❌ Éléments du toggle stats non trouvés');
        return;
    }

    // Basculer l'état
    statsVisible = !statsVisible;

    // Appliquer la visibilité
    if (statsVisible) {
        progressSummary.style.display = 'flex';
        icon.textContent = '👁️';
        text.textContent = 'Masquer stats';
    } else {
        progressSummary.style.display = 'none';
        icon.textContent = '👁️‍🗨️';
        text.textContent = 'Afficher stats';
    }

    // Sauvegarder la préférence
    localStorage.setItem('statsVisible', statsVisible ? 'true' : 'false');
}

// Fonction pour restaurer l'état de visibilité au chargement
function restoreStatsVisibility() {
    const savedState = localStorage.getItem('statsVisible');

    // Si une préférence est sauvegardée, l'utiliser
    if (savedState !== null) {
        statsVisible = savedState === 'true';

        const progressSummary = document.getElementById('progressSummary');
        const icon = document.getElementById('toggleStatsIcon');
        const text = document.getElementById('toggleStatsText');

        if (progressSummary && icon && text) {
            if (statsVisible) {
                progressSummary.style.display = 'flex';
                icon.textContent = '👁️';
                text.textContent = 'Masquer stats';
            } else {
                progressSummary.style.display = 'none';
                icon.textContent = '👁️‍🗨️';
                text.textContent = 'Afficher stats';
            }
        }
    }
}

// Raccourci clavier Ctrl+F pour focus sur la recherche
document.addEventListener('keydown', function(e) {
    // Ctrl+H pour toggle statistiques
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        toggleStatsVisibility();
    }

    // Ctrl+F ou Cmd+F
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();

        const videosSection = document.getElementById('videosSection');
        const searchBox = document.getElementById('videoSearchBox');

        // Si la section vidéos est visible, focus sur la recherche
        if (videosSection && videosSection.style.display !== 'none' && searchBox) {
            searchBox.focus();
            searchBox.select();
        }
    }

    // Echap pour effacer la recherche
    if (e.key === 'Escape') {
        const searchBox = document.getElementById('videoSearchBox');
        if (searchBox && document.activeElement === searchBox) {
            searchBox.value = '';
            filterVideos();
            searchBox.blur();
        }

        // Fermer les modals avec Escape
        const newScanModal = document.getElementById('newScanModal');
        if (newScanModal && newScanModal.style.display === 'flex') {
            closeNewScanModal();
        }

        // Fermer le modal de sauvegarde avec Escape
        const saveSessionModal = document.getElementById('saveSessionModal');
        if (saveSessionModal && saveSessionModal.style.display === 'flex') {
            closeSaveSessionModal();
        }

        // Gérer la touche Entrée dans le champ de nom de session
        if (e.key === 'Enter' && e.target.id === 'sessionNameInput') {
            e.preventDefault();
            confirmSaveSession();
        }
    }
});

