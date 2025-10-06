const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Game mode
let gameMode = 'campaign';
let quickMazeConfig = { level: 1, seed: 12345 };

// Storage key
const SAVE_KEY = 'mazeExplorerSave';

// Load or initialize game state
function loadGameState() {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
        try {
            const state = JSON.parse(saved);
            state.won = false;
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
        highestLevel: 1
    };
}

function saveGameState() {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
    } catch (e) {
        console.error('Failed to save game:', e);
    }
}

function resetCurrentMaze() {
    if (gameMode === 'campaign') {
        if (confirm('Reset current maze?')) {
            const mazeSize = 5 + gameState.level * 15;
            maze = new Maze(mazeSize, mazeSize, gameState.seed);
            player = new Player(maze.cellSize / 2, maze.cellSize / 2);
            gameState.playerX = maze.cellSize / 2;
            gameState.playerY = maze.cellSize / 2;
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
    document.getElementById('startMenu').classList.remove('hidden');
    document.getElementById('win').style.display = 'none';
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

    canMove(x, y, dx, dy) {
        const cellX = Math.floor(x / this.cellSize);
        const cellY = Math.floor(y / this.cellSize);
        const newX = x + dx;
        const newY = y + dy;
        const newCellX = Math.floor(newX / this.cellSize);
        const newCellY = Math.floor(newY / this.cellSize);

        if (newCellX < 0 || newCellX >= this.cols || newCellY < 0 || newCellY >= this.rows) {
            return false;
        }

        if (cellX !== newCellX || cellY !== newCellY) {
            if (newCellX > cellX && this.grid[cellY][cellX].walls.right) return false;
            if (newCellX < cellX && this.grid[cellY][cellX].walls.left) return false;
            if (newCellY > cellY && this.grid[cellY][cellX].walls.bottom) return false;
            if (newCellY < cellY && this.grid[cellY][cellX].walls.top) return false;
        }

        return true;
    }
}

// Player
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 6;
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
        if (maze.canMove(this.x, this.y, dx, dy)) {
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

function startGame(mode, config = null) {
    gameMode = mode;
    document.getElementById('startMenu').classList.add('hidden');
    
    if (mode === 'campaign') {
        if (gameState.level > 8) gameState.level = 8;
        if (gameState.highestLevel > 8) gameState.highestLevel = 8;
        
        const mazeSize = 5 + gameState.level * 15;
        maze = new Maze(mazeSize, mazeSize, gameState.seed);
        
        const startX = maze.cellSize / 2;
        const startY = maze.cellSize / 2;
        
        let validX = gameState.playerX || startX;
        let validY = gameState.playerY || startY;
        
        player = new Player(validX, validY);
    } else {
        quickMazeConfig = config;
        if (quickMazeConfig.level > 8) quickMazeConfig.level = 8;
        
        const mazeSize = 5 + quickMazeConfig.level * 15;
        maze = new Maze(mazeSize, mazeSize, quickMazeConfig.seed);
        player = new Player(maze.cellSize / 2, maze.cellSize / 2);
    }
    
    updateUI();
}

// Menu button handlers
document.getElementById('campaignBtn').addEventListener('click', () => {
    if (gameState.level > 8) {
        gameState.level = 8;
        saveGameState();
    }
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
        const mazeSize = 5 + gameState.level * 15;
        maze = new Maze(mazeSize, mazeSize, gameState.seed);
        player = new Player(maze.cellSize / 2, maze.cellSize / 2);
        gameState.playerX = maze.cellSize / 2;
        gameState.playerY = maze.cellSize / 2;
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
    if (gameMode === 'campaign') {
        if (gameState.level >= 8) {
            alert('🎉 Congratulations! You\'ve completed all 8 levels!\n\nStarting from Level 1 again...');
            gameState.level = 1;
        } else {
            gameState.level++;
        }
        
        gameState.seed = Date.now();
        gameState.won = false;
        
        if (gameState.level > gameState.highestLevel && gameState.level <= 8) {
            gameState.highestLevel = gameState.level;
        }
        
        document.getElementById('win').style.display = 'none';
        
        const mazeSize = 5 + gameState.level * 15;
        maze = new Maze(mazeSize, mazeSize, gameState.seed);
        player = new Player(maze.cellSize / 2, maze.cellSize / 2);
        
        gameState.playerX = maze.cellSize / 2;
        gameState.playerY = maze.cellSize / 2;
        
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

    const camX = player.x - canvas.width / 2;
    const camY = player.y - canvas.height / 2;

    if (!gameState.won) {
        let dx = 0, dy = 0;
        if (keys['arrowup'] || keys['w']) dy -= player.speed;
        if (keys['arrowdown'] || keys['s']) dy += player.speed;
        if (keys['arrowleft'] || keys['a']) dx -= player.speed;
        if (keys['arrowright'] || keys['d']) dx += player.speed;
        
        if (dx !== 0) player.move(dx, 0, maze);
        if (dy !== 0) player.move(0, dy, maze);

        if (player.checkExit(maze)) {
            gameState.won = true;
            if (gameMode === 'campaign') {
                saveGameState();
            }
            document.getElementById('win').style.display = 'block';
        }

        autoSave();
    }

    maze.draw(camX, camY);
    player.draw(camX, camY);

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
