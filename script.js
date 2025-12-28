const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game mode
let gameMode = 'campaign';
let quickMazeConfig = { level: 1, seed: 12345 };
let movementMode = 'maze'; // 'ball' or 'maze'

// Zoom-out animation state for campaign mode level completion
let zoomAnimation = {
    active: false,
    completed: false, // Stays true to keep zoomed-out view after animation
    progress: 0,
    startZoom: 1,
    targetZoom: 1,
    duration: 90, // frames (~1.5 seconds at 60fps)
    startCamX: 0,
    startCamY: 0
};

// Smooth camera transition for campaign mode region/corridor switching
let smoothCam = {
    x: 0,
    y: 0,
    zoom: 1,
    initialized: false,
    lerpFactor: 0.03 // Lower = slower transition (0.03 is ~50% slower than typical 0.06)
};

// Storage key
const SAVE_KEY = 'mazeExplorerSave';

// Load or initialize game state
function loadGameState() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const state = JSON.parse(saved);
            state.won = false;
            // Load movement mode preference
            if (state.movementMode) {
                movementMode = state.movementMode;
            }
            return state;
        } catch (e) {
            console.error('Failed to load save data:', e);
        }
    }
    return {
        level: 1,
        seed: Date.now(),
        playerX: 0,
        playerY: 0,
        won: false,
        highestLevel: 1,
        movementMode: 'maze'
    };
}

function saveGameState() {
    try {
        gameState.movementMode = movementMode;
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
    } catch (e) {
        console.error('Failed to save game:', e);
    }
}

function resetCurrentMaze() {
    if (gameMode === 'campaign') {
        if (confirm('Reset current maze?')) {
            zoomAnimation.active = false;
            zoomAnimation.completed = false;
            smoothCam.initialized = false;
            campaignMaze = new CampaignMaze(gameState.level, gameState.seed);
            maze = campaignMaze;
            const startPos = campaignMaze.getStartPosition();
            player = new Player(startPos.x, startPos.y);
            gameState.playerX = startPos.x;
            gameState.playerY = startPos.y;
            gameState.won = false;
            document.getElementById('win').style.display = 'none';
            saveGameState();
        }
    } else {
        quickMazeConfig.seed = Date.now();
        const mazeSize = 5 + quickMazeConfig.level * 15;
        maze = new Maze(mazeSize, mazeSize, quickMazeConfig.seed);
        player = new Player(maze.cellSize / 2, maze.cellSize / 2);
        gameState.won = false;
        document.getElementById('win').style.display = 'none';
        updateUI();
    }
}

function returnToMenu() {
    zoomAnimation.active = false;
    zoomAnimation.completed = false;
    smoothCam.initialized = false;
    document.getElementById('startMenu').classList.remove('hidden');
    document.getElementById('win').style.display = 'none';
    document.getElementById('campaignControls').style.display = 'none';
    gameState.won = false;
}

let gameState = loadGameState();

// Seeded random number generator
class Random {
    constructor(seed) {
        this.seed = seed;
    }
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

// Decorative Maze for start menu
class DecorativeMaze {
    constructor(canvas, cols, rows, seed) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cols = cols;
        this.rows = rows;
        this.cellSize = 20;
        this.grid = [];
        this.rng = new Random(seed);
        this.stack = [];
        this.generationComplete = false;
        this.animationSpeed = 1;
        
        this.canvas.width = this.cols * this.cellSize;
        this.canvas.height = this.rows * this.cellSize;
        
        for (let y = 0; y < rows; y++) {
            this.grid[y] = [];
            for (let x = 0; x < cols; x++) {
                this.grid[y][x] = {
                    walls: { top: true, right: true, bottom: true, left: true },
                    visited: false
                };
            }
        }
        
        const startX = Math.floor(this.rng.next() * cols);
        const startY = Math.floor(this.rng.next() * rows);
        this.stack.push([startX, startY]);
    }

    step() {
        if (this.stack.length === 0) {
            this.generationComplete = true;
            return;
        }

        const [cx, cy] = this.stack[this.stack.length - 1];
        this.grid[cy][cx].visited = true;
        
        const directions = [
            { dx: 0, dy: -1, wall: 'top', opposite: 'bottom' },
            { dx: 1, dy: 0, wall: 'right', opposite: 'left' },
            { dx: 0, dy: 1, wall: 'bottom', opposite: 'top' },
            { dx: -1, dy: 0, wall: 'left', opposite: 'right' }
        ];
        
        for (let i = directions.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng.next() * (i + 1));
            [directions[i], directions[j]] = [directions[j], directions[i]];
        }
        
