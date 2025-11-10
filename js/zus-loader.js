/**
 * Züs Integration for SHAC Player
 * Handles loading SHAC files from Züs distributed storage
 */

class ZusFileLoader {
    constructor() {
        this.dbName = 'SHACPlayerCache';
        this.storeName = 'shacFiles';
        this.db = null;
        this.initDB();
    }

    /**
     * Initialize IndexedDB for caching
     */
    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('size', 'size', { unique: false });
                }
            };
        });
    }

    /**
     * Load file from Züs with caching
     */
    async loadFromZus(shareUrl, options = {}) {
        const { 
            onProgress = () => {}, 
            bypassCache = false,
            zusApiEndpoint = null 
        } = options;

        // Extract file ID from share URL
        const fileId = this.extractFileId(shareUrl);
        
        // Check cache first unless bypassed
        if (!bypassCache) {
            const cached = await this.getFromCache(fileId);
            if (cached) {
                console.log('Loading from cache:', fileId);
                onProgress({ percent: 100, cached: true });
                return cached.data;
            }
        }

        // Download from Züs
        console.log('Downloading from Züs:', shareUrl);
        
        try {
            // If Züs provides a custom API endpoint, use it
            const downloadUrl = zusApiEndpoint || await this.getZusDownloadUrl(shareUrl);
            
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
            }

            const contentLength = parseInt(response.headers.get('content-length') || '0');
            const reader = response.body.getReader();
            const chunks = [];
            let receivedLength = 0;

            // Read the response chunk by chunk
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                chunks.push(value);
                receivedLength += value.length;
                
                // Report progress
                const percent = contentLength ? (receivedLength / contentLength) * 100 : 0;
                onProgress({ 
                    percent, 
                    loaded: receivedLength, 
                    total: contentLength,
                    cached: false 
                });
            }

            // Combine chunks into single ArrayBuffer
            const chunksAll = new Uint8Array(receivedLength);
            let position = 0;
            for (const chunk of chunks) {
                chunksAll.set(chunk, position);
                position += chunk.length;
            }

            const arrayBuffer = chunksAll.buffer;

            // Cache the file
            await this.saveToCache(fileId, arrayBuffer, shareUrl);

            return arrayBuffer;

        } catch (error) {
            console.error('Error loading from Züs:', error);
            throw new Error(`Failed to load file from Züs: ${error.message}`);
        }
    }

    /**
     * Extract file ID from Züs share URL
     */
    extractFileId(shareUrl) {
        const match = shareUrl.match(/\/([^\/]+)$/);
        return match ? match[1] : shareUrl;
    }

    /**
     * Get actual download URL from Züs share page
     * This would need to be implemented based on Züs API
     */
    async getZusDownloadUrl(shareUrl) {
        // For now, this is a placeholder
        // In practice, you'd either:
        // 1. Parse the HTML page to find download link
        // 2. Use Züs API if available
        // 3. Have Züs team provide direct download URLs
        
        // Temporary: assume direct download by appending /download
        return `${shareUrl}/download`;
    }

    /**
     * Save file to IndexedDB cache
     */
    async saveToCache(id, arrayBuffer, url) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            const data = {
                id,
                url,
                data: arrayBuffer,
                size: arrayBuffer.byteLength,
                timestamp: Date.now()
            };

            const request = store.put(data);
            request.onsuccess = () => {
                console.log('Cached file:', id, `(${(data.size / 1024 / 1024).toFixed(2)} MB)`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get file from cache
     */
    async getFromCache(id) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(id);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get cache storage info
     */
    async getCacheInfo() {
        if (!this.db) await this.initDB();

        const files = await this.getAllCachedFiles();
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        
        // Check browser storage quota
        let quota = null;
        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate();
            quota = {
                usage: estimate.usage || 0,
                quota: estimate.quota || 0,
                usagePercent: ((estimate.usage || 0) / (estimate.quota || 1)) * 100
            };
        }

        return {
            fileCount: files.length,
            totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            files: files.map(f => ({
                id: f.id,
                url: f.url,
                sizeMB: (f.size / 1024 / 1024).toFixed(2),
                timestamp: new Date(f.timestamp).toLocaleString()
            })),
            quota
        };
    }

    /**
     * Get all cached files
     */
    async getAllCachedFiles() {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear specific file from cache
     */
    async clearFile(id) {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => {
                console.log('Cleared from cache:', id);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all cached files
     */
    async clearAllCache() {
        if (!this.db) await this.initDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();
            
            request.onsuccess = () => {
                console.log('Cleared all cache');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Request persistent storage permission
     */
    async requestPersistentStorage() {
        if ('storage' in navigator && 'persist' in navigator.storage) {
            const isPersisted = await navigator.storage.persisted();
            console.log(`Persisted storage granted: ${isPersisted}`);
            
            if (!isPersisted) {
                const result = await navigator.storage.persist();
                console.log(`Persistent storage request result: ${result}`);
                return result;
            }
            
            return true;
        }
        
        return false;
    }
}

// Export for use
window.ZusFileLoader = ZusFileLoader;