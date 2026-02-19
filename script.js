const CFG = window.FLIP_CONFIG;
if (!CFG) throw new Error("FLIP_CONFIG not found. Check config.js.");

const $stage = document.getElementById("stage");
const $bgA = document.getElementById("bgA");
const $bgB = document.getElementById("bgB");
const $tiles = document.getElementById("tiles");
const $play = document.getElementById("play");
const $reset = document.getElementById("reset");
const $hotspot = document.getElementById("hotspot");

let runId = 0;
let useA = true;

const tileMap = new Map(); // id -> {wrap, card, front, back, word}
const state = new Map();   // id -> "front" | "en" | "ua"

function setAspect(){
  const f = (CFG.format || "16:9").trim();
  document.documentElement.style.setProperty("--aspect", f === "9:16" ? "9/16" : "16/9");
}


function fadeTilesTo(opacity, ms){
  const dur = Math.max(0, ms|0);
  $tiles.style.transitionDuration = dur + "ms";
  $tiles.style.opacity = String(opacity);
  return new Promise(res => setTimeout(res, dur));
}

function sleep(ms, myRun){
  return new Promise(res => setTimeout(() => {
    if (myRun !== runId) return res();
    res();
  }, Math.max(0, ms|0)));
}

function mountTiles(){
  $tiles.innerHTML = "";
  tileMap.clear();
  state.clear();

  const ids = CFG.order || ["t1","t2","t3","b1","b2"];
  const positions = { t1:"t1", t2:"t2", t3:"t3", b1:"b1", b2:"b2" };

  for (const id of ids){
    const wrap = document.createElement("div");
    wrap.className = "tile";
    wrap.dataset.pos = positions[id] || id;

    const card = document.createElement("div");
    card.className = "card";

    const front = document.createElement("div");
    front.className = "face front";

    const back = document.createElement("div");
    back.className = "face back";

    const word = document.createElement("div");
    word.className = "word";

    back.appendChild(word);
    card.appendChild(front);
    card.appendChild(back);
    wrap.appendChild(card);
    $tiles.appendChild(wrap);

    tileMap.set(id, {wrap, card, front, back, word});
    state.set(id, "front");
  }
}

function setBgLayer(url){
  // crossfade between bgA and bgB
  const fadeMs = (CFG.timing?.sceneFadeMs ?? 900) | 0;
  const blurPx = (CFG.timing?.sceneBlurPx ?? 10);
  document.documentElement.style.setProperty("--sceneBlurPx", `${blurPx}px`);
  document.documentElement.style.setProperty("--sceneFadeMs", fadeMs + "ms");

  const show = useA ? $bgA : $bgB;
  const hide = useA ? $bgB : $bgA;

  hide.style.backgroundImage = `url('${url}')`;
  hide.style.opacity = "1";
  show.style.opacity = "0";

  // swap flag after transition ends
  useA = !useA;
}

function setBgInstant(url){
  // set on both layers to avoid flashes
  $bgA.style.backgroundImage = `url('${url}')`;
  $bgB.style.backgroundImage = `url('${url}')`;
  $bgA.style.opacity = "1";
  $bgB.style.opacity = "0";
  useA = true;
  document.documentElement.style.setProperty("--sceneBlurPx", `0px`);
}

function computeFrontCropping(bgUrl){
  const sceneDef = (CFG.scenes || []).find(s => s.bg === bgUrl) || null;
  // Make each front show a "cropped piece" of the full stage background
  const stageRect = $stage.getBoundingClientRect();

  for (const [id, obj] of tileMap.entries()){
    const r = obj.wrap.getBoundingClientRect();
    const x = r.left - stageRect.left;
    const y = r.top - stageRect.top;

    obj.front.style.setProperty("--frontBgUrl", `url('${bgUrl}')`);
    obj.front.style.setProperty("--frontBgSize", `${stageRect.width}px ${stageRect.height}px`);
    obj.front.style.setProperty("--frontBgPos", `${-x}px ${-y}px`);

    // Якщо для плитки задано власну картинку front — використовуємо її замість вирізки з bg
    const tileDef = sceneDef && sceneDef.tiles ? sceneDef.tiles[id] : null;
    if (tileDef && tileDef.front){
      obj.front.style.setProperty("--frontBgImage", `url(${tileDef.front})`);
      obj.front.style.setProperty("--frontBgSize", `cover`);
      obj.front.style.setProperty("--frontBgPos", `center`);
    } else {
      obj.front.style.removeProperty("--frontBgImage");
      obj.front.style.removeProperty("--frontBgSize");
      // --frontBgPos залишається як вирізка
    }


    const def = (CFG.scenes?.find(s => s.bg === bgUrl)?.tiles?.[id]) || null;
    const perTile = def && typeof def.frontDark === "number" ? def.frontDark : null;
    const base = (typeof CFG.frontDarkDefault === "number") ? CFG.frontDarkDefault : 0;
    const max = (typeof CFG.frontDarkMax === "number") ? CFG.frontDarkMax : 0.45;
    const dark = Math.max(0, Math.min(max, (perTile ?? base)));
    obj.front.style.setProperty("--frontDark", dark);
  }

  const dark = Math.max(0, Math.min(0.45, CFG.frontDark ?? 0.18));
  // frontDark застосовується по плитках (див. нижче)

}


