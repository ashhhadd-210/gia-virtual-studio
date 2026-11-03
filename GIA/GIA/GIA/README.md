# GIA Showroom

GIA is a luxury indoor showroom walkthrough built with Babylon.js, Vite, and Howler.js.

It includes:

- A full-screen loading overlay with progress
- Device-aware loading and streaming behavior
- Mouse-guided desktop navigation and mobile touch controls
- Zone-based background audio for the main hall, corridor, and showcase areas
- Production-ready static build output

## Requirements

- Node.js 18 or newer
- npm

## Getting Started

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

Vite will print the local URL in the terminal, usually:

```text
http://localhost:5173
```

If you want to open the project from another device on the same network:

```bash
npm run dev -- --host 0.0.0.0
```

## Production Build

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Controls

### Desktop

- Move the mouse over an item to inspect it
- Click a mannequin, bag, or shoe to focus it
- Click the open floor to fly to that position
- While focused on an item, move the mouse to orbit and tilt
- Use the mouse wheel to change focus distance
- Click the floor or background to exit focus
- Click and hold the bottom-left or bottom-right corner to rotate in place

### Mobile / Touch

- Tap a mannequin, bag, or shoe to focus it
- Tap the open floor to fly to that position
- Tap the background while focused to exit focus
- Drag while focused on an item to orbit it
- Use the left joystick to move in browse mode
- Drag on the right side of the screen to look around while browsing

## Audio

The showroom uses Howler.js for playback and procedural sound generation for movement, focus, ambient layers, and zone-based background music.

Current audio behavior includes:

- Main hall background synth
- Corridor-specific background synth with a different melodic identity
- Shop/showcase upbeat layer
- Click, movement, flight, and focus accents

## Scripts

Available npm scripts:

```bash
npm run dev
npm run build
npm run preview
npm run optimize:showroom-accessories
npm run optimize:mannequins
npm run optimize:accessories-inplace
```

## Deployment

The app builds into `dist/` and can be deployed to any static hosting provider that supports a single-page app setup.

Recommended deployment behavior:

- Run `npm run build` during production builds
- Serve files from `dist`
- Rewrite non-asset routes to `index.html`
- Cache generated static assets such as `.glb`, `.webp`, fonts, and other build artifacts aggressively
- Serve `sw.js` with no-cache headers so service worker updates can refresh correctly

## Project Structure

Main folders and files:

- `src/main.js` - Babylon engine, scene startup, loading flow, and service worker registration
- `src/ShowroomWorld.js` - showroom scene content, models, layout, and materials
- `src/FirstPersonController.js` - desktop and mobile navigation logic
- `src/AudioManager.js` - all audio playback and procedural sound design
- `src/loadingScreen.js` - loading orchestration and progress reporting
- `ASSETS/` - models, generated textures, fonts, and other runtime assets
- `scripts/` - asset generation and optimization helpers

## Notes

- The loading system is designed to prepare as much of the showroom as possible before gameplay starts.
- Build output is generated into `dist/`.

