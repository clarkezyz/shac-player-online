/**
 * 3D Visualizer for Spatial Audio
 * Renders the spatial scene with sound sources and listener
 */

class SpatialVisualizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.layers = [];
        this.listenerPos = { x: 0, y: 0, z: 0 };
        this.listenerRot = { azimuth: 0, elevation: 0 };
        
        // Visual settings
        this.scale = 50; // pixels per meter
        this.gridSize = 20; // grid squares;
        
        // Animation
        this.animationFrame = null;
        this.time = 0;
        
        // Interaction
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        // Adaptive rendering
        this.lastFrameTime = 0;
        this.frameTimeSamples = [];
        this.maxSamples = 30; // Track last 30 frames
        this.adaptiveMode = false;
        this.targetFrameTime = 16.67; // 60fps target
        this.stressThreshold = 25; // If frame time exceeds 25ms consistently
        
        this.setupCanvas();
        this.setupInteraction();
    }

    /**
     * Setup canvas sizing
     */
    setupCanvas() {
        const resize = () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.centerX = this.canvas.width / 2;
            this.centerY = this.canvas.height / 2;
        };
        
        resize();
        window.addEventListener('resize', resize);
    }

    /**
     * Setup mouse/touch interaction
     */
    setupInteraction() {
        // Check if we're on mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                        window.innerWidth <= 1024 ||
                        ('ontouchstart' in window) ||
                        (navigator.maxTouchPoints > 0);
        
        // Only setup mouse events on desktop
        if (!isMobile) {
            // Mouse events - only on canvas, not document
            this.canvas.addEventListener('mousedown', (e) => {
                // Only start drag if clicking directly on canvas, not on UI elements
                if (e.target === this.canvas) {
                    this.handleStart(e.clientX, e.clientY);
                    e.stopPropagation();
                }
            });
            
            this.canvas.addEventListener('mousemove', (e) => {
                if (this.isDragging && e.target === this.canvas) {
                    this.handleMove(e.clientX, e.clientY);
                    e.stopPropagation();
                }
            });
            
            this.canvas.addEventListener('mouseup', (e) => {
                if (this.isDragging) {
                    this.handleEnd();
                    e.stopPropagation();
                }
            });
            
            this.canvas.addEventListener('mouseleave', () => {
                if (this.isDragging) {
                    this.handleEnd();
                }
            });
        }
        
        // Don't setup touch events here - let controls.js handle all mobile touch
    }

    handleStart(x, y) {
        this.isDragging = true;
        this.lastMouseX = x;
        this.lastMouseY = y;
        if (this.onRotationStart) this.onRotationStart();
    }

    handleMove(x, y) {
        if (!this.isDragging) return;
        
        const deltaX = x - this.lastMouseX;
        const deltaY = y - this.lastMouseY;
        
        // Convert to rotation (horizontal movement = azimuth, vertical = elevation)
        // Inverted to match natural expectation
        const azimuthDelta = -deltaX * 0.5;
        const elevationDelta = deltaY * 0.5;
        
        if (this.onRotation) {
            this.onRotation(azimuthDelta, elevationDelta);
        }
        
        this.lastMouseX = x;
        this.lastMouseY = y;
    }

    handleEnd() {
        this.isDragging = false;
    }

    /**
     * Update visualization data
     */
    updateData(layers, listenerPos, listenerRot) {
        this.layers = layers;
        this.listenerPos = listenerPos;
        this.listenerRot = listenerRot;
    }

    /**
     * Start animation loop
     */
    start() {
        if (this.animationFrame) return;
        
        const animate = (currentTime) => {
            // Track frame performance for adaptive rendering
            const frameTime = currentTime - this.lastFrameTime;
            this.trackFramePerformance(frameTime);
            
            this.time += 0.016; // ~60fps
            this.render();
            
            this.lastFrameTime = currentTime;
            this.animationFrame = requestAnimationFrame(animate);
        };
        
        this.lastFrameTime = performance.now();
        animate(this.lastFrameTime);
    }

    /**
     * Stop animation loop
     */
    stop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }

    /**
     * Track frame performance for adaptive rendering
     */
    trackFramePerformance(frameTime) {
        // Add to samples
        this.frameTimeSamples.push(frameTime);
        
        // Keep only recent samples
        if (this.frameTimeSamples.length > this.maxSamples) {
            this.frameTimeSamples.shift();
        }
        
        // Check if we need to enter adaptive mode
        if (this.frameTimeSamples.length >= 10) {
            const averageFrameTime = this.frameTimeSamples.reduce((a, b) => a + b, 0) / this.frameTimeSamples.length;
            const wasAdaptive = this.adaptiveMode;
            
            // Enter adaptive mode if consistently slow
            this.adaptiveMode = averageFrameTime > this.stressThreshold;
            
            // Log mode changes for debugging
            if (this.adaptiveMode !== wasAdaptive) {
                console.log(this.adaptiveMode ? 
                    `🎨 Adaptive rendering enabled (avg frame time: ${averageFrameTime.toFixed(1)}ms)` :
                    `🎨 Adaptive rendering disabled (avg frame time: ${averageFrameTime.toFixed(1)}ms)`
                );
            }
        }
    }

    /**
     * Render the 3D scene with adaptive quality
     */
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#0a0a0a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw grid FIRST (background layer) - simplified in adaptive mode
        if (this.adaptiveMode) {
            this.drawGridSimplified();
        } else {
            this.drawGrid();
        }
        
        // Draw essential elements ON TOP of grid (audio sources and listener position)
        this.drawSoundSources();
        this.drawListener();
        
        // Draw UI elements - reduced detail in adaptive mode
        if (this.adaptiveMode) {
            this.drawCompassSimplified();
        } else {
            this.drawCompass();
        }
        
        this.drawPositionInfo();
        
        // Skip non-essential elements in adaptive mode
        if (!this.adaptiveMode) {
            // Draw controller tip if connected
            if (window.shacPlayer && window.shacPlayer.controls && window.shacPlayer.controls.gamepadConnected) {
                this.drawControllerTip();
            }
        }
    }

    /**
     * Draw simplified grid for adaptive mode
     */
    drawGridSimplified() {
        this.ctx.strokeStyle = '#1a1a2a';
        this.ctx.lineWidth = 1;
        
        // Only draw major axes and fewer grid lines
        const gridExtent = this.gridSize * this.scale;
        const step = this.scale * 4; // Every 4 meters instead of 1
        
        // Draw only a few grid lines
        for (let i = -this.gridSize; i <= this.gridSize; i += 4) {
            const pos = i * this.scale;
            
            // Vertical lines
            const x = this.centerX + pos;
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.centerY - gridExtent);
            this.ctx.lineTo(x, this.centerY + gridExtent);
            this.ctx.stroke();
            
            // Horizontal lines
            const y = this.centerY + pos;
            this.ctx.beginPath();
            this.ctx.moveTo(this.centerX - gridExtent, y);
            this.ctx.lineTo(this.centerX + gridExtent, y);
            this.ctx.stroke();
        }
        
        // Draw main axes only
        this.ctx.strokeStyle = '#2a2a3a';
        this.ctx.lineWidth = 2;
        
        // X axis
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX - gridExtent, this.centerY);
        this.ctx.lineTo(this.centerX + gridExtent, this.centerY);
        this.ctx.stroke();
        
        // Z axis
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX, this.centerY - gridExtent);
        this.ctx.lineTo(this.centerX, this.centerY + gridExtent);
        this.ctx.stroke();
    }

    /**
     * Draw the ground grid
     */
    drawGrid() {
        this.ctx.strokeStyle = '#1a1a2a';
        this.ctx.lineWidth = 1;
        
        const gridExtent = this.gridSize * this.scale;
        
        for (let i = -this.gridSize; i <= this.gridSize; i++) {
            const pos = i * this.scale;
            
            // Vertical lines
            const x = this.centerX + pos;
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.centerY - gridExtent);
            this.ctx.lineTo(x, this.centerY + gridExtent);
            this.ctx.stroke();
            
            // Horizontal lines
            const y = this.centerY + pos;
            this.ctx.beginPath();
            this.ctx.moveTo(this.centerX - gridExtent, y);
            this.ctx.lineTo(this.centerX + gridExtent, y);
            this.ctx.stroke();
        }
        
        // Draw axes
        this.ctx.strokeStyle = '#2a2a3a';
        this.ctx.lineWidth = 2;
        
        // X axis
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX - gridExtent, this.centerY);
        this.ctx.lineTo(this.centerX + gridExtent, this.centerY);
        this.ctx.stroke();
        
        // Z axis
        this.ctx.beginPath();
        this.ctx.moveTo(this.centerX, this.centerY - gridExtent);
        this.ctx.lineTo(this.centerX, this.centerY + gridExtent);
        this.ctx.stroke();
    }

    /**
     * Draw sound sources
     */
    drawSoundSources() {
        for (const layer of this.layers) {
            const screenPos = this.worldToScreen(layer.position[0], layer.position[2]);
            
            // Skip if outside view
            if (!this.isInView(screenPos.x, screenPos.y)) continue;
            
            // Determine color based on layer type
            let color = '#00d4ff';
            if (layer.name.includes('rain')) color = '#4080ff';
            else if (layer.name.includes('bass')) color = '#ff40ff';
            else if (layer.name.includes('kick')) color = '#ff4040';
            else if (layer.name.includes('melody')) color = '#40ff40';
            else if (layer.name.includes('pad')) color = '#ffff40';
            
            // Draw source circle with subtle pulse
            const radius = 15 + Math.sin(this.time * 0.8 + layer.name.length) * 1;
            
            // Glow effect
            const gradient = this.ctx.createRadialGradient(
                screenPos.x, screenPos.y, 0,
                screenPos.x, screenPos.y, radius * 2
            );
            gradient.addColorStop(0, color + '80');
            gradient.addColorStop(0.5, color + '40');
            gradient.addColorStop(1, color + '00');
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(screenPos.x, screenPos.y, radius * 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Core circle
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Height indicator (Y position)
            if (Math.abs(layer.position[1]) > 0.1) {
                this.ctx.strokeStyle = color + '60';
                this.ctx.lineWidth = 2;
                this.ctx.setLineDash([5, 5]);
                this.ctx.beginPath();
                this.ctx.moveTo(screenPos.x, screenPos.y);
                this.ctx.lineTo(screenPos.x, screenPos.y + layer.position[1] * this.scale * 0.5);
                this.ctx.stroke();
                this.ctx.setLineDash([]);
            }
            
            // Label
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '12px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(layer.name, screenPos.x, screenPos.y - radius - 5);
        }
    }

    /**
     * Draw listener representation
     */
    drawListener() {
        const screenPos = this.worldToScreen(this.listenerPos.x, this.listenerPos.z);
        
        // Smaller, refined body circle with darker pink and border
        const radius = 12;
        
        // Outer border
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, radius + 1, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Main body - darker pink
        this.ctx.fillStyle = '#c85a8e';
        this.ctx.beginPath();
        this.ctx.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Sound wave direction indicator (instead of arrow)
        const dirAngle = -this.listenerRot.azimuth * Math.PI / 180 - Math.PI / 2;
        
        // Draw 3 concentric sound wave arcs showing listening direction
        for (let i = 0; i < 3; i++) {
            const waveRadius = 18 + (i * 6);
            const arcLength = Math.PI / 3; // 60 degree arc
            const startAngle = dirAngle - arcLength / 2;
            const endAngle = dirAngle + arcLength / 2;
            
            this.ctx.strokeStyle = `rgba(200, 90, 142, ${0.6 - i * 0.15})`;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(screenPos.x, screenPos.y, waveRadius, startAngle, endAngle);
            this.ctx.stroke();
        }
        
        // Small directional indicator line for clarity
        const dirLength = 20;
        const dirX = screenPos.x + Math.cos(dirAngle) * dirLength;
        const dirY = screenPos.y + Math.sin(dirAngle) * dirLength;
        
        this.ctx.strokeStyle = 'rgba(200, 90, 142, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(screenPos.x, screenPos.y);
        this.ctx.lineTo(dirX, dirY);
        this.ctx.stroke();
        
        // Elevation indicator (matching source implementation)
        if (Math.abs(this.listenerPos.y) > 0.1) {
            // Use listener's pink color for elevation indicator
            this.ctx.strokeStyle = '#c85a8e80';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.beginPath();
            this.ctx.moveTo(screenPos.x, screenPos.y);
            // Match the same scale as sources: position[1] * scale * 0.5
            this.ctx.lineTo(screenPos.x, screenPos.y - this.listenerPos.y * this.scale * 0.5);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }

    /**
     * Draw compass
     */
    drawCompass() {
        const x = 80; // Much smaller position
        const y = 80;
        const radius = 35; // Much smaller compass
        
        // Outer glow effect
        const glowGradient = this.ctx.createRadialGradient(x, y, radius, x, y, radius + 20);
        glowGradient.addColorStop(0, 'rgba(0, 212, 255, 0.3)');
        glowGradient.addColorStop(1, 'rgba(0, 212, 255, 0)');
        this.ctx.fillStyle = glowGradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius + 20, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Background with depth
        const bgGradient = this.ctx.createRadialGradient(x - 10, y - 10, 0, x, y, radius + 10);
        bgGradient.addColorStop(0, 'rgba(40, 40, 60, 0.9)');
        bgGradient.addColorStop(1, 'rgba(10, 10, 20, 0.95)');
        this.ctx.fillStyle = bgGradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius + 10, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Outer ring with pulsing effect
        this.ctx.strokeStyle = `rgba(0, 212, 255, ${0.6 + Math.sin(this.time * 0.003) * 0.2})`;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Inner ring
        this.ctx.strokeStyle = 'rgba(255, 0, 255, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius - 5, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Cardinal direction lines
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
            const angle = (i * Math.PI) / 2;
            this.ctx.beginPath();
            this.ctx.moveTo(
                x + Math.sin(angle) * (radius - 15),
                y - Math.cos(angle) * (radius - 15)
            );
            this.ctx.lineTo(
                x + Math.sin(angle) * (radius + 5),
                y - Math.cos(angle) * (radius + 5)
            );
            this.ctx.stroke();
        }
        
        // Enhanced direction indicator
        const angle = -this.listenerRot.azimuth * Math.PI / 180 - Math.PI / 2;
        const tipX = x + Math.cos(angle) * radius;
        const tipY = y + Math.sin(angle) * radius;
        
        // Arrow shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.ctx.beginPath();
        this.ctx.moveTo(tipX + 2, tipY + 2);
        this.ctx.lineTo(
            x + Math.cos(angle + 2.5) * (radius - 20) + 2,
            y + Math.sin(angle + 2.5) * (radius - 20) + 2
        );
        this.ctx.lineTo(
            x + Math.cos(angle - 2.5) * (radius - 20) + 2,
            y + Math.sin(angle - 2.5) * (radius - 20) + 2
        );
        this.ctx.closePath();
        this.ctx.fill();
        
        // Arrow with gradient
        const arrowGradient = this.ctx.createLinearGradient(
            x, y, tipX, tipY
        );
        arrowGradient.addColorStop(0, '#0099cc');
        arrowGradient.addColorStop(1, '#00d4ff');
        this.ctx.fillStyle = arrowGradient;
        this.ctx.beginPath();
        this.ctx.moveTo(tipX, tipY);
        this.ctx.lineTo(
            x + Math.cos(angle + 2.5) * (radius - 20),
            y + Math.sin(angle + 2.5) * (radius - 20)
        );
        this.ctx.lineTo(
            x + Math.cos(angle - 2.5) * (radius - 20),
            y + Math.sin(angle - 2.5) * (radius - 20)
        );
        this.ctx.closePath();
        this.ctx.fill();
        
        // Cardinal direction labels with glow
        this.ctx.shadowColor = 'rgba(0, 212, 255, 0.8)';
        this.ctx.shadowBlur = 8;
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.font = 'bold 16px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        this.ctx.fillText('N', x, y - radius - 25);
        this.ctx.fillText('S', x, y + radius + 25);
        this.ctx.fillText('E', x + radius + 25, y);
        this.ctx.fillText('W', x - radius - 25, y);
        this.ctx.shadowBlur = 0;
        
        // Enhanced compass label
        this.ctx.fillStyle = 'rgba(0, 212, 255, 0.9)';
        this.ctx.font = 'bold 18px system-ui';
        this.ctx.fillText('SPATIAL', x, y - radius - 45);
        this.ctx.font = 'bold 14px system-ui';
        this.ctx.fillStyle = 'rgba(255, 0, 255, 0.8)';
        this.ctx.fillText('COMPASS', x, y - radius - 60);
    }

    /**
     * Draw simplified compass for adaptive mode
     */
    drawCompassSimplified() {
        const x = 80;
        const y = 80;
        const radius = 30; // Smaller compass
        
        // Simple background
        this.ctx.fillStyle = 'rgba(10, 10, 20, 0.8)';
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Basic outer ring
        this.ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
        
        // Direction indicator
        const angle = -this.listenerRot.azimuth * Math.PI / 180 - Math.PI / 2;
        const tipX = x + Math.cos(angle) * radius;
        const tipY = y + Math.sin(angle) * radius;
        
        // Simple arrow
        this.ctx.fillStyle = '#00d4ff';
        this.ctx.beginPath();
        this.ctx.moveTo(tipX, tipY);
        this.ctx.lineTo(
            x + Math.cos(angle + 2.5) * (radius - 15),
            y + Math.sin(angle + 2.5) * (radius - 15)
        );
        this.ctx.lineTo(
            x + Math.cos(angle - 2.5) * (radius - 15),
            y + Math.sin(angle - 2.5) * (radius - 15)
        );
        this.ctx.closePath();
        this.ctx.fill();
        
        // Basic N label only
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '14px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('N', x, y - radius - 20);
    }

    /**
     * Draw position information
     */
    drawPositionInfo() {
        // Convert azimuth to compass direction
        let azimuth = this.listenerRot.azimuth;
        while (azimuth < 0) azimuth += 360;
        while (azimuth >= 360) azimuth -= 360;
        
        let direction = '';
        if (azimuth >= 337.5 || azimuth < 22.5) direction = 'N';
        else if (azimuth < 67.5) direction = 'NE';
        else if (azimuth < 112.5) direction = 'E';
        else if (azimuth < 157.5) direction = 'SE';
        else if (azimuth < 202.5) direction = 'S';
        else if (azimuth < 247.5) direction = 'SW';
        else if (azimuth < 292.5) direction = 'W';
        else direction = 'NW';
        
        const info = [
            `Position: (${this.listenerPos.x.toFixed(1)}, ${this.listenerPos.y.toFixed(1)}, ${this.listenerPos.z.toFixed(1)})`,
            `Facing: ${direction} (${azimuth.toFixed(0)}°)`
        ];
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = '16px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
        
        let y = this.canvas.height - 60;
        for (const line of info) {
            this.ctx.fillText(line, 20, y);
            y += 20;
        }
    }

    /**
     * Draw controller tip
     */
    drawControllerTip() {
        // Draw tip in top center
        const tipText = "🎮 Tip: Move closer to sounds to hear them more clearly";
        
        this.ctx.fillStyle = '#00d4ffcc';
        this.ctx.fillRect(this.centerX - 200, 20, 400, 40);
        
        this.ctx.fillStyle = '#000000';
        this.ctx.font = 'bold 16px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(tipText, this.centerX, 40);
    }

    /**
     * Convert world coordinates to screen coordinates
     */
    worldToScreen(x, z) {
        return {
            x: this.centerX + x * this.scale,
            y: this.centerY - z * this.scale  // Flip Z axis: positive Z should be up (toward front)
        };
    }

    /**
     * Check if a point is in view
     */
    isInView(x, y) {
        return x >= 0 && x <= this.canvas.width && y >= 0 && y <= this.canvas.height;
    }
}

// Export for use in other modules
window.SpatialVisualizer = SpatialVisualizer;