        let foundUnvisited = false;
        for (const dir of directions) {
            const nx = cx + dir.dx;
            const ny = cy + dir.dy;
            
            if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows && !this.grid[ny][nx].visited) {
                this.grid[cy][cx].walls[dir.wall] = false;
                this.grid[ny][nx].walls[dir.opposite] = false;
                this.stack.push([nx, ny]);
                foundUnvisited = true;
                break;
            }
        }
        
        if (!foundUnvisited) {
            this.stack.pop();
        }
    }

    draw() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.strokeStyle = '#4a90e2';
        this.ctx.lineWidth = 2;

        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const cell = this.grid[y][x];
                const screenX = x * this.cellSize;
                const screenY = y * this.cellSize;

                this.ctx.beginPath();
                if (cell.walls.top) {
                    this.ctx.moveTo(screenX, screenY);
                    this.ctx.lineTo(screenX + this.cellSize, screenY);
                }
                if (cell.walls.right) {
                    this.ctx.moveTo(screenX + this.cellSize, screenY);
                    this.ctx.lineTo(screenX + this.cellSize, screenY + this.cellSize);
                }
                if (cell.walls.bottom) {
                    this.ctx.moveTo(screenX, screenY + this.cellSize);
                    this.ctx.lineTo(screenX + this.cellSize, screenY + this.cellSize);
                }
                if (cell.walls.left) {
                    this.ctx.moveTo(screenX, screenY);
                    this.ctx.lineTo(screenX, screenY + this.cellSize);
                }
                this.ctx.stroke();
            }
        }
        
        if (this.stack.length > 0) {
            const [cx, cy] = this.stack[this.stack.length - 1];
            this.ctx.fillStyle = 'rgba(74, 144, 226, 0.3)';
            this.ctx.fillRect(cx * this.cellSize + 2, cy * this.cellSize + 2, 
                             this.cellSize - 4, this.cellSize - 4);
        }
    }

    reset() {
        this.grid = [];
        this.stack = [];
        this.generationComplete = false;
        
        for (let y = 0; y < this.rows; y++) {
            this.grid[y] = [];
            for (let x = 0; x < this.cols; x++) {
                this.grid[y][x] = {
                    walls: { top: true, right: true, bottom: true, left: true },
                    visited: false
                };
            }
        }
        
        const startX = Math.floor(this.rng.next() * this.cols);
        const startY = Math.floor(this.rng.next() * this.rows);
        this.stack.push([startX, startY]);
    }
}

// Initialize decorative mazes
let decorativeMazeLeft = null;
let decorativeMazeRight = null;

function initDecorativeMazes() {
    const leftCanvas = document.getElementById('decorativeMazeLeft');
    const rightCanvas = document.getElementById('decorativeMazeRight');
    
    if (leftCanvas && rightCanvas) {
        const mazeHeight = Math.floor(window.innerHeight / 20);
        const mazeWidth = 24;
        
        decorativeMazeLeft = new DecorativeMaze(leftCanvas, mazeWidth, mazeHeight, Date.now());
        decorativeMazeRight = new DecorativeMaze(rightCanvas, mazeWidth, mazeHeight, Date.now() + 1000);
    }
}

function animateDecorativeMazes() {
    if (!document.getElementById('startMenu').classList.contains('hidden')) {
        if (decorativeMazeLeft && decorativeMazeLeft.grid && decorativeMazeLeft.grid.length > 0) {
            for (let i = 0; i < decorativeMazeLeft.animationSpeed; i++) {
                if (!decorativeMazeLeft.generationComplete) {
                    decorativeMazeLeft.step();
                } else {
                    decorativeMazeLeft.reset();
                }
            }
            decorativeMazeLeft.draw();
        }
        
        if (decorativeMazeRight && decorativeMazeRight.grid && decorativeMazeRight.grid.length > 0) {
            for (let i = 0; i < decorativeMazeRight.animationSpeed; i++) {
                if (!decorativeMazeRight.generationComplete) {
                    decorativeMazeRight.step();
                } else {
                    decorativeMazeRight.reset();
                }
            }
            decorativeMazeRight.draw();
        }
    }
}

initDecorativeMazes();

// Movement mode toggle
document.getElementById('moveBallBtn').addEventListener('click', () => {
    movementMode = 'ball';
    document.getElementById('moveBallBtn').classList.add('active');
    document.getElementById('moveMazeBtn').classList.remove('active');
    if (gameMode === 'campaign') {
        gameState.movementMode = movementMode;
        saveGameState();
    }
});

document.getElementById('moveMazeBtn').addEventListener('click', () => {
    movementMode = 'maze';
    document.getElementById('moveMazeBtn').classList.add('active');
    document.getElementById('moveBallBtn').classList.remove('active');

    // Disable gyroscope when switching to move maze mode
    if (gyroscopeMode) {
        disableGyroscope();
    }

    if (gameMode === 'campaign') {
        gameState.movementMode = movementMode;
        saveGameState();
    }
});

