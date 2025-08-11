import React, { useEffect, useRef } from 'react';
import { Application, Container, Graphics, Texture, Sprite, RenderTexture } from 'pixi.js';
import { grassTexture, forestTexture, hillTexture, marshTexture, thicketTexture, waterTexture, roadTexture, bridgeTexture } from './textures';

type Biome = 'meadow'|'forest'|'hill'|'marsh'|'thicket';
type Tile = { terrain: 'grass'|'water'|'road'|'bridge'; biome: Biome; structure?: { id:string; level:number; icon:string; shape?:Array<[number,number]> } };

type Props = {
  tiles: Tile[];
  size: number;
  tileSize?: number;
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

  // mount app
// ensure textures exist and are rendered to RTs once
useEffect(() => {
  if (!appRef.current) return;
  const app = appRef.current;
  if (!texRef.current) {
    const { RenderTexture, Texture } = await import('pixi.js'); // lazy type import if needed

    const make = (gf: (size?: number) => import('./textures').then(m => m.GFactory) | any, size = tileSize) => {
      // gf here is one of our *GFactory* functions (returns Graphics)
      const g = (gf as any)(size);
      const rt = RenderTexture.create({ width: size, height: size });
      app.renderer.render(g, { renderTexture: rt });
      g.destroy();
      return rt as Texture;
    };

    // import factories
    const tex = await import('./textures');
    texRef.current = {
      meadow: make(tex.grassG),
      forest: make(tex.forestG),
      hill:   make(tex.hillG),
      marsh:  make(tex.marshG),
      thicket:make(tex.thicketG),
      water:  make(tex.waterG),
      road:   make(tex.roadG),
      bridge: make(tex.bridgeG),
    };
  }
}, [tileSize]);


    // layers
    const world = new Container(); world.eventMode = 'static';
    const base = new Container(); const roads = new Container(); const structs = new Container(); const ghostL = new Container();
    world.addChild(base, roads, structs, ghostL);
    app.stage.addChild(world);

    // panning + zoom
    let scale = 1;
    world.on('pointerdown', (e:any) => { dragging.current.down = true; dragging.current.lx = e.global.x; dragging.current.ly = e.global.y; });
    world.on('pointerup', ()=> dragging.current.down = false);
    world.on('pointerupoutside', ()=> dragging.current.down = false);
    world.on('globalpointermove', (e:any) => {
      if (!dragging.current.down) return;
      const dx = e.global.x - dragging.current.lx;
      const dy = e.global.y - dragging.current.ly;
      world.x += dx; world.y += dy;
      dragging.current.lx = e.global.x; dragging.current.ly = e.global.y;
    });
    (app.view as any).addEventListener('wheel', (ev:WheelEvent) => {
      const delta = Math.sign(ev.deltaY)*-0.1;
      scale = Math.min(2.5, Math.max(0.5, scale + delta));
      world.scale.set(scale);
    }, { passive: true });

    // tile pointer handling
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
    return () => { app.destroy(true); appRef.current = null; };
  }, [size, tileSize, onClick, onDrag]);

  // ensure textures exist and are rendered to RTs once
  useEffect(() => {
    if (!appRef.current) return;
    const app = appRef.current;
    if (!texRef.current) {
      // draw each Graphics into a render texture once
      const make = (name:string, gFactory:()=>Graphics) => {
        const g = gFactory();
        const w = Math.ceil(g.width||tileSize), h = Math.ceil(g.height||tileSize);
        const rt = RenderTexture.create({ width: w, height: h });
        app.renderer.render(g, { renderTexture: rt });
        g.destroy();
        return rt as Texture;
      };
      texRef.current = {
        meadow: make('meadow', ()=>{ return g; }),
        forest: make('forest', ()=> forestTexture(tileSize) as unknown as Graphics),
        hill: make('hill', ()=> hillTexture(tileSize) as unknown as Graphics),
        marsh: make('marsh', ()=> marshTexture(tileSize) as unknown as Graphics),
        thicket: make('thicket', ()=> thicketTexture(tileSize) as unknown as Graphics),
        water: make('water', ()=> waterTexture(tileSize) as unknown as Graphics),
        road: make('road', ()=> roadTexture(tileSize) as unknown as Graphics),
        bridge: make('bridge', ()=> bridgeTexture(tileSize) as unknown as Graphics),
      };
    }
  }, [tileSize]);

  // redraw tiles when data changes
  useEffect(() => {
    if (!appRef.current || !layersRef.current || !texRef.current) return;
    const { base, roads, structs, ghost: ghostL } = layersRef.current;
    const T = texRef.current!;
    base.removeChildren(); roads.removeChildren(); structs.removeChildren(); ghostL.removeChildren();

    // base + roads
    for (let i=0;i<tiles.length;i++){
      const t = tiles[i];
      const x = (i % size) * tileSize, y = Math.floor(i/size) * tileSize;
      const biomeTex = T[t.biome] || T.meadow;
      const s = new Sprite(biomeTex); s.x = x; s.y = y; base.addChild(s);

      if (t.terrain === 'water') {
        const w = new Sprite(T.water); w.x = x; w.y = y; base.addChild(w);
      } else if (t.terrain === 'road') {
        const r = new Sprite(T.road); r.x = x; r.y = y; roads.addChild(r);
      } else if (t.terrain === 'bridge') {
        const b = new Sprite(T.bridge); b.x = x; b.y = y; roads.addChild(b);
      }

      // structures (simple vector icons; keep it minimal here)
      if (t.structure){
        const g = new Graphics(); g.roundRect(x+4, y+4, tileSize-8, tileSize-8, 4).fill(0x3b2f2f);
        if (t.structure.id.includes('market')) g.fill({ color: 0xc7772e });
        if (t.structure.id.includes('library')) g.fill({ color: 0x6a7bb6 });
        if (t.structure.id.includes('cottage')) g.fill({ color: 0xcf8c7c });
        if (t.structure.id.includes('quarry')) g.fill({ color: 0x8f8f8f });
        if (t.structure.id.includes('sawmill')) g.fill({ color: 0x8f6b4a });
        structs.addChild(g);
      }
    }

    // ghost highlight
    if (ghost && ghost.length){
      ghost.forEach(i=>{
        const x = (i % size) * tileSize, y = Math.floor(i/size) * tileSize;
        const g = new Graphics(); g.roundRect(x+1,y+1,tileSize-2,tileSize-2,6).fill({ color: 0x69d6a6, alpha: 0.25 }).stroke({ color: 0x69d6a6, width: 2, alpha: 0.4 });
        ghostL.addChild(g);
      });
    }
  }, [tiles, size, tileSize, ghost]);

  return <div ref={hostRef} style={{ width: size*tileSize+2, height: size*tileSize+2 }} />;
}
