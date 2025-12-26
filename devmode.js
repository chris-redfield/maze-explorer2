/**
 * Developer Mode for Maze Explorer
 *
 * FEATURE TOGGLE: Set to false before shipping to production
 */
const DEV_MODE_ENABLED = false;

if (DEV_MODE_ENABLED) {
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', () => {
        initDevMode();
    });

    // If DOM is already ready, init immediately
    if (document.readyState !== 'loading') {
        initDevMode();
    }
}

let devModeInitialized = false;

function initDevMode() {
    if (devModeInitialized) return;
    devModeInitialized = true;

    // Add Test Mode button to the campaign controls
    const campaignControls = document.getElementById('campaignControls');
    if (campaignControls) {
        const testBtn = document.createElement('button');
        testBtn.id = 'testModeBtn';
        testBtn.className = 'campaign-btn';
        testBtn.style.marginTop = '10px';
        testBtn.style.background = '#8b5cf6';
        testBtn.textContent = 'Test Mode (Dev)';
        campaignControls.appendChild(testBtn);

        testBtn.addEventListener('click', () => {
            startTestMode();
        });
    }

    console.log('Dev mode initialized');
}

function startTestMode() {
    // Create a test maze with specific layout for testing zoom feature
    const testMaze = new TestCampaignMaze();

    // Hide start menu
    document.getElementById('startMenu').classList.add('hidden');

    // Set global game state
    gameMode = 'campaign';
    campaignMaze = testMaze;
    maze = testMaze;
    smoothCam.initialized = false;
    teleportCooldown = 0;

    const startPos = testMaze.getStartPosition();
    player = new Player(startPos.x, startPos.y);

    updateUI();
}

/**
 * Test Campaign Maze - creates a specific layout for testing large mini-mazes
 * Layout: Small starting maze on left, very tall maze on right connected at the top
 */
class TestCampaignMaze {
    constructor() {
        this.level = 1;
        this.seed = 12345;
        this.rng = new Random(this.seed);
        this.cellSize = 20;

        // Fixed size for test maze
        this.cols = 40;
        this.rows = 70;

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

        this.regions = [];
        this.corridors = [];
        this.teleportCells = [];

        this.generate();
    }

    generate() {
        // Create two manually positioned regions:
        // Region 1: Small starting region at top-left
        // Region 2: Very tall vertical region to the right (to test zoom)

        const leaf1 = {
            x: 0, y: 0, width: 15, height: 15,
            color: MAZE_COLORS[0],
            regionId: 0,
            innerX: 2,
            innerY: 2,
            innerWidth: 10,
            innerHeight: 10,
            discovered: true,
            region: null
        };

        const leaf2 = {
            x: 20, y: 0, width: 18, height: 68,
            color: MAZE_COLORS[1],
            regionId: 1,
            innerX: 22,
            innerY: 2,
            innerWidth: 14,
            innerHeight: 63, // Very tall!
            discovered: false,
            region: null
        };

        // Set region bounds
        leaf1.region = {
            startX: leaf1.innerX,
            startY: leaf1.innerY,
            width: leaf1.innerWidth,
            height: leaf1.innerHeight
        };

        leaf2.region = {
            startX: leaf2.innerX,
            startY: leaf2.innerY,
            width: leaf2.innerWidth,
            height: leaf2.innerHeight
        };

        const leaves = [leaf1, leaf2];

        // Generate mini-mazes within each region
        leaves.forEach((leaf, index) => {
            this.generateMiniMaze(leaf, index);
        });

        // Create a corridor connecting the regions
        // Position the connection near the TOP of region 2 so player enters at the top of the tall maze
        const corridorY = 5;
        const corridorCells = [];

        // Maze 1 right edge is at x=11 (innerX=2, innerWidth=10)
        // Maze 2 left edge is at x=22
        // Corridor goes from x=12 to x=21 (between the mazes, not overlapping)
        const corridorStartX = 12;
        const corridorEndX = 21;

        for (let x = corridorStartX; x <= corridorEndX; x++) {
            corridorCells.push({ x, y: corridorY });
            this.grid[corridorY][x].isCorridor = true;
            this.grid[corridorY][x].walls = { top: true, right: false, bottom: true, left: false };
        }

        // Fix corridor ends - close the outer walls
        this.grid[corridorY][corridorStartX].walls.left = false; // Open to maze 1
        this.grid[corridorY][corridorEndX].walls.right = false;  // Open to maze 2

        // Open walls between corridor and regions
        // Left side: maze cell (11, 5) -> open right wall to connect to corridor
        const entry1X = leaf1.innerX + leaf1.innerWidth - 1; // = 11
        if (this.grid[corridorY] && this.grid[corridorY][entry1X]) {
            this.grid[corridorY][entry1X].walls.right = false;
        }

        // Right side: maze cell (22, 5) -> open left wall to connect to corridor
        const entry2X = leaf2.innerX; // = 22
        if (this.grid[corridorY] && this.grid[corridorY][entry2X]) {
            this.grid[corridorY][entry2X].walls.left = false;
        }

        // Create corridor with proper format (including connects array)
        this.corridors.push({
            cells: corridorCells,
            connects: [leaf1.regionId, leaf2.regionId],
            discovered: false
        });

        // Set up start position in region 1
        this.startX = leaf1.innerX + 1;
        this.startY = leaf1.innerY + 1;
        this.startRegion = leaf1;

        // Set up exit in region 2 (at the bottom of the tall maze)
        const exitX = leaf2.innerX + Math.floor(leaf2.innerWidth / 2);
        const exitY = leaf2.innerY + leaf2.innerHeight - 2;
        this.exitX = exitX;
        this.exitY = exitY;
        this.exitRegion = leaf2;

        // Mark exit cell
        if (this.grid[exitY] && this.grid[exitY][exitX]) {
            this.grid[exitY][exitX].isExit = true;
        }

        // Store regions
        this.regions = leaves;

        // Initialize current region for camera tracking
        this.currentRegion = this.startRegion;
        this.currentCorridor = null;
    }

