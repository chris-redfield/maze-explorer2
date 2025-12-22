// Campaign Mode with BSP Maze Generation

// Color palette for mini-mazes
const MAZE_COLORS = [
    '#4a90e2', // Blue
    '#e24a90', // Pink
    '#90e24a', // Green
    '#e2904a', // Orange
    '#904ae2', // Purple
    '#4ae290', // Teal
    '#e2e24a', // Yellow
    '#4ae2e2', // Cyan
    '#e24a4a', // Red
    '#4a4ae2', // Indigo
    '#e24ae2', // Magenta
    '#90904a', // Olive
];

// BSP Tree Node
class BSPNode {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.left = null;
        this.right = null;
        this.isLeaf = true;
        this.region = null; // Will hold the actual maze region data
        this.color = null;
        this.discovered = false;
        this.connections = []; // Connection points to other regions
    }

    // Split this node into two children
    split(rng, minSize) {
        if (!this.isLeaf) return false;

        // Determine split direction based on aspect ratio with some randomness
        let splitHorizontal;
        if (this.width / this.height >= 1.25) {
            splitHorizontal = false; // Split vertically (left/right)
        } else if (this.height / this.width >= 1.25) {
            splitHorizontal = true; // Split horizontally (top/bottom)
        } else {
            splitHorizontal = rng.next() > 0.5;
        }

        const max = (splitHorizontal ? this.height : this.width) - minSize;
        if (max <= minSize) return false; // Too small to split

        // Random split position
        const splitPos = Math.floor(rng.next() * (max - minSize)) + minSize;

        if (splitHorizontal) {
            this.left = new BSPNode(this.x, this.y, this.width, splitPos);
            this.right = new BSPNode(this.x, this.y + splitPos, this.width, this.height - splitPos);
        } else {
            this.left = new BSPNode(this.x, this.y, splitPos, this.height);
            this.right = new BSPNode(this.x + splitPos, this.y, this.width - splitPos, this.height);
        }

        this.isLeaf = false;
        return true;
    }

    // Get all leaf nodes
    getLeaves() {
        if (this.isLeaf) return [this];
        return [...this.left.getLeaves(), ...this.right.getLeaves()];
    }
}

// Campaign Maze using BSP
class CampaignMaze {
    constructor(level, seed) {
        this.level = level;
        this.seed = seed;
        this.rng = new Random(seed);
        this.cellSize = 20;

        // Calculate base size - grows with level
        // Level 1: ~30x30, Level 2: ~45x45, Level 3: ~67x67, etc. (50% growth)
        const baseSize = Math.floor(30 * Math.pow(1.5, level - 1));
        this.cols = baseSize;
        this.rows = baseSize;

        // Number of splits = level + 1
        this.numSplits = level + 1;

        // Initialize the grid
        this.grid = [];
        for (let y = 0; y < this.rows; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.cols; x++) {
                this.grid[y][x] = {
                    walls: { top: true, right: true, bottom: true, left: true },
                    visited: false,
                    regionId: -1,
                    isConnection: false,
                    isCorridor: false,
                    color: null
                };
            }
        }

        // Create BSP tree
        this.root = new BSPNode(0, 0, this.cols, this.rows);
        this.regions = [];
        this.corridors = [];

