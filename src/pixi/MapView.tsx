import React, { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Texture, Sprite, RenderTexture } from 'pixi.js';
import { grassG, forestG, hillG, marshG, thicketG, waterG, roadG, bridgeG } from './textures';

type Biome = 'meadow'|'forest'|'hill'|'marsh'|'thicket';
type Tile = { terrain: 'grass'|'water'|'road'|'bridge'; biome: Biome; structure?: { id:string; level:number; icon:string; shape?:Array<[number,number]> } };

type Props = {
  tiles: Tile[];
  size: number;            // grid dimension (e.g., 54)
  tileSize?: number;       // pixel size of a tile (world scale), e.g., 28
  ghost?: number[]|null;
  onClick?(idx:number): void;
  onDrag?(idx:number): void;
};

export default function MapView({ tiles, size, tileSize = 28, ghost, onClick, onDrag }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application|null>(null);
  const layersRef = useRef<{base:Container; roads:Container; structs:Container; ghost:Container}|null>(null);
  const texRef = useRef<{[k:string]:Texture}|null>(null);
  const dragging = useRef<{down:boolean; lx:number; ly:number}>({ down:false, lx:0, ly:0 });

  // mount app (Pixi v8) and keep canvas sized to host
  useEffect(() => {
    let app: Application | null = null;
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    (async () => {
      const host = hostRef.current!;
      app = new Application();
      await app.init({
        backgroundAlpha: 0,
        antialias: true,
        // start with something; we immediately resize to host below
        width: 300, height: 300,
      });
      if (cancelled) { app.destroy(true); return; }

      appRef.current = app;
      host.innerHTML = '';
      host.appendChild(app.canvas);

      const world = new Container(); world.eventMode = 'static';
      const base = new Container(); const roads = new Container(); const structs = new Container(); const ghostL = new Container();
      world.addChild(base, roads, structs, ghostL);
      app.stage.addChild(world);

      // ----- pan & zoom -----
      let scale = 1;
      world.on('pointerdown', (e:any) => { dragging.current.down = true; dragging.current.lx = e.global.x; dragging.current.ly = e.global.y; });
      world.on('pointerup',   () => { dragging.current.down = false; });
      world.on('pointerupoutside', () => { dragging.current.down = false; });
      world.on('globalpointermove', (e:any) => {
        if (!dragging.current.down) return;
        const dx = e.global.x - dragging.current.lx;
        const dy = e.global.y - dragging.current.ly;
        world.x += dx; world.y += dy;
        dragging.current.lx = e.global.x; dragging.current.ly = e.global.y;
      });
      app.canvas.addEventListener('wheel', (ev: WheelEvent) => {
        const delta = Math.sign(ev.deltaY) * -0.1;
        scale = Math.min(2.5, Math.max(0.5, scale + delta));
        world.scale.set(scale);
      }, { passive: true });

      // clicks -> tile index
      world.on('pointertap', (e:any) => {
        const p = world.toLocal(e.global);
        const x = Math.floor(p.x / tileSize), y = Math.floor(p.y / tileSize);
        if (x>=0 && y>=0 && x<size && y<size) onClick?.(y*size + x);
      });
      world.on('pointermove', (e:any) => {
        if (!onDrag || !dragging.current.down) return;
        const p = world.toLocal(e.global);
        const x = Math.floor(p.x / tileSize), y = Math.floor(p.y / tileSize);
        if (x>=0 && y>=0 && x<size && y<size) onDrag(y*size + x);
      });

      layersRef.current = { base, roads, structs, ghost: ghostL };

      // ----- keep renderer the same size as the host div -----
      const fit = () => {
        const w = host.clientWidth || 300;
        const h = host.clientHeight || 300;
        // v8 resize signature
        (app!.renderer as any).resize?.({ width: w, height: h }) ?? (app!.renderer as any).resize?.(w, h);
      };
      fit();
      ro = new ResizeObserver(fit);
      ro.observe(host);
    })();

    return () => {
      cancelled = true;
      ro?.disconnect();
      appRef.current?.destroy(true);
      appRef.current = null;
      layersRef.current = null;
      texRef.current = null;
    };
  }, [size, tileSize, onClick, onDrag]);

  // build textures once from Graphics factories
  useEffect(() => {
    const app = appRef.current;
    if (!app || texRef.current) return;

    const make = (gf: (size?: number) => Graphics) => {
      const g = gf(tileSize);
      const rt = RenderTexture.create({ width: tileSize, height: tileSize });
      app.renderer.render(g, { renderTexture: rt });
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
  }, [tileSize]);

  // redraw contents whenever tiles change
  useEffect(() => {
    if (!appRef.current || !layersRef.current || !texRef.current) return;
    const { base, roads, structs, ghost: ghostL } = layersRef.current;
    const T = texRef.current!;
    base.removeChildren(); roads.removeChildren(); structs.removeChildren(); ghostL.removeChildren();

    for (let i=0;i<tiles.length;i++){
      const t = tiles[i];
      const x = (i % size) * tileSize, y = Math.floor(i/size) * tileSize;

      const biomeTex = T[t.biome] || T.meadow;
      const s = new Sprite(biomeTex); s.x = x; s.y = y; base.addChild(s);

      if (t.terrain === 'water')      { const w = new Sprite(T.water);  w.x=x; w.y=y; base.addChild(w); }
      else if (t.terrain === 'road')  { const r = new Sprite(T.road);   r.x=x; r.y=y; roads.addChild(r); }
      else if (t.terrain === 'bridge'){ const b = new Sprite(T.bridge); b.x=x; b.y=y; roads.addChild(b); }

      if (t.structure){
        const g = new Graphics().roundRect(x+4, y+4, tileSize-8, tileSize-8, 4).fill(0x3b2f2f);
        if (t.structure.id.includes('market'))  g.fill({ color: 0xc7772e });
        if (t.structure.id.includes('library')) g.fill({ color: 0x6a7bb6 });
        if (t.structure.id.includes('cottage')) g.fill({ color: 0xcf8c7c });
        if (t.structure.id.includes('quarry'))  g.fill({ color: 0x8f8f8f });
        if (t.structure.id.includes('sawmill'))  g.fill({ color: 0x8f6b4a });
        structs.addChild(g);
      }
    }

    if (ghost && ghost.length){
      ghost.forEach(i=>{
        const x = (i % size) * tileSize, y = Math.floor(i/size) * tileSize;
        const g = new Graphics().roundRect(x+1,y+1,tileSize-2,tileSize-2,6).fill({ color: 0x69d6a6, alpha: 0.25 }).stroke({ color: 0x69d6a6, width: 2, alpha: 0.4 });
        ghostL.addChild(g);
      });
    }
  }, [tiles, size, tileSize, ghost]);

  // host fills its parent; parent sets the height
  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
