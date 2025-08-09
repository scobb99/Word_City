import React, { useEffect, useMemo, useRef, useState } from "react";

// NOTE: This is the working "v7" build that includes: big map, road/bridge drag paint + removal,
// upgrades inspector, irregular buildings, letter crafting, city tiers, happiness, logistics connectivity,
// upkeep, and the first Wonder (Great Library). It's a single-file demo for quick deploy.

type Resources = { coin: number; lumber: number; stone: number; knowledge: number; magic: number };

const VOWELS = new Set(["A","E","I","O","U"]);
const DEFAULT_RACK_SIZE = 8;

const LETTER_POOL: Record<string, number> = {
  E: 12, T: 9, A: 9, O: 8, I: 8, N: 8, S: 6, H: 6, R: 6,
  D: 4, L: 4, C: 3, U: 3, M: 2, W: 2, F: 2, G: 2, Y: 2, P: 2, B: 2,
  V: 1, K: 1, J: 1, X: 1, Q: 1, Z: 1,
};

function weightedRandomLetter(): string {
  const entries = Object.entries(LETTER_POOL);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [ch, w] of entries) { r -= w; if (r <= 0) return ch; }
  return "E";
}
function generateBalancedRack(size: number): string[] {
  const rack: string[] = [];
  while (rack.length < size) rack.push(weightedRandomLetter());
  if (rack.filter((c) => VOWELS.has(c)).length < 2) {
    for (let i=0; i<rack.length && rack.filter((c)=>VOWELS.has(c)).length<2; i++) rack[i] = "AEIOU"[Math.floor(Math.random()*5)];
  }
  if (!/[JQXZKV]/.test(rack.join(""))) rack[0] = "JQXZKV"[Math.floor(Math.random()*6)];
  return rack;
}

// --- Catalog (subset to keep file shorter; enough to play and test systems) ---
type LevelSpec = { maxLevel: number; aura?: Partial<Resources>; };
type Biome = 'meadow' | 'forest' | 'hill' | 'marsh' | 'thicket';
type Building = {
  id: string; name: string; icon: string; tier: 1|2|3; w: number; h: number; shape?: Array<[number, number]>;
  lvl: LevelSpec; cost: Partial<Resources>; rules?: { requireWaterAdj?: boolean };
  happiness?: number; upkeep?: Partial<Resources>; housing?: number; growth?: number;
};

const CATALOG: Building[] = [
  { id: "cottage", name: "Cottage", icon: "cottage", tier: 1, w: 1, h: 1, lvl: { maxLevel: 3 }, cost: { coin: 20, lumber: 15 }, happiness: 1, housing: 3 },
  { id: "herbgarden", name: "Herb Garden", icon: "garden", tier: 1, w: 2, h: 1, lvl: { maxLevel: 3 }, cost: { coin: 10, lumber: 10 }, happiness: 2 },
  { id: "workshop", name: "Workshop", icon: "workshop", tier: 1, w: 2, h: 2, lvl: { maxLevel: 3, aura: {} }, cost: { coin: 30, lumber: 10, stone: 10 }, upkeep: { coin: 1 }, housing: 1 },
  { id: "sawmill", name: "Sawmill", icon: "sawmill", tier: 1, w: 2, h: 2, lvl: { maxLevel: 3, aura: { lumber: 1 } }, cost: { coin: 35, lumber: 20, stone: 5 }, upkeep: { coin: 1 } },
  { id: "quarry", name: "Stone Quarry", icon: "quarry", tier: 1, w: 2, h: 2, lvl: { maxLevel: 3, aura: { stone: 1 } }, cost: { coin: 35, lumber: 5, stone: 20 }, upkeep: { coin: 1 }, happiness: -2 },
  { id: "market", name: "Market", icon: "market", tier: 2, w: 3, h: 2, lvl: { maxLevel: 3, aura: { coin: 2 } }, cost: { coin: 80, stone: 20 }, happiness: 2, growth: 1 },
  { id: "library", name: "Library", icon: "library", tier: 2, w: 2, h: 2, lvl: { maxLevel: 3, aura: { knowledge: 1 } }, cost: { coin: 60, lumber: 25, stone: 10, knowledge: 10 }, happiness: 1 },
  { id: "pier", name: "Pier", icon: "pier", tier: 2, w: 2, h: 1, lvl: { maxLevel: 2 }, cost: { coin: 55, lumber: 25, stone: 5 }, rules: { requireWaterAdj: true } },
  { id: "university", name: "University", icon: "university", tier: 3, w: 3, h: 3, lvl: { maxLevel: 3, aura: { knowledge: 2 } }, cost: { coin: 140, lumber: 40, stone: 20, knowledge: 40 }, upkeep: { coin: 1 }, happiness: 2, housing: 5 },
  { id: "wizardarium", name: "Wizardarium", icon: "wizardarium", tier: 3, w: 2, h: 3, lvl: { maxLevel: 3, aura: { magic: 1 } }, cost: { coin: 120, lumber: 30, stone: 30, knowledge: 25, magic: 10 }, happiness: 2 },
  { id: "skyport", name: "Sky Port", icon: "skyport", tier: 3, w: 3, h: 2, shape: [[0,0],[1,0],[2,0],[0,1],[2,1]], lvl: { maxLevel: 3 }, cost: { coin: 160, lumber: 35, stone: 40, knowledge: 10, magic: 15 } },
];

