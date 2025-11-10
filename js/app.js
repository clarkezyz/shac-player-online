/**
 * SHAC Player - Local File Player
 * Plays .shac files from user's device
 */

class SHACPlayer {
    constructor() {
        this.fileLoader = new UniversalFileLoader();
        this.zusLoader = new ZusFileLoader();
        this.audioEngine = new SpatialAudioEngine();
        this.visualizer = new SpatialVisualizer(document.getElementById('visualizer'));
        this.controls = new PlayerControls();
        
        this.currentSHAC = null;
        this.updateInterval = null;
        this.isInitialized = false;
        
        this.init();
    }

    async init() {
        try {
            // Show loading
            this.controls.showLoading('Initializing spatial audio...', 'Preparing player...');
            
            // Initialize audio engine
            await this.audioEngine.init();
            
            // Setup control callbacks
            this.setupControlCallbacks();
            
            // Setup visualizer callbacks
            this.setupVisualizerCallbacks();
            
            // Start visualizer
            this.visualizer.start();
            
            // Setup file input immediately
            this.setupFileInput();
            
            // Setup info buttons
            this.setupInfoButtons();
            
            // Setup PWA install
            this.setupPWAInstall();
            
            // Show player ready for files
            this.controls.showPlayer();
            this.controls.showNoFileOverlay();
            this.controls.updateTrackInfo(
                'SHAC Player',
                'Load a .shac file to begin'
            );
            
            this.isInitialized = true;
            
        } catch (error) {
            console.error('Player initialization error:', error);
            this.controls.showLoading('Error: ' + error.message);
        }
    }

    setupControlCallbacks() {
        // Play/pause
        this.controls.onPlayPause = async () => {
            if (!this.currentSHAC) return;
            
            if (this.audioEngine.isPlaying) {
                this.audioEngine.pause();
                this.controls.setPlaying(false);
                this.stopUpdateLoop();
            } else {
                await this.audioEngine.play();
                this.controls.setPlaying(true);
                this.startUpdateLoop();
            }
        };

        // Replay
        this.controls.onReplay = async () => {
            if (this.audioEngine && this.currentSHAC) {
                await this.audioEngine.replay();
                this.controls.setPlaying(true);
                this.startUpdateLoop();
            }
        };

        // Movement (view-relative, for mouse/visualizer)
        this.controls.onMove = (dx, dy, dz) => {
            this.audioEngine.moveListener(dx, dy, dz);
            this.updateVisualization();
        };

        // Absolute movement (world coordinates, for keyboard/controller)
        this.controls.onMoveAbsolute = (dx, dy, dz) => {
            this.audioEngine.moveListenerAbsolute(dx, dy, dz);
            this.updateVisualization();
        };

        // Rotation
        this.controls.onRotate = (dAzimuth, dElevation) => {
            this.audioEngine.rotateListener(dAzimuth, dElevation);
            this.updateVisualization();
        };

        // Set absolute direction (for controller)
        this.controls.onSetDirection = (azimuth, elevation) => {
            this.audioEngine.setListenerDirection(azimuth, elevation);
            this.updateVisualization();
        };

        // Reset position
        this.controls.onReset = () => {
            this.audioEngine.resetListener();
            this.updateVisualization();
        };
    }

    setupVisualizerCallbacks() {
        this.visualizer.onRotation = (dAzimuth, dElevation) => {
            this.audioEngine.rotateListener(dAzimuth, dElevation);
            this.updateVisualization();
        };
    }