        // Generate the maze
        this.generate();
    }

    generate() {
        // Step 1: Perform BSP splits
        this.performSplits();

        // Step 2: Get all leaf regions and assign colors
        const leaves = this.root.getLeaves();
        const shuffledColors = [...MAZE_COLORS];
        this.shuffleArray(shuffledColors);

        leaves.forEach((leaf, index) => {
            leaf.color = shuffledColors[index % shuffledColors.length];
            leaf.regionId = index;
        });

        // Step 3: Shrink regions to create corridor space
        this.shrinkRegions(leaves);

        // Step 4: Generate mini-maze within each region
        leaves.forEach((leaf, index) => {
            this.generateMiniMaze(leaf, index);
        });

        // Step 5: Create corridors between adjacent regions
        this.createCorridors(this.root);

        // Step 6: Set up start and exit
        this.setupStartAndExit(leaves);

        // Store regions for later use
        this.regions = leaves;

        // Discover the starting region
        this.regions[0].discovered = true;

        // Initialize current region for camera tracking
        this.currentRegion = this.startRegion;
        this.currentCorridor = null;
    }

    performSplits() {
        const minSize = 8; // Minimum region size
        let nodesToSplit = [this.root];

        for (let i = 0; i < this.numSplits; i++) {
            const nextNodes = [];
            for (const node of nodesToSplit) {
                if (node.split(this.rng, minSize)) {
                    nextNodes.push(node.left, node.right);
                } else {
                    nextNodes.push(node);
                }
            }
            nodesToSplit = nextNodes;
        }
    }

    shrinkRegions(leaves) {
        const corridorWidth = 1;
        const padding = 2; // Space between region edge and maze

        leaves.forEach(leaf => {
            // Shrink the region bounds
            leaf.innerX = leaf.x + padding;
            leaf.innerY = leaf.y + padding;
            leaf.innerWidth = leaf.width - padding * 2 - corridorWidth;
            leaf.innerHeight = leaf.height - padding * 2 - corridorWidth;

            // Ensure minimum size
            if (leaf.innerWidth < 5) leaf.innerWidth = 5;
            if (leaf.innerHeight < 5) leaf.innerHeight = 5;
        });
    }

    generateMiniMaze(leaf, regionId) {
        const startX = leaf.innerX;
        const startY = leaf.innerY;
        const width = leaf.innerWidth;
        const height = leaf.innerHeight;

        // Mark all cells in this region
        for (let y = startY; y < startY + height && y < this.rows; y++) {
            for (let x = startX; x < startX + width && x < this.cols; x++) {
                this.grid[y][x].regionId = regionId;
                this.grid[y][x].color = leaf.color;
                this.grid[y][x].visited = false;
            }
        }

        // Generate maze using recursive backtracking within the region
        const stack = [[startX, startY]];

        while (stack.length > 0) {
            const [cx, cy] = stack[stack.length - 1];
            this.grid[cy][cx].visited = true;

            const directions = [
                { dx: 0, dy: -1, wall: 'top', opposite: 'bottom' },
                { dx: 1, dy: 0, wall: 'right', opposite: 'left' },
                { dx: 0, dy: 1, wall: 'bottom', opposite: 'top' },
                { dx: -1, dy: 0, wall: 'left', opposite: 'right' }
            ];

            this.shuffleArray(directions);

            let foundUnvisited = false;
            for (const dir of directions) {
                const nx = cx + dir.dx;
                const ny = cy + dir.dy;

                // Check if within this region's bounds
                if (nx >= startX && nx < startX + width &&
                    ny >= startY && ny < startY + height &&
                    ny < this.rows && nx < this.cols &&
                    !this.grid[ny][nx].visited) {

                    this.grid[cy][cx].walls[dir.wall] = false;
                    this.grid[ny][nx].walls[dir.opposite] = false;
                    stack.push([nx, ny]);
                    foundUnvisited = true;
                    break;
                }
            }

            if (!foundUnvisited) {
                stack.pop();
            }
        }

        // Store region bounds for connection points
        leaf.region = { startX, startY, width, height };
    }

    createCorridors(node) {
        if (node.isLeaf) return;

        // Create corridor between left and right children
        this.connectRegions(node.left, node.right);

        // Recurse
        this.createCorridors(node.left);
        this.createCorridors(node.right);
    }

    connectRegions(nodeA, nodeB) {
        // Find all leaves in each subtree
        const leavesA = nodeA.getLeaves();
        const leavesB = nodeB.getLeaves();

        // Find the best pair of leaves to connect (closest ones)
        let bestPair = null;
        let bestDistance = Infinity;

        for (const leafA of leavesA) {
            for (const leafB of leavesB) {
                const dist = this.regionDistance(leafA, leafB);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    bestPair = [leafA, leafB];
                }
            }
        }

        if (bestPair) {
            this.createCorridorBetween(bestPair[0], bestPair[1]);
        }
    }

    regionDistance(leafA, leafB) {
        const centerAX = leafA.x + leafA.width / 2;
        const centerAY = leafA.y + leafA.height / 2;
        const centerBX = leafB.x + leafB.width / 2;
        const centerBY = leafB.y + leafB.height / 2;

        return Math.abs(centerAX - centerBX) + Math.abs(centerAY - centerBY);
    }

    createCorridorBetween(leafA, leafB) {
        const regA = leafA.region;
        const regB = leafB.region;

        if (!regA || !regB) return;

        // Determine if horizontal or vertical connection
        const horizontal = Math.abs((leafA.x + leafA.width / 2) - (leafB.x + leafB.width / 2)) >
                          Math.abs((leafA.y + leafA.height / 2) - (leafB.y + leafB.height / 2));

        let connectionPoint;

        if (horizontal) {
            // Connect horizontally
            const leftLeaf = leafA.x < leafB.x ? leafA : leafB;
            const rightLeaf = leafA.x < leafB.x ? leafB : leafA;
            const leftReg = leftLeaf.region;
            const rightReg = rightLeaf.region;

            // Find overlapping Y range
            const overlapStart = Math.max(leftReg.startY, rightReg.startY);
            const overlapEnd = Math.min(leftReg.startY + leftReg.height, rightReg.startY + rightReg.height);

            if (overlapEnd > overlapStart) {
                // Pick a Y position in the overlap
                const corridorY = Math.floor(overlapStart + this.rng.next() * (overlapEnd - overlapStart - 1));

                // Corridor X range
                const startX = leftReg.startX + leftReg.width;
                const endX = rightReg.startX;

                // Create corridor cells
                connectionPoint = this.carveCorridor(startX, corridorY, endX, corridorY, leftLeaf, rightLeaf);
            }
        } else {
            // Connect vertically
            const topLeaf = leafA.y < leafB.y ? leafA : leafB;
            const bottomLeaf = leafA.y < leafB.y ? leafB : leafA;
            const topReg = topLeaf.region;
            const bottomReg = bottomLeaf.region;

            // Find overlapping X range
            const overlapStart = Math.max(topReg.startX, bottomReg.startX);
            const overlapEnd = Math.min(topReg.startX + topReg.width, bottomReg.startX + bottomReg.width);

            if (overlapEnd > overlapStart) {
                // Pick an X position in the overlap
                const corridorX = Math.floor(overlapStart + this.rng.next() * (overlapEnd - overlapStart - 1));

                // Corridor Y range
                const startY = topReg.startY + topReg.height;
                const endY = bottomReg.startY;

                // Create corridor cells
                connectionPoint = this.carveCorridor(corridorX, startY, corridorX, endY, topLeaf, bottomLeaf);
            }
        }

        // Store connection info
        if (connectionPoint) {
            leafA.connections.push({ target: leafB, point: connectionPoint });
            leafB.connections.push({ target: leafA, point: connectionPoint });
        }
    }

    carveCorridor(x1, y1, x2, y2, leafA, leafB) {
        const corridor = [];

        // Ensure we're going in the right direction
        const dx = x2 > x1 ? 1 : (x2 < x1 ? -1 : 0);
        const dy = y2 > y1 ? 1 : (y2 < y1 ? -1 : 0);

        let x = x1;
        let y = y1;

        const regA = leafA.region;
        const regB = leafB.region;

        // First, open the exit from region A into the corridor
        if (dx !== 0) {
            // Horizontal corridor - open the right wall of region A
            const exitX = regA.startX + regA.width - 1;
            const exitY = y1;
            if (exitY >= 0 && exitY < this.rows && exitX >= 0 && exitX < this.cols) {
                this.grid[exitY][exitX].walls.right = false;
                // Also open the left wall of the first corridor cell
                if (x1 >= 0 && x1 < this.cols) {
                    this.grid[y1][x1].walls.left = false;
                }
            }
        } else {
            // Vertical corridor - open the bottom wall of region A
            const exitX = x1;
            const exitY = regA.startY + regA.height - 1;
            if (exitY >= 0 && exitY < this.rows && exitX >= 0 && exitX < this.cols) {
                this.grid[exitY][exitX].walls.bottom = false;
                // Also open the top wall of the first corridor cell
                if (y1 >= 0 && y1 < this.rows) {
                    this.grid[y1][x1].walls.top = false;
                }
            }
        }

        // Carve the corridor cells
        let prevX = -1, prevY = -1;
        while (true) {
            if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
                const cell = this.grid[y][x];
                // Only mark as corridor if not already part of a region
                if (cell.regionId === -1) {
                    cell.isCorridor = true;
                    cell.regionId = -2; // Special ID for corridors
                    corridor.push({ x, y });
                }

                // Open wall to previous cell
                if (prevX >= 0 && prevY >= 0) {
                    if (prevX < x) {
                        this.grid[prevY][prevX].walls.right = false;
                        cell.walls.left = false;
                    } else if (prevX > x) {
                        this.grid[prevY][prevX].walls.left = false;
                        cell.walls.right = false;
                    } else if (prevY < y) {
                        this.grid[prevY][prevX].walls.bottom = false;
                        cell.walls.top = false;
                    } else if (prevY > y) {
                        this.grid[prevY][prevX].walls.top = false;
                        cell.walls.bottom = false;
                    }
                }

                prevX = x;
                prevY = y;
            }

            // Check if we've reached the end
            if (x === x2 && y === y2) break;

            // Move to next cell
            if (x !== x2) x += dx;
            else if (y !== y2) y += dy;
        }

        // Open entry to region B
        if (dx !== 0) {
            // Horizontal corridor - open the left wall of region B entry point
            const entryX = regB.startX;
            const entryY = y2;
            if (entryY >= 0 && entryY < this.rows && entryX >= 0 && entryX < this.cols) {
                this.grid[entryY][entryX].walls.left = false;
                // Open right wall of last corridor cell
                if (x2 >= 0 && x2 < this.cols && y2 >= 0 && y2 < this.rows) {
                    this.grid[y2][x2].walls.right = false;
                }
            }
        } else {
            // Vertical corridor - open the top wall of region B entry point
            const entryX = x2;
            const entryY = regB.startY;
            if (entryY >= 0 && entryY < this.rows && entryX >= 0 && entryX < this.cols) {
                this.grid[entryY][entryX].walls.top = false;
                // Open bottom wall of last corridor cell
                if (x2 >= 0 && x2 < this.cols && y2 >= 0 && y2 < this.rows) {
                    this.grid[y2][x2].walls.bottom = false;
                }
            }
        }

        this.corridors.push({ cells: corridor, connects: [leafA.regionId, leafB.regionId] });

        // Return middle point of corridor for connection reference
        const midIdx = Math.floor(corridor.length / 2);
        return corridor[midIdx] || corridor[0];
    }

    setupStartAndExit(leaves) {
        // Find the leaf closest to top-left for start
        let startLeaf = leaves[0];
        let minDist = startLeaf.x + startLeaf.y;

        for (const leaf of leaves) {
            const dist = leaf.x + leaf.y;
            if (dist < minDist) {
                minDist = dist;
                startLeaf = leaf;
            }
        }

        // Reorder so start leaf is first
        const startIdx = leaves.indexOf(startLeaf);
        if (startIdx > 0) {
            [leaves[0], leaves[startIdx]] = [leaves[startIdx], leaves[0]];
            // Update region IDs
            leaves.forEach((leaf, idx) => leaf.regionId = idx);
        }

        // Find the leaf furthest from start for exit (bottom-right preference)
        let exitLeaf = leaves[leaves.length - 1];
        let maxDist = 0;

        for (const leaf of leaves) {
            const dist = (leaf.x + leaf.width) + (leaf.y + leaf.height);
            if (dist > maxDist && leaf !== startLeaf) {
                maxDist = dist;
                exitLeaf = leaf;
            }
        }

        // Set start position
        this.startRegion = startLeaf;
        this.startX = startLeaf.region.startX;
        this.startY = startLeaf.region.startY;

        // Set exit in the exit region (bottom-right corner of that region)
        this.exitRegion = exitLeaf;
        this.exitX = exitLeaf.region.startX + exitLeaf.region.width - 1;
        this.exitY = exitLeaf.region.startY + exitLeaf.region.height - 1;

        // Mark exit cell
        if (this.exitY < this.rows && this.exitX < this.cols) {
            this.grid[this.exitY][this.exitX].isExit = true;
        }

        // Mark start cell
        if (this.startY < this.rows && this.startX < this.cols) {
            this.grid[this.startY][this.startX].isStart = true;
        }
    }

    // Check if player is in a new region and discover it
    checkDiscovery(playerX, playerY) {
        const cellX = Math.floor(playerX / this.cellSize);
        const cellY = Math.floor(playerY / this.cellSize);

        if (cellY >= 0 && cellY < this.rows && cellX >= 0 && cellX < this.cols) {
            const cell = this.grid[cellY][cellX];

            // Check if actually in a corridor cell (regionId === -2)
            if (cell.isCorridor && cell.regionId === -2) {
                // Find which corridor and discover it
                for (const corridor of this.corridors) {
                    for (const c of corridor.cells) {
                        if (c.x === cellX && c.y === cellY) {
                            corridor.discovered = true;
                            // Update current location for camera - only when IN the corridor
                            this.currentCorridor = corridor;
                            this.currentRegion = null;
                            break;
                        }
                    }
                }
            }
            // Check if in a region (not a corridor)
            else if (cell.regionId >= 0 && cell.regionId < this.regions.length) {
                const region = this.regions[cell.regionId];
                if (!region.discovered) {
                    region.discovered = true;
                }
                // Update current region for camera
                this.currentRegion = region;
                this.currentCorridor = null;

                // Discover corridors that connect to this region
                for (const corridor of this.corridors) {
                    if (corridor.connects.includes(cell.regionId)) {
                        corridor.discovered = true;
                    }
                }
            }
        }
    }

    // Get camera position for Move Ball mode - centers on current region or corridor
    getCameraForMoveBallMode(canvas) {
        let centerX, centerY, viewWidth, viewHeight;

        if (this.currentCorridor) {
            // Center on corridor
            const cells = this.currentCorridor.cells;
            const minX = Math.min(...cells.map(c => c.x));
            const maxX = Math.max(...cells.map(c => c.x));
            const minY = Math.min(...cells.map(c => c.y));
            const maxY = Math.max(...cells.map(c => c.y));

            centerX = ((minX + maxX) / 2 + 0.5) * this.cellSize;
            centerY = ((minY + maxY) / 2 + 0.5) * this.cellSize;

            // Include some surrounding area
            viewWidth = (maxX - minX + 10) * this.cellSize;
            viewHeight = (maxY - minY + 10) * this.cellSize;
        } else if (this.currentRegion && this.currentRegion.region) {
            // Center on current region
            const reg = this.currentRegion.region;
            centerX = (reg.startX + reg.width / 2) * this.cellSize;
            centerY = (reg.startY + reg.height / 2) * this.cellSize;
            viewWidth = reg.width * this.cellSize;
            viewHeight = reg.height * this.cellSize;
        } else {
            // Default to start region
            const reg = this.startRegion.region;
            centerX = (reg.startX + reg.width / 2) * this.cellSize;
            centerY = (reg.startY + reg.height / 2) * this.cellSize;
            viewWidth = reg.width * this.cellSize;
            viewHeight = reg.height * this.cellSize;
        }

        // Calculate camera position to center the view
        let camX = centerX - canvas.width / 2;
        let camY = centerY - canvas.height / 2;

        return { camX, camY };
    }

    draw(camX, camY, ctx, canvas) {
        const startCol = Math.max(0, Math.floor(camX / this.cellSize) - 1);
        const endCol = Math.min(this.cols, Math.ceil((camX + canvas.width) / this.cellSize) + 1);
        const startRow = Math.max(0, Math.floor(camY / this.cellSize) - 1);
        const endRow = Math.min(this.rows, Math.ceil((camY + canvas.height) / this.cellSize) + 1);

        // First pass: Draw blue zone indicators for discovered corridors
        for (const corridor of this.corridors) {
            if (corridor.discovered) {
                for (const c of corridor.cells) {
                    // Only draw if this cell is actually a corridor cell
                    if (c.x >= startCol && c.x < endCol && c.y >= startRow && c.y < endRow) {
                        const cell = this.grid[c.y][c.x];
                        if (cell.regionId === -2) { // Only actual corridor cells
                            const screenX = c.x * this.cellSize - camX;
                            const screenY = c.y * this.cellSize - camY;
                            ctx.fillStyle = 'rgba(74, 144, 226, 0.3)';
                            ctx.fillRect(screenX, screenY, this.cellSize, this.cellSize);
                        }
                    }
                }
            }
        }

        // Second pass: Draw cells
        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
                const cell = this.grid[y][x];
                const screenX = x * this.cellSize - camX;
                const screenY = y * this.cellSize - camY;

                // Determine if this cell's region is discovered
                let isDiscovered = false;
                let cellColor = '#4a90e2';
                let isCorridorDiscovered = false;

                if (cell.isCorridor) {
                    // Check if this corridor is discovered
                    for (const corridor of this.corridors) {
                        for (const c of corridor.cells) {
                            if (c.x === x && c.y === y) {
                                isCorridorDiscovered = corridor.discovered;
                                break;
                            }
                        }
                        if (isCorridorDiscovered) break;
                    }
                    isDiscovered = isCorridorDiscovered;
                    cellColor = '#4a90e2'; // Blue for corridors
                } else if (cell.regionId >= 0 && cell.regionId < this.regions.length) {
                    const region = this.regions[cell.regionId];
                    isDiscovered = region.discovered;
                    cellColor = region.color;
                }

                // Skip undiscovered cells entirely (make them invisible)
                if (!isDiscovered) {
                    continue;
                }

                // Draw exit
                if (cell.isExit) {
                    ctx.fillStyle = '#00ff88';
                    ctx.fillRect(screenX + 2, screenY + 2, this.cellSize - 4, this.cellSize - 4);
                }

                // Draw start
                if (cell.isStart) {
                    ctx.fillStyle = '#ffaa00';
                    ctx.fillRect(screenX + 2, screenY + 2, this.cellSize - 4, this.cellSize - 4);
                }

                // Draw walls
                ctx.strokeStyle = cellColor;
                ctx.lineWidth = 2;
                ctx.beginPath();

                if (cell.walls.top) {
                    ctx.moveTo(screenX, screenY);
                    ctx.lineTo(screenX + this.cellSize, screenY);
                }
                if (cell.walls.right) {
                    ctx.moveTo(screenX + this.cellSize, screenY);
                    ctx.lineTo(screenX + this.cellSize, screenY + this.cellSize);
                }
                if (cell.walls.bottom) {
                    ctx.moveTo(screenX, screenY + this.cellSize);
                    ctx.lineTo(screenX + this.cellSize, screenY + this.cellSize);
                }
                if (cell.walls.left) {
                    ctx.moveTo(screenX, screenY);
                    ctx.lineTo(screenX, screenY + this.cellSize);
                }

                ctx.stroke();
            }
        }
    }

    canMove(x, y, dx, dy, radius) {
        const newX = x + dx;
        const newY = y + dy;

        // Check boundaries
        if (newX - radius < 0 || newX + radius >= this.cols * this.cellSize ||
            newY - radius < 0 || newY + radius >= this.rows * this.cellSize) {
            return false;
        }

        // Get the range of cells the ball might be in
        const minCellX = Math.max(0, Math.floor((newX - radius) / this.cellSize));
        const maxCellX = Math.min(this.cols - 1, Math.floor((newX + radius) / this.cellSize));
        const minCellY = Math.max(0, Math.floor((newY - radius) / this.cellSize));
        const maxCellY = Math.min(this.rows - 1, Math.floor((newY + radius) / this.cellSize));

        // Check collision with walls
        for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
            for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
                const cell = this.grid[cellY][cellX];
                const cellLeft = cellX * this.cellSize;
                const cellTop = cellY * this.cellSize;
                const cellRight = cellLeft + this.cellSize;
                const cellBottom = cellTop + this.cellSize;

                if (cell.walls.top && this.circleLineIntersect(newX, newY, radius, cellLeft, cellTop, cellRight, cellTop)) {
                    return false;
                }
                if (cell.walls.bottom && this.circleLineIntersect(newX, newY, radius, cellLeft, cellBottom, cellRight, cellBottom)) {
                    return false;
                }
                if (cell.walls.left && this.circleLineIntersect(newX, newY, radius, cellLeft, cellTop, cellLeft, cellBottom)) {
                    return false;
                }
                if (cell.walls.right && this.circleLineIntersect(newX, newY, radius, cellRight, cellTop, cellRight, cellBottom)) {
                    return false;
                }
            }
        }

        return true;
    }

    circleLineIntersect(cx, cy, radius, x1, y1, x2, y2) {
        const A = cx - x1;
        const B = cy - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;

        if (lenSq === 0) {
            const dx = cx - x1;
            const dy = cy - y1;
            return (dx * dx + dy * dy) <= radius * radius;
        }

        let param = dot / lenSq;
        if (param < 0) param = 0;
        if (param > 1) param = 1;

        const xx = x1 + param * C;
        const yy = y1 + param * D;

        const dx = cx - xx;
        const dy = cy - yy;

        return (dx * dx + dy * dy) <= radius * radius;
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng.next() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // Check if player reached the final exit
    checkWin(playerX, playerY) {
        const cellX = Math.floor(playerX / this.cellSize);
        const cellY = Math.floor(playerY / this.cellSize);

        // Must be in the exit region and at the exit cell
        return cellX === this.exitX && cellY === this.exitY && this.exitRegion.discovered;
    }

    // Get starting position in pixel coordinates
    getStartPosition() {
        return {
            x: this.startX * this.cellSize + this.cellSize / 2,
            y: this.startY * this.cellSize + this.cellSize / 2
        };
    }
}
