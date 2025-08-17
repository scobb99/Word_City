import React, { useEffect, useRef, useState } from 'react';
import {
  Application,
  Container,
  Graphics,
  Texture,
  Sprite,
  RenderTexture,
  Rectangle,
} from 'pixi.js';
import { grassG, forestG, hillG, marshG, thicketG, waterG, roadG, bridgeG } from './textures';

type Biome = 'meadow' | 'forest' | 'hill' | 'marsh' | 'thicket';
type Structure = { id: string; level: number; icon: string; w: number; h: number; anchor: boolean; origin: number };
type Tile = { terrain: 'grass'|'water'|'road'|'bridge'; biome: Biome; structure?: Structure };

type Props = {
  tiles: Tile[];
  size: number;        // grid dimension (e.g., 54)
  tileSize?: number;   // tile pixels (e.g., 28)
  ghost?: number[] | null;
  onClick?(idx: number): void;
  onDrag?(idx: number): void;
};

/* Simple cozy-fantasy building painter */
function paintBuilding(id:string, wpx:number, hpx:number): Graphics {
  const g = new Graphics();
  // Base body
  const body = 0x3b2f2f;
  const stroke = 0x1e1b1b;
  g.roundRect(2, 6, wpx-4, hpx-8, 6).fill(body).stroke({ color: stroke, width: 2, alpha: 0.5 });

  const roof = (c:number)=> g.poly([2,6, wpx-2,6, wpx-8,0, 8,0]).fill(c);
  const stripe = (x:number,w:number,c:number)=> g.rect(x, 6, w, 10).fill(c);
  const windowRect = (x:number,y:number)=> g.roundRect(x,y,8,10,2).fill(0xe6f0ff).stroke({color:0x2a2a2a, width:1, alpha:0.6});
  const post = (x:number)=> g.rect(x, hpx-10, 4, 10).fill(0x6b4e31);

  switch(id){
    case 'cottage':
      roof(0xb56539);
      windowRect(10, Math.max(12, hpx/2 - 6));
      windowRect(Math.max(20, wpx-20), Math.max(12, hpx/2 - 6));
      break;
    case 'sawmill':
      roof(0x8b5a2b);
      // saw blade
      g.circle(wpx*0.7, hpx*0.6, 8).fill(0xdddddd).stroke({ color:0x666666, width:2 });
      // planks
      for (let x=10; x<wpx-10; x+=8) g.rect(x, hpx-18, 6, 10).fill(0x7a5a3c);
      break;
    case 'quarry':
      roof(0x707070);
      // stone chunks
      for (let i=0;i<6;i++){
        const rx = 8 + Math.random()*(wpx-24);
        const ry = 12 + Math.random()*(hpx-28);
        g.roundRect(rx, ry, 10, 8, 2).fill(0x9a9a9a).stroke({ color:0x5a5a5a, width:1, alpha:0.6 });
      }
      break;
    case 'market':
      // striped awning
      const cols = [0xf4a261, 0xfef3c7];
      const stripeW = Math.max(10, Math.floor(wpx/6));
      for (let x=2, i=0; x<wpx-2; x+=stripeW, i++){
        stripe(x, Math.min(stripeW, wpx-2-x), cols[i%2]);
      }
      g.roundRect(2, 18, wpx-4, hpx-20, 4).fill(0x8b3f2b);
      break;
    case 'library':
      roof(0x6a7bb6);
      // columns
      const colW = 6, gap = 10; let cx = 10;
      for (; cx < wpx-10-colW; cx += gap) g.roundRect(cx, 14, colW, hpx-22, 2).fill(0xdedede);
      // door
      g.roundRect(Math.max(10, wpx/2-6), hpx-24, 12, 20, 3).fill(0x333333);
      break;
    case 'pier':
      // deck
      g.roundRect(0, hpx*0.25, wpx, hpx*0.5, 4).fill(0x8b6b4a);
      post(6); post(wpx-10);
      break;
    default:
      roof(0x8b5a2b);
  }
  return g;
}

