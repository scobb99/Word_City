import React, { useEffect, useMemo, useRef, useState } from "react";
import MapView from "./pixi/MapView";

// ——— Types shared with MapView ———
type Resources = { coin: number; lumber: number; stone: number; knowledge: number; magic: number };
type Biome = 'meadow' | 'forest' | 'hill' | 'marsh' | 'thicket';
type Tile = { terrain: 'grass' | 'water' | 'road' | 'bridge'; biome: Biome; structure?: { id: string; level: number; icon: string; shape?: Array<[number,number]> } };

const VOWELS = new Set(["A","E","I","O","U"]);
const DEFAULT_RACK_SIZE = 8;
const WORD_LIST_PATH = "/words-enable.txt"; // <— put your big list here

// ——— Minimal catalog to demonstrate; keep your full set if you want ———
type Building = {
  id: string; name: string; icon: string; tier: 1|2|3; w: number; h: number; shape?: Array<[number, number]>;
  lvl: { maxLevel: number; aura?: Partial<Resources> }; cost: Partial<Resources>;
  rules?: { requireWaterAdj?: boolean }; happiness?: number; upkeep?: Partial<Resources>; housing?: number; growth?: number;
};
const CATALOG: Building[] = [
  { id: "cottage", name: "Cottage", icon:"cottage", tier:1, w:1, h:1, lvl:{maxLevel:3}, cost:{ coin:20, lumber:15 }, happiness:1, housing:3 },
  { id: "sawmill", name: "Sawmill", icon:"sawmill", tier:1, w:2, h:2, lvl:{maxLevel:3, aura:{lumber:1}}, cost:{ coin:35, lumber:20, stone:5 } },
  { id: "quarry", name: "Stone Quarry", icon:"quarry", tier:1, w:2, h:2, lvl:{maxLevel:3, aura:{stone:1}}, cost:{ coin:35, lumber:5, stone:20 }, happiness:-2 },
  { id: "market", name: "Market", icon:"market", tier:2, w:3, h:2, lvl:{maxLevel:3, aura:{coin:2}}, cost:{ coin:80, stone:20 }, happiness:2, growth:1 },
  { id: "library", name: "Library", icon:"library", tier:2, w:2, h:2, lvl:{maxLevel:3, aura:{knowledge:1}}, cost:{ coin:60, lumber:25, stone:10, knowledge:10 }, happiness:1 },
  { id: "pier", name: "Pier", icon:"pier", tier:2, w:2, h:1, lvl:{maxLevel:2}, cost:{ coin:55, lumber:25, stone:5 }, rules:{ requireWaterAdj:true } },
];

// ——— Word list loader ———
const FALLBACK = ["STONE","MAGIC","CLOUD","MYSTIC","GARDEN","COTTAGE","RIVER","LIBRARY","MARKET","BRIDGE"];
async function loadWords(): Promise<Set<string>> {
  try {
    const res = await fetch(WORD_LIST_PATH, { cache: 'no-store' });
    if (!res.ok) throw new Error('no list');
    const text = await res.text();
    return new Set(text.split(/\r?\n/).map(w=>w.trim().toUpperCase()).filter(Boolean));
  } catch {
    return new Set(FALLBACK);
  }
}