// Initialize toggle button states
if (movementMode === 'ball') {
    document.getElementById('moveBallBtn').classList.add('active');
    document.getElementById('moveMazeBtn').classList.remove('active');
} else {
    document.getElementById('moveMazeBtn').classList.add('active');
    document.getElementById('moveBallBtn').classList.remove('active');
}

// Maze generator
class Maze {
    constructor(cols, rows, seed) {
        this.cols = cols;
        this.rows = rows;
        this.cellSize = 20;
        this.grid = [];
        this.rng = new Random(seed);
        
        for (let y = 0; y < rows; y++) {
            this.grid[y] = [];
            for (let x = 0; x < cols; x++) {
                this.grid[y][x] = {
                    walls: { top: true, right: true, bottom: true, left: true },
                    visited: false
                };
            }
        }
        
        this.generate(0, 0);
        this.createExit();
    }

    generate(x, y) {
        const stack = [[x, y]];
        
        while (stack.length > 0) {
            const [cx, cy] = stack[stack.length - 1];
            this.grid[cy][cx].visited = true;
            
            const directions = [
                { dx: 0, dy: -1, wall: 'top', opposite: 'bottom' },
                { dx: 1, dy: 0, wall: 'right', opposite: 'left' },
                { dx: 0, dy: 1, wall: 'bottom', opposite: 'top' },
                { dx: -1, dy: 0, wall: 'left', opposite: 'right' }
            ];
            
            for (let i = directions.length - 1; i > 0; i--) {
                const j = Math.floor(this.rng.next() * (i + 1));
                [directions[i], directions[j]] = [directions[j], directions[i]];
            }
            
            let foundUnvisited = false;
            for (const dir of directions) {
                const nx = cx + dir.dx;
                const ny = cy + dir.dy;
                
                if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows && !this.grid[ny][nx].visited) {
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
    }

    createExit() {
        const exitX = this.cols - 1;
        const exitY = this.rows - 1;
        this.exitX = exitX;
        this.exitY = exitY;
        this.grid[exitY][exitX].isExit = true;
    }

    draw(camX, camY) {
        ctx.strokeStyle = '#4a90e2';
        ctx.lineWidth = 2;

        const startCol = Math.max(0, Math.floor(camX / this.cellSize));
        const endCol = Math.min(this.cols, Math.ceil((camX + canvas.width) / this.cellSize));
        const startRow = Math.max(0, Math.floor(camY / this.cellSize));
        const endRow = Math.min(this.rows, Math.ceil((camY + canvas.height) / this.cellSize));

        for (let y = startRow; y < endRow; y++) {
            for (let x = startCol; x < endCol; x++) {
                const cell = this.grid[y][x];
                const screenX = x * this.cellSize - camX;
                const screenY = y * this.cellSize - camY;

                if (cell.isExit) {
                    ctx.fillStyle = '#00ff88';
                    ctx.fillRect(screenX + 2, screenY + 2, this.cellSize - 4, this.cellSize - 4);
                }

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

        ctx.fillStyle = '#ffaa00';
        ctx.fillRect(-camX + 2, -camY + 2, this.cellSize - 4, this.cellSize - 4);
    }

    canMove(x, y, dx, dy, radius) {
        const newX = x + dx;
        const newY = y + dy;
        
        // Check boundaries first
        if (newX - radius < 0 || newX + radius >= this.cols * this.cellSize || 
            newY - radius < 0 || newY + radius >= this.rows * this.cellSize) {
            return false;
        }
        
        // Get the range of cells the ball might be in
        const minCellX = Math.max(0, Math.floor((newX - radius) / this.cellSize));
        const maxCellX = Math.min(this.cols - 1, Math.floor((newX + radius) / this.cellSize));
        const minCellY = Math.max(0, Math.floor((newY - radius) / this.cellSize));
        const maxCellY = Math.min(this.rows - 1, Math.floor((newY + radius) / this.cellSize));
        
        // Check collision with walls in all potentially intersecting cells
        for (let cellY = minCellY; cellY <= maxCellY; cellY++) {
            for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
                const cell = this.grid[cellY][cellX];
                const cellLeft = cellX * this.cellSize;
                const cellTop = cellY * this.cellSize;
                const cellRight = cellLeft + this.cellSize;
                const cellBottom = cellTop + this.cellSize;
                
                // Check collision with each wall of the cell
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
        // Calculate distance from circle center to line segment
        const A = cx - x1;
        const B = cy - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) {
            // Line segment is a point
            const dx = cx - x1;
            const dy = cy - y1;
            return (dx * dx + dy * dy) <= radius * radius;
        }
        
        let param = dot / lenSq;
        
        // Clamp to line segment
        if (param < 0) param = 0;
        if (param > 1) param = 1;
        
        const xx = x1 + param * C;
        const yy = y1 + param * D;
        
        const dx = cx - xx;
        const dy = cy - yy;
        
        return (dx * dx + dy * dy) <= radius * radius;
    }
}

// Player
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 6;
        this.collisionRadius = this.size * 0.4;
        this.speed = 3;
    }

    draw(camX, camY) {
        ctx.fillStyle = '#ff3366';
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = 'rgba(255, 51, 102, 0.3)';
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y - camY, this.size + 3, 0, Math.PI * 2);
        ctx.fill();
    }

    move(dx, dy, maze) {
        if (maze.canMove(this.x, this.y, dx, dy, this.collisionRadius)) {
            this.x += dx;
            this.y += dy;
            if (gameMode === 'campaign') {
                gameState.playerX = this.x;
                gameState.playerY = this.y;
            }
        }
    }

    checkExit(maze) {
        const cellX = Math.floor(this.x / maze.cellSize);
        const cellY = Math.floor(this.y / maze.cellSize);
        return cellX === maze.exitX && cellY === maze.exitY;
    }
}

let maze, player;
let campaignMaze = null; // BSP maze for campaign mode
let teleportCooldown = 0; // Frames to wait before teleporting again

function startGame(mode, config = null) {
    gameMode = mode;
    document.getElementById('startMenu').classList.add('hidden');
    smoothCam.initialized = false;

    if (mode === 'campaign') {
        if (gameState.level > 8) gameState.level = 8;
        if (gameState.highestLevel > 8) gameState.highestLevel = 8;

        // Reset teleport cooldown
        teleportCooldown = 0;

        // Use BSP maze for campaign mode
        campaignMaze = new CampaignMaze(gameState.level, gameState.seed);
        maze = campaignMaze; // For compatibility

        const startPos = campaignMaze.getStartPosition();

        // Always start at the beginning of the maze for BSP campaigns
        // The old save position may not be valid for the new BSP structure
        player = new Player(startPos.x, startPos.y);
        gameState.playerX = startPos.x;
        gameState.playerY = startPos.y;
        saveGameState();
    } else {
        campaignMaze = null;
        quickMazeConfig = config;
        if (quickMazeConfig.level > 8) quickMazeConfig.level = 8;

        const mazeSize = 5 + quickMazeConfig.level * 15;
        maze = new Maze(mazeSize, mazeSize, quickMazeConfig.seed);
        player = new Player(maze.cellSize / 2, maze.cellSize / 2);
    }

    updateUI();
}

// Campaign menu handling
function updateCampaignMenu() {
    const continueBtn = document.getElementById('continueBtn');
    const savedLevelSpan = document.getElementById('savedLevel');
    const hasSavedProgress = gameState.level > 1 || gameState.highestLevel > 1;

    savedLevelSpan.textContent = gameState.level;

    if (hasSavedProgress) {
        continueBtn.disabled = false;
    } else {
        continueBtn.disabled = true;
    }
}

// Menu button handlers
document.getElementById('campaignBtn').addEventListener('click', () => {
    const controls = document.getElementById('campaignControls');
    const isVisible = controls.style.display !== 'none';

    if (isVisible) {
        controls.style.display = 'none';
    } else {
        controls.style.display = 'flex';
        updateCampaignMenu();
    }
});

document.getElementById('continueBtn').addEventListener('click', () => {
    if (gameState.level > 8) {
        gameState.level = 8;
        saveGameState();
    }
    startGame('campaign');
});

document.getElementById('newGameBtn').addEventListener('click', () => {
    const seed = parseInt(document.getElementById('quickSeed').value) || Date.now();
    gameState.level = 1;
    gameState.seed = seed;
    gameState.playerX = 0;
    gameState.playerY = 0;
    gameState.won = false;
    saveGameState();
    startGame('campaign');
});

document.getElementById('quickMazeBtn').addEventListener('click', () => {
    let level = parseInt(document.getElementById('quickLevel').value) || 1;
    const seed = parseInt(document.getElementById('quickSeed').value) || Date.now();
    
    level = Math.max(1, Math.min(8, level));
    document.getElementById('quickLevel').value = level;
    
    startGame('quick', { level, seed });
});

document.getElementById('quickLevel').addEventListener('input', (e) => {
    let value = parseInt(e.target.value);
    if (value > 8) {
        e.target.value = 8;
    } else if (value < 1) {
        e.target.value = 1;
    }
});

// Seed input
const seedInput = document.getElementById('seedInput');
seedInput.addEventListener('change', () => {
    const newSeed = parseInt(seedInput.value) || Date.now();

    if (gameMode === 'campaign') {
        gameState.seed = newSeed;
        campaignMaze = new CampaignMaze(gameState.level, gameState.seed);
        maze = campaignMaze;
        const startPos = campaignMaze.getStartPosition();
        player = new Player(startPos.x, startPos.y);
        gameState.playerX = startPos.x;
        gameState.playerY = startPos.y;
        saveGameState();
    } else {
        quickMazeConfig.seed = newSeed;
        const mazeSize = 5 + quickMazeConfig.level * 15;
        maze = new Maze(mazeSize, mazeSize, quickMazeConfig.seed);
        player = new Player(maze.cellSize / 2, maze.cellSize / 2);
    }

    updateUI();
});

// Button handlers
document.getElementById('resetBtn').addEventListener('click', resetCurrentMaze);
document.getElementById('menuBtn').addEventListener('click', returnToMenu);
document.getElementById('menuBtn2').addEventListener('click', returnToMenu);
document.getElementById('nextLevelBtn').addEventListener('click', () => {
    zoomAnimation.active = false;
    zoomAnimation.completed = false;
    smoothCam.initialized = false;
    if (gameMode === 'campaign') {
        if (gameState.level >= 8) {
            alert('Congratulations! You\'ve completed all 8 levels!\n\nStarting from Level 1 again...');
            gameState.level = 1;
        } else {
            gameState.level++;
        }

        gameState.won = false;

        if (gameState.level > gameState.highestLevel && gameState.level <= 8) {
            gameState.highestLevel = gameState.level;
        }

        document.getElementById('win').style.display = 'none';

        campaignMaze = new CampaignMaze(gameState.level, gameState.seed);
        maze = campaignMaze;
        const startPos = campaignMaze.getStartPosition();
        player = new Player(startPos.x, startPos.y);

        gameState.playerX = startPos.x;
        gameState.playerY = startPos.y;

        saveGameState();
        updateUI();
    } else {
        quickMazeConfig.seed = Date.now();
        gameState.won = false;
        document.getElementById('win').style.display = 'none';

        const mazeSize = 5 + quickMazeConfig.level * 15;
        maze = new Maze(mazeSize, mazeSize, quickMazeConfig.seed);
        player = new Player(maze.cellSize / 2, maze.cellSize / 2);

        updateUI();
    }
});

// Input handling
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' && gameState.won) {
        document.getElementById('nextLevelBtn').click();
    }
});
window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