export default function MapView({ tiles, size, tileSize = 28, ghost, onClick, onDrag }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const layersRef = useRef<{ base: Container; roads: Container; structs: Container; ghost: Container } | null>(null);
  const texRef = useRef<{ [k: string]: Texture } | null>(null);
  const dragging = useRef<{ down: boolean; lx: number; ly: number }>({ down: false, lx: 0, ly: 0 });
  const [readyBump, setReadyBump] = useState(0); // triggers redraw after textures build

  // Mount & init (Pixi v8) with WebGL + manual resize (stable)
  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let cancelled = false;

    (async () => {
      const host = hostRef.current;
      if (!host) return;

      const app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        preference: 'webgl',     // stay on WebGL to avoid GPU flicker on some Macs
        width: 300,
        height: 300,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });
      if (cancelled) { app.destroy(true); return; }

      appRef.current = app;
      host.innerHTML = '';
      host.appendChild(app.canvas);
      console.log('MapView v8 (webgl) stable');

      const world = new Container();
      world.eventMode = 'static';

      const base = new Container();
      const roads = new Container();
      const structs = new Container();
      const ghostL = new Container();
      world.addChild(base, roads, structs, ghostL);
      app.stage.addChild(world);

      // hit area covers whole grid for reliable pointer hits
      const gridW = size * tileSize;
      const gridH = size * tileSize;
      world.hitArea = new Rectangle(0, 0, gridW, gridH);

      // ---- Pan & zoom
      world.on('pointerdown', (e: any) => { dragging.current.down = true; dragging.current.lx = e.global.x; dragging.current.ly = e.global.y; });
      world.on('pointerup', () => { dragging.current.down = false; });
      world.on('pointerupoutside', () => { dragging.current.down = false; });
      world.on('globalpointermove', (e: any) => {
        if (!dragging.current.down) return;
        const dx = e.global.x - dragging.current.lx;
        const dy = e.global.y - dragging.current.ly;
        world.x += dx; world.y += dy;
        dragging.current.lx = e.global.x; dragging.current.ly = e.global.y;
      });

      let scale = 1;
      app.canvas.addEventListener('wheel', (ev: WheelEvent) => {
        const delta = Math.sign(ev.deltaY) * -0.1;
        scale = Math.min(2.5, Math.max(0.5, scale + delta));
        world.scale.set(scale);
      }, { passive: true });

      // ---- Tile clicks / drag-paint
      world.on('pointertap', (e: any) => {
        const p = world.toLocal(e.global);
        const x = Math.floor(p.x / tileSize), y = Math.floor(p.y / tileSize);
        if (x>=0 && y>=0 && x<size && y<size) onClick?.(y*size + x);
      });
      world.on('pointermove', (e: any) => {
        if (!onDrag || !dragging.current.down) return;
        const p = world.toLocal(e.global);
        const x = Math.floor(p.x / tileSize), y = Math.floor(p.y / tileSize);
        if (x>=0 && y>=0 && x<size && y<size) onDrag(y*size + x);
      });

      layersRef.current = { base, roads, structs, ghost: ghostL };

      // ---- Build tile textures AFTER app exists (v8 render API)
      if (!texRef.current) {
        const make = (gf: (size?: number) => Graphics) => {
          const g = gf(tileSize);
          const rt = RenderTexture.create({
            width: tileSize,
            height: tileSize,
            // @ts-ignore: resolution exists at runtime
            resolution: (app.renderer as any).resolution || 1,
          });
          app.renderer.render({ container: g, target: rt, clear: true });
          g.destroy(true);
          return rt as Texture;
        };

        texRef.current = {
          meadow: make(grassG),
          forest: make(forestG),
          hill:   make(hillG),
          marsh:  make(marshG),
          thicket:make(thicketG),
          water:  make(waterG),
          road:   make(roadG),
          bridge: make(bridgeG),
        };

        setReadyBump(v => v + 1); // trigger draw effect
      }

      // ---- Manual resize only when the host actually changes size (avoids flicker)
      const fit = () => {
        const w = host.clientWidth || 300;
        const h = host.clientHeight || 300;
        const r: any = app.renderer as any;
        try { r.resize({ width: w, height: h }); } catch { r.resize(w, h); }
      };
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(host);
    })();

    return () => {
      ro?.disconnect();
      if (appRef.current) appRef.current.destroy(true);
      appRef.current = null;
      layersRef.current = null;
      texRef.current = null;
    };
  }, [size, tileSize, onClick, onDrag]);

  // Draw (or redraw)
  useEffect(() => {
    const app = appRef.current;
    const layers = layersRef.current;
    const T = texRef.current;
    if (!app || !layers || !T) return;

    const { base, roads, structs, ghost: ghostL } = layers;
    base.removeChildren(); roads.removeChildren(); structs.removeChildren(); ghostL.removeChildren();

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const x = (i % size) * tileSize;
      const y = Math.floor(i / size) * tileSize;

      // biome tile
      const bg = new Sprite(T[t.biome] || T.meadow);
      bg.x = x; bg.y = y; base.addChild(bg);

      // overlays
      if (t.terrain === 'water')      { const w = new Sprite(T.water);  w.x=x; w.y=y; base.addChild(w); }
      else if (t.terrain === 'road')  { const r = new Sprite(T.road);   r.x=x; r.y=y; roads.addChild(r); }
      else if (t.terrain === 'bridge'){ const b = new Sprite(T.bridge); b.x=x; b.y=y; roads.addChild(b); }
    }

    // Draw buildings once from their anchor tile as a single piece
    for (let i = 0; i < tiles.length; i++){
      const t = tiles[i]; if (!t.structure || !t.structure.anchor) continue;
      const x = (i % size) * tileSize;
      const y = Math.floor(i / size) * tileSize;
      const wpx = t.structure.w * tileSize;
      const hpx = t.structure.h * tileSize;
      const b = paintBuilding(t.structure.id, wpx, hpx);
      b.position.set(x, y);
      layers.structs.addChild(b);
    }

    if (ghost && ghost.length) {
      ghost.forEach((ii) => {
        const x = (ii % size) * tileSize, y = Math.floor(ii / size) * tileSize;
        const g = new Graphics()
          .roundRect(x + 1, y + 1, tileSize - 2, tileSize - 2, 6)
          .fill({ color: 0x69d6a6, alpha: 0.25 })
          .stroke({ color: 0x69d6a6, width: 2, alpha: 0.4 });
        layers.ghost.addChild(g);
      });
    }
  }, [tiles, size, tileSize, ghost, readyBump]);

  // Host fills its parent; parent height is set in App.tsx
  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