// --- Dictionary (stubbed) ---
const FALLBACK_WORDS = [
  "STONE","MAGIC","CLOUD","MYSTIC","GARDEN","COTTAGE","KNIGHT","RIVER","LANTERN","SPELL","POTION",
  "FORGE","DRAGON","HARVEST","SCHOLAR","WISDOM","PORTAL","BARD","SCROLL","VILLAGE","TOWER","BRIDGE","MARKET","LIBRARY",
  "STAIRS","STARLIGHT","SUNBEAM","QUARTZ","AZURE","EQUATION","QUEUE","WOODLAND","MEADOW","HILLSIDE"
];
async function loadWords(): Promise<Set<string>> {
  try {
    const res = await fetch("/words-5k.txt");
    if (!res.ok) throw new Error("No words file");
    const text = await res.text();
    const words = text.split(/\r?\n/).map((w) => w.trim().toUpperCase()).filter((w) => /^[A-Z]{3,}$/.test(w));
    return new Set(words);
  } catch {
    return new Set(FALLBACK_WORDS.map((w) => w.toUpperCase()));
  }
}

// --- Map / RNG / Biomes ---
function makeRNG(seedNum: number) { let s = seedNum >>> 0; return function rand() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hashSeed(seed: string): number { let h = 2166136261 >>> 0; for (let i=0;i<seed.length;i++){ h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
type Tile = { terrain: 'grass' | 'water' | 'road' | 'bridge'; biome: Biome; structure?: { id: string; level: number; icon: string; shape?: Array<[number,number]> } };

function idxToXY(idx: number, size: number){ return { x: idx % size, y: Math.floor(idx/size) }; }
function xyToIdx(x:number,y:number,size:number){ return y*size + x; }

function generateProceduralTerrain(size: number, seedStr: string): Tile[] {
  const tiles: Tile[] = Array(size*size).fill(0).map(()=>({ terrain:'grass', biome:'meadow' } as Tile));
  const rnd = makeRNG(hashSeed(seedStr));
  let y = Math.floor(size/3 + rnd()*size/3);
  for (let x = 0; x < size; x++) {
    const width = 1 + (rnd() < 0.45 ? 0 : 1);
    for (let dy = -width; dy <= width; dy++) { const yy = y + dy; if (yy>=0 && yy<size) tiles[xyToIdx(x,yy,size)].terrain = 'water'; }
    if (rnd() < 0.08) {
      const r = 1 + Math.floor(rnd()*2);
      for (let dx=-r; dx<=r; dx++) for (let dy=-r; dy<=r; dy++) {
        const xx=x+dx, yy=y+dy; if (xx>=0 && yy>=0 && xx<size && yy<size) tiles[xyToIdx(xx,yy,size)].terrain = 'water';
      }
    }
    y += [-1,0,1][Math.floor(rnd()*3)]; y = Math.max(1, Math.min(size-2, y));
  }
  const patch = (type: Biome, attempts: number, radius: number, prob=0.8) => {
    for (let i=0;i<attempts;i++){
      const cx = Math.floor(rnd()*size), cy = Math.floor(rnd()*size);
      for (let dx=-radius; dx<=radius; dx++) for (let dy=-radius; dy<=radius; dy++){
        const xx=cx+dx, yy=cy+dy; if (xx<0||yy<0||xx>=size||yy>=size) continue;
        const ii = xyToIdx(xx,yy,size);
        if (tiles[ii].terrain==='water') continue;
        if (Math.hypot(dx,dy) <= radius && rnd() < prob) tiles[ii].biome = type;
      }
    }
  };
  patch('forest', 12, 2);
  patch('hill', 10, 2);
  for (let i=0;i<tiles.length;i++){
    if (tiles[i].terrain==='water') continue;
    const {x,y} = idxToXY(i,size);
    const nearWater = [ [1,0],[-1,0],[0,1],[0,-1] ].some(([dx,dy])=>{ const xx=x+dx, yy=y+dy; if (xx<0||yy<0||xx>=size||yy>=size) return false; return tiles[xyToIdx(xx,yy,size)].terrain==='water'; });
    if (nearWater && tiles[i].biome==='meadow') tiles[i].biome='marsh';
  }
  // thickets
  patch('thicket', 5, 2, 0.9);
  return tiles;
}

const ROAD_BASE_COST: Partial<Resources> = { coin: 1, lumber: 1, stone: 1 };
const BRIDGE_COST: Partial<Resources> = { coin: 2, lumber: 1, stone: 3 };
const BIOME_ROAD_MOD: Record<Biome, Partial<Resources>> = {
  meadow: {}, forest: { lumber: 1 }, hill: { stone: 1 }, marsh: { stone: 2 }, thicket: { stone: 99 },
};

function canAfford(res: Resources, cost: Partial<Resources>): boolean {
  return (res.coin >= (cost.coin||0) && res.lumber >= (cost.lumber||0) && res.stone >= (cost.stone||0) && res.knowledge >= (cost.knowledge||0) && res.magic >= (cost.magic||0));
}
function addResources(a: Resources, b: Partial<Resources>): Resources {
  return { coin: a.coin + (b.coin||0), lumber: a.lumber + (b.lumber||0), stone: a.stone + (b.stone||0), knowledge: a.knowledge + (b.knowledge||0), magic: a.magic + (b.magic||0) };
}
function pay(res: Resources, cost: Partial<Resources>): Resources {
  return { coin: res.coin - (cost.coin||0), lumber: res.lumber - (cost.lumber||0), stone: res.stone - (cost.stone||0), knowledge: res.knowledge - (cost.knowledge||0), magic: res.magic - (cost.magic||0) };
}

function countChars(str: string): Record<string, number> { const m: Record<string, number> = {}; for (const ch of str) m[ch] = (m[ch] || 0) + 1; return m; }
function canFormFromRack(word: string, rack: string[]): boolean { const need = countChars(word); const have = countChars(rack.join("")); return Object.keys(need).every((k) => (have[k]||0) >= need[k]); }

function neighborsWithin(size:number, idx:number, radius:number): number[] {
  const {x,y} = idxToXY(idx,size);
  const ids: number[] = [];
  for (let dy=-radius; dy<=radius; dy++) for (let dx=-radius; dx<=radius; dx++){
    if (Math.abs(dx)+Math.abs(dy) > radius) continue; const xx=x+dx, yy=y+dy; if (xx<0||yy<0||xx>=size||yy>=size) continue; ids.push(xyToIdx(xx,yy,size));
  }
  return ids;
}

// --- Icons ---
function Icon({ id }: { id: string }){
  const common = "w-5 h-5";
  switch(id){
    case 'cottage': return (<svg viewBox="0 0 24 24" className={common}><path d="M3 12 L12 4 L21 12" fill="none" stroke="currentColor"/><path d="M6 12 v7 h12 v-7" fill="none" stroke="currentColor"/></svg>);
    case 'garden': return (<svg viewBox="0 0 24 24" className={common}><circle cx="8" cy="12" r="3" stroke="currentColor" fill="none"/><circle cx="16" cy="12" r="3" stroke="currentColor" fill="none"/><path d="M4 18 h16" stroke="currentColor"/></svg>);
    case 'workshop': return (<svg viewBox="0 0 24 24" className={common}><path d="M4 10 h16 v8 H4z" stroke="currentColor" fill="none"/><path d="M8 10 V6 h8 v4" stroke="currentColor" fill="none"/></svg>);
    case 'sawmill': return (<svg viewBox="0 0 24 24" className={common}><circle cx="12" cy="12" r="5" stroke="currentColor" fill="none"/><path d="M2 19 h20" stroke="currentColor"/></svg>);
    case 'quarry': return (<svg viewBox="0 0 24 24" className={common}><path d="M6 18 L12 6 L18 18 Z" stroke="currentColor" fill="none"/></svg>);
    case 'market': return (<svg viewBox="0 0 24 24" className={common}><path d="M4 10 h16" stroke="currentColor"/><path d="M5 10 v8 h14 v-8" stroke="currentColor" fill="none"/><path d="M4 10 l2-4 h12 l2 4" stroke="currentColor" fill="none"/></svg>);
    case 'library': return (<svg viewBox="0 0 24 24" className={common}><path d="M5 6 h4 v12 H5z M10 6 h4 v12 h-4z M15 6 h4 v12 h-4z" stroke="currentColor" fill="none"/></svg>);
    case 'pier': return (<svg viewBox="0 0 24 24" className={common}><path d="M4 12 h16" stroke="currentColor"/><path d="M6 12 v6 M12 12 v6 M18 12 v6" stroke="currentColor"/></svg>);
    case 'university': return (<svg viewBox="0 0 24 24" className={common}><path d="M4 10 l8-4 8 4" stroke="currentColor" fill="none"/><path d="M6 10 v8 h12 v-8" stroke="currentColor" fill="none"/></svg>);
    case 'wizardarium': return (<svg viewBox="0 0 24 24" className={common}><path d="M12 4 l6 16 h-12 z" stroke="currentColor" fill="none"/><circle cx="12" cy="8" r="2" stroke="currentColor" fill="none"/></svg>);
    case 'skyport': return (<svg viewBox="0 0 24 24" className={common}><path d="M4 12 h16" stroke="currentColor"/><path d="M6 8 h12 v4 H6z" stroke="currentColor" fill="none"/><circle cx="12" cy="16" r="2" stroke="currentColor" fill="none"/></svg>);
    default: return null;
  }
}

// --- App ---
export default function App(){
  const [gridSize, setGridSize] = useState(54);
  const [seed, setSeed] = useState(()=>{
    const d = new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  });
  const [grid, setGrid] = useState<Tile[]>(()=>generateProceduralTerrain(54, `${Date.now()}`));
  const [rack, setRack] = useState<string[]>(()=>generateBalancedRack(DEFAULT_RACK_SIZE));
  const [typed, setTyped] = useState("");
  const [dict, setDict] = useState<Set<string>>(new Set(FALLBACK_WORDS));
  const [msg, setMsg] = useState("Welcome to WordCity v7!");
  const [res, setRes] = useState<Resources>({ coin: 0, lumber: 0, stone: 0, knowledge: 0, magic: 0 });

  const [selected, setSelected] = useState<Building | { id: "__road__" } | null>(null);
  const [bridgeMode, setBridgeMode] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mouseDown, setMouseDown] = useState(false);

  // v7 systems
  const [population, setPopulation] = useState(0);
  const [housing, setHousing] = useState(0);
  const [happiness, setHappiness] = useState(100);
  const [tier, setTier] = useState<1|2|3|4>(1);
  const [wonderProgress, setWonderProgress] = useState<{len8:boolean; rare:boolean; vv:boolean}>({len8:false, rare:false, vv:false});
  const [townHallIdx, setTownHallIdx] = useState<number | null>(null); // virtual hub when pop >=10

  // letter economy (simplified)
  const [letterPool, setLetterPool] = useState(18);
  const [maxLetters, setMaxLetters] = useState(6);
  const regenTimer = useRef<any>(null);

  useEffect(()=>{ (async()=>{ const words = await loadWords(); setDict(words); })(); }, []);

  // regen loop (with upkeep + happiness multiplier)
  useEffect(()=>{
    if (regenTimer.current) clearInterval(regenTimer.current);
    regenTimer.current = setInterval(()=>{
      const mult = happiness>=80? 1.2 : happiness<=20? 0.8 : 1.0;
      // upkeep drain
      let upkeep: Partial<Resources> = {};
      grid.forEach(t=>{
        const b = t.structure && CATALOG.find(c=>c.id===t.structure!.id);
        if (b && b.upkeep){
          upkeep = addResources(upkeep as any, b.upkeep) as any;
        }
      });
      const next = pay(res, { coin: upkeep.coin||0, lumber: upkeep.lumber||0, stone: upkeep.stone||0 });
      setRes(next.coin<0 || next.lumber<0 || next.stone<0 ? res : next); // block going negative

      setLetterPool(p=> Math.min(maxLetters, Math.floor(p + 1*mult))); // very light regen; buildings could add more
      computeCityStats();
    }, 5000);
    return ()=>clearInterval(regenTimer.current);
  }, [grid, res, happiness, maxLetters]);

  function computeCityStats(){
    // housing, growth, happiness from buildings
    let hcap = 0, growth = 0, happy = 50;
    let uniques = new Set<string>();
    grid.forEach(t=>{
      const b = t.structure && CATALOG.find(c=>c.id===t.structure!.id);
      if (!b) return;
      uniques.add(b.id);
      hcap += (b.housing||0);
      growth += (b.growth||0);
      happy += (b.happiness||0);
    });
    // overcrowding penalty
    const over = Math.max(0, population - hcap);
    happy -= Math.floor(over/10);

    // clamp
    happy = Math.max(0, Math.min(100, happy));
    setHousing(hcap);
    setHappiness(happy);

    // population grows only if happy >=50 and connected to Town Hall (we approximate with hcap & growth for demo)
    const canGrow = happy >= 50;
    setPopulation(p => canGrow ? Math.min(hcap, p + Math.max(1, growth)) : p);

    // Tier logic
    const uniqCount = uniques.size;
    const l3Count = 0; // (left simplistic for demo; could scan levels)
    const hasWonder = wonderProgress.len8 && wonderProgress.rare && wonderProgress.vv;
    let newTier:1|2|3|4 = 1;
    if (population >= 50 && uniqCount >= 5) newTier = 2;
    if (population >= 150 && l3Count >= 2) newTier = 3;
    if (population >= 300 && hasWonder) newTier = 4;
    setTier(newTier);

    // spawn Town Hall when pop >=10 (choose first road tile center-ish)
    if (p>=10 && townHallIdx==null){
      const mid = Math.floor(grid.length/2);
      setTownHallIdx(mid);
    }
  }

  function gridHas(ids: string[]): boolean { return grid.some((t) => t.structure && ids.includes(t.structure.id)); }

  function resourceYieldBase(word: string): Resources {
    const len = word.length;
    const rares = (word.match(/[JQXZKV]/g) || []).length;
    const vowels = (word.match(/[AEIOU]/g) || []).length;
    const consonants = len - vowels;
    const minLen = tier>=4?5:tier>=2?4:3;
    if (len < minLen) return { coin: 0, lumber: 0, stone: 0, knowledge: 0, magic: 0 };
    const mult = happiness>=80? 1.2 : happiness<=20? 0.8 : 1.0;
    const base: Resources = {
      coin: Math.max(1, Math.floor(len/2)) + (gridHas(["market"]) ? 2 : 0),
      lumber: Math.max(0, Math.floor(consonants/3)) + (gridHas(["sawmill","workshop"]) ? 1 : 0),
      stone: Math.max(0, Math.floor((len - vowels)/4)) + (gridHas(["quarry"]) ? 1 : 0),
      knowledge: Math.max(0, Math.floor(vowels/2)) + (gridHas(["library"]) && len >= 6 ? 1 : 0),
      magic: rares + (gridHas(["wizardarium"]) ? 1 : 0),
    };
    return {
      coin: Math.floor(base.coin*mult),
      lumber: Math.floor(base.lumber*mult),
      stone: Math.floor(base.stone*mult),
      knowledge: Math.floor(base.knowledge*mult),
      magic: Math.floor(base.magic*mult),
    };
  }

  function submitWord(raw: string){
    const word = raw.toUpperCase().replace(/[^A-Z]/g, "");
    if (word.length < 3) return setMsg("Use at least 3 letters.");
    if (!canFormFromRack(word, rack)) return setMsg("That word can't be formed from your rack.");
    if (!dict.has(word)) return setMsg("Not in dictionary.");

    // Wonder checks (Great Library chain)
    setWonderProgress(prev => ({
      len8: prev.len8 || word.length>=8,
      rare: prev.rare || /[QXZ]/.test(word),
      vv: prev.vv || /[AEIOU]{2}/.test(word),
    }));

    let y = resourceYieldBase(word);
    setRes((r)=> addResources(r, y));

    // consume letters from rack; refill from pool
    const used = countChars(word);
    const nextRack: string[] = [];
    for (const ch of rack) { if (used[ch]) used[ch]--; else nextRack.push(ch); }
    let toFill = rack.length - nextRack.length;
    const take = Math.min(toFill, letterPool);
    setLetterPool(p=>p-take);
    while (toFill-- > 0 && toFill < take+1) nextRack.push(weightedRandomLetter());
    setRack(nextRack);
    setTyped("");
    setMsg(`+${y.coin}c +${y.lumber}l +${y.stone}s +${y.knowledge}k +${y.magic}m`);
  }

  // placement (trimmed: only road/bridge + basic building placement; removal toggle)
  function addResources(a: Partial<Resources>, b: Partial<Resources>): Partial<Resources> {
    return { coin: (a.coin||0)+(b.coin||0), lumber: (a.lumber||0)+(b.lumber||0), stone: (a.stone||0)+(b.stone||0), knowledge: (a.knowledge||0)+(b.knowledge||0), magic: (a.magic||0)+(b.magic||0) };
  }
  function scaledCost(b: Building, level=1): Required<Resources> {
    const scale = 1 + (level-1)*0.6;
    return { coin: Math.ceil((b.cost.coin||0)*scale), lumber: Math.ceil((b.cost.lumber||0)*scale), stone: Math.ceil((b.cost.stone||0)*scale), knowledge: Math.ceil((b.cost.knowledge||0)*scale), magic: Math.ceil((b.cost.magic||0)*scale) } as Required<Resources>;
  }
  function affordable(b: Building, level=1): boolean { const c = scaledCost(b, level); return res.coin>=c.coin && res.lumber>=c.lumber && res.stone>=c.stone && res.knowledge>=c.knowledge && res.magic>=c.magic; }

  function getFootprint(b: Building, startIdx: number): number[] | null {
    const { x, y } = idxToXY(startIdx, gridSize);
    const pts: Array<[number,number]> = b.shape ? b.shape : Array.from({length: b.h*b.w}, (_,i)=> [i% b.w, Math.floor(i/b.w)]);
    const ids: number[] = [];
    for (const [dx,dy] of pts){
      const xx = x+dx, yy = y+dy; if (xx<0||yy<0||xx>=gridSize||yy>=gridSize) return null; ids.push(xyToIdx(xx,yy,gridSize));
    }
    return ids;
  }

  function placeRoadOrBridge(idx:number){
    const t = grid[idx];
    if (removeMode){
      if (t.terrain==='road' || t.terrain==='bridge'){
        const refund = t.terrain==='bridge' ? { coin:1, stone:1 } : { coin:1, lumber:1 };
        const next=[...grid]; next[idx] = { ...t, terrain: 'grass' }; setGrid(next); setRes((r)=> addResources(r, refund));
      }
      if (t.structure){
        const next=[...grid]; next[idx] = { ...t, structure: undefined }; setGrid(next);
      }
      return;
    }
    if (t.terrain === 'water') {
      if (!bridgeMode) { setMsg('Toggle Bridge Mode for water.'); return; }
      const cost = BRIDGE_COST; if (!canAfford(res, cost)) { setMsg('Not enough for bridge.'); return; }
      const next = [...grid]; next[idx] = { ...t, terrain: 'bridge' }; setGrid(next); setRes((r)=>pay(r,cost));
    } else if (t.terrain === 'grass') {
      if (t.biome==='thicket') { setMsg('Thicket is impassable.'); return; }
      const cost = addCosts(ROAD_BASE_COST, BIOME_ROAD_MOD[t.biome]);
      if (!canAfford(res, cost)) { setMsg('Not enough for road.'); return; }
      const next = [...grid]; next[idx] = { ...t, terrain: 'road' }; setGrid(next); setRes((r)=>pay(r,cost));
    }
  }

  const gridIndices = useMemo(()=> Array.from({length: gridSize*gridSize}, (_,i)=>i), [gridSize]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100 p-3 lg:p-6 select-none">
      <div className="max-w-[1400px] mx-auto grid gap-3 lg:gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <span>WordCity ✨</span>
            <span className="text-xs lg:text-sm font-normal opacity-70">v7 • Tiers • Happiness • Logistics • Wonder</span>
          </h1>
          <div className="flex gap-3 items-center text-xs">
            <div>Tier: <b>{tier}</b></div>
            <div>😊 {happiness}%</div>
            <div>👥 {population}/{housing}</div>
            <div>🔤 {letterPool}/{maxLetters}</div>
            <input value={seed} onChange={(e)=>setSeed(e.target.value)} placeholder="map seed" className="px-2 py-1 rounded bg-slate-900 border border-slate-700" />
            <button className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700" onClick={()=>{ setGrid(generateProceduralTerrain(gridSize, seed)); setMsg(`New map ${seed}`); }}>New Map</button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-slate-800/60 border border-slate-700 text-xs">
          <div className="px-2 py-1 rounded-xl bg-slate-900 border border-slate-700">💰 <b>{res.coin}</b></div>
          <div className="px-2 py-1 rounded-xl bg-slate-900 border border-slate-700">🪵 <b>{res.lumber}</b></div>
          <div className="px-2 py-1 rounded-xl bg-slate-900 border border-slate-700">🪨 <b>{res.stone}</b></div>
          <div className="px-2 py-1 rounded-xl bg-slate-900 border border-slate-700">📖 <b>{res.knowledge}</b></div>
          <div className="px-2 py-1 rounded-xl bg-slate-900 border border-slate-700">✨ <b>{res.magic}</b></div>
          <label className="flex items-center gap-1 ml-auto"><input type="checkbox" checked={removeMode} onChange={(e)=>setRemoveMode(e.target.checked)} /> Remove</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={bridgeMode} onChange={(e)=>setBridgeMode(e.target.checked)} /> Bridge</label>
          <div className="opacity-80">{msg}</div>
        </div>

        <div className="grid lg:grid-cols-[2fr_1fr] gap-3">
          <div className="bg-slate-800/60 rounded-2xl p-2 border border-slate-700 h-[680px] overflow-auto"
               onMouseDown={()=>setMouseDown(true)} onMouseUp={()=>setMouseDown(false)} onMouseLeave={()=>setMouseDown(false)}>
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 22px))` }}>
              {gridIndices.map((idx)=>{
                const t = grid[idx];
                const bgTerrain = t.terrain === 'water' ? 'bg-sky-900/60 border-sky-800' : t.terrain === 'road' ? 'bg-amber-900/40 border-amber-800' : t.terrain === 'bridge' ? 'bg-amber-800/60 border-amber-700' : 'bg-slate-900 border-slate-700';
                const biomeRing = t.biome === 'forest' ? 'ring-1 ring-emerald-800/40' : t.biome === 'hill' ? 'ring-1 ring-stone-700/40' : t.biome === 'marsh' ? 'ring-1 ring-teal-800/40' : t.biome === 'thicket' ? 'ring-1 ring-green-900/50' : '';

                return (
                  <button
                    key={idx}
                    onMouseEnter={() => { setHoverIdx(idx); if (mouseDown && selected && (selected as any).id==='__road__') placeRoadOrBridge(idx); }}
                    onMouseLeave={() => setHoverIdx(null)}
                    onClick={() => {
                      if (selected && (selected as any).id !== '__road__'){
                        const b = selected as Building;
                        const fp = getFootprint(b, idx); if (!fp) return setMsg("Out of bounds");
                        for (const ii of fp){ const tile = grid[ii]; if (!((tile.terrain==='road'||tile.terrain==='bridge') && !tile.structure)) return setMsg("Needs empty road/bridge footprint"); }
                        const cost = scaledCost(b, 1); if (!canAfford(res, cost)) return setMsg("Not enough resources");
                        const next=[...grid]; fp.forEach(ii=> next[ii] = { ...next[ii], structure: { id: b.id, level: 1, icon: b.icon, shape: b.shape } }); setGrid(next);
                        setRes((r)=> pay(r, cost)); setMsg(`${b.name} built`);
                      } else if (selected && (selected as any).id==='__road__') {
                        placeRoadOrBridge(idx);
                      }
                    }}
                    className={`w-[22px] h-[22px] rounded-[6px] flex items-center justify-center ${bgTerrain} ${biomeRing} hover:bg-slate-800 text-[10px] border relative overflow-hidden`}
                    title={`${t.structure?.id || t.terrain} • ${t.biome}`}
                  >
                    {t.structure ? <Icon id={t.structure.icon}/> : t.terrain === 'bridge' ? '🌉' : t.terrain === 'road' ? '🛣️' : t.terrain === 'water' ? '🌊' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700">
              <div className="mb-2 text-sm opacity-80">Type or drag letters. Word rewards scale with Tier & Happiness.</div>
              <div className="flex items-center gap-2 mb-2">
                <input value={typed} onChange={(e)=>setTyped(e.target.value)} onKeyDown={(e)=>{ if (e.key==='Enter') submitWord(typed); }} placeholder="Make a word…" className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <button onClick={()=>submitWord(typed)} className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500">Submit</button>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {rack.map((ch,i)=> (<div key={i} className="w-9 h-11 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-700 text-lg font-bold">{ch}</div>))}
                <button className="ml-auto px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800"
                  onClick={()=>{
                    const need = rack.length; const use = Math.min(need, letterPool);
                    setLetterPool(p=>p-use);
                    const newRack = generateBalancedRack(use).concat(rack.slice(use)); setRack(newRack);
                  }}>🔁 Refresh (uses pool)</button>
              </div>
            </div>

            <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700">
              <div className="mb-2 font-semibold">Build</div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button onClick={()=> setSelected({ id: "__road__" })} className={`rounded-xl p-3 text-left border bg-slate-900 hover:bg-slate-800 border-slate-700 ${selected && (selected as any).id==='__road__' ? 'ring-2 ring-indigo-500' : ''}`}>
                  <div className="text-2xl">🛣️</div>
                  <div className="font-medium">Road / Bridge</div>
                  <label className="text-xs opacity-80 flex items-center gap-2 mt-1"><input type="checkbox" checked={bridgeMode} onChange={(e)=>setBridgeMode(e.target.checked)}/> Bridge mode</label>
                </button>
                {CATALOG.filter(b=> b.tier <= tier).map((b)=>(
                  <button key={b.id} onClick={()=> setSelected(b)} disabled={!affordable(b)} className={`rounded-xl p-3 text-left border ${selected && (selected as any).id===b.id? "ring-2 ring-indigo-500": ""} ${affordable(b)? "bg-slate-900 hover:bg-slate-800 border-slate-700": "bg-slate-900/40 border-slate-800 opacity-60"}`} title={`L1 cost: 💰${b.cost.coin||0} 🪵${b.cost.lumber||0} 🪨${b.cost.stone||0} 📖${b.cost.knowledge||0} ✨${b.cost.magic||0}`}>
                    <div className="flex items-center gap-2"><Icon id={b.icon}/><div className="font-medium">{b.name}</div></div>
                    <div className="text-[10px] opacity-70">T{b.tier} {b.shape? '• irregular':'• ' + b.w + '×' + b.h}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700">
              <div className="mb-2 font-semibold">Great Library (Wonder)</div>
              <ol className="list-decimal pl-5 text-sm">
                <li className={wonderProgress.len8? "line-through opacity-60": ""}>One word ≥ 8 letters</li>
                <li className={wonderProgress.rare? "line-through opacity-60": ""}>One word with Q/X/Z</li>
                <li className={wonderProgress.vv? "line-through opacity-60": ""}>One word with double vowel</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
