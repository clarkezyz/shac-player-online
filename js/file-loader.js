/**
 * SHAC File Loader for SHAC Player
 * Handles .shac files with proper error handling and alignment
 */

class UniversalFileLoader {
    constructor() {
        this.supportedFormats = {
            '.shac': 'Spatial Harmonic Audio Codec (Multi-Source)',
            '.zyz': 'ZYZ Format (Pre-Mixed Distribution)'
        };
    }

    /**
     * Load a file from either URL or File object
     */
    async load(source) {
        if (typeof source === 'string') {
            return await this.loadFromURL(source);
        } else if (source instanceof File) {
            return await this.loadFromFile(source);
        } else {
            throw new Error('Invalid source: must be URL string or File object');
        }
    }

    /**
     * Load from URL with progress tracking
     */
    async loadFromURL(url) {
        console.log(`Loading spatial audio from: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentLength = response.headers.get('content-length');
        const fileSizeMB = contentLength ? parseInt(contentLength) / 1024 / 1024 : 0;
        console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
        
        // Check size limits
        if (fileSizeMB > 2048) {
            throw new Error(`File too large (${(fileSizeMB / 1024).toFixed(1)}GB). Maximum supported size is 2GB.`);
        }
        
        // Get file extension from URL
        const extension = this.getFileExtension(url);
        
        // Download the file
        const arrayBuffer = await response.arrayBuffer();
        console.log(`Downloaded ${arrayBuffer.byteLength} bytes`);
        
        // Decode based on format
        return await this.decode(arrayBuffer, extension);
    }

    /**
     * Load from File object
     */
    async loadFromFile(file) {
        console.log(`Loading file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
        
        // Validate file extension
        const extension = this.getFileExtension(file.name);
        if (!this.supportedFormats[extension]) {
            throw new Error(`Unsupported file format: ${extension}. Supported formats: ${Object.keys(this.supportedFormats).join(', ')}`);
        }
        
        // Read file
        const arrayBuffer = await file.arrayBuffer();
        
        // Decode based on format
        return await this.decode(arrayBuffer, extension);
    }

    /**
     * Decode the file based on its format
     */
    async decode(arrayBuffer, extension) {
        // Both .shac and .zyz use the same decoder (ZYZ is just SHAC with one pre-mixed layer)
        if ((extension === '.shac' || extension === '.zyz') && typeof SHACDecoder === 'undefined') {
            throw new Error('SHAC decoder not loaded. Please ensure shac-decoder.js is included.');
        }

        try {
            const formatName = extension === '.zyz' ? 'ZYZ (pre-mixed)' : 'SHAC';
            console.log(`Decoding ${formatName} format...`);

            const decoder = new SHACDecoder();
            const result = await decoder.decode(arrayBuffer);
            result.format = extension === '.zyz' ? 'zyz' : 'shac';

            // Check if this is a pre-mixed ZYZ file
            if (result.layerNames.length === 1 && result.layers.get(result.layerNames[0])?.metadata?.pre_mixed) {
                console.log('Detected ZYZ format: single pre-mixed ambisonic field');
                result.format = 'zyz';
                result.preMixed = true;
            }

            return result;
        } catch (error) {
            // Provide more helpful error messages
            if (error.message.includes('alignment')) {
                throw new Error(`File alignment issue detected. The file may be corrupted or incompatible with this player version.`);
            } else if (error.message.includes('magic')) {
                throw new Error(`Invalid file format. Expected ${extension} file but got different format.`);
            } else {
                throw error;
            }
        }
    }

    /**
     * Get file extension from filename or URL
     */
    getFileExtension(filename) {
        const match = filename.toLowerCase().match(/\.(shac|zyz)$/);
        if (!match) {
            throw new Error(`File must have .shac or .zyz extension`);
        }
        return match[0];
    }

    /**
     * Validate file before loading
     */
    validateFile(file) {
        // Check file size
        const maxSizeGB = 2;
        const maxSizeBytes = maxSizeGB * 1024 * 1024 * 1024;
        if (file.size > maxSizeBytes) {
            throw new Error(`File too large: ${(file.size / 1024 / 1024 / 1024).toFixed(1)}GB. Maximum size is ${maxSizeGB}GB.`);
        }
        
        // Check extension
        const extension = this.getFileExtension(file.name);
        if (!this.supportedFormats[extension]) {
            throw new Error(`Unsupported format: ${extension}`);
        }
        
        return true;
    }

    /**
     * Create a file info object from loaded data
     */
    createFileInfo(data, filename) {
        const duration = data.header.n_samples / data.header.sample_rate;
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);

        return {
            name: filename.replace(/\.(shac|zyz)$/, ''),
            format: data.format,
            compressed: false,
            preMixed: data.preMixed || false,
            duration: `${minutes}:${seconds.toString().padStart(2, '0')}`,
            durationSeconds: duration,
            layers: data.layerNames.length,
            sampleRate: data.header.sample_rate,
            channels: data.header.n_channels,
            order: data.header.order,
            bitDepth: data.header.bit_depth,
            samples: data.header.n_samples,
            qualitySettings: data.qualityLevel || null
        };
    }
}

// Export for use
window.UniversalFileLoader = UniversalFileLoader;