function setClosedTilesVisibility(isClosedFront){
  const fade = (CFG.closedTilesFadeMs ?? 180) | 0;
  const minO = (typeof CFG.tilesMinOpacity === 'number') ? CFG.tilesMinOpacity : 0;
  const maxO = (typeof CFG.tilesMaxOpacity === 'number') ? CFG.tilesMaxOpacity : 1;
  $tiles.style.transitionDuration = fade + 'ms';
  if (CFG.closedTilesInvisible && isClosedFront){
    $tiles.style.opacity = String(minO);
  } else {
    $tiles.style.opacity = String(maxO);
  }
}

function clearToFrontInstant(){
  for (const id of tileMap.keys()){
    const obj = tileMap.get(id);
    obj.card.style.setProperty("--cardDur", "0ms");
    obj.card.style.transform = "rotateY(0deg)";
    state.set(id, "front");
  }
  requestAnimationFrame(() => {
    for (const id of tileMap.keys()){
      tileMap.get(id).card.style.setProperty("--cardDur", "");
    }
    setClosedTilesVisibility(true);
  });
}

function setBackContent(scene, id, lang){
  const obj = tileMap.get(id);
  const def = scene.tiles[id];
  if (!obj || !def) return;

  obj.back.style.background = (lang === "en") ? CFG.colors.en : CFG.colors.ua;
  obj.word.textContent = def.text?.[lang] ?? "";
  state.set(id, lang);
}

function flipFrontToBack(scene, id){
  const obj = tileMap.get(id);
  const def = scene.tiles[id];
  if (!obj || !def) return;

  obj.card.style.setProperty("--cardDur", (def.flipToBackMs ?? 900) + "ms");
  setBackContent(scene, id, "en");
  obj.card.style.transform = "rotateY(180deg)";
}

function flipBackToFront(scene, id){
  const obj = tileMap.get(id);
  const def = scene.tiles[id];
  if (!obj || !def) return;

  obj.card.style.setProperty("--cardDur", (def.flipToBackMs ?? 900) + "ms");
  obj.card.style.transform = "rotateY(0deg)";
  state.set(id, "front");
}

function flipText(scene, id, toLang){
  const obj = tileMap.get(id);
  const def = scene.tiles[id];
  if (!obj || !def) return;

  const dur = def.flipTextMs ?? 520;
  obj.back.style.setProperty("--textFlipDur", dur + "ms");
  obj.back.classList.add("flipText");

  setTimeout(() => {
    if (state.get(id) !== "front") setBackContent(scene, id, toLang);
  }, Math.floor(dur/2));

  setTimeout(() => obj.back.classList.remove("flipText"), dur + 30);
}

async function sceneTransitionTo(nextBg, myRun){
  const fadeMs = (CFG.timing?.sceneFadeMs ?? 900) | 0;
  const blurPx = (CFG.timing?.sceneBlurPx ?? 10);
  document.documentElement.style.setProperty("--sceneBlurPx", `${blurPx}px`);

  // 1) fade tiles out (show clean full background canvas)
  const minO = (typeof CFG.tilesMinOpacity === 'number') ? CFG.tilesMinOpacity : 0;
  await fadeTilesTo(minO, Math.floor(fadeMs*0.45));
  await sleep(Math.floor(fadeMs*0.10), myRun);
  if (myRun !== runId) return;

  // 2) crossfade background to next image
  setBgLayer(nextBg);
  await sleep(fadeMs, myRun);
  if (myRun !== runId) return;

  // 3) update tile cropping to next background, then fade tiles back in
  computeFrontCropping(nextBg);
  const maxO = (typeof CFG.tilesMaxOpacity === 'number') ? CFG.tilesMaxOpacity : 1;
  const introMs = (CFG.tilesIntroFadeMs ?? Math.floor(fadeMs*0.6)) | 0;
  await fadeTilesTo(maxO, introMs);
  await sleep(Math.floor(fadeMs*0.10), myRun);
  document.documentElement.style.setProperty("--sceneBlurPx", `0px`);
}

