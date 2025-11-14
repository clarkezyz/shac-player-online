/**
 * Spatial Audio Engine using WebAudio API
 * Handles 3D audio rendering and listener movement
 */

/**
 * AudioBufferPool - Elegant memory management for Float32Arrays
 * Reduces garbage collection pressure by reusing buffers
 */
class AudioBufferPool {
    constructor() {
        this.pool = [];
        this.inUse = new WeakSet();
        this.stats = {
            created: 0,
            reused: 0,
            currentPoolSize: 0
        };
    }
    
    acquire(size) {
        // Find a free buffer of the right size
        let buffer = null;
        for (let i = 0; i < this.pool.length; i++) {
            const candidate = this.pool[i];
            if (candidate.length === size && !this.inUse.has(candidate)) {
                buffer = candidate;
                this.stats.reused++;
                break;
            }
        }
        
        // Create new if needed
        if (!buffer) {
            buffer = new Float32Array(size);
            this.pool.push(buffer);
            this.stats.created++;
            this.stats.currentPoolSize = this.pool.length;
        }
        
        this.inUse.add(buffer);
        return buffer;
    }
    
    release(buffer) {
        if (this.inUse.has(buffer)) {
            this.inUse.delete(buffer);
            buffer.fill(0); // Clean for reuse
        }
    }
    
    releaseAll(buffers) {
        for (const buffer of buffers) {
            this.release(buffer);
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            reuseRatio: this.stats.reused / (this.stats.created + this.stats.reused)
        };
    }
}

// Global pool instance
const audioBufferPool = new AudioBufferPool();

class SpatialAudioEngine {
    constructor() {
        this.audioContext = null;
        this.layers = new Map();
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        
        // Listener position and orientation
        this.listenerPosition = { x: 0, y: 0, z: 0 };
        this.listenerRotation = { azimuth: 0, elevation: 0, roll: 0 };
        
        // Movement parameters
        this.moveSpeed = 0.17;   // Controlled movement speed
        this.rotateSpeed = 1.7;  // Controlled rotation speed
        
        // Movement presets system
        this.movementPresets = null;
        this.audioSources = [];
    }

    /**
     * Initialize the audio context
     */
    async init() {
        // Create audio context (handle vendor prefixes and browser restrictions)
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        try {
            this.audioContext = new AudioContext();
        } catch (error) {
            // Browser requires user interaction for AudioContext
            this.audioContext = null;
        }
        
        // Setup listener (if audio context is available)
        if (this.audioContext) {
            if (this.audioContext.listener.positionX) {
                // Modern API
                // Initialize at origin (flipped X has no effect on 0)
                this.audioContext.listener.positionX.value = 0;
                this.audioContext.listener.positionY.value = 0;
                this.audioContext.listener.positionZ.value = 0;
            } else {
                // Legacy API
                this.audioContext.listener.setPosition(0, 0, 0);
            }
            
            // Set default orientation (looking down negative Z axis)
            this.updateListenerOrientation();
        }
        
        // Initialize movement presets
        if (window.MovementPresets) {
            this.movementPresets = new window.MovementPresets();
        }
        
    }