// Mobile controls
function setupMobileControls() {
    const buttons = [
        { id: 'btnUp', key: 'arrowup' },
        { id: 'btnDown', key: 'arrowdown' },
        { id: 'btnLeft', key: 'arrowleft' },
        { id: 'btnRight', key: 'arrowright' }
    ];

    buttons.forEach(({ id, key }) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[key] = true;
        });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[key] = false;
        });
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            keys[key] = true;
        });
        btn.addEventListener('mouseup', (e) => {
            e.preventDefault();
            keys[key] = false;
        });
    });
}

setupMobileControls();

// Gyroscope control system
let gyroscopeMode = false;
let gyroscopeAvailable = false;
let gyroscopeInput = { x: 0, y: 0 }; // Tilt values (-1 to 1)
let gyroscopeOrientation = 'vertical'; // 'vertical' or 'horizontal'

// Detect if device is mobile and has gyroscope
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window) ||
           (navigator.maxTouchPoints > 0);
}

// Lock screen orientation to portrait
function lockOrientation() {
    if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('portrait').catch(() => {
            // Orientation lock not supported or failed - that's ok
        });
    }
}

// Request gyroscope permission (required on iOS 13+)
async function requestGyroscopePermission() {
    // Check if we need to request permission (iOS 13+)
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                return true;
            } else {
                // Permission denied - show instructions to reset
                alert(
                    'Gyroscope permission was denied.\n\n' +
                    'To reset and try again:\n' +
                    '1. Go to Settings > Safari\n' +
                    '2. Scroll down and tap "Clear History and Website Data"\n' +
                    '   OR go to Settings > Safari > Advanced > Website Data and remove this site\n' +
                    '3. Reload this page and try again'
                );
                return false;
            }
        } catch (e) {
            console.error('Gyroscope permission request failed:', e);
            // This can happen if not on HTTPS or other issues
            alert(
                'Could not request gyroscope permission.\n\n' +
                'Make sure you are accessing this page via HTTPS.\n' +
                'Error: ' + e.message
            );
            return false;
        }
    }
    return true; // Permission not required on this device (Android, etc.)
}