async function playAll(){
  const myRun = ++runId;

  setAspect();
  // глобальний glow (мʼяка обводка) — керується з config.js
  const glow = (typeof CFG.frontGlowDefault === "number") ? CFG.frontGlowDefault : 0;
  const g = Math.max(0, Math.min(0.35, glow));
  document.documentElement.style.setProperty("--frontGlow", g);
  document.documentElement.style.setProperty("--frontGlowBlurPx", `${CFG.frontGlowBlurPx ?? 16}px`);
  document.documentElement.style.setProperty("--frontGlowSpreadPx", `${CFG.frontGlowSpreadPx ?? 2}px`);
  document.documentElement.style.setProperty("--frontGlowInsetPx", `${CFG.frontGlowInsetPx ?? 2}px`);
  // рамка/контур (використовується у box-shadow .face через --glow)
  const frameA = (typeof CFG.tileFrameAlpha === "number") ? CFG.tileFrameAlpha : 0;
  const frameAlpha = Math.max(0, Math.min(0.45, frameA));
  document.documentElement.style.setProperty("--tileFrameAlpha", frameAlpha);
  document.documentElement.style.setProperty("--tileFrameSizePx", `${CFG.tileFrameSizePx ?? 0}px`);
  mountTiles();

  // initial bg
  const scenes = CFG.scenes || [];
  if (!scenes.length) return;

  setBgInstant(scenes[0].bg);
  computeFrontCropping(scenes[0].bg);
  clearToFrontInstant();
  setClosedTilesVisibility(true);

  // Плавна поява плиток на старті першої сцени (поки йде initialDelayMs)
  const introMs0 = (CFG.tilesIntroFadeMs ?? 0) | 0;
  const minO0 = (typeof CFG.tilesMinOpacity === 'number') ? CFG.tilesMinOpacity : 0;
  const maxO0 = (typeof CFG.tilesMaxOpacity === 'number') ? CFG.tilesMaxOpacity : 1;
  if (introMs0 > 0){
    $tiles.style.transitionDuration = '0ms';
    $tiles.style.opacity = String(minO0);
    requestAnimationFrame(()=>{
      $tiles.style.transitionDuration = introMs0 + 'ms';
      $tiles.style.opacity = String(maxO0);
    });
    await sleep(introMs0, myRun);
  }


  const timing = CFG.timing || {};
  const initialDelay = timing.initialDelayMs ?? 0;
  const holdTile = timing.holdTileMs ?? 3000;
  const holdFinal = timing.holdFinalMs ?? 5000;
  const holdFront = timing.holdFrontBetweenScenesMs ?? 800;
  const order = CFG.order || ["t1","t2","t3","b1","b2"];

  // keep responsive: recompute cropping on resize
  const onResize = () => computeFrontCropping(currentBg());
  window.addEventListener("resize", onResize, {passive:true});

  function currentBg(){
    // whichever is currently visible
    const visible = useA ? $bgB : $bgA; // because useA toggles after setBgLayer
    // But for our logic, easier: return last applied scene bg stored on stage
    return $stage.dataset.bg || scenes[0].bg;
  }

  for (let s = 0; s < scenes.length; s++){
    if (myRun !== runId) break;

    const scene = scenes[s];
    $stage.dataset.bg = scene.bg;

    // ensure bg is correct (for first scene already set)
    if (s === 0){
      // already set
    } else {
      // we arrive here after transition already set and cropping updated
    }

    await sleep(initialDelay, myRun);

    // якщо у закритому стані плитки були прозорі — показуємо їх перед переворотами
    setClosedTilesVisibility(false);
    const intro2 = (CFG.tilesIntroFadeMs ?? (CFG.closedTilesFadeMs ?? 180)) | 0;
    if (intro2 > 0) await sleep(intro2, myRun);

    // tile-by-tile: EN 3s -> UA 3s
    for (const id of order){
      if (myRun !== runId) break;

      flipFrontToBack(scene, id);
      await sleep(holdTile, myRun);

      flipText(scene, id, "ua");
      await sleep(holdTile, myRun);
    }

    // all -> EN hold
    for (const id of order) flipText(scene, id, "en");
    await sleep(holdFinal, myRun);

    // all -> UA hold
    for (const id of order) flipText(scene, id, "ua");
    await sleep(holdFinal, myRun);

    // return to full canvas (front)
    for (const id of order) flipBackToFront(scene, id);
    // пауза на закритому полотні (перед переходом)
    setClosedTilesVisibility(true);
    const outro = (CFG.tilesOutroFadeMs ?? 0) | 0;
    const minO2 = (typeof CFG.tilesMinOpacity === 'number') ? CFG.tilesMinOpacity : 0;
    if (outro > 0 && holdFront > outro){
      await sleep(holdFront - outro, myRun);
      await fadeTilesTo(minO2, outro);
    } else {
      await sleep(holdFront, myRun);
    }

    // transition to next scene (if any)
    if (s < scenes.length - 1){
      const next = scenes[s+1];
      await sceneTransitionTo(next.bg, myRun);
      $stage.dataset.bg = next.bg;
    }
  }

  window.removeEventListener("resize", () => {});
}

// HUD
let lastTap = 0;
$hotspot.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  const now = Date.now();
  if (now - lastTap < 320){
    $stage.classList.toggle("showHud");
    lastTap = 0;
  } else lastTap = now;
});

// tap to restart when hud hidden
$stage.addEventListener("pointerdown", () => {
  if ($stage.classList.contains("showHud")) return;
  restart();
});

function restart(){ runId++; playAll(); }
function reset(){ runId++; clearToFrontInstant(); }

$play.addEventListener("click", (e)=>{ e.stopPropagation(); restart(); });
$reset.addEventListener("click",(e)=>{ e.stopPropagation(); reset(); });

// start
restart();
