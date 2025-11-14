/**
 * UI Controls for SHAC Web Player
 * Handles play/pause, progress bar, keyboard input, etc.
 */

class PlayerControls {
    constructor() {
        this.isPlaying = false;
        this.duration = 0;
        this.currentTime = 0;
        
        // Callbacks
        this.onPlayPause = null;
        this.onSeek = null;
        this.onMove = null;           // View-relative movement (for keyboard)
        this.onMoveAbsolute = null;   // World-coordinate movement (for controller)
        this.onRotate = null;
        this.onSetDirection = null;   // Set absolute direction
        this.onReset = null;
        this.onReplay = null;
        
        // Gamepad support
        this.gamepadIndex = null;
        this.gamepadConnected = false;
        
        // DOM elements
        this.playPauseBtn = document.getElementById('play-pause');
        this.replayBtn = document.getElementById('replay-btn');
        this.progressTrack = document.querySelector('.progress-track');
        this.progressFill = document.querySelector('.progress-fill');
        this.progressHandle = document.querySelector('.progress-handle');
        this.currentTimeEl = document.getElementById('current-time');
        this.totalTimeEl = document.getElementById('total-time');
        this.fullscreenBtn = document.getElementById('fullscreen');
        this.instructionsOverlay = document.getElementById('instructions');
        this.startExperienceBtn = document.getElementById('start-experience');
        this.noFileOverlay = document.getElementById('no-file-overlay');
        this.browseFileBtn = document.getElementById('browse-file');
        this.dropZone = document.getElementById('drop-zone');
        this.loadingDetails = document.querySelector('.loading-details');
        this.loadFileBtn = document.getElementById('load-file');
        this.infoBtn = document.getElementById('info-btn');
        
        this.setupEventListeners();
        this.setupKeyboardControls();
        this.setupGamepadControls();
        this.setupMobileControls();
    }