    setupFileInput() {
        const fileInput = document.getElementById('file-input');
        
        // Load file button in top bar
        const loadFileBtn = document.getElementById('load-file');
        if (loadFileBtn) {
            loadFileBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }
        
        // File input handlers
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                await this.loadFile(file);
            }
        });
        
        // Drag and drop
        const dropZone = document.getElementById('drop-zone');
        if (dropZone) {
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.style.backgroundColor = 'rgba(0, 212, 255, 0.1)';
            });
            
            dropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.style.backgroundColor = '';
            });
            
            dropZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.style.backgroundColor = '';
                
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    await this.loadFile(files[0]);
                }
            });
        }
        
        // Browse button in overlay
        const browseBtn = document.getElementById('browse-file');
        if (browseBtn) {
            browseBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }
        
        // Skip button
        const skipBtn = document.getElementById('skip-upload');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => {
                this.controls.hideNoFileOverlay();
            });
        }
        
        // Züs integration
        this.setupZusIntegration();
    }
    
    setupZusIntegration() {
        // Load from Züs button
        const zusBtn = document.getElementById('load-from-zus');
        if (zusBtn) {
            zusBtn.addEventListener('click', () => {
                this.showZusDialog();
            });
        }
        
        // Züs dialog elements
        const zusDialog = document.getElementById('zus-dialog');
        const closeZusBtn = document.getElementById('close-zus-dialog');
        const backToFileLoaderBtn = document.getElementById('back-to-file-loader');
        const loadZusFileBtn = document.getElementById('load-zus-file');
        const zusUrlInput = document.getElementById('zus-url');
        
        if (closeZusBtn) {
            closeZusBtn.addEventListener('click', () => {
                zusDialog.classList.remove('show');
            });
        }
        
        if (backToFileLoaderBtn) {
            backToFileLoaderBtn.addEventListener('click', () => {
                zusDialog.classList.remove('show');
                this.controls.showNoFileOverlay();
            });
        }
        
        if (loadZusFileBtn) {
            loadZusFileBtn.addEventListener('click', async () => {
                const url = zusUrlInput.value.trim();
                if (url) {
                    await this.loadFromZus(url);
                }
            });
        }
        
        // Clear cache button
        const clearCacheBtn = document.getElementById('clear-cache');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async () => {
                if (confirm('Clear all cached SHAC files?')) {
                    await this.zusLoader.clearAllCache();
                    await this.updateCacheDisplay();
                }
            });
        }
        
        // Initialize cache display
        this.updateCacheDisplay();
    }
    
    async showZusDialog() {
        const zusDialog = document.getElementById('zus-dialog');
        this.controls.hideNoFileOverlay();
        zusDialog.classList.add('show');
        await this.updateCacheDisplay();
    }
    
    async updateCacheDisplay() {
        try {
            const cacheInfo = await this.zusLoader.getCacheInfo();
            const cacheStatus = document.getElementById('cache-status');
            const cacheFiles = document.getElementById('cache-files');
            const clearCacheBtn = document.getElementById('clear-cache');
            
            if (cacheInfo.fileCount === 0) {
                cacheStatus.textContent = 'No cached files';
                cacheFiles.innerHTML = '';
                clearCacheBtn.style.display = 'none';
            } else {
                cacheStatus.textContent = `${cacheInfo.fileCount} files (${cacheInfo.totalSizeMB} MB)`;
                clearCacheBtn.style.display = 'block';
                
                // Show quota info if available
                if (cacheInfo.quota) {
                    const quotaMB = (cacheInfo.quota.quota / 1024 / 1024).toFixed(0);
                    const usedMB = (cacheInfo.quota.usage / 1024 / 1024).toFixed(0);
                    cacheStatus.textContent += ` - Storage: ${usedMB}MB / ${quotaMB}MB (${cacheInfo.quota.usagePercent.toFixed(1)}%)`;
                }
                
                // Display cached files
                cacheFiles.innerHTML = cacheInfo.files.map(file => `
                    <div class="cache-item">
                        <div class="file-info">
                            <div class="file-name">${file.id}</div>
                            <div class="file-details">${file.sizeMB} MB • ${file.timestamp}</div>
                        </div>
                        <button onclick="player.loadCachedFile('${file.id}')">Load</button>
                    </div>
                `).join('');
            }
        } catch (error) {
            console.error('Error updating cache display:', error);
            document.getElementById('cache-status').textContent = 'Error reading cache';
        }
    }
    
    async loadFromZus(url) {
        const zusDialog = document.getElementById('zus-dialog');
        const progressSection = document.getElementById('zus-progress');
        const progressFill = progressSection.querySelector('.progress-fill');
        const progressLabel = progressSection.querySelector('.progress-label');
        const progressDetails = progressSection.querySelector('.progress-details');
        const loadBtn = document.getElementById('load-zus-file');
        
        try {
            // Show progress
            progressSection.style.display = 'block';
            loadBtn.disabled = true;
            progressLabel.textContent = 'Connecting to Züs...';
            
            // Load from Züs with progress tracking
            const arrayBuffer = await this.zusLoader.loadFromZus(url, {
                onProgress: (info) => {
                    const percent = Math.round(info.percent);
                    progressFill.style.width = `${percent}%`;
                    
                    // Update percentage display
                    const percentageElement = progressSection.querySelector('.progress-percentage');
                    if (percentageElement) {
                        percentageElement.textContent = `${percent}%`;
                    }
                    
                    if (info.cached) {
                        progressLabel.textContent = 'Loading from cache...';
                    } else {
                        progressLabel.textContent = 'Downloading from Züs...';
                        const loadedMB = (info.loaded / 1024 / 1024).toFixed(2);
                        const totalMB = info.total ? (info.total / 1024 / 1024).toFixed(2) : '?';
                        progressDetails.textContent = `${loadedMB} MB / ${totalMB} MB`;
                    }
                }
            });
            
            // Decode and load the file
            progressLabel.textContent = 'Decoding SHAC file...';
            const shacData = await this.fileLoader.decode(arrayBuffer, '.shac');
            
            // Load into audio engine
            progressLabel.textContent = 'Loading spatial audio...';
            await this.audioEngine.loadSHAC(shacData);
            
            // Store current SHAC
            this.currentSHAC = shacData;
            
            // Update visualization
            this.updateVisualization();
            
            // Extract filename from URL
            const fileName = this.zusLoader.extractFileId(url);
            this.controls.updateTrackInfo(
                fileName,
                `${shacData.layerNames.length} spatial layers • ${(shacData.header.n_samples / shacData.header.sample_rate).toFixed(0)}s`
            );
            
            // Update time display
            const duration = this.audioEngine.duration || 0;
            this.controls.updateTime(0, duration);
            
            // Close dialog and show player
            zusDialog.classList.remove('show');
            this.controls.showPlayer();
            this.controls.showInstructions();
            
            // Update cache display
            await this.updateCacheDisplay();
            
        } catch (error) {
            console.error('Error loading from Züs:', error);
            alert(`Error loading file from Züs: ${error.message}`);
        } finally {
            progressSection.style.display = 'none';
            loadBtn.disabled = false;
            progressFill.style.width = '0%';
            progressDetails.textContent = '';
        }
    }
    
    async loadCachedFile(fileId) {
        try {
            const cached = await this.zusLoader.getFromCache(fileId);
            if (cached) {
                // Close dialog first
                document.getElementById('zus-dialog').classList.remove('show');
                
                // Load the cached file
                this.controls.showLoading('Loading from cache...', `Loading ${fileId}...`);
                const shacData = await this.fileLoader.decode(cached.data, '.shac');
                await this.audioEngine.loadSHAC(shacData);
                
                this.currentSHAC = shacData;
                this.updateVisualization();
                
                this.controls.updateTrackInfo(
                    fileId,
                    `${shacData.layerNames.length} spatial layers • ${(shacData.header.n_samples / shacData.header.sample_rate).toFixed(0)}s`
                );
                
                const duration = this.audioEngine.duration || 0;
                this.controls.updateTime(0, duration);
                
                this.controls.showPlayer();
                this.controls.showInstructions();
            }
        } catch (error) {
            console.error('Error loading cached file:', error);
            alert(`Error loading cached file: ${error.message}`);
        }
    }

    setupInfoButtons() {
        // Close buttons for overlays
        const closeButtons = document.querySelectorAll('.close-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const overlay = e.target.closest('.overlay');
                if (overlay) {
                    overlay.classList.remove('show');
                }
            });
        });
        
        // Controls button
        const controlsBtn = document.getElementById('controls-btn');
        const controlsOverlay = document.getElementById('controls-overlay');
        if (controlsBtn && controlsOverlay) {
            controlsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                controlsOverlay.classList.add('show');
            });
            
            // Click outside to close
            controlsOverlay.addEventListener('click', (e) => {
                if (e.target === controlsOverlay) {
                    controlsOverlay.classList.remove('show');
                }
            });
        }
        
        // Info overlay
        const infoOverlay = document.getElementById('info-overlay');
        if (infoOverlay) {
            // Click outside to close
            infoOverlay.addEventListener('click', (e) => {
                if (e.target === infoOverlay) {
                    infoOverlay.classList.remove('show');
                }
            });
        }
    }

    async loadFile(file) {
        try {
            this.controls.showLoading('Loading file...', `Processing ${file.name}...`);
            this.controls.hideNoFileOverlay();
            
            // Load and decode the file
            const shacData = await this.fileLoader.load(file);
            
            // Load into audio engine
            await this.audioEngine.loadSHAC(shacData);
            
            // Store current SHAC
            this.currentSHAC = shacData;
            
            // Update visualization
            this.updateVisualization();
            
            // Update UI with file info
            const fileName = file.name.replace('.shac', '');
            this.controls.updateTrackInfo(
                fileName,
                `${shacData.layerNames.length} spatial layers • ${(shacData.header.n_samples / shacData.header.sample_rate).toFixed(0)}s`
            );
            
            // Update time display
            const duration = this.audioEngine.duration || 0;
            this.controls.updateTime(0, duration);
            
            // Show player and instructions
            this.controls.showPlayer();
            this.controls.showInstructions();
            
        } catch (error) {
            console.error('Error loading file:', error);
            this.controls.showPlayer();
            this.controls.showNoFileOverlay();
            alert(`Error loading file: ${error.message}`);
        }
    }

    updateVisualization() {
        const layers = this.audioEngine.getLayerInfo();
        const listenerPos = this.audioEngine.listenerPosition;
        const listenerRot = this.audioEngine.listenerRotation;
        
        this.visualizer.updateData(layers, listenerPos, listenerRot);
    }

    /**
     * Start update loop for progress tracking
     */
    startUpdateLoop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.updateInterval = setInterval(() => {
            if (this.audioEngine.isPlaying) {
                const currentTime = this.audioEngine.getCurrentTime();
                const duration = this.audioEngine.duration || 0;
                this.controls.updateTime(currentTime, duration);
                
                // Auto-stop at end
                if (currentTime >= duration) {
                    this.audioEngine.pause();
                    this.controls.setPlaying(false);
                    this.stopUpdateLoop();
                }
            }
        }, 100);
    }

    /**
     * Stop update loop
     */
    stopUpdateLoop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    /**
     * Setup PWA install functionality
     */
    setupPWAInstall() {
        let deferredPrompt = null;
        const installButton = document.getElementById('install-pwa');
        
        // Check if we came from the install page
        const urlParams = new URLSearchParams(window.location.search);
        const shouldShowInstall = urlParams.get('install') === 'true';
        
        // Listen for the beforeinstallprompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent Chrome 76 and later from showing the mini-infobar
            e.preventDefault();
            // Stash the event so it can be triggered later
            deferredPrompt = e;
            
            // Show install button if available
            if (installButton) {
                installButton.style.display = 'flex';
            }
            
            // Auto-show install prompt if came from install page
            if (shouldShowInstall && !window.matchMedia('(display-mode: standalone)').matches) {
                setTimeout(() => this.showInstallDialog(), 500);
            }
        });
        
        // Handle install button click
        if (installButton) {
            installButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.showInstallDialog(deferredPrompt);
            });
        }
        
        // Check if already installed
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            // Already installed, hide install button
            if (installButton) {
                installButton.style.display = 'none';
            }
        }
        
        // Listen for successful install
        window.addEventListener('appinstalled', () => {
            console.log('SHAC Player installed successfully');
            if (installButton) {
                installButton.style.display = 'none';
            }
        });
    }
    
    /**
     * Show install dialog
     */
    showInstallDialog(deferredPrompt) {
        if (deferredPrompt) {
            // Show browser install prompt
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('User accepted PWA install');
                } else {
                    console.log('User dismissed PWA install');
                }
                deferredPrompt = null;
            });
        } else {
            // Show manual install instructions
            this.showManualInstallInstructions();
        }
    }
    
    /**
     * Show manual install instructions
     */
    showManualInstallInstructions() {
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);
        
        let instructions = '';
        
        if (isIOS) {
            instructions = `
                <h3>Install SHAC Player on iOS</h3>
                <ol>
                    <li>Tap the Share button <span style="font-size: 1.2em;">⬆️</span> at the bottom of Safari</li>
                    <li>Scroll down and tap "Add to Home Screen"</li>
                    <li>Tap "Add" in the top right corner</li>
                </ol>
                <p>The SHAC Player will be saved to your home screen and work offline!</p>
            `;
        } else if (isAndroid) {
            instructions = `
                <h3>Install SHAC Player on Android</h3>
                <ol>
                    <li>Tap the menu button (⋮) in your browser</li>
                    <li>Tap "Add to Home Screen" or "Install App"</li>
                    <li>Tap "Add" or "Install"</li>
                </ol>
                <p>The SHAC Player will be saved to your home screen and work offline!</p>
            `;
        } else {
            instructions = `
                <h3>Install SHAC Player</h3>
                <p>In Chrome or Edge:</p>
                <ol>
                    <li>Click the install icon in the address bar (if available)</li>
                    <li>Or open the menu (⋮) and click "Install SHAC Player"</li>
                </ol>
                <p>The player will be installed and work offline!</p>
            `;
        }
        
        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'overlay active';
        overlay.innerHTML = `
            <div class="info-content" style="max-width: 500px;">
                <button class="close-btn" onclick="this.closest('.overlay').remove()">&times;</button>
                ${instructions}
                <button class="primary-btn" style="margin-top: 20px;" onclick="this.closest('.overlay').remove()">Got it!</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
    }
}