    // Mini-maze generation using recursive backtracking
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

        // Recursive backtracking maze generation
        const stack = [];
        const startCellX = startX;
        const startCellY = startY;

        if (this.grid[startCellY] && this.grid[startCellY][startCellX]) {
            this.grid[startCellY][startCellX].visited = true;
            stack.push({ x: startCellX, y: startCellY });
        }

        while (stack.length > 0) {
            const current = stack[stack.length - 1];
            const neighbors = this.getUnvisitedNeighbors(current.x, current.y, startX, startY, width, height);

            if (neighbors.length === 0) {
                stack.pop();
            } else {
                const next = neighbors[Math.floor(this.rng.next() * neighbors.length)];
                this.removeWall(current.x, current.y, next.x, next.y);
                this.grid[next.y][next.x].visited = true;
                stack.push(next);
            }
        }
    }

    getUnvisitedNeighbors(x, y, startX, startY, width, height) {
        const neighbors = [];
        const directions = [
            { dx: 0, dy: -1 }, // up
            { dx: 1, dy: 0 },  // right
            { dx: 0, dy: 1 },  // down
            { dx: -1, dy: 0 }  // left
        ];

        for (const dir of directions) {
            const nx = x + dir.dx;
            const ny = y + dir.dy;

            if (nx >= startX && nx < startX + width &&
                ny >= startY && ny < startY + height &&
                this.grid[ny] && this.grid[ny][nx] &&
                !this.grid[ny][nx].visited) {
                neighbors.push({ x: nx, y: ny });
            }
        }

        return neighbors;
    }

    removeWall(x1, y1, x2, y2) {
        if (x2 > x1) {
            this.grid[y1][x1].walls.right = false;
            this.grid[y2][x2].walls.left = false;
        } else if (x2 < x1) {
            this.grid[y1][x1].walls.left = false;
            this.grid[y2][x2].walls.right = false;
        } else if (y2 > y1) {
            this.grid[y1][x1].walls.bottom = false;
            this.grid[y2][x2].walls.top = false;
        } else if (y2 < y1) {
            this.grid[y1][x1].walls.top = false;
            this.grid[y2][x2].walls.bottom = false;
        }
    }

    getStartPosition() {
        return {
            x: this.startX * this.cellSize + this.cellSize / 2,
            y: this.startY * this.cellSize + this.cellSize / 2
        };
    }

    checkWin(playerX, playerY) {
        const cellX = Math.floor(playerX / this.cellSize);
        const cellY = Math.floor(playerY / this.cellSize);
        return cellX === this.exitX && cellY === this.exitY;
    }

    checkDiscovery(playerX, playerY) {
        const cellX = Math.floor(playerX / this.cellSize);
        const cellY = Math.floor(playerY / this.cellSize);

        if (cellY < 0 || cellY >= this.rows || cellX < 0 || cellX >= this.cols) return;

        const cell = this.grid[cellY][cellX];

        // Check if in a corridor
        if (cell.isCorridor) {
            for (const corridor of this.corridors) {
                if (corridor.cells.some(c => c.x === cellX && c.y === cellY)) {
                    corridor.discovered = true;
                    this.currentCorridor = corridor;
                    this.currentRegion = null;
                    break;
                }
            }
        } else if (cell.regionId >= 0) {
            // In a region
            const region = this.regions[cell.regionId];
            if (region && !region.discovered) {
                region.discovered = true;

                // Discover corridors that connect to this region
                for (const corridor of this.corridors) {
                    if (corridor.connects.includes(cell.regionId)) {
                        corridor.discovered = true;
                    }
                }
            }
            this.currentRegion = region;
            this.currentCorridor = null;
        }
    }

    checkTeleport() {
        return null; // No teleports in test mode
    }

    getCameraForMoveBallMode(canvas) {
        let centerX, centerY, viewWidth, viewHeight;

        if (this.currentCorridor) {
            const cells = this.currentCorridor.cells;
            const minX = Math.min(...cells.map(c => c.x));
            const maxX = Math.max(...cells.map(c => c.x));
            const minY = Math.min(...cells.map(c => c.y));
            const maxY = Math.max(...cells.map(c => c.y));

            centerX = ((minX + maxX) / 2 + 0.5) * this.cellSize;
            centerY = ((minY + maxY) / 2 + 0.5) * this.cellSize;
            viewWidth = (maxX - minX + 10) * this.cellSize;
            viewHeight = (maxY - minY + 10) * this.cellSize;
        } else if (this.currentRegion && this.currentRegion.region) {
            const reg = this.currentRegion.region;
            centerX = (reg.startX + reg.width / 2) * this.cellSize;
            centerY = (reg.startY + reg.height / 2) * this.cellSize;
            viewWidth = reg.width * this.cellSize;
            viewHeight = reg.height * this.cellSize;
        } else {
            const reg = this.startRegion.region;
            centerX = (reg.startX + reg.width / 2) * this.cellSize;
            centerY = (reg.startY + reg.height / 2) * this.cellSize;
            viewWidth = reg.width * this.cellSize;
            viewHeight = reg.height * this.cellSize;
        }

        // Calculate zoom factor if region doesn't fit screen
        const padding = 1.1;
        const scaleX = canvas.width / (viewWidth * padding);
        const scaleY = canvas.height / (viewHeight * padding);
        const zoom = Math.min(scaleX, scaleY, 1);

        let camX = centerX - (canvas.width / zoom) / 2;
        let camY = centerY - (canvas.height / zoom) / 2;

        return { camX, camY, zoom };
    }

    draw(camX, camY, ctx, canvas) {
        const startCol = Math.max(0, Math.floor(camX / this.cellSize) - 1);
        const endCol = Math.min(this.cols, Math.ceil((camX + canvas.width) / this.cellSize) + 1);
        const startRow = Math.max(0, Math.floor(camY / this.cellSize) - 1);
        const endRow = Math.min(this.rows, Math.ceil((camY + canvas.height) / this.cellSize) + 1);

        // Draw corridor backgrounds
        for (const corridor of this.corridors) {
            if (corridor.discovered) {
                for (const c of corridor.cells) {
                    if (c.x >= startCol && c.x <= endCol && c.y >= startRow && c.y <= endRow) {
                        const screenX = c.x * this.cellSize - camX;
                        const screenY = c.y * this.cellSize - camY;
                        ctx.fillStyle = 'rgba(74, 144, 226, 0.3)';
                        ctx.fillRect(screenX, screenY, this.cellSize, this.cellSize);
                    }
                }
            }
        }

        // Draw cells
        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
                const cell = this.grid[y][x];
                const screenX = x * this.cellSize - camX;
                const screenY = y * this.cellSize - camY;

                // Only draw discovered regions and corridors
                const region = cell.regionId >= 0 ? this.regions[cell.regionId] : null;
                const isDiscovered = (region && region.discovered) || cell.isCorridor;

                if (!isDiscovered) continue;

                // Draw exit
                if (cell.isExit) {
                    ctx.fillStyle = '#00ff88';
                    ctx.fillRect(screenX + 2, screenY + 2, this.cellSize - 4, this.cellSize - 4);
                }

                // Draw walls
                ctx.strokeStyle = cell.color || '#4a90e2';
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

        const nearestX = x1 + param * C;
        const nearestY = y1 + param * D;

        const dx = cx - nearestX;
        const dy = cy - nearestY;

        return (dx * dx + dy * dy) <= radius * radius;
    }
}