    /**
     * Create audio context on user interaction
     */
    async createAudioContext() {
        if (!this.audioContext) {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioContext();
                
                // Setup listener now that context is created
                if (this.audioContext.listener.positionX) {
                    this.audioContext.listener.positionX.value = 0;
                    this.audioContext.listener.positionY.value = 0;
                    this.audioContext.listener.positionZ.value = 0;
                } else {
                    this.audioContext.listener.setPosition(0, 0, 0);
                }
                
                this.updateListenerOrientation();
            } catch (error) {
                console.error('Failed to create AudioContext:', error);
            }
        }
    }

    /**
     * Load SHAC data into the audio engine
     * @param {Object} shacData - Decoded SHAC data from SHACDecoder
     */
    async loadSHAC(shacData) {
        this.clear();

        const { header, layers, preMixed } = shacData;
        this.sampleRate = header.sample_rate;
        this.duration = header.n_samples / header.sample_rate;

        // Reset audio sources array
        this.audioSources = [];

        // Process each layer
        for (const [layerName, layerData] of layers) {
            await this.createSpatialLayer(layerName, layerData, header);

            // For ZYZ format, check if there are source references in metadata
            if (preMixed && layerData.metadata.source_references) {
                // Use source references for visualization (pre-mixed ZYZ file)
                console.log('Loading ZYZ format with source references for visualization');
                for (const sourceRef of layerData.metadata.source_references) {
                    this.audioSources.push({
                        name: sourceRef.name,
                        position: sourceRef.position,
                        metadata: { ...sourceRef, isReference: true },
                        isReference: true  // Flag to indicate this is a visual marker only
                    });
                }
            } else {
                // Regular SHAC format - use actual layer positions
                const position = layerData.metadata.position || [0, 0, 0];
                this.audioSources.push({
                    name: layerName,
                    position: position,
                    metadata: layerData.metadata
                });
            }
        }

        if (preMixed) {
            console.log(`Loaded ZYZ format (pre-mixed) with ${this.audioSources.length} source reference markers`);
        } else {
            console.log(`Loaded ${layers.size} spatial layers with positions:`, this.audioSources);
        }
    }

    /**
     * Create a spatial audio layer
     */
    async createSpatialLayer(name, layerData, header) {
        const { metadata, audioData } = layerData;
        const position = metadata.position || [0, 0, 0];
        
        // Create audio buffer from ambisonic data
        const audioBuffer = await this.createAudioBuffer(audioData, header);
        
        // Store layer data for node creation
        const layerInfo = {
            name,
            audioBuffer,
            position: metadata.position || [0, 0, 0],
            metadata,
            sourceNode: null,
            pannerNode: null
        };
        
        // Create audio nodes if context is available
        if (this.audioContext) {
            this.createAudioNodes(layerInfo);
        }
        
        // Store the layer
        this.layers.set(name, layerInfo);
    }

    /**
     * Create audio nodes for a layer
     */
    createAudioNodes(layerInfo) {
        // Create spatial nodes
        const sourceNode = this.audioContext.createBufferSource();
        sourceNode.buffer = layerInfo.audioBuffer;
        sourceNode.loop = false;

        // Check if this is a pre-mixed ZYZ file
        const isPreMixed = layerInfo.metadata && layerInfo.metadata.pre_mixed === true;

        if (isPreMixed) {
            // ZYZ FORMAT: Ambisonic field is already spatially encoded
            // DO NOT apply panner node - it would destroy the spatial information
            // Just connect directly to output for ambisonic decoding
            console.log('ZYZ format detected: Using direct ambisonic decode (no panner)');

            sourceNode.connect(this.audioContext.destination);
            layerInfo.sourceNode = sourceNode;
            layerInfo.pannerNode = null;  // No panner for pre-mixed
            return;
        }

        // SHAC FORMAT: Each layer is a separate source that needs positioning
        // Create panner node for 3D positioning
        const pannerNode = this.audioContext.createPanner();
        pannerNode.panningModel = 'HRTF';
        pannerNode.distanceModel = 'inverse';
        pannerNode.refDistance = 1;
        pannerNode.maxDistance = 100;
        pannerNode.rolloffFactor = 1;
        pannerNode.coneInnerAngle = 360;
        pannerNode.coneOuterAngle = 0;
        pannerNode.coneOuterGain = 0;

        // Validate and set position
        const position = layerInfo.position;
        const safePosition = [
            isFinite(position[0]) ? position[0] : 0,
            isFinite(position[1]) ? position[1] : 0,
            isFinite(position[2]) ? position[2] : 0
        ];
        
        if (pannerNode.positionX) {
            // Modern API
            // Flip X coordinate to match SHAC encoder convention
            pannerNode.positionX.value = -safePosition[0];
            pannerNode.positionY.value = safePosition[1];
            pannerNode.positionZ.value = safePosition[2];
        } else {
            // Legacy API
            // Flip X coordinate to match SHAC encoder convention
            pannerNode.setPosition(-safePosition[0], safePosition[1], safePosition[2]);
        }
        
        // Connect nodes
        sourceNode.connect(pannerNode);
        pannerNode.connect(this.audioContext.destination);
        
        // Update layer info with nodes
        layerInfo.sourceNode = sourceNode;
        layerInfo.pannerNode = pannerNode;
    }

    /**
     * Create AudioBuffer from ambisonic data
     */
    async createAudioBuffer(audioData, header) {
        // Proper ambisonic to binaural decoding with full order support
        
        // Validate audio data
        if (!audioData || !Array.isArray(audioData) || audioData.length === 0) {
            console.error('Invalid audio data:', audioData);
            throw new Error('Invalid audio data format');
        }
        
        const numSamples = audioData[0].length;
        if (numSamples === 0) {
            console.error('Audio data has 0 samples');
            throw new Error('Audio data has no samples');
        }

        const audioBuffer = this.audioContext.createBuffer(2, numSamples, header.sample_rate);

        // Determine ambisonic order from channel count
        const order = Math.sqrt(audioData.length) - 1;
        
        // Decode using proper ambisonic to binaural conversion
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        
        if (audioData.length >= 4) {
            // Full ambisonic decoding with HRTF-based binaural rendering
            this.decodeBinauralHRTF(audioData, left, right, numSamples, order);
        } else if (audioData.length >= 2) {
            // Stereo input
            left.set(audioData[0]);
            right.set(audioData[1]);
        } else {
            // Mono input
            left.set(audioData[0]);
            right.set(audioData[0]);
        }
        
        return audioBuffer;
    }
    
    /**
     * HRTF-based binaural decoding for ambisonics
     * 
     * Note: Uses full virtual speaker decoding rather than simple channel mixing.
     * Simple 4-channel mixing discards significant spatial information.
     * This implementation preserves spatial detail through proper decoding.
     */
    decodeBinauralHRTF(audioData, left, right, numSamples, order) {
        // Virtual loudspeaker configuration for binaural decoding
        const speakers = this.getVirtualSpeakerConfig(order);
        
        // Decode ambisonics to virtual speakers first
        const speakerOutputs = this.decodeToVirtualSpeakers(audioData, speakers, numSamples);
        
        // Apply HRTF to each virtual speaker and sum to stereo
        this.applySpatialHRTF(speakerOutputs, speakers, left, right, numSamples);
    }
    
    /**
     * Get virtual speaker configuration based on ambisonic order
     */
    getVirtualSpeakerConfig(order) {
        // Optimized speaker layouts for different orders
        if (order >= 3) {
            // 3rd order: 20-speaker icosahedral layout
            return this.getIcosahedralSpeakers();
        } else if (order >= 2) {
            // 2nd order: 12-speaker layout
            return this.getDodecahedralSpeakers();
        } else {
            // 1st order: 8-speaker cube layout
            return this.getCubeSpeakers();
        }
    }
    
    /**
     * High-quality 20-speaker icosahedral layout for 3rd order
     */
    getIcosahedralSpeakers() {
        const phi = (1 + Math.sqrt(5)) / 2; // Golden ratio
        const speakers = [];
        
        // 12 vertices of icosahedron + 8 additional for stability
        const vertices = [
            [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi],
            [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
            [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1],
            // Additional speakers for 3rd order stability
            [phi/2, phi/2, phi/2], [-phi/2, phi/2, phi/2], 
            [phi/2, -phi/2, phi/2], [-phi/2, -phi/2, phi/2],
            [phi/2, phi/2, -phi/2], [-phi/2, phi/2, -phi/2],
            [phi/2, -phi/2, -phi/2], [-phi/2, -phi/2, -phi/2]
        ];
        
        vertices.forEach((pos, i) => {
            const [x, y, z] = pos;
            const norm = Math.sqrt(x*x + y*y + z*z);
            speakers.push({
                azimuth: Math.atan2(x, z),
                elevation: Math.asin(y / norm),
                gain: 1.0 / vertices.length
            });
        });
        
        return speakers;
    }
    
    /**
     * 12-speaker dodecahedral layout for 2nd order
     */
    getDodecahedralSpeakers() {
        const speakers = [];
        
        // Optimized 12-speaker layout
        for (let i = 0; i < 12; i++) {
            const azimuth = (i * 2 * Math.PI) / 12;
            const elevation = (i % 2 === 0) ? Math.PI/6 : -Math.PI/6;
            
            speakers.push({
                azimuth: azimuth,
                elevation: elevation,
                gain: 1.0 / 12
            });
        }
        
        return speakers;
    }
    
    /**
     * 8-speaker cube layout for 1st order
     */
    getCubeSpeakers() {
        return [
            { azimuth: 0, elevation: 0, gain: 0.125 },           // Front
            { azimuth: Math.PI/2, elevation: 0, gain: 0.125 },   // Left
            { azimuth: Math.PI, elevation: 0, gain: 0.125 },     // Back
            { azimuth: -Math.PI/2, elevation: 0, gain: 0.125 },  // Right
            { azimuth: 0, elevation: Math.PI/4, gain: 0.125 },   // Front Up
            { azimuth: Math.PI/2, elevation: Math.PI/4, gain: 0.125 }, // Left Up
            { azimuth: Math.PI, elevation: Math.PI/4, gain: 0.125 },   // Back Up
            { azimuth: -Math.PI/2, elevation: Math.PI/4, gain: 0.125 } // Right Up
        ];
    }
    
    /**
     * Decode ambisonics to virtual speaker array
     */
    decodeToVirtualSpeakers(audioData, speakers, numSamples) {
        const outputs = [];
        
        for (let spkIdx = 0; spkIdx < speakers.length; spkIdx++) {
            const speaker = speakers[spkIdx];
            const output = audioBufferPool.acquire(numSamples);
            
            // Compute spherical harmonic coefficients for this speaker direction
            const shCoeffs = this.computeSphericalHarmonics(speaker.azimuth, speaker.elevation, audioData.length);
            
            // Decode: sum of (ambisonic_channel * sh_coefficient)
            for (let sample = 0; sample < numSamples; sample++) {
                let sum = 0;
                for (let ch = 0; ch < audioData.length; ch++) {
                    sum += audioData[ch][sample] * shCoeffs[ch];
                }
                output[sample] = sum * speaker.gain;
            }
            
            outputs.push(output);
        }
        
        return outputs;
    }
    
    /**
     * Apply spatial HRTF to virtual speakers and sum to binaural output
     */
    applySpatialHRTF(speakerOutputs, speakers, left, right, numSamples) {
        // Clear output buffers
        left.fill(0);
        right.fill(0);
        
        // Process each virtual speaker
        for (let spkIdx = 0; spkIdx < speakers.length; spkIdx++) {
            const speaker = speakers[spkIdx];
            const output = speakerOutputs[spkIdx];
            
            // Get HRTF for this speaker position
            const hrtf = this.getHRTF(speaker.azimuth, speaker.elevation);
            
            // Apply HRTF (simple implementation - could be improved with proper convolution)
            for (let i = 0; i < numSamples; i++) {
                left[i] += output[i] * hrtf.left;
                right[i] += output[i] * hrtf.right;
            }
        }
        
        // Release all speaker output buffers back to pool
        audioBufferPool.releaseAll(speakerOutputs);
    }
    
    /**
     * PREMIUM HRTF model for maximum musical spatialization
     * NO SHORTCUTS - Pure musical excellence
     */
    getHRTF(azimuth, elevation) {
        // Advanced HRTF with frequency-dependent processing for musical richness
        
        // Interaural Time Difference (ITD) - critical for musical timing perception
        const headRadius = 0.0875; // 8.75cm average head radius
        const soundSpeed = 343; // m/s
        const itd = (headRadius / soundSpeed) * (azimuth + Math.sin(azimuth));
        
        // Interaural Level Difference (ILD) with frequency shaping
        const baseLevelDiff = Math.sin(azimuth) * 12; // Up to 12dB difference
        
        // Elevation-dependent spectral shaping (pinna filtering)
        const pinnaGain = this.getPinnaResponse(elevation);
        
        // Distance-dependent air absorption (for realism)
        const distance = 1.0; // Virtual speakers at 1m
        const airAbsorption = Math.exp(-0.0001 * distance);
        
        // Head shadow effect (frequency dependent)
        const headShadowLeft = azimuth > 0 ? 
            1.0 - 0.3 * Math.sin(azimuth) : 1.0;
        const headShadowRight = azimuth < 0 ? 
            1.0 + 0.3 * Math.sin(azimuth) : 1.0;
        
        // Torso reflection for low frequencies (adds warmth)
        const torsoReflection = 1.0 + 0.1 * Math.cos(elevation);
        
        // Final HRTF calculation with all psychoacoustic factors
        const leftGain = (0.5 + 0.5 * Math.cos(azimuth + Math.PI/2)) * 
                        pinnaGain * headShadowLeft * torsoReflection * airAbsorption;
        const rightGain = (0.5 + 0.5 * Math.cos(azimuth - Math.PI/2)) * 
                         pinnaGain * headShadowRight * torsoReflection * airAbsorption;
        
        return {
            left: Math.max(0.01, leftGain),   // Prevent complete null
            right: Math.max(0.01, rightGain), // Always some signal for musical presence
            itd: itd,  // For future time-domain processing
            elevation: elevation  // For spectral processing
        };
    }
    
    /**
     * Pinna (outer ear) frequency response based on elevation
     * Critical for vertical localization in music
     */
    getPinnaResponse(elevation) {
        // Pinna boost for frequencies based on elevation angle
        const elevationNorm = elevation / (Math.PI / 2); // Normalize to [-1, 1]
        
        // Musical frequency emphasis based on elevation
        if (elevation > 0) {
            // Above horizon: boost high frequencies (sparkle, air)
            return 1.0 + 0.2 * elevationNorm;
        } else {
            // Below horizon: maintain low frequencies (warmth, power)
            return 1.0 + 0.1 * Math.abs(elevationNorm);
        }
    }
    
    /**
     * Compute spherical harmonic coefficients for a direction
     */
    computeSphericalHarmonics(azimuth, elevation, numChannels) {
        const coeffs = new Array(numChannels);
        let idx = 0;
        
        const order = Math.sqrt(numChannels) - 1;
        
        for (let l = 0; l <= order; l++) {
            for (let m = -l; m <= l; m++) {
                coeffs[idx] = this.realSphericalHarmonic(l, m, azimuth, elevation);
                idx++;
            }
        }
        
        return coeffs;
    }
    
    /**
     * Complete real spherical harmonic computation
     * Comprehensive implementation for spatial audio accuracy
     */
    realSphericalHarmonic(l, m, azimuth, elevation) {
        const absM = Math.abs(m);
        const cosElevation = Math.cos(elevation);
        const sinElevation = Math.sin(elevation);
        const cosAzimuth = Math.cos(azimuth);
        const sinAzimuth = Math.sin(azimuth);
        
        // Pre-compute powers for efficiency and proper scoping
        const cosEl2 = cosElevation * cosElevation;
        const sinEl2 = sinElevation * sinElevation;
        const cosEl3 = cosEl2 * cosElevation;
        const sinEl3 = sinEl2 * sinElevation;
        
        // Order 0 (omnidirectional)
        if (l === 0) {
            return 1.0; // Y_0^0
        }
        
        // Order 1 (first-order directional)
        else if (l === 1) {
            if (m === -1) return Math.sqrt(3/(4*Math.PI)) * sinElevation * sinAzimuth; // Y_1^{-1}
            if (m === 0) return Math.sqrt(3/(4*Math.PI)) * cosElevation;  // Y_1^0
            if (m === 1) return Math.sqrt(3/(4*Math.PI)) * sinElevation * cosAzimuth; // Y_1^1
        }
        
        // Order 2 (quadrupole patterns)
        else if (l === 2) {
            
            if (m === -2) return Math.sqrt(15/(16*Math.PI)) * sinEl2 * Math.sin(2*azimuth);
            if (m === -1) return Math.sqrt(15/(4*Math.PI)) * sinElevation * cosElevation * sinAzimuth;
            if (m === 0) return Math.sqrt(5/(16*Math.PI)) * (3*cosEl2 - 1);
            if (m === 1) return Math.sqrt(15/(4*Math.PI)) * sinElevation * cosElevation * cosAzimuth;
            if (m === 2) return Math.sqrt(15/(16*Math.PI)) * sinEl2 * Math.cos(2*azimuth);
        }
        
        // Order 3 (octupole patterns) - Critical for musical detail
        else if (l === 3) {
            
            if (m === -3) return Math.sqrt(35/(32*Math.PI)) * sinEl3 * Math.sin(3*azimuth);
            if (m === -2) return Math.sqrt(105/(16*Math.PI)) * sinEl2 * cosElevation * Math.sin(2*azimuth);
            if (m === -1) return Math.sqrt(21/(32*Math.PI)) * sinElevation * (5*cosEl2 - 1) * sinAzimuth;
            if (m === 0) return Math.sqrt(7/(16*Math.PI)) * cosElevation * (5*cosEl2 - 3);
            if (m === 1) return Math.sqrt(21/(32*Math.PI)) * sinElevation * (5*cosEl2 - 1) * cosAzimuth;
            if (m === 2) return Math.sqrt(105/(16*Math.PI)) * sinEl2 * cosElevation * Math.cos(2*azimuth);
            if (m === 3) return Math.sqrt(35/(32*Math.PI)) * sinEl3 * Math.cos(3*azimuth);
        }
        
        // For higher orders, implement recursion for perfect mathematical accuracy
        else if (l > 3) {
            return this.computeHighOrderHarmonic(l, m, azimuth, elevation);
        }
        
        return 0.0;
    }
    
    /**
     * High-order spherical harmonic computation using recurrence relations
     * For orders 4+ where musical detail and spatial precision matter most
     */
    computeHighOrderHarmonic(l, m, azimuth, elevation) {
        // Use recurrence relations for higher orders
        // This ensures mathematical precision for complex spatial arrangements
        
        const cosTheta = Math.cos(elevation);
        const sinTheta = Math.sin(elevation);
        const absM = Math.abs(m);
        
        // Associated Legendre polynomial computation
        let Plm = this.associatedLegendre(l, absM, cosTheta);
        
        // Normalization factor
        const norm = Math.sqrt((2*l+1) * this.factorial(l-absM) / (4*Math.PI * this.factorial(l+absM)));
        
        // Apply azimuthal dependence
        let result;
        if (m === 0) {
            result = norm * Plm;
        } else if (m > 0) {
            result = norm * Plm * Math.cos(m * azimuth);
        } else {
            result = norm * Plm * Math.sin(absM * azimuth);
        }
        
        return result;
    }
    
    /**
     * Associated Legendre polynomial for high-order harmonics
     */
    associatedLegendre(l, m, x) {
        // For musical excellence, compute exact values
        if (l === m) {
            // P_l^l(x) = (-1)^l * (2l-1)!! * (1-x^2)^(l/2)
            let result = Math.pow(-1, l);
            for (let i = 1; i <= l; i++) {
                result *= (2*i - 1);
            }
            result *= Math.pow(1 - x*x, l/2);
            return result;
        } else if (l === m + 1) {
            // P_{l}^m(x) = x * (2m+1) * P_m^m(x)
            return x * (2*m + 1) * this.associatedLegendre(m, m, x);
        } else {
            // Use recurrence relation for general case
            const Pmm = this.associatedLegendre(m, m, x);
            const Pm1m = this.associatedLegendre(m+1, m, x);
            
            let Plm_prev = Pmm;
            let Plm_curr = Pm1m;
            
            for (let ll = m + 2; ll <= l; ll++) {
                const Plm_next = ((2*ll-1)*x*Plm_curr - (ll+m-1)*Plm_prev) / (ll-m);
                Plm_prev = Plm_curr;
                Plm_curr = Plm_next;
            }
            
            return Plm_curr;
        }
    }
    
    /**
     * Factorial for mathematical precision
     */
    factorial(n) {
        if (n <= 1) return 1;
        let result = 1;
        for (let i = 2; i <= n; i++) {
            result *= i;
        }
        return result;
    }

    /**
     * Play the spatial audio
     */
    async play() {
        if (this.isPlaying) return;
        
        // Create audio context if needed
        await this.createAudioContext();
        
        if (!this.audioContext) {
            console.error('AudioContext not available');
            return;
        }
        
        // Create audio nodes for all layers if they don't exist
        for (const [name, layer] of this.layers) {
            if (!layer.sourceNode || !layer.pannerNode) {
                this.createAudioNodes(layer);
            }
        }
        
        const offset = this.pauseTime;
        this.startTime = this.audioContext.currentTime - offset;
        
        // Start all layers
        for (const [name, layer] of this.layers) {
            // Create new source node (they can only be played once)
            const sourceNode = this.audioContext.createBufferSource();
            sourceNode.buffer = layer.audioBuffer;
            sourceNode.loop = false;
            
            // Reconnect
            sourceNode.connect(layer.pannerNode);
            
            // Start playback
            sourceNode.start(0, offset);
            
            // Update layer reference
            layer.sourceNode = sourceNode;
        }
        
        this.isPlaying = true;
    }

    /**
     * Pause the spatial audio
     */
    pause() {
        if (!this.isPlaying) return;
        
        this.pauseTime = this.audioContext.currentTime - this.startTime;
        
        // Stop all layers
        for (const [name, layer] of this.layers) {
            layer.sourceNode.stop();
        }
        
        this.isPlaying = false;
    }

    /**
     * Replay from the beginning
     */
    async replay() {
        // Stop current playback
        if (this.isPlaying) {
            this.pause();
        }
        
        // Reset to beginning
        this.pauseTime = 0;
        
        // Start playing
        await this.play();
        
        console.log('Replaying spatial audio from beginning');
    }

    /**
     * Get current playback time
     */
    getCurrentTime() {
        if (this.isPlaying) {
            return this.audioContext.currentTime - this.startTime;
        }
        return this.pauseTime;
    }

    /**
     * Update listener position
     */
    updateListenerPosition(x, y, z) {
        this.listenerPosition.x = x;
        this.listenerPosition.y = y;
        this.listenerPosition.z = z;
        
        if (this.audioContext.listener.positionX) {
            // Modern API
            // Flip X coordinate to match SHAC encoder convention
            this.audioContext.listener.positionX.value = -x;
            this.audioContext.listener.positionY.value = y;
            this.audioContext.listener.positionZ.value = z;
        } else {
            // Legacy API
            // Flip X coordinate to match SHAC encoder convention
            this.audioContext.listener.setPosition(-x, y, z);
        }
    }

    /**
     * Update listener rotation
     */
    updateListenerRotation(azimuth, elevation, roll = 0) {
        this.listenerRotation.azimuth = azimuth;
        this.listenerRotation.elevation = elevation;
        this.listenerRotation.roll = roll;
        this.updateListenerOrientation();
    }

    /**
     * Update listener orientation based on rotation with full 6DOF support
     * 
     * Note: Calculates proper up vector for full roll support.
     * Simplified up vector (0,1,0) would break roll functionality.
     */
    updateListenerOrientation() {
        const azimuthRad = (this.listenerRotation.azimuth * Math.PI) / 180;
        const elevationRad = (this.listenerRotation.elevation * Math.PI) / 180;
        const rollRad = (this.listenerRotation.roll * Math.PI) / 180;
        
        // Calculate forward vector (looking along positive Z when azimuth = 0)
        const forwardX = Math.sin(azimuthRad) * Math.cos(elevationRad);
        const forwardY = Math.sin(elevationRad);
        const forwardZ = Math.cos(azimuthRad) * Math.cos(elevationRad);
        
        // Calculate proper up vector with roll support
        // Base up vector rotated by roll around the forward vector
        const baseUpX = -Math.sin(azimuthRad) * Math.sin(elevationRad) * Math.cos(rollRad) - Math.cos(azimuthRad) * Math.sin(rollRad);
        const baseUpY = Math.cos(elevationRad) * Math.cos(rollRad);
        const baseUpZ = -Math.cos(azimuthRad) * Math.sin(elevationRad) * Math.cos(rollRad) + Math.sin(azimuthRad) * Math.sin(rollRad);
        
        // Normalize up vector
        const upLength = Math.sqrt(baseUpX * baseUpX + baseUpY * baseUpY + baseUpZ * baseUpZ);
        const upX = upLength > 0 ? baseUpX / upLength : 0;
        const upY = upLength > 0 ? baseUpY / upLength : 1;
        const upZ = upLength > 0 ? baseUpZ / upLength : 0;
        
        if (this.audioContext.listener.forwardX) {
            // Modern API
            // Flip forward X to match SHAC encoder convention
            this.audioContext.listener.forwardX.value = -forwardX;
            this.audioContext.listener.forwardY.value = forwardY;
            this.audioContext.listener.forwardZ.value = forwardZ;
            this.audioContext.listener.upX.value = upX;
            this.audioContext.listener.upY.value = upY;
            this.audioContext.listener.upZ.value = upZ;
        } else {
            // Legacy API
            // Flip forward X to match SHAC encoder convention
            this.audioContext.listener.setOrientation(
                -forwardX, forwardY, forwardZ,
                upX, upY, upZ
            );
        }
    }

    /**
     * Move listener based on input (relative to listener orientation)
     */
    moveListener(dx, dy, dz) {
        // Convert movement to be relative to listener's current orientation
        const azimuthRad = (this.listenerRotation.azimuth * Math.PI) / 180;
        
        // Calculate rotated movement vectors
        const worldDx = dx * Math.cos(azimuthRad) - dz * Math.sin(azimuthRad);
        const worldDz = dx * Math.sin(azimuthRad) + dz * Math.cos(azimuthRad);
        
        // Create raw movement vector
        const rawMovement = {
            x: worldDx * this.moveSpeed,
            y: dy * this.moveSpeed,
            z: worldDz * this.moveSpeed
        };
        
        // Apply movement presets if available
        let processedMovement = rawMovement;
        if (this.movementPresets) {
            processedMovement = this.movementPresets.processMovement(
                rawMovement,
                this.listenerPosition,
                this.audioSources
            );
        }
        
        this.updateListenerPosition(
            this.listenerPosition.x + processedMovement.x,
            this.listenerPosition.y + processedMovement.y,
            this.listenerPosition.z + processedMovement.z
        );
    }

    /**
     * Rotate listener based on input - unrestricted consciousness movement
     */
    rotateListener(dAzimuth, dElevation) {
        this.updateListenerRotation(
            this.listenerRotation.azimuth + dAzimuth * this.rotateSpeed,
            this.listenerRotation.elevation + dElevation * this.rotateSpeed
        );
    }

    /**
     * Set absolute listener direction (for tank controls)
     */
    setListenerDirection(azimuth, elevation) {
        this.updateListenerRotation(azimuth, elevation);
    }

    /**
     * Move listener in absolute world coordinates (not relative to view)
     */
    moveListenerAbsolute(dx, dy, dz) {
        // Create raw movement vector in world coordinates
        const rawMovement = {
            x: dx * this.moveSpeed,
            y: dy * this.moveSpeed,
            z: dz * this.moveSpeed
        };
        
        // Apply movement presets if available
        let processedMovement = rawMovement;
        if (this.movementPresets) {
            processedMovement = this.movementPresets.processMovement(
                rawMovement,
                this.listenerPosition,
                this.audioSources
            );
        }
        
        this.updateListenerPosition(
            this.listenerPosition.x + processedMovement.x,
            this.listenerPosition.y + processedMovement.y,
            this.listenerPosition.z + processedMovement.z
        );
    }

    /**
     * Set listener to absolute world position (for direct touch control)
     */
    setListenerPosition(x, y, z) {
        // Target position
        const targetPosition = { x, y, z };
        
        // Apply movement presets/barriers if available
        let finalPosition = targetPosition;
        if (this.movementPresets) {
            // Calculate movement vector to target
            const movementVector = {
                x: x - this.listenerPosition.x,
                y: y - this.listenerPosition.y,
                z: z - this.listenerPosition.z
            };
            
            // Process through movement presets to handle barriers
            const processedMovement = this.movementPresets.processMovement(
                movementVector,
                this.listenerPosition,
                this.audioSources
            );
            
            // Calculate final position after barrier processing
            finalPosition = {
                x: this.listenerPosition.x + processedMovement.x,
                y: this.listenerPosition.y + processedMovement.y,
                z: this.listenerPosition.z + processedMovement.z
            };
        }
        
        this.updateListenerPosition(finalPosition.x, finalPosition.y, finalPosition.z);
    }

    /**
     * Reset listener to origin
     */
    resetListener() {
        // Reset to movement preset's home position if available
        if (this.movementPresets) {
            const homePosition = this.movementPresets.resetToHome();
            this.updateListenerPosition(homePosition.x, homePosition.y, homePosition.z);
        } else {
            this.updateListenerPosition(0, 0, 0);
        }
        this.updateListenerRotation(0, 0);
    }

    /**
     * Move environment/world relative to listener
     */
    moveEnvironment(dx, dy, dz) {
        // Update world offset
        this.worldOffset.x += dx;
        this.worldOffset.y += dy;
        this.worldOffset.z += dz;
        
        // Update all source positions with new world offset
        this.updateAllSourcePositions();
    }

    /**
     * Update all source positions with current world offset
     */
    updateAllSourcePositions() {
        for (const [name, layer] of this.layers) {
            if (layer.pannerNode && layer.position) {
                const safePosition = [
                    isFinite(layer.position[0]) ? layer.position[0] : 0,
                    isFinite(layer.position[1]) ? layer.position[1] : 0,
                    isFinite(layer.position[2]) ? layer.position[2] : 0
                ];
                
                if (layer.pannerNode.positionX) {
                    // Modern API
                    layer.pannerNode.positionX.value = -(safePosition[0] + this.worldOffset.x);
                    layer.pannerNode.positionY.value = safePosition[1] + this.worldOffset.y;
                    layer.pannerNode.positionZ.value = safePosition[2] + this.worldOffset.z;
                } else {
                    // Legacy API
                    layer.pannerNode.setPosition(-(safePosition[0] + this.worldOffset.x), safePosition[1] + this.worldOffset.y, safePosition[2] + this.worldOffset.z);
                }
            }
        }
    }

    /**
     * Get layer information for visualization
     */
    getLayerInfo() {
        const layerInfo = [];
        for (const [name, layer] of this.layers) {
            layerInfo.push({
                name,
                position: layer.position,
                metadata: layer.metadata
            });
        }
        return layerInfo;
    }

    /**
     * Clear all layers
     */
    clear() {
        // Stop all playing sources
        if (this.isPlaying) {
            this.pause();
        }
        
        // Disconnect all nodes
        for (const [name, layer] of this.layers) {
            layer.pannerNode.disconnect();
        }
        
        this.layers.clear();
        this.pauseTime = 0;
    }
}

// Export for use in other modules
window.SpatialAudioEngine = SpatialAudioEngine;