// Cozy-fantasy procedural graphics (return Graphics, not Texture)
import { Graphics } from 'pixi.js';

export type GFactory = (size?: number) => Graphics;

export const grassG: GFactory = (size = 28) => {
  const g = new Graphics();
  g.roundRect(0, 0, size, size, 6).fill(0x9ecb97);
  for (let i = 0; i < 12; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    g.moveTo(x, y).lineTo(x + 2, y + 3).stroke({ color: 0x6fa974, width: 1, alpha: 0.5 });
  }
  return g;
};

export const forestG: GFactory = (size = 28) => {
  const g = new Graphics();
  g.roundRect(0, 0, size, size, 6).fill(0x8ab886);
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 2 + Math.random() * 3;
    g.circle(x, y, r).fill({ color: 0x4d7a4f, alpha: 0.35 });
  }
  return g;
};

export const hillG: GFactory = (size = 28) => {
  const g = new Graphics();
  g.roundRect(0, 0, size, size, 6).fill(0xa6c49f);
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    g.rect(x, y, 2, 2).fill(0x7f8b7b);
  }
  return g;
};

export const marshG: GFactory = (size = 28) => {
  const g = new Graphics();
  g.roundRect(0, 0, size, size, 6).fill(0x8bb5a2);
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    g.ellipse(x, y, 3, 1).fill({ color: 0x5a9785, alpha: 0.4 });
  }
  return g;
};

export const thicketG: GFactory = (size = 28) => {
  const g = new Graphics();
  g.roundRect(0, 0, size, size, 6).fill(0x6a9367);
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    g.rect(x, y, 3, 3).fill({ color: 0x2e5c32, alpha: 0.55 });
  }
  return g;
};

export const waterG: GFactory = (size = 28) => {
  const g = new Graphics();
  g.roundRect(0, 0, size, size, 6).fill(0x78b7e6);
  for (let i = 0; i < 4; i++) {
    const y = (i + 1) * (size / 5);
    g.moveTo(3, y).bezierCurveTo(size / 3, y - 2, (2 * size) / 3, y + 2, size - 3, y)
      .stroke({ color: 0x3f8ac8, width: 1, alpha: 0.35 });
  }
  return g;
};

export const roadG: GFactory = (size = 28) => {
  const g = new Graphics();
  g.roundRect(0, 0, size, size, 6).fill(0x6b5743);
  const cx = size / 2 - 1;
  for (let y = 4; y < size - 4; y += 6) g.rect(cx, y, 2, 3).fill({ color: 0x8e7760, alpha: 0.7 });
  return g;
};

export const bridgeG: GFactory = (size = 28) => {
  const g = new Graphics();
  g.roundRect(0, 0, size, size, 6).fill(0x8a6a4f);
  for (let y = 3; y < size - 3; y += 5) g.rect(3, y, size - 6, 2).fill({ color: 0xb48e6e, alpha: 0.85 });
  return g;
};