    /**
     * Setup UI event listeners
     */
    setupEventListeners() {
        // Play/pause button
        this.playPauseBtn.addEventListener('click', (e) => {
            console.log('Play button clicked!', this.onPlayPause);
            e.preventDefault();
            e.stopPropagation();
            if (this.onPlayPause) {
                this.onPlayPause();
            } else {
                console.log('No onPlayPause callback set!');
            }
        });
        
        // Replay button
        this.replayBtn.addEventListener('click', (e) => {
            console.log('Replay button clicked!');
            e.preventDefault();
            e.stopPropagation();
            if (this.onReplay) {
                this.onReplay();
            } else {
                console.log('No onReplay callback set!');
            }
        });
        
        // Progress bar
        this.progressTrack.addEventListener('click', (e) => {
            const rect = this.progressTrack.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            const time = percent * this.duration;
            if (this.onSeek) this.onSeek(time);
        });
        
        // Fullscreen
        this.fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        });
        
        // Start experience button
        this.startExperienceBtn.addEventListener('click', (e) => {
            console.log('Start Experience button clicked!');
            e.preventDefault();
            e.stopPropagation();
            this.hideInstructions();
            if (this.onPlayPause) this.onPlayPause();
        });
        
        // Load file button
        if (this.loadFileBtn) {
            this.loadFileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const fileInput = document.getElementById('file-input');
                if (fileInput) {
                    fileInput.click();
                }
            });
        }
        
        // Info button
        if (this.infoBtn) {
            this.infoBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const infoOverlay = document.getElementById('info-overlay');
                if (infoOverlay) {
                    infoOverlay.classList.add('show');
                }
            });
        }
    }

    /**
     * Setup keyboard controls
     */
    setupKeyboardControls() {
        const keys = new Set();
        
        document.addEventListener('keydown', (e) => {
            keys.add(e.key);
            
            // Play/pause on space
            if (e.key === ' ') {
                e.preventDefault();
                if (this.onPlayPause) this.onPlayPause();
            }
            
            // Reset on R
            if (e.key.toLowerCase() === 'r') {
                if (this.onReset) this.onReset();
            }
            
            // Fullscreen on F
            if (e.key.toLowerCase() === 'f') {
                this.fullscreenBtn.click();
            }
            
            // Escape to skip instructions or reset
            if (e.key === 'Escape') {
                if (this.instructionsOverlay.classList.contains('show')) {
                    console.log('Escape pressed - hiding instructions');
                    this.hideInstructions();
                } else if (this.onReset) {
                    this.onReset();
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            keys.delete(e.key);
        });
        
        // Movement update loop
        setInterval(() => {
            let dx = 0, dz = 0, dy = 0;
            let dAzimuth = 0, dElevation = 0;
            
            // WASD movement (absolute world coordinates)
            if (keys.has('w') || keys.has('W')) dz = 1;   // W = north (positive Z)
            if (keys.has('s') || keys.has('S')) dz = -1;  // S = south (negative Z)
            if (keys.has('a') || keys.has('A')) dx = -1;  // A = west (negative X)
            if (keys.has('d') || keys.has('D')) dx = 1;   // D = east (positive X)
            if (keys.has('q') || keys.has('Q')) dy = 1;   // Q = up
            if (keys.has('e') || keys.has('E')) dy = -1;  // E = down
            
            // Arrow key rotation (absolute direction setting)
            if (keys.has('ArrowLeft')) dAzimuth = -1;
            if (keys.has('ArrowRight')) dAzimuth = 1;
            if (keys.has('ArrowUp')) dElevation = 1;
            if (keys.has('ArrowDown')) dElevation = -1;
            
            // Send movement commands (absolute world movement)
            if (dx !== 0 || dy !== 0 || dz !== 0) {
                if (this.onMoveAbsolute) this.onMoveAbsolute(dx, dy, dz);
            }
            
            if (dAzimuth !== 0 || dElevation !== 0) {
                if (this.onRotate) this.onRotate(dAzimuth, dElevation);
            }
        }, 16); // ~60fps
    }

    /**
     * Setup gamepad controls
     */
    setupGamepadControls() {
        // Check for gamepad API support
        if (!('getGamepads' in navigator)) {
            console.log('Gamepad API not supported');
            return;
        }

        // Listen for gamepad connection
        window.addEventListener('gamepadconnected', (e) => {
            console.log('Gamepad connected:', e.gamepad.id);
            this.gamepadIndex = e.gamepad.index;
            this.gamepadConnected = true;
            this.showGamepadNotification('Controller connected: ' + e.gamepad.id);
        });

        // Listen for gamepad disconnection
        window.addEventListener('gamepaddisconnected', (e) => {
            console.log('Gamepad disconnected');
            if (e.gamepad.index === this.gamepadIndex) {
                this.gamepadConnected = false;
                this.gamepadIndex = null;
                this.showGamepadNotification('Controller disconnected');
            }
        });

        // Start gamepad polling loop
        this.pollGamepad();
    }

    /**
     * Poll gamepad state
     */
    pollGamepad() {
        if (this.gamepadConnected) {
            const gamepads = navigator.getGamepads();
            const gamepad = gamepads[this.gamepadIndex];
            
            if (gamepad) {
                // Left stick for movement (axes 0 and 1)
                const leftStickX = gamepad.axes[0];
                const leftStickY = gamepad.axes[1];
                
                // Right stick for rotation (axes 2 and 3)
                const rightStickX = gamepad.axes[2];
                const rightStickY = gamepad.axes[3];
                
                // Apply deadzone
                const deadzone = 0.15;
                
                // Movement (absolute world coordinates, not relative to view)
                if (Math.abs(leftStickX) > deadzone || Math.abs(leftStickY) > deadzone) {
                    if (this.onMoveAbsolute) {
                        this.onMoveAbsolute(
                            leftStickX * 0.33,   // Right = positive X (east) - reduced sensitivity
                            0,                   // No vertical movement on left stick
                            -leftStickY * 0.33   // Up = positive Z (north) - reduced sensitivity
                        );
                    }
                }
                
                // Absolute direction control (not rotation)
                if (Math.abs(rightStickX) > deadzone || Math.abs(rightStickY) > deadzone) {
                    if (this.onSetDirection) {
                        // Convert stick position to absolute angle (reduced sensitivity)
                        const targetAngle = Math.atan2(-rightStickX, -rightStickY) * 180 / Math.PI;
                        this.onSetDirection(targetAngle, 0); // Set absolute direction
                    }
                }
                
                // Button controls
                // A button (index 0) - Play/Pause
                if (gamepad.buttons[0].pressed && !this.gamepadButtonStates[0]) {
                    if (this.onPlayPause) this.onPlayPause();
                }
                
                // Y button (index 3) - Reset position
                if (gamepad.buttons[3].pressed && !this.gamepadButtonStates[3]) {
                    if (this.onReset) this.onReset();
                }
                
                // Bumpers for vertical movement
                // Right bumper (index 5) - Move up
                if (gamepad.buttons[5].pressed) {
                    if (this.onMove) this.onMove(0, 1, 0);
                }
                
                // Left bumper (index 4) - Move down
                if (gamepad.buttons[4].pressed) {
                    if (this.onMove) this.onMove(0, -1, 0);
                }
                
                // Store button states to detect press/release
                if (!this.gamepadButtonStates) {
                    this.gamepadButtonStates = [];
                }
                for (let i = 0; i < gamepad.buttons.length; i++) {
                    this.gamepadButtonStates[i] = gamepad.buttons[i].pressed;
                }
            }
        }
        
        // Continue polling
        requestAnimationFrame(() => this.pollGamepad());
    }

    /**
     * Show gamepad notification
     */
    showGamepadNotification(message) {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('gamepad-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'gamepad-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 212, 255, 0.9);
                color: white;
                padding: 1rem 1.5rem;
                border-radius: 4px;
                font-size: 0.9rem;
                z-index: 1000;
                transition: opacity 0.3s ease;
            `;
            document.body.appendChild(notification);
        }
        
        notification.textContent = message;
        notification.style.opacity = '1';
        
        // Hide after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
        }, 3000);
    }

    /**
     * Setup direct touch controls: finger IS the sprite
     */
    setupMobileControls() {
        // Direct touch controls: finger position = sprite position exactly
        let activeTouchId = null;
        
        // Get current listener height and keep it updated
        let currentListenerHeight = 0;
        
        // Add method to update height from external sources
        this.updateListenerHeight = (newHeight) => {
            currentListenerHeight = newHeight;
        };
        
        // Two-finger controls for listening direction (back to original)
        let isTwoFingerActive = false;
        let initialTwoFingerCenter = { x: 0, y: 0 };
        
        // Get main touch area (the canvas or main container)
        const touchArea = document.getElementById('visualizer') || document.body;
        
        // Convert screen coordinates to world position with proper scaling
        const screenToWorld = (screenX, screenY) => {
            const rect = touchArea.getBoundingClientRect();
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            // Direct mapping: screen position maps to world position
            // Scale factor adjusted for reasonable world space
            const scale = 0.01; // 1cm per pixel gives good control range
            const worldX = (screenX - centerX) * scale;
            const worldZ = (screenY - centerY) * scale;
            
            return { x: worldX, z: worldZ };
        };
        
        // Handle two-finger touch for listening direction (original function)
        const handleTwoFingerTouch = (touch1, touch2) => {
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            
            if (!isTwoFingerActive) {
                isTwoFingerActive = true;
                initialTwoFingerCenter.x = centerX;
                initialTwoFingerCenter.y = centerY;
                return;
            }
            
            // Calculate swipe direction for hearing control
            const deltaX = centerX - initialTwoFingerCenter.x;
            const deltaY = centerY - initialTwoFingerCenter.y;
            
            // Convert to listening direction (azimuth) - unrestricted consciousness
            const sensitivity = 2.0; // Increased for fluid movement
            const azimuthDelta = deltaX * sensitivity;
            const elevationDelta = -deltaY * sensitivity; // Invert Y for natural feel
            
            // Send rotation update (original hearing control)
            if (this.onRotate) {
                this.onRotate(azimuthDelta, elevationDelta);
            }
            
            // Update initial position for next frame
            initialTwoFingerCenter.x = centerX;
            initialTwoFingerCenter.y = centerY;
        };
        
        // Simple drag controls
        let lastTouchX = 0;
        let lastTouchY = 0;
        let isDragging = false;
        
        touchArea.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                // Single finger: start dragging
                const touch = e.touches[0];
                activeTouchId = touch.identifier;
                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;
                isDragging = true;
                
                e.preventDefault();
            } else if (e.touches.length === 2) {
                // Two fingers: listening direction control (original)
                isDragging = false;
                isTwoFingerActive = true;
                
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                handleTwoFingerTouch(touch1, touch2);
                
                e.preventDefault();
            }
        });
        
        touchArea.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && isDragging && activeTouchId !== null) {
                // Single finger: drag sprite by movement delta
                const touch = Array.from(e.touches).find(t => t.identifier === activeTouchId);
                if (touch) {
                    // Calculate movement delta
                    const deltaX = touch.clientX - lastTouchX;
                    const deltaY = touch.clientY - lastTouchY;
                    
                    // Convert screen delta to world delta  
                    const scale = 0.09; // 9x sensitivity - spatial audio for the masses!
                    const worldDeltaX = deltaX * scale;
                    const worldDeltaZ = -deltaY * scale; // Flipped: pull down = go down
                    
                    // Move sprite by delta (this works like keyboard/controller)
                    if (this.onMoveAbsolute) {
                        this.onMoveAbsolute(worldDeltaX, 0, worldDeltaZ);
                    }
                    
                    // Update last position
                    lastTouchX = touch.clientX;
                    lastTouchY = touch.clientY;
                }
                e.preventDefault();
            } else if (e.touches.length === 2 && isTwoFingerActive) {
                // Two fingers: update listening direction
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                handleTwoFingerTouch(touch1, touch2);
                e.preventDefault();
            }
        });
        
        touchArea.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                // All fingers lifted - stop dragging
                activeTouchId = null;
                isTwoFingerActive = false;
                isDragging = false;
            } else if (e.touches.length === 1) {
                // Back to single finger from two-finger
                isTwoFingerActive = false;
                
                // If we don't have an active touch, start tracking the remaining finger
                if (activeTouchId === null) {
                    const touch = e.touches[0];
                    activeTouchId = touch.identifier;
                    lastTouchX = touch.clientX;
                    lastTouchY = touch.clientY;
                    isDragging = true;
                }
            }
        });
        
        touchArea.addEventListener('touchcancel', (e) => {
            // Reset all touch state on cancel
            activeTouchId = null;
            isTwoFingerActive = false;
        });
        
        // Create elevation control buttons
        this.createElevationControls();
    }

    /**
     * Create elevation control buttons for touch devices
     */
    createElevationControls() {
        // Check if we're on a touch device
        if (!('ontouchstart' in window)) return;
        
        // Create elevation controls container
        const elevationControls = document.createElement('div');
        elevationControls.className = 'elevation-controls mobile-only';
        elevationControls.innerHTML = `
            <button class="elevation-btn up-btn">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M7 14l5-5 5 5z"/>
                </svg>
            </button>
            <div class="elevation-label">Height</div>
            <button class="elevation-btn down-btn">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path d="M7 10l5 5 5-5z"/>
                </svg>
            </button>
        `;
        
        // Add to the mobile controls container
        const mobileControls = document.getElementById('mobile-controls');
        if (mobileControls) {
            mobileControls.appendChild(elevationControls);
        }
        
        // Add event listeners for elevation buttons
        const upBtn = elevationControls.querySelector('.up-btn');
        const downBtn = elevationControls.querySelector('.down-btn');
        
        let elevationInterval = null;
        
        const startElevation = (direction) => {
            if (elevationInterval) clearInterval(elevationInterval);
            
            elevationInterval = setInterval(() => {
                // Update current height for touch controls
                currentListenerHeight += direction * 0.5;
                
                if (this.onMoveAbsolute) {
                    this.onMoveAbsolute(0, direction * 0.5, 0);
                }
            }, 50); // 20fps for smooth movement
        };
        
        const stopElevation = () => {
            if (elevationInterval) {
                clearInterval(elevationInterval);
                elevationInterval = null;
            }
        };
        
        // Touch events for elevation buttons
        upBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startElevation(1); // Move up
            upBtn.style.transform = 'scale(0.9)';
        });
        
        upBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopElevation();
            upBtn.style.transform = 'scale(1)';
        });
        
        downBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startElevation(-1); // Move down
            downBtn.style.transform = 'scale(0.9)';
        });
        
        downBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            stopElevation();
            downBtn.style.transform = 'scale(1)';
        });
        
        // Handle touch leave/cancel events
        [upBtn, downBtn].forEach(btn => {
            btn.addEventListener('touchcancel', stopElevation);
            btn.addEventListener('touchleave', stopElevation);
        });
    }


    /**
     * Update play/pause button state
     */
    setPlaying(playing) {
        this.isPlaying = playing;
        const playIcon = this.playPauseBtn.querySelector('.play-icon');
        const pauseIcon = this.playPauseBtn.querySelector('.pause-icon');
        
        if (playing) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
        }
    }

    /**
     * Update time display
     */
    updateTime(current, duration) {
        this.currentTime = current;
        this.duration = duration;
        
        // Update progress bar
        const percent = duration > 0 ? (current / duration) * 100 : 0;
        this.progressFill.style.width = percent + '%';
        this.progressHandle.style.left = percent + '%';
        
        // Update time text
        this.currentTimeEl.textContent = this.formatTime(current);
        this.totalTimeEl.textContent = this.formatTime(duration);
    }

    /**
     * Format time in MM:SS
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Show loading screen
     */
    showLoading(status = 'Loading...', details = '') {
        document.getElementById('loading').classList.add('active');
        document.getElementById('player').classList.remove('active');
        document.querySelector('.status').textContent = status;
        if (this.loadingDetails) {
            this.loadingDetails.textContent = details;
        }
    }

    /**
     * Show player screen
     */
    showPlayer() {
        document.getElementById('loading').classList.remove('active');
        document.getElementById('player').classList.add('active');
    }

    /**
     * Show instructions overlay
     */
    showInstructions() {
        this.instructionsOverlay.classList.add('show');
    }

    /**
     * Hide instructions overlay
     */
    hideInstructions() {
        this.instructionsOverlay.classList.remove('show');
    }

    /**
     * Show no file overlay
     */
    showNoFileOverlay() {
        this.noFileOverlay.classList.add('show');
    }

    /**
     * Hide no file overlay
     */
    hideNoFileOverlay() {
        this.noFileOverlay.classList.remove('show');
    }

    /**
     * Update track info
     */
    updateTrackInfo(title, subtitle) {
        document.getElementById('track-title').textContent = title;
        document.getElementById('track-subtitle').textContent = subtitle;
    }
}

// Export for use in other modules
window.PlayerControls = PlayerControls;