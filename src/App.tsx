import React, { useEffect, useState } from "react";
import MapView from "./pixi/MapView";

/* =======================
   Constants & Types
   ======================= */

type Resources = { coin: number; lumber: number; stone: number; knowledge: number; magic: number };
type Biome = "meadow" | "forest" | "hill" | "marsh" | "thicket";
type Tile = {
  terrain: "grass" | "water" | "road" | "bridge";
  biome: Biome;
  structure?: { id: string; level: number; icon: string; shape?: Array<[number, number]> };
};

type Building = {
  id: string;
  name: string;
  icon: string;
  tier: 1 | 2 | 3;
  w: number;
  h: number;
  shape?: Array<[number, number]>;
  cost: Partial<Resources>;
  happiness?: number;
  housing?: number;
};

const GRID_SIZE = 54;
const DEFAULT_RACK_SIZE = 8;
const WORD_LIST_PATH = "/words-enable.txt"; // keep this near the top

async function loadWords(): Promise<Set<string>> {
  try {
    const res = await fetch(WORD_LIST_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("No words file");
    const text = await res.text();
    const words = text
      .split(/\r?\n/)
      .map(w => w.trim().toUpperCase())
      .filter(w => /^[A-Z]{3,}$/.test(w));
    return new Set(words);
  } catch {
    // inline fallback so there is no global name to go missing
    return new Set(["STONE","MAGIC","GARDEN","BRIDGE","LIBRARY","RIVER","MARKET","COTTAGE"]);
  }
}


const VOWELS = new Set(["A", "E", "I", "O", "U"]);

/* Minimal cozy catalog (safe, no external art required) */
const CATALOG: Building[] = [
  { id: "cottage", name: "Cottage", icon: "cottage", tier: 1, w: 1, h: 1, cost: { coin: 10, lumber: 8 }, happiness: 1, housing: 3 },
  { id: "sawmill", name: "Sawmill", icon: "sawmill", tier: 1, w: 2, h: 2, cost: { coin: 25, lumber: 12, stone: 5 } },
  { id: "quarry", name: "Quarry", icon: "quarry", tier: 1, w: 2, h: 2, cost: { coin: 25, stone: 15 } },
  { id: "market", name: "Market", icon: "market", tier: 2, w: 3, h: 2, cost: { coin: 60, stone: 10 } },
  { id: "library", name: "Library", icon: "library", tier: 2, w: 2, h: 2, cost: { coin: 50, lumber: 15, stone: 10 } },
  { id: "pier", name: "Pier", icon: "pier", tier: 2, w: 2, h: 1, cost: { coin: 40, lumber: 10 } },
];

/* =======================
   Utilities
   ======================= */

function makeRNG(seedNum: number) {
  let s = seedNum >>> 0;
  return function rand() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function xyToIdx(x: number, y: number, size: number) {
  return y * size + x;
}
function idxToXY(idx: number, size: number) {
  return { x: idx % size, y: Math.floor(idx / size) };
}

function generateTerrain(size: number, seedStr: string): Tile[] {
  const tiles: Tile[] = Array(size * size)
    .fill(0)
    .map(() => ({ terrain: "grass", biome: "meadow" as Biome }));

  const rnd = makeRNG(hashSeed(seedStr));
  // carve a winding river + lakes
  let y = Math.floor(size / 3 + rnd() * size / 3);
  for (let x = 0; x < size; x++) {
    const width = 1 + (rnd() < 0.45 ? 0 : 1);
    for (let dy = -width; dy <= width; dy++) {
      const yy = y + dy;
      if (yy >= 0 && yy < size) tiles[xyToIdx(x, yy, size)].terrain = "water";
    }
    if (rnd() < 0.08) {
      const r = 1 + Math.floor(rnd() * 2);
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++) {
          const xx = x + dx,
            yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < size && yy < size) tiles[xyToIdx(xx, yy, size)].terrain = "water";
        }
    }
    y += [-1, 0, 1][Math.floor(rnd() * 3)];
    y = Math.max(1, Math.min(size - 2, y));
  }

  // biome patches
  const patch = (type: Biome, attempts: number, radius: number, prob = 0.8) => {
    for (let i = 0; i < attempts; i++) {
      const cx = Math.floor(rnd() * size),
        cy = Math.floor(rnd() * size);
      for (let dx = -radius; dx <= radius; dx++)
        for (let dy = -radius; dy <= radius; dy++) {
          const xx = cx + dx,
            yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
          const ii = xyToIdx(xx, yy, size);
          if (tiles[ii].terrain === "water") continue;
          if (Math.hypot(dx, dy) <= radius && rnd() < prob) tiles[ii].biome = type;
        }
    }
  };
  patch("forest", 12, 2);
  patch("hill", 10, 2);
  patch("thicket", 5, 2, 0.9);

  // marsh near water
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].terrain === "water") continue;
    const { x, y } = idxToXY(i, size);
    const nearWater = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([dx, dy]) => {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= size || yy >= size) return false;
      return tiles[xyToIdx(xx, yy, size)].terrain === "water";
    });
    if (nearWater && tiles[i].biome === "meadow") tiles[i].biome = "marsh";
  }

  return tiles;
}

