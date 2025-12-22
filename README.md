# Maze Explorer

A browser-based maze exploration game with two game modes and multiple difficulty levels.

## Game Modes

### Campaign Mode
Progress through increasingly challenging levels. The game uses **Binary Space Partitioning (BSP)** to generate complex multi-region mazes:

- **Level 1**: 2 BSP splits (2-4 mini-mazes)
- **Level 2**: 3 BSP splits (3-8 mini-mazes)
- **Level 3**: 4 BSP splits (4-16 mini-mazes)
- And so on...

Each level features:
- Multiple interconnected mini-mazes with unique colors
- Corridors connecting adjacent regions
- Progressive discovery - undiscovered regions appear darkened
- Increasing map size with each level

### Quick Maze Mode
Generate a single maze with custom parameters:
- **Level (1-8)**: Controls maze complexity and size
- **Seed**: Reproducible maze generation

## Controls

- **Arrow Keys** or **WASD**: Move player
- **Space**: Proceed to next level (after winning)
- **Mobile**: On-screen D-pad

## Movement Modes

- **Move Maze**: Camera follows the player (default)
- **Move Ball**: Camera stays centered, player moves visually

## Features

- **Auto-save**: Campaign progress is automatically saved
- **Seeded generation**: Share seeds to replay the same mazes
- **Responsive design**: Works on desktop and mobile devices
- **Decorative animations**: Animated maze generation on the start menu

## File Structure

```
maze-explorer2/
├── index.html      # Main HTML structure
├── styles.css      # All styling
├── script.js       # Core game logic (player, rendering, UI)
└── campaign.js     # Campaign mode with BSP maze generation
```

## Technical Details

### Maze Generation

**Quick Maze**: Uses recursive backtracking (depth-first search) to generate perfect mazes.

**Campaign Mode (BSP)**:
1. Space is recursively divided using Binary Space Partitioning
2. Each leaf region is shrunk to create corridor space
3. Individual mini-mazes are generated within each region
4. Corridors connect adjacent regions at their boundaries
5. Player must navigate through all regions to reach the final exit

### Collision Detection

The player is represented as a circle with radius-based collision detection against maze walls using circle-line intersection tests.

## Browser Support

Modern browsers with ES6+ support (Chrome, Firefox, Safari, Edge).