// Handle device orientation for gyroscope input
function handleDeviceOrientation(event) {
    if (!gyroscopeMode || movementMode !== 'ball') return;

    // beta: front-to-back tilt (-180 to 180, 0 when vertical, 90 when flat)
    // gamma: left-to-right tilt (-90 to 90, 0 when flat)
    const beta = event.beta || 0;  // Tilt forward/backward
    const gamma = event.gamma || 0; // Tilt left/right

    // Sensitivity thresholds and max tilt
    const deadzone = 5; // Degrees of deadzone
    const maxTilt = 30; // Maximum tilt angle for full speed

    // Neutral position based on orientation mode:
    // - Vertical: phone screen facing user (beta ~45)
    // - Horizontal: phone screen facing up/ceiling (beta ~0)
    const neutralBeta = gyroscopeOrientation === 'horizontal' ? 0 : 45;
    const tiltForwardBack = beta - neutralBeta; // Positive = tilted back, negative = tilted forward

    // Apply deadzone and normalize to -1 to 1
    let normalizedY = 0;
    if (Math.abs(tiltForwardBack) > deadzone) {
        normalizedY = Math.max(-1, Math.min(1, (tiltForwardBack - Math.sign(tiltForwardBack) * deadzone) / maxTilt));
    }

    let normalizedX = 0;
    if (Math.abs(gamma) > deadzone) {
        normalizedX = Math.max(-1, Math.min(1, (gamma - Math.sign(gamma) * deadzone) / maxTilt));
    }

    gyroscopeInput.x = normalizedX;
    gyroscopeInput.y = normalizedY;
}

