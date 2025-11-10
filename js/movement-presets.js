/**
 * Movement Presets for SHAC Player
 * Clean, focused atmospheric experiences
 */

class MovementPresets {
    constructor() {
        this.currentPreset = null;
        this.presets = this.initializePresets();
        this.activePresetName = 'explorer'; // Explorer is now default
        
        this.setupEventListeners();
        this.setPreset('explorer'); // Set Explorer as default
    }

    initializePresets() {
        return {
            explorer: {
                name: "Explorer",
                description: "Freedom to roam and discover - default experience",
                boundaries: {
                    radius: 30,        // 30 squares east/west
                    floor: -10,        // 20 squares total (10 up, 10 down)
                    ceiling: 10,
                    stage_barrier: 0   // No stage barrier for full freedom
                },
                movement: {
                    horizontal_speed: 1.2,
                    vertical_speed: 0.8,
                    damping: 0.6
                },
                constraints: "explorer_freedom",  // Complete freedom
                home_position: [0, 0, -3],  // Just back from center
                pull_strength: 0
            },

            venue: {
                name: "Venue",
                description: "Multi-stage club - walk between performances",
                boundaries: {
                    radius: 30,        // Same boundary system
                    floor: -10,
                    ceiling: 10,
                    stage_barrier: 0
                },
                movement: {
                    horizontal_speed: 1.0,
                    vertical_speed: 0.4,
                    damping: 0.8
                },
                constraints: "venue_with_source_barriers",
                home_position: [0, 0, -8],  // Back of the main floor
                pull_strength: 0,
                source_barriers: {
                    enabled: true,
                    radius: 0.8,       // Just the size of the person/instrument
                    description: "Can't walk through the performers"
                }
            },

            asymmetric: {
                name: "Asymmetric",
                description: "Dance with the music - movement flows like rhythm",
                boundaries: {
                    radius: 30,
                    floor: -10,
                    ceiling: 10,
                    stage_barrier: 1
                },
                movement: {
                    forward_speed: 1.4,      // Leaning into the music feels natural
                    backward_speed: 0.6,     // Backing away from intensity takes effort
                    left_right_speed: 1.1,   // Swaying side to side flows easily
                    up_speed: 0.7,           // Rising with crescendos
                    down_speed: 1.0,         // Dropping with the bass feels natural
                    approach_boost: 1.6,     // Getting pulled into the groove
                    retreat_penalty: 0.7,    // Resisting the musical pull
                    damping: 0.75
                },
                constraints: "directional_bias",
                home_position: [0, 0, -2],  // Closer to the action
                pull_strength: 0
            },

            stadium: {
                name: "Stadium",
                description: "Massive space with distant perspectives",
                boundaries: {
                    radius: 30,
                    floor: -10,
                    ceiling: 10,
                    stage_barrier: 3    // Close enough for good volume, far enough for perspective
                },
                movement: {
                    horizontal_speed: 1.5,
                    vertical_speed: 0.6,
                    damping: 0.6
                },
                constraints: "soft_boundaries",
                home_position: [0, 2, -15],  // Up in the stands
                pull_strength: 0
            },

            elastic: {
                name: "Elastic",
                description: "The music has gravity - find the perfect listening spot",
                boundaries: {
                    radius: 30,
                    floor: -10,
                    ceiling: 10,
                    stage_barrier: 0.5
                },
                movement: {
                    horizontal_speed: 1.1,
                    vertical_speed: 0.6,
                    damping: 0.65
                },
                constraints: "elastic_return",
                home_position: [0, 1, -1],   // Slightly elevated, close to center
                pull_strength: 0.25,         // Gentle but noticeable
                comfort_zone: 6,             // Closer comfort zone
                max_pull: 0.6                // Not overwhelming
            }
        };
    }

    setupEventListeners() {
        // New dropdown button and options
        const dropdownBtn = document.getElementById('movement-preset-btn');
        const dropdown = document.getElementById('movement-dropdown');
        const movementOptions = document.querySelectorAll('.movement-option');
        const currentText = document.getElementById('current-movement-text');
        
        // Toggle dropdown
        if (dropdownBtn && dropdown) {
            dropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', () => {
                dropdown.classList.remove('show');
            });
            
            // Handle option selection
            movementOptions.forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const value = option.dataset.value;
                    const text = option.textContent.trim();
                    
                    // Update active option
                    movementOptions.forEach(opt => opt.classList.remove('active'));
                    option.classList.add('active');
                    
                    // Update button text
                    if (currentText) {
                        currentText.textContent = text.trim(); // Use text directly, no emojis to remove
                    }
                    
                    // Set preset
                    this.setPreset(value);
                    
