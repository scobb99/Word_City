// Cozy-fantasy procedural textures (no image assets needed)
import { Graphics, RenderTexture, Texture } from 'pixi.js';

export function grassTexture(size = 28) {
  const g = new Graphics();
  g.roundRect(0,0,size,size,6).fill(0x9ecb97); // soft meadow green
  // speckles
  for (let i=0;i<12;i++){
    const x = Math.random()*size, y = Math.random()*size;
    g.moveTo(x,y).lineTo(x+2,y+3).stroke({ color: 0x6fa974, width: 1, alpha: 0.5 });
  }
  return gToTex(g, size, size);
}

export function forestTexture(size = 28) {
  const g = new Graphics();
  g.roundRect(0,0,size,size,6).fill(0x8ab886);
  // darker blobs
  for (let i=0;i<8;i++){
    const x = Math.random()*size, y = Math.random()*size, r = 2+Math.random()*3;
    g.circle(x,y,r).fill({ color: 0x4d7a4f, alpha: 0.35 });
  }
  return gToTex(g, size, size);
}

export function hillTexture(size = 28) {
  const g = new Graphics();
  g.roundRect(0,0,size,size,6).fill(0xa6c49f);
  // little stone dots
  for (let i=0;i<6;i++){
    const x = Math.random()*size, y = Math.random()*size;
    g.rect(x,y,2,2).fill(0x7f8b7b);
  }
  return gToTex(g, size, size);
}

export function marshTexture(size = 28) {
  const g = new Graphics();
  g.roundRect(0,0,size,size,6).fill(0x8bb5a2);
  // wet streaks
  for (let i=0;i<5;i++){
    const x = Math.random()*size, y = Math.random()*size;
    g.ellipse(x,y,3,1).fill({ color: 0x5a9785, alpha: 0.4 });
  }
  return gToTex(g, size, size);
}

export function thicketTexture(size = 28) {
  const g = new Graphics();
  g.roundRect(0,0,size,size,6).fill(0x6a9367);
  for (let i=0;i<9;i++){
    const x = Math.random()*size, y = Math.random()*size;
    g.rect(x,y,3,3).fill({ color: 0x2e5c32, alpha: 0.55 });
  }
  return gToTex(g, size, size);
}

export function waterTexture(size = 28) {
  const g = new Graphics();
  g.roundRect(0,0,size,size,6).fill(0x78b7e6); // base blue
  // gentle ripples
  for (let i=0;i<4;i++){
    const y = (i+1) * (size/5);
    g.moveTo(3, y).bezierCurveTo(size/3, y-2, 2*size/3, y+2, size-3, y).stroke({ color: 0x3f8ac8, width: 1, alpha: 0.35 });
  }
  return gToTex(g, size, size);
}

export function roadTexture(size = 28) {
  const g = new Graphics();
  g.roundRect(0,0,size,size,6).fill(0x6b5743); // cozy brown road
  // center stones
  const cx = size/2 - 1;
  for (let y=4;y<size-4;y+=6) g.rect(cx, y, 2, 3).fill({ color: 0x8e7760, alpha: 0.7 });
  return gToTex(g, size, size);
}

export function bridgeTexture(size = 28) {
  const g = new Graphics();
  g.roundRect(0,0,size,size,6).fill(0x8a6a4f);
  // planks
  for (let y=3;y<size-3;y+=5) g.rect(3, y, size-6, 2).fill({ color: 0xb48e6e, alpha: 0.85 });
  return gToTex(g, size, size);
}

function gToTex(g: Graphics, w: number, h: number): Texture {
  const rt = RenderTexture.create({ width: w, height: h });
  // @ts-ignore - get renderer from any last used
  g.renderable = true;
  // A tiny hack: Pixi v8 needs the Graphics to be rendered by an Application. We'll let MapView draw them once and cache.
  return rt;
}