// Initialize gyroscope system
async function initGyroscope() {
    if (!isMobileDevice()) {
        console.log('Not a mobile device, gyroscope disabled');
        return;
    }

    // Check if DeviceOrientationEvent is available
    if (typeof DeviceOrientationEvent === 'undefined') {
        console.log('DeviceOrientationEvent not available');
        return;
    }

    // Show gyroscope toggle option
    document.getElementById('gyroscopeToggle').style.display = 'flex';

    // Lock orientation
    lockOrientation();

    gyroscopeAvailable = true;
}

// Gyroscope toggle button handlers
function enableGyroscope() {
    gyroscopeMode = true;
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    document.getElementById('gyroOnBtn').classList.add('active');
    document.getElementById('gyroOffBtn').classList.remove('active');

    // Show orientation toggle when gyroscope is active
    document.getElementById('gyroOrientationToggle').style.display = 'flex';

    // Hide D-pad when gyroscope is active
    document.getElementById('mobileControls').style.display = 'none';

    // Lock orientation when gyroscope is enabled
    lockOrientation();
}

function disableGyroscope() {
    gyroscopeMode = false;
    window.removeEventListener('deviceorientation', handleDeviceOrientation);
    gyroscopeInput = { x: 0, y: 0 };

    document.getElementById('gyroOffBtn').classList.add('active');
    document.getElementById('gyroOnBtn').classList.remove('active');

    // Hide orientation toggle when gyroscope is disabled
    document.getElementById('gyroOrientationToggle').style.display = 'none';

    // Show D-pad again on mobile
    if (isMobileDevice()) {
        document.getElementById('mobileControls').style.display = 'block';
    }
}

document.getElementById('gyroOnBtn').addEventListener('click', function() {
    if (!gyroscopeAvailable) return;

    // iOS 13+ requires permission request directly in user gesture handler
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {

        // Call requestPermission directly (not through async wrapper)
        DeviceOrientationEvent.requestPermission()
            .then(function(permission) {
                if (permission === 'granted') {
                    activateGyroscope();
                } else {
                    alert(
                        'Gyroscope permission was denied.\n\n' +
                        'To reset and try again:\n' +
                        '1. Close Safari completely (swipe up from app switcher)\n' +
                        '2. Settings > Safari > Advanced > Website Data\n' +
                        '3. Find and delete this site\'s data\n' +
                        '4. Reopen Safari and try again'
                    );
                }
            })
            .catch(function(e) {
                alert(
                    'Could not request gyroscope permission.\n\n' +
                    'Make sure:\n' +
                    '1. You are using HTTPS (check URL starts with https://)\n' +
                    '2. Settings > Safari > Motion & Orientation Access is ON\n\n' +
                    'Error: ' + e.message
                );
            });
    } else {
        // Android or older iOS - no permission needed
        activateGyroscope();
    }
});

function activateGyroscope() {
    // Auto-switch to Move Ball mode since gyroscope only works there
    if (movementMode !== 'ball') {
        movementMode = 'ball';
        document.getElementById('moveBallBtn').classList.add('active');
        document.getElementById('moveMazeBtn').classList.remove('active');
        if (gameMode === 'campaign') {
            gameState.movementMode = movementMode;
            saveGameState();
        }
    }
    enableGyroscope();
}