                    // Close dropdown
                    dropdown.classList.remove('show');
                });
            });
        }
        
        // Legacy support for old selectors
        const presetSelect = document.getElementById('movement-preset-sidebar') || 
                           document.getElementById('movement-preset');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                this.setPreset(e.target.value);
            });
        }
    }

    setPreset(presetName) {
        if (!this.presets[presetName]) {
            console.warn(`Unknown preset: ${presetName}`);
            return;
        }

        this.activePresetName = presetName;
        this.currentPreset = this.presets[presetName];
        
        // Update dropdown to match (support both old and new selectors)
        const presetSelect = document.getElementById('movement-preset-sidebar') || 
                           document.getElementById('movement-preset');
        if (presetSelect) {
            presetSelect.value = presetName;
        }
    }

    /**
     * Process movement input based on current preset
     * @param {Object} inputVector - Raw movement input {x, y, z}
     * @param {Object} currentPosition - Current listener position
     * @param {Array} audioSources - Array of audio source positions
     * @returns {Object} - Processed movement vector
     */
    processMovement(inputVector, currentPosition, audioSources = []) {
        if (!this.currentPreset) return inputVector;

        let processedVector = { ...inputVector };
        const preset = this.currentPreset;

        // Apply speed modifiers
        if (preset.movement.horizontal_speed !== undefined) {
            processedVector.x *= preset.movement.horizontal_speed;
            processedVector.z *= preset.movement.horizontal_speed;
        }

        if (preset.movement.vertical_speed !== undefined) {
            processedVector.y *= preset.movement.vertical_speed;
        }

        // Handle asymmetric movement
        if (preset.constraints === "directional_bias") {
            processedVector = this.applyAsymmetricMovement(processedVector, currentPosition, audioSources);
        }

        // Apply constraints
        const newPosition = {
            x: currentPosition.x + processedVector.x,
            y: currentPosition.y + processedVector.y,
            z: currentPosition.z + processedVector.z
        };

        const constrainedPosition = this.applyConstraints(newPosition, currentPosition, audioSources);

        // Return the final movement vector
        return {
            x: constrainedPosition.x - currentPosition.x,
            y: constrainedPosition.y - currentPosition.y,
            z: constrainedPosition.z - currentPosition.z
        };
    }

    applyAsymmetricMovement(inputVector, currentPosition, audioSources) {
        const preset = this.currentPreset;
        const movement = preset.movement;
        
        let processed = { ...inputVector };

        // Different speeds for different directions
        if (processed.z > 0) { // Moving forward
            processed.z *= movement.forward_speed || 1.0;
        } else if (processed.z < 0) { // Moving backward
            processed.z *= movement.backward_speed || 1.0;
        }

        if (processed.x !== 0) { // Left/right movement
            processed.x *= movement.left_right_speed || 1.0;
        }

        if (processed.y > 0) { // Moving up
            processed.y *= movement.up_speed || 1.0;
        } else if (processed.y < 0) { // Moving down
            processed.y *= movement.down_speed || 1.0;
        }

        // Apply approach/retreat modifiers
        if (audioSources.length > 0) {
            const isApproaching = this.isMovingTowardSources(inputVector, currentPosition, audioSources);
            if (isApproaching && movement.approach_boost) {
                processed.x *= movement.approach_boost;
                processed.z *= movement.approach_boost;
            } else if (!isApproaching && movement.retreat_penalty) {
                processed.x *= movement.retreat_penalty;
                processed.z *= movement.retreat_penalty;
            }
        }

        return processed;
    }

    applyConstraints(newPosition, currentPosition, audioSources) {
        const preset = this.currentPreset;
        const boundaries = preset.boundaries;
        let constrained = { ...newPosition };

        // Distance from origin
        const distance = Math.sqrt(constrained.x * constrained.x + constrained.z * constrained.z);

        // Apply boundary constraints
        switch (preset.constraints) {
            case "explorer_freedom":
                constrained = this.applyExplorerBoundaries(constrained, boundaries);
                break;
                
            case "soft_boundaries":
                constrained = this.applySoftBoundaries(constrained, boundaries);
                break;
                
            case "elastic_return":
                constrained = this.applyElasticConstraints(constrained, currentPosition, boundaries, audioSources);
                break;
                
            case "directional_bias":
                constrained = this.applySoftBoundaries(constrained, boundaries);
                break;
                
            case "venue_with_source_barriers":
                constrained = this.applyVenueConstraints(constrained, currentPosition, boundaries, audioSources);
                break;
                
            default:
                constrained = this.applySoftBoundaries(constrained, boundaries);
        }

        return constrained;
    }

    applyExplorerBoundaries(position, boundaries) {
        let constrained = { ...position };

        // Only apply outer boundaries - no stage barriers, no source collisions
        // Radial constraint (30 squares from center)
        const distance = Math.sqrt(constrained.x * constrained.x + constrained.z * constrained.z);
        if (distance > boundaries.radius) {
            const scale = boundaries.radius / distance;
            constrained.x *= scale;
            constrained.z *= scale;
        }

        // Vertical constraints (20 squares total: 10 up, 10 down)
        constrained.y = Math.max(boundaries.floor, Math.min(boundaries.ceiling, constrained.y));

        // NO stage barriers, NO source barriers - complete freedom within bounds
        return constrained;
    }

    applySoftBoundaries(position, boundaries) {
        let constrained = { ...position };

        // Radial constraint (30 squares from center)
        const distance = Math.sqrt(constrained.x * constrained.x + constrained.z * constrained.z);
        if (distance > boundaries.radius) {
            const scale = boundaries.radius / distance;
            constrained.x *= scale;
            constrained.z *= scale;
        }

        // Vertical constraints (20 squares total: 10 up, 10 down)
        constrained.y = Math.max(boundaries.floor, Math.min(boundaries.ceiling, constrained.y));

        // Stage barrier (if any)
        if (boundaries.stage_barrier > 0) {
            const originDistance = Math.sqrt(constrained.x * constrained.x + constrained.z * constrained.z);
            if (originDistance < boundaries.stage_barrier) {
                const scale = boundaries.stage_barrier / Math.max(originDistance, 0.1);
                constrained.x *= scale;
                constrained.z *= scale;
            }
        }

        return constrained;
    }

    applyElasticConstraints(position, currentPosition, boundaries, audioSources) {
        let constrained = this.applySoftBoundaries(position, boundaries);
        const preset = this.currentPreset;

        if (preset.pull_strength > 0) {
            // Calculate pull toward sources or home position
            let pullTarget = preset.home_position || [0, 0, 0];
            
            // If we have audio sources, pull toward the closest one
            if (audioSources.length > 0) {
                pullTarget = this.findNearestSource(constrained, audioSources);
            }

            const distanceToTarget = Math.sqrt(
                Math.pow(constrained.x - pullTarget[0], 2) +
                Math.pow(constrained.z - pullTarget[2], 2)
            );

            const comfortZone = preset.comfort_zone || 5;
            if (distanceToTarget > comfortZone) {
                const pullForce = Math.min(
                    (distanceToTarget - comfortZone) * preset.pull_strength,
                    preset.max_pull || 1.0
                );

                // Apply pull toward target
                const pullDirection = {
                    x: (pullTarget[0] - constrained.x) / distanceToTarget,
                    z: (pullTarget[2] - constrained.z) / distanceToTarget
                };

                constrained.x += pullDirection.x * pullForce;
                constrained.z += pullDirection.z * pullForce;
            }
        }

        return constrained;
    }

    applyVenueConstraints(position, currentPosition, boundaries, audioSources) {
        // First apply standard soft boundaries
        let constrained = this.applySoftBoundaries(position, boundaries);
        const preset = this.currentPreset;
        
        // Apply source barriers if enabled
        if (preset.source_barriers && preset.source_barriers.enabled && audioSources.length > 0) {
            const barrierRadius = preset.source_barriers.radius || 2.5;
            
            // Check each audio source for collision
            for (const source of audioSources) {
                const sourcePos = source.position || source;
                const distanceToSource = Math.sqrt(
                    Math.pow(constrained.x - sourcePos[0], 2) +
                    Math.pow(constrained.z - sourcePos[2], 2)
                );
                
                // If we're too close to a source, push us away
                if (distanceToSource < barrierRadius) {
                    // Calculate direction away from source
                    const pushDirection = {
                        x: constrained.x - sourcePos[0],
                        z: constrained.z - sourcePos[2]
                    };
                    
                    // Normalize the push direction
                    const pushLength = Math.sqrt(pushDirection.x * pushDirection.x + pushDirection.z * pushDirection.z);
                    if (pushLength > 0) {
                        pushDirection.x /= pushLength;
                        pushDirection.z /= pushLength;
                        
                        // Push to exactly the barrier distance
                        constrained.x = sourcePos[0] + pushDirection.x * barrierRadius;
                        constrained.z = sourcePos[2] + pushDirection.z * barrierRadius;
                    }
                }
            }
        }
        
        return constrained;
    }

    isMovingTowardSources(inputVector, currentPosition, audioSources) {
        if (audioSources.length === 0) return false;

        const nearestSource = this.findNearestSource(currentPosition, audioSources);
        const directionToSource = {
            x: nearestSource[0] - currentPosition.x,
            z: nearestSource[2] - currentPosition.z
        };

        // Normalize
        const length = Math.sqrt(directionToSource.x * directionToSource.x + directionToSource.z * directionToSource.z);
        if (length === 0) return false;

        directionToSource.x /= length;
        directionToSource.z /= length;

        // Dot product to see if moving toward source
        const dotProduct = inputVector.x * directionToSource.x + inputVector.z * directionToSource.z;
        return dotProduct > 0;
    }

    findNearestSource(position, audioSources) {
        if (audioSources.length === 0) return [0, 0, 0];

        let nearestSource = audioSources[0];
        let minDistance = Infinity;

        for (const source of audioSources) {
            const sourcePos = source.position || source;
            const distance = Math.sqrt(
                Math.pow(position.x - sourcePos[0], 2) +
                Math.pow(position.z - sourcePos[2], 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                nearestSource = sourcePos;
            }
        }

        return nearestSource;
    }

    resetToHome() {
        if (!this.currentPreset) return { x: 0, y: 0, z: 0 };
        
        const home = this.currentPreset.home_position || [0, 0, 0];
        return { x: home[0], y: home[1], z: home[2] };
    }

    getCurrentPresetName() {
        return this.activePresetName;
    }

    getCurrentPreset() {
        return this.currentPreset;
    }
}

// Export for use in other modules
window.MovementPresets = MovementPresets;