function weightedRandomLetter() {
  // Heavily weighted vowels/common consonants (quick Scrabble-like bag)
  const bag = "EEEEEEEEETTAAOOIINNSHHRRDDLCLUCMWFGYPBVKJXZQ";
  return bag[Math.floor(Math.random() * bag.length)] || "E";
}
function generateRack(n: number) {
  const r: string[] = [];
  while (r.length < n) r.push(weightedRandomLetter());
  return r;
}
function countChars(str: string) {
  const m: Record<string, number> = {};
  for (const c of str) m[c] = (m[c] || 0) + 1;
  return m;
}
function canFormFromRack(word: string, rack: string[]) {
  const need = countChars(word);
  const have = countChars(rack.join(""));
  return Object.keys(need).every((k) => (have[k] || 0) >= need[k]);
}

async function loadWords(): Promise<Set<string>> {
  try {
    const res = await fetch(WORD_LIST_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error("No words file");
    const text = await res.text();
    const words = text
      .split(/\r?\n/)
      .map((w) => w.trim().toUpperCase())
      .filter((w) => /^[A-Z]{3,}$/.test(w));
    return new Set(words);
  } catch {
    return new Set(FALLBACK);
  }
}

/* =======================
   App
   ======================= */

export default function App() {
  const [grid] = useState<Tile[]>(() => generateTerrain(GRID_SIZE, new Date().toISOString()));
  const [rack, setRack] = useState<string[]>(() => generateRack(DEFAULT_RACK_SIZE));
  const [typed, setTyped] = useState("");
 const [dict, setDict] = useState<Set<string>>(
  new Set(["STONE","MAGIC","GARDEN","BRIDGE","LIBRARY","RIVER","MARKET","COTTAGE"])
);
  const [msg, setMsg] = useState("Cozy build: drag to pan, wheel to zoom. Build roads/bridges first!");
  const [res, setRes] = useState<Resources>({ coin: 0, lumber: 0, stone: 0, knowledge: 0, magic: 0 });
  const [happiness] = useState(80);
  const [tier] = useState<1 | 2 | 3>(1);

  const [selected, setSelected] = useState<Building | { id: "__road__" } | null>(null);
  const [bridgeMode, setBridgeMode] = useState(false);
  const [removeMode, setRemoveMode] = useState(false);

  useEffect(() => {
    (async () => setDict(await loadWords()))();
  }, []);

  // road / bridge painting + building placement
  function placeRoadOrBridge(i: number) {
    setMsg("");
    setGrid((g) => {
      const t = g[i];
      if (!t) return g;
      if (removeMode) {
        // remove road/bridge or structure
        if (t.terrain === "road" || t.terrain === "bridge") {
          const next = [...g];
          next[i] = { ...t, terrain: "grass" };
          return next;
        }
        if (t.structure) {
          const next = [...g];
          next[i] = { ...t, structure: undefined };
          return next;
        }
        return g;
      }
      if (t.terrain === "water") {
        if (!bridgeMode) {
          setMsg("Toggle Bridge to span water.");
          return g;
        }
        const next = [...g];
        next[i] = { ...t, terrain: "bridge" };
        return next;
      } else if (t.terrain === "grass") {
        if (t.biome === "thicket") {
          setMsg("Thicket is impassable.");
          return g;
        }
        const next = [...g];
        next[i] = { ...t, terrain: "road" };
        return next;
      }
      return g;
    });
  }

  function setGrid(updater: (g: Tile[]) => Tile[]) {
    // helper to safely update grid state since grid itself is const initialization
    _setGrid((prev) => updater(prev));
  }
  const [_grid, _setGrid] = useState<Tile[]>(grid); // internal mutable copy handed to MapView
  useEffect(() => {
    // initialize internal grid copy once
    _setGrid(grid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onClickTile(i: number) {
    // road/bridge tool
    if (selected && (selected as any).id === "__road__") {
      placeRoadOrBridge(i);
      return;
    }

    // buildings must sit on existing road/bridge footprint
    if (!selected) return;
    const b = selected as Building;
    const { x, y } = idxToXY(i, GRID_SIZE);
    const pts = b.shape ?? Array.from({ length: b.w * b.h }, (_, k) => [k % b.w, Math.floor(k / b.w)] as [number, number]);

    const ids: number[] = [];
    for (const [dx, dy] of pts) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= GRID_SIZE || yy >= GRID_SIZE) {
        setMsg("Out of bounds.");
        return;
      }
      const ii = xyToIdx(xx, yy, GRID_SIZE);
      const tt = _grid[ii];
      if (!tt || !((tt.terrain === "road" || tt.terrain === "bridge") && !tt.structure)) {
        setMsg("Needs empty road/bridge tiles.");
        return;
      }
      ids.push(ii);
    }

    _setGrid((g) => {
      const next = [...g];
      ids.forEach((ii) => (next[ii] = { ...next[ii], structure: { id: b.id, level: 1, icon: b.icon, shape: b.shape } }));
      return next;
    });
    setMsg(`${b.name} built`);
  }

  function onDragTile(i: number) {
    if (selected && (selected as any).id === "__road__") placeRoadOrBridge(i);
  }

  function submitWord(raw: string) {
    const word = (raw || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (word.length < (tier >= 2 ? 4 : 3)) return setMsg("Word too short for this tier.");
    if (!canFormFromRack(word, rack)) return setMsg("Can't form from rack.");
    if (!dict.has(word)) return setMsg("Not in dictionary.");

    const vowels = (word.match(/[AEIOU]/g) || []).length;
    const rares = (word.match(/[JQXZKV]/g) || []).length;
    const gain: Resources = {
      coin: Math.max(1, Math.floor(word.length / 2)),
      lumber: Math.floor((word.length - vowels) / 3),
      stone: Math.floor((word.length - vowels) / 4),
      knowledge: Math.floor(vowels / 2),
      magic: rares,
    };
    const mult = happiness >= 80 ? 1.2 : happiness <= 20 ? 0.8 : 1;
    (Object.keys(gain) as (keyof Resources)[]).forEach((k) => (gain[k] = Math.floor(gain[k] * mult)));

    setRes((r) => ({
      coin: r.coin + gain.coin,
      lumber: r.lumber + gain.lumber,
      stone: r.stone + gain.stone,
      knowledge: r.knowledge + gain.knowledge,
      magic: r.magic + gain.magic,
    }));

    // consume letters and refill
    const need = countChars(word);
    const keep: string[] = [];
    for (const ch of rack) {
      if (need[ch]) need[ch]--;
      else keep.push(ch);
    }
    while (keep.length < rack.length) keep.push(weightedRandomLetter());
    setRack(keep);

    setTyped("");
    setMsg(`+${gain.coin}c +${gain.lumber}l +${gain.stone}s +${gain.knowledge}k +${gain.magic}m`);
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(#0b1220,#0a0f1a)", color: "#e5e7eb", padding: 12 }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h1 style={{ fontWeight: 800, fontSize: 20 }}>WordCity ✨ <span style={{ opacity: 0.6, fontSize: 12 }}>cozy build</span></h1>
          <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
            <div>💰 {res.coin}</div>
            <div>🪵 {res.lumber}</div>
            <div>🪨 {res.stone}</div>
            <div>📖 {res.knowledge}</div>
            <div>✨ {res.magic}</div>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={removeMode} onChange={(e) => setRemoveMode(e.target.checked)} /> Remove
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="checkbox" checked={bridgeMode} onChange={(e) => setBridgeMode(e.target.checked)} /> Bridge
            </label>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div style={{ background: "rgba(30,41,59,.6)", border: "1px solid #334155", borderRadius: 16, padding: 8, overflow: "hidden" }}>
            <MapView tiles={_grid} size={GRID_SIZE} tileSize={28} ghost={null} onClick={onClickTile} onDrag={onDragTile} />
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ background: "rgba(30,41,59,.6)", border: "1px solid #334155", borderRadius: 16, padding: 12 }}>
              <div style={{ marginBottom: 8, opacity: 0.85, fontSize: 14 }}>{msg}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitWord(typed); }}
                  placeholder="Type a word…"
                  style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", color: "#e5e7eb" }}
                />
                <button onClick={() => submitWord(typed)} style={{ padding: "8px 12px", borderRadius: 10, background: "#6366f1", border: "none", color: "#fff" }}>
                  Submit
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {rack.map((ch, i) => (
                  <div key={i} style={{ width: 36, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: "1px solid #334155", background: "#0b1220", fontWeight: 800 }}>
                    {ch}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: "rgba(30,41,59,.6)", border: "1px solid #334155", borderRadius: 16, padding: 12 }}>
              <div style={{ marginBottom: 8, fontWeight: 700 }}>Build</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button
                  onClick={() => setSelected({ id: "__road__" })}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #334155",
                    background: selected && (selected as any).id === "__road__" ? "#4338ca" : "#0b1220",
                    color: "#e5e7eb",
                  }}
                >
                  <div style={{ fontSize: 18 }}>🛣️</div>
                  <div style={{ fontWeight: 600 }}>Road / Bridge</div>
                </button>

                {CATALOG.filter((b) => b.tier <= tier).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setSelected(b)}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #334155",
                      background: selected && (selected as any).id === b.id ? "#4338ca" : "#0b1220",
                      color: "#e5e7eb",
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.75 }}>T{b.tier} • {b.w}×{b.h}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <footer style={{ textAlign: "center", fontSize: 11, opacity: 0.6, marginTop: 10 }}>
          Painterly tiles • Roads/Bridges • Word→resources • Open dictionary with fallback
        </footer>
      </div>
    </div>
  );
}