// ——— Map generation (same as before, trimmed) ———
function makeRNG(seedNum: number) { let s = seedNum >>> 0; return function rand() { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function hashSeed(seed: string): number { let h = 2166136261 >>> 0; for (let i=0;i<seed.length;i++){ h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function xyToIdx(x:number,y:number,size:number){ return y*size + x; }
function idxToXY(idx: number, size: number){ return { x: idx % size, y: Math.floor(idx/size) }; }

function generateTerrain(size:number, seedStr:string): Tile[] {
  const tiles: Tile[] = Array(size*size).fill(0).map(()=>({terrain:'grass', biome:'meadow'} as Tile));
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
  const patch = (type: Biome, attempts:number, radius:number, prob=0.8) => {
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
  patch('forest', 12, 2); patch('hill', 10, 2); patch('thicket', 5, 2, 0.9);
  // marsh near water
  for (let i=0;i<tiles.length;i++){
    if (tiles[i].terrain==='water') continue;
    const {x,y} = idxToXY(i,size);
    const near = [[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{
      const xx=x+dx, yy=y+dy; if (xx<0||yy<0||xx>=size||yy>=size) return false; return tiles[xyToIdx(xx,yy,size)].terrain==='water';
    });
    if (near && tiles[i].biome==='meadow') tiles[i].biome='marsh';
  }
  return tiles;
}

// ——— Helpers ———
function countChars(str: string){ const m: Record<string, number> = {}; for (const c of str) m[c]=(m[c]||0)+1; return m; }
function canFormFromRack(word: string, rack: string[]){ const need=countChars(word), have=countChars(rack.join("")); return Object.keys(need).every(k=>(have[k]||0)>=need[k]); }
function weightedRandomLetter(){ const bag = "EEEEEEEEETTAAOOIINNSHHRRDDLCLUCMWFGYPBVKJXZQ"; return bag[Math.floor(Math.random()*bag.length)] || 'E'; }
function generateRack(n:number){ const r=[] as string[]; while(r.length<n) r.push(weightedRandomLetter()); return r; }

// ——— App ———
export default function App(){
  const [gridSize] = useState(54);
  const [seed, setSeed] = useState(()=> new Date().toISOString().slice(0,10));
  const [grid, setGrid] = useState<Tile[]>(()=> generateTerrain(54, `${Date.now()}`));
  const [rack, setRack] = useState<string[]>(()=> generateRack(DEFAULT_RACK_SIZE));
  const [typed, setTyped] = useState("");
  const [dict, setDict] = useState<Set<string>>(new Set(FALLBACK));
  const [msg, setMsg] = useState("Cozy renderer active. Drag to pan, wheel to zoom. Use Road/Bridge tool and build!");

  const [selected, setSelected] = useState<Building | { id: "__road__" } | null>(null);
  const [bridgeMode, setBridgeMode] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);
  const [ghost, setGhost] = useState<number[]|null>(null);

  const [res, setRes] = useState<Resources>({ coin: 0, lumber: 0, stone: 0, knowledge: 0, magic: 0 });
  const [happiness, setHappiness] = useState(100);
  const [tier, setTier] = useState<1|2|3|4>(1);

  useEffect(()=>{ (async()=> setDict(await loadWords()))(); }, []);

  // click/drag handlers for the map
  function placeRoadOrBridge(i:number){
    const t = grid[i];
    if (removeMode){
      if (t.terrain==='road'||t.terrain==='bridge') setGrid(g=> g.map((T,k)=>k===i?{...T, terrain:'grass'}:T));
      if (t.structure) setGrid(g=> g.map((T,k)=>k===i?{...T, structure:undefined}:T));
      return;
    }
    if (t.terrain==='water'){
      if (!bridgeMode) return setMsg("Toggle Bridge to span water.");
      setGrid(g=> g.map((T,k)=>k===i?{...T, terrain:'bridge'}:T));
    } else if (t.terrain==='grass'){
      if (t.biome==='thicket') return setMsg("Thicket is impassable.");
      setGrid(g=> g.map((T,k)=>k===i?{...T, terrain:'road'}:T));
    }
  }
  function onClickTile(i:number){
    if (selected && (selected as any).id==='__road__') return placeRoadOrBridge(i);
    if (!selected || (selected as any).id==='__road__') return;
    const b = selected as Building;
    const { x,y } = idxToXY(i, gridSize);
    const pts = b.shape ?? Array.from({length:b.w*b.h},(_,k)=> [k%b.w, Math.floor(k/b.w)] as [number,number]);
    const ids:number[] = [];
    for (const [dx,dy] of pts){
      const xx=x+dx, yy=y+dy; if (xx<0||yy<0||xx>=gridSize||yy>=gridSize) return setMsg("Out of bounds");
      const ii = xyToIdx(xx,yy,gridSize); const tt = grid[ii];
      if (!((tt.terrain==='road'||tt.terrain==='bridge') && !tt.structure)) return setMsg("Needs empty road/bridge footprint");
      ids.push(ii);
    }
    setGrid(g=>{
      const next=[...g]; ids.forEach(ii=> next[ii] = { ...next[ii], structure:{ id:b.id, level:1, icon:b.icon, shape:b.shape } }); return next;
    });
    setMsg(`${b.name} built`);
    setGhost(null);
  }
  function onDragTile(i:number){
    if (selected && (selected as any).id==='__road__') placeRoadOrBridge(i);
  }

  // ghost preview on hover (MapView only gives us drag/click; to keep it simple we preview nothing until click)
  useEffect(()=>{ setGhost(null); }, [selected]);

  function submitWord(raw:string){
    const word = raw.toUpperCase().replace(/[^A-Z]/g,"");
    if (word.length < (tier>=2?4:3)) return setMsg("Word too short for current tier.");
    if (!canFormFromRack(word, rack)) return setMsg("Can't form from rack.");
    if (!dict.has(word)) return setMsg("Not in dictionary.");
    const vowels=(word.match(/[AEIOU]/g)||[]).length, rares=(word.match(/[JQXZKV]/g)||[]).length;
    const gain:Resources = { coin: Math.max(1, Math.floor(word.length/2)), lumber: Math.floor((word.length - vowels)/3), stone: Math.floor((word.length - vowels)/4), knowledge: Math.floor(vowels/2), magic: rares };
    const mult = happiness>=80?1.2:happiness<=20?0.8:1; Object.keys(gain).forEach(k=> (gain as any)[k]=Math.floor((gain as any)[k]*mult));
    setRes(r=> ({ coin:r.coin+gain.coin, lumber:r.lumber+gain.lumber, stone:r.stone+gain.stone, knowledge:r.knowledge+gain.knowledge, magic:r.magic+gain.magic }));
    // consume letters (simple)
    const need = countChars(word); const next:string[]=[]; for (const ch of rack){ if (need[ch]) need[ch]--; else next.push(ch); }
    while (next.length < rack.length) next.push(weightedRandomLetter());
    setRack(next); setTyped(""); setMsg(`+${gain.coin}c +${gain.lumber}l +${gain.stone}s +${gain.knowledge}k +${gain.magic}m`);
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 to-slate-950 text-slate-100 p-3 lg:p-6">
      <div className="max-w-[1400px] mx-auto grid gap-3 lg:gap-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl lg:text-2xl font-bold">WordCity ✨ <span className="text-xs opacity-70">Cozy renderer</span></h1>
          <div className="flex gap-3 items-center text-xs">
            <div>💰 {res.coin}</div><div>🪵 {res.lumber}</div><div>🪨 {res.stone}</div><div>📖 {res.knowledge}</div><div>✨ {res.magic}</div>
            <div>Tier {tier}</div>
            <label className="flex items-center gap-1 ml-2"><input type="checkbox" checked={removeMode} onChange={e=>setRemoveMode(e.target.checked)} /> Remove</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={bridgeMode} onChange={e=>setBridgeMode(e.target.checked)} /> Bridge</label>
          </div>
        </header>

        <div className="grid lg:grid-cols-[2fr_1fr] gap-3">
          {/* PIXI MAP */}
          <div className="rounded-2xl p-2 border border-slate-700 bg-slate-800/60 overflow-auto">
            <MapView tiles={grid} size={gridSize} tileSize={28} ghost={ghost} onClick={onClickTile} onDrag={onDragTile}/>
          </div>

          {/* Right rail */}
          <div className="grid gap-3">
            <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700">
              <div className="mb-2 text-sm opacity-80">{msg}</div>
              <div className="flex items-center gap-2 mb-2">
                <input value={typed} onChange={e=>setTyped(e.target.value)} onKeyDown={e=>{ if (e.key==='Enter') submitWord(typed); }} placeholder="Make a word…" className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700" />
                <button onClick={()=>submitWord(typed)} className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500">Submit</button>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                {rack.map((ch,i)=> (<div key={i} className="w-9 h-11 flex items-center justify-center rounded-xl bg-slate-900 border border-slate-700 text-lg font-bold">{ch}</div>))}
              </div>
            </div>

            <div className="bg-slate-800/60 rounded-2xl p-3 border border-slate-700">
              <div className="mb-2 font-semibold">Build</div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={()=> setSelected({ id: "__road__" })} className={`rounded-xl p-3 text-left border bg-slate-900 hover:bg-slate-800 border-slate-700 ${selected && (selected as any).id==='__road__' ? 'ring-2 ring-indigo-500' : ''}`}>
                  <div className="text-2xl">🛣️</div><div className="font-medium">Road / Bridge</div>
                </button>
                {CATALOG.filter(b=> b.tier <= tier).map(b=>(
                  <button key={b.id} onClick={()=> setSelected(b)} className={`rounded-xl p-3 text-left border ${selected && (selected as any).id===b.id? "ring-2 ring-indigo-500": ""} bg-slate-900 hover:bg-slate-800 border-slate-700`}>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-[10px] opacity-70">T{b.tier} {b.shape? '• irregular':'• ' + b.w + '×' + b.h}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer className="text-[10px] opacity-60 text-center">Pixi renderer • painterly tiles • keep all mechanics; swap your full catalog back in anytime.</footer>
      </div>
    </div>
  );
}