document.getElementById('gyroOffBtn').addEventListener('click', () => {
    disableGyroscope();
});

// Gyroscope orientation toggle handlers
document.getElementById('gyroVerticalBtn').addEventListener('click', () => {
    gyroscopeOrientation = 'vertical';
    document.getElementById('gyroVerticalBtn').classList.add('active');
    document.getElementById('gyroHorizontalBtn').classList.remove('active');
});

document.getElementById('gyroHorizontalBtn').addEventListener('click', () => {
    gyroscopeOrientation = 'horizontal';
    document.getElementById('gyroHorizontalBtn').classList.add('active');
    document.getElementById('gyroVerticalBtn').classList.remove('active');
});

// Initialize gyroscope on load
initGyroscope();

function updateUI() {
    if (gameMode === 'campaign') {
        document.getElementById('modeDisplay').textContent = 'Campaign';
        document.getElementById('level').textContent = gameState.level;
        document.getElementById('seedInput').value = gameState.seed;
    } else {
        document.getElementById('modeDisplay').textContent = 'Quick Maze';
        document.getElementById('level').textContent = quickMazeConfig.level;
        document.getElementById('seedInput').value = quickMazeConfig.seed;
    }
}

// Auto-save
let saveTimer = 0;
function autoSave() {
    if (gameMode === 'campaign') {
        saveTimer++;
        if (saveTimer > 60) {
            saveGameState();
            saveTimer = 0;
        }
    }
}

// Game loop
function gameLoop() {
    animateDecorativeMazes();
    
    if (!document.getElementById('startMenu').classList.contains('hidden') || !maze || !player) {
        requestAnimationFrame(gameLoop);
        return;
    }
    
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let camX, camY;

    if (movementMode === 'maze') {
        // Move Maze mode: camera follows player (current behavior)
        camX = player.x - canvas.width / 2;
        camY = player.y - canvas.height / 2;
    } else {
        // Move Ball mode: camera centers on current region/corridor
        if (gameMode === 'campaign' && campaignMaze) {
            // Use the campaign maze's camera method for region-based centering
            const cam = campaignMaze.getCameraForMoveBallMode(canvas);

            // Initialize smooth camera on first frame
            if (!smoothCam.initialized) {
                smoothCam.x = cam.camX;
                smoothCam.y = cam.camY;
                smoothCam.zoom = cam.zoom;
                smoothCam.initialized = true;
            }

            // Smoothly interpolate camera position and zoom
            smoothCam.x += (cam.camX - smoothCam.x) * smoothCam.lerpFactor;
            smoothCam.y += (cam.camY - smoothCam.y) * smoothCam.lerpFactor;
            smoothCam.zoom += (cam.zoom - smoothCam.zoom) * smoothCam.lerpFactor;

            camX = smoothCam.x;
            camY = smoothCam.y;
        } else {
            // Quick maze mode: center the whole maze
            const mazeWidth = maze.cols * maze.cellSize;
            const mazeHeight = maze.rows * maze.cellSize;

            camX = (mazeWidth - canvas.width) / 2;
            camY = (mazeHeight - canvas.height) / 2;

            if (mazeWidth < canvas.width) {
                camX = -((canvas.width - mazeWidth) / 2);
            }
            if (mazeHeight < canvas.height) {
                camY = -((canvas.height - mazeHeight) / 2);
            }
        }
    }

    if (!gameState.won) {
        let dx = 0, dy = 0;

        // Gyroscope input (only in move ball mode)
        if (gyroscopeMode && movementMode === 'ball') {
            dx = gyroscopeInput.x * player.speed;
            dy = gyroscopeInput.y * player.speed;
        } else {
            // Keyboard/touch input
            if (keys['arrowup'] || keys['w']) dy -= player.speed;
            if (keys['arrowdown'] || keys['s']) dy += player.speed;
            if (keys['arrowleft'] || keys['a']) dx -= player.speed;
            if (keys['arrowright'] || keys['d']) dx += player.speed;
        }

        if (dx !== 0) player.move(dx, 0, maze);
        if (dy !== 0) player.move(0, dy, maze);

        // Check discovery for campaign mode
        if (gameMode === 'campaign' && campaignMaze) {
            campaignMaze.checkDiscovery(player.x, player.y);

            // Check teleport (with cooldown to prevent rapid re-teleporting)
            if (teleportCooldown > 0) {
                teleportCooldown--;
            } else {
                const teleportDest = campaignMaze.checkTeleport(player.x, player.y);
                if (teleportDest) {
                    player.x = teleportDest.x;
                    player.y = teleportDest.y;
                    gameState.playerX = player.x;
                    gameState.playerY = player.y;
                    teleportCooldown = 60; // ~1 second cooldown at 60fps
                }
            }
        }

        // Check win condition
        let hasWon = false;
        if (gameMode === 'campaign' && campaignMaze) {
            hasWon = campaignMaze.checkWin(player.x, player.y);
        } else {
            hasWon = player.checkExit(maze);
        }

        if (hasWon) {
            gameState.won = true;
            if (gameMode === 'campaign') {
                saveGameState();
                // Start zoom-out animation for campaign mode
                const mazeWidth = campaignMaze.cols * campaignMaze.cellSize;
                const mazeHeight = campaignMaze.rows * campaignMaze.cellSize;
                const scaleX = canvas.width / mazeWidth;
                const scaleY = canvas.height / mazeHeight;
                zoomAnimation.targetZoom = Math.min(scaleX, scaleY) * 0.9; // 90% to add some margin
                zoomAnimation.startZoom = 1;
                zoomAnimation.progress = 0;
                zoomAnimation.startCamX = camX;
                zoomAnimation.startCamY = camY;
                zoomAnimation.active = true;
            } else {
                // Quick mode: show win message immediately
                document.getElementById('win').style.display = 'block';
            }
        }

        autoSave();
    }

    // Handle zoom-out animation and static zoomed view for campaign mode completion
    if ((zoomAnimation.active || zoomAnimation.completed) && gameMode === 'campaign' && campaignMaze) {
        let currentZoom;
        let animCamX, animCamY;

        const mazeWidth = campaignMaze.cols * campaignMaze.cellSize;
        const mazeHeight = campaignMaze.rows * campaignMaze.cellSize;

        if (zoomAnimation.active) {
            zoomAnimation.progress++;

            // Easing function for smooth animation
            const t = Math.min(zoomAnimation.progress / zoomAnimation.duration, 1);
            const easeOut = 1 - Math.pow(1 - t, 3); // Cubic ease-out

            // Interpolate zoom level
            currentZoom = zoomAnimation.startZoom + (zoomAnimation.targetZoom - zoomAnimation.startZoom) * easeOut;

            // Calculate target camera position to center the entire maze
            const targetCamX = (mazeWidth - canvas.width / currentZoom) / 2;
            const targetCamY = (mazeHeight - canvas.height / currentZoom) / 2;

            // Interpolate camera position
            animCamX = zoomAnimation.startCamX + (targetCamX - zoomAnimation.startCamX) * easeOut;
            animCamY = zoomAnimation.startCamY + (targetCamY - zoomAnimation.startCamY) * easeOut;

            // Check if animation is complete
            if (zoomAnimation.progress >= zoomAnimation.duration) {
                zoomAnimation.active = false;
                zoomAnimation.completed = true;
                document.getElementById('win').style.display = 'block';
            }
        } else {
            // Static zoomed-out view after animation completes
            currentZoom = zoomAnimation.targetZoom;
            animCamX = (mazeWidth - canvas.width / currentZoom) / 2;
            animCamY = (mazeHeight - canvas.height / currentZoom) / 2;
        }

        // Apply zoom transform
        ctx.save();
        ctx.scale(currentZoom, currentZoom);

        // Create scaled canvas dimensions for proper culling
        const scaledCanvas = {
            width: canvas.width / currentZoom,
            height: canvas.height / currentZoom
        };

        // Draw with animated camera and scaled dimensions
        campaignMaze.draw(animCamX, animCamY, ctx, scaledCanvas);
        player.draw(animCamX, animCamY);

        ctx.restore();
    } else {
        // Normal drawing (no zoom animation)
        // Apply zoom for move ball mode in campaign when region doesn't fit screen
        const needsZoom = gameMode === 'campaign' && movementMode === 'ball' && smoothCam.zoom < 1;

        if (needsZoom) {
            ctx.save();
            ctx.scale(smoothCam.zoom, smoothCam.zoom);

            const scaledCanvas = {
                width: canvas.width / smoothCam.zoom,
                height: canvas.height / smoothCam.zoom
            };

            campaignMaze.draw(camX, camY, ctx, scaledCanvas);
            player.draw(camX, camY);
            ctx.restore();
        } else if (gameMode === 'campaign' && campaignMaze) {
            campaignMaze.draw(camX, camY, ctx, canvas);
            player.draw(camX, camY);
        } else {
            maze.draw(camX, camY);
            player.draw(camX, camY);
        }
    }

    requestAnimationFrame(gameLoop);
}

updateUI();
gameLoop();

window.addEventListener('beforeunload', () => {
    if (gameMode === 'campaign') saveGameState();
});

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
