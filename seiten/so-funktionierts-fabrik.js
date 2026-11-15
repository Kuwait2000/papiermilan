/* Skript der Seite so-funktionierts.html.
   Stand frueher direkt in der HTML-Datei. Ausgelagert, damit die Seite keine
   Inline-Skripte mehr braucht und die Content-Security-Policy ohne
   'unsafe-inline' auskommt (siehe README, Abschnitt Sicherheit). */
(function () {
const THREE = window.THREE;
if (!THREE) { document.getElementById('stage').classList.add('nogl'); return; }

const stage = document.getElementById('stage');
const canvas = document.getElementById('fabrik-canvas');
const fab = document.getElementById('fabrik');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const klein = matchMedia('(max-width: 760px)').matches;

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (err) { renderer = null; }
if (!renderer || !renderer.getContext()) { stage.classList.add('nogl'); }
else { bauen(); }

function bauen(){
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, klein ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const HG = new THREE.Color('#f8f7f4');
  scene.background = HG;
  scene.fog = new THREE.Fog(HG, 95, 240);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 500);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b4aa, 2.1));
  const sonne = new THREE.DirectionalLight(0xffffff, 2.3);
  sonne.position.set(-26, 58, 34);
  sonne.castShadow = true;
  sonne.shadow.mapSize.set(klein ? 1024 : 2048, klein ? 1024 : 2048);
  Object.assign(sonne.shadow.camera, { left:-64, right:64, top:42, bottom:-42, near:10, far:170 });
  sonne.shadow.bias = -0.0004; sonne.shadow.normalBias = 0.03;
  scene.add(sonne);

  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const M = {
    weiss: lam('#fbfbfa'), hell: lam('#e8e6e1'), mittel: lam('#c9c6bf'), dunkel: lam('#16232b'),
    rot: lam('#b00e2b'), boden: lam('#f1efe9'), papier: lam('#ffffff'), akte: lam('#d6d3cc'),
    blau: lam('#003e59')
  };
  const ROTLICHT = new THREE.MeshBasicMaterial({ color: '#d0213f' });
  const KANTE = new THREE.LineBasicMaterial({ color: '#16232b' });
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  const geoCache = new Map(), kantenCache = new Map();
  function boxGeo(w, h, d){ const k = w + '|' + h + '|' + d; if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d)); return geoCache.get(k); }
  function kanten(g, thr = 1){ const k = g.uuid + ':' + thr; if (!kantenCache.has(k)) kantenCache.set(k, new THREE.EdgesGeometry(g, thr)); return kantenCache.get(k); }
  function box(w, h, d, mat, x, y, z, parent = scene, opt = {}){
    const g = boxGeo(w, h, d), m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.castShadow = opt.schatten !== false; m.receiveShadow = true;
    if (opt.kanten !== false) m.add(new THREE.LineSegments(kanten(g), KANTE));
    parent.add(m); return m;
  }
  // steht auf y0: Mittelpunkt liegt h/2 darüber
  const steh = (w, h, d, mat, x, z, y0 = 0, parent = scene, opt) => box(w, h, d, mat, x, y0 + h / 2, z, parent, opt);
  function zyl(r, h, mat, x, y, z, parent = scene, opt = {}){
    const g = new THREE.CylinderGeometry(opt.oben ?? r, r, h, opt.seg ?? 48);
    const m = new THREE.Mesh(g, mat); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    if (opt.kanten !== false) m.add(new THREE.LineSegments(kanten(g, 25), KANTE));
    parent.add(m); return m;
  }

  /* Beschriftungen als Textur */
  const aniso = renderer.capabilities.getMaxAnisotropy();
  function etikett(text, h, opt = {}){
    const size = 64, pad = opt.pad ?? 30;
    const c = document.createElement('canvas'), ctx = c.getContext('2d');
    const font = `${opt.gewicht ?? 600} ${size}px ${MONO}`;
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + pad * 2, hh = Math.round(size * 1.65);
    c.width = w; c.height = hh;
    ctx.fillStyle = opt.grund ?? '#ffffff'; ctx.fillRect(0, 0, w, hh);
    if (opt.rand !== false){ ctx.strokeStyle = opt.farbe ?? '#16232b'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, hh - 8); }
    ctx.font = font; ctx.fillStyle = opt.farbe ?? '#16232b'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, hh / 2 + 3);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(h * w / hh, h), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    return m;
  }
  function schild(text, x, z, opt = {}){
    const hoehe = opt.hoehe ?? 5.2, ry = opt.ry ?? 0.42;
    steh(0.14, hoehe, 0.14, M.dunkel, x, z, 0, scene, { kanten:false });
    const e = etikett(text, opt.h ?? 0.95);
    e.position.set(x, hoehe + (opt.h ?? 0.95) / 2 - 0.05, z); e.rotation.y = ry;
    scene.add(e); return e;
  }

  /* ---------- Halle ---------- */
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), M.boden);
  boden.rotation.x = -Math.PI / 2; boden.receiveShadow = true; scene.add(boden);
  const raster = new THREE.GridHelper(330, 110, '#dcd8cf', '#e4e0d8'); raster.position.y = 0.004; scene.add(raster);
  box(108, 0.14, 32, M.weiss, 1.5, 0.07, -1.5, scene, { schatten:false });
  box(104, 0.02, 0.2, M.dunkel, 1.5, 0.15, 9.2, scene, { kanten:false, schatten:false });
  box(104, 0.02, 0.2, M.dunkel, 1.5, 0.15, -12.4, scene, { kanten:false, schatten:false });
  for (let x = -49; x <= 52; x += 6.5) box(2.6, 0.02, 0.2, M.dunkel, x, 0.15, 11.2, scene, { kanten:false, schatten:false });
  // Stützen an der Rückwand
  for (let x = -52; x <= 55; x += 13){ steh(0.7, 15, 0.7, M.hell, x, -16.5); }
  box(108, 0.9, 0.9, M.hell, 1.5, 15.45, -16.5);
  box(108, 0.4, 0.4, M.hell, 1.5, 9.5, -16.5);
  // Poller
  [[-47,6],[-31,7],[-19,-7.8],[-6,8],[7.5,-9.4],[20,7.5],[32,8],[50,-6]].forEach(([x,z]) => steh(0.36, 1.1, 0.36, M.dunkel, x, z, 0.14, scene, { kanten:false }));

  /* ---------- Förderband ---------- */
  const ST = [-39, -26, -13, 0, 13, 26, 39];
  const BAND_OBEN = 1.3;
  function band(x0, x1, z){
    const L = x1 - x0, c = (x0 + x1) / 2;
    box(L, 0.5, 2.4, M.hell, c, 0.95, z);
    box(L, 0.1, 2.0, M.dunkel, c, 1.25, z, scene, { kanten:false });
    for (let x = x0 + 0.8; x < x1; x += 3.1){ steh(0.26, 0.7, 0.26, M.mittel, x, z + 0.9, 0, scene, { kanten:false }); steh(0.26, 0.7, 0.26, M.mittel, x, z - 0.9, 0, scene, { kanten:false }); }
  }
  band(-44, 44.6, 0);
  band(-4, 14.6, -5);
  // Querbänder zwischen Hauptband und Rücklauf
  box(2.4, 0.5, 3.6, M.hell, 14.6, 0.95, -3.0); box(2.0, 0.1, 3.6, M.dunkel, 14.6, 1.25, -3.0, scene, { kanten:false });
  box(2.4, 0.5, 3.6, M.hell, -4, 0.95, -3.0); box(2.0, 0.1, 3.6, M.dunkel, -4, 1.25, -3.0, scene, { kanten:false });

  /* ---------- 01 Annahme ---------- */
  const SCHR = [-43, -39, -35];
  ['STADTRAT', '12 BZA', 'BEZIRK OBB'].forEach((name, i) => {
    const x = SCHR[i], H = 6.4;
    steh(3.2, H, 2.4, M.weiss, x, -4.6);
    for (let r = 0; r < 5; r++){
      box(2.7, 0.06, 0.04, M.dunkel, x, 0.75 + r * 1.12, -3.38, scene, { kanten:false, schatten:false });
      box(0.6, 0.14, 0.08, M.dunkel, x, 1.25 + r * 1.12, -3.36, scene, { kanten:false, schatten:false });
    }
    const e = etikett(name, 0.5); e.position.set(x, H - 0.45, -3.37); scene.add(e);
    steh(2.6, 0.12, 1.9, M.hell, x, -4.6, H);
    for (let k = 0; k < 3; k++) steh(0.95, 0.22, 1.25, M.akte, x - 0.5 + k * 0.5, -4.6 + (k % 2) * 0.2, H + 0.12 + k * 0.22);
  });
  [[-45, -7], [-45, 2.2], [-33, -7], [-33, 2.2]].forEach(([x, z]) => steh(0.42, 10.6, 0.42, M.hell, x, z));
  box(0.5, 0.5, 9.7, M.hell, -45, 10.85, -2.4); box(0.5, 0.5, 9.7, M.hell, -33, 10.85, -2.4);
  const bruecke = box(12.5, 0.6, 0.7, M.weiss, -39, 11.3, 0);
  const katze = box(1.3, 0.8, 1.1, M.weiss, 0, -0.7, 0, bruecke);
  const seil = box(0.07, 1, 0.07, M.dunkel, 0, -2, 0, katze, { kanten:false });
  const greifer = new THREE.Group(); katze.add(greifer);
  box(1.1, 0.35, 1.1, M.dunkel, 0, 0, 0, greifer);
  box(0.12, 0.6, 0.95, M.mittel, -0.52, -0.42, 0, greifer); box(0.12, 0.6, 0.95, M.mittel, 0.52, -0.42, 0, greifer);
  const fracht = box(0.95, 0.24, 1.25, M.akte, 0, -0.42, 0, greifer);
  const KATZE_Y = 11.3 - 0.7;
  const GK = [ // Phase, Brücke z, Ziel, Greifer y, trägt
    [0.00, -4.6, 'schrank', 9.4, 0], [0.10, -4.6, 'schrank', 7.25, 0], [0.18, -4.6, 'schrank', 7.25, 1],
    [0.28, -4.6, 'schrank', 9.4, 1], [0.50, 0.0, 'band', 9.4, 1], [0.62, 0.0, 'band', 2.05, 1],
    [0.68, 0.0, 'band', 2.05, 0], [0.80, 0.0, 'band', 9.4, 0], [1.00, -4.6, 'naechster', 9.4, 0]
  ];

  /* ---------- 02 Sortierer ---------- */
  steh(0.5, 4.4, 0.5, M.weiss, -26, 1.7); steh(0.5, 4.4, 0.5, M.weiss, -26, -1.7);
  box(0.8, 0.7, 4.2, M.weiss, -26, 4.75, 0);
  box(0.8, 0.45, 0.8, M.dunkel, -26, 4.17, 0);
  box(1.8, 1.3, 1.4, M.weiss, -24.6, 1.5, -2.4);
  const schieber2 = box(1.4, 0.55, 0.14, M.dunkel, -24.6, 1.6, -1.4);
  const stange2 = box(0.16, 0.16, 1, M.mittel, -24.6, 1.6, -1.9, scene, { kanten:false });
  box(2.3, 0.1, 3.8, M.hell, -24.6, 1.2, 3.1);
  const KX = -24.6, KZ = 6.1;
  box(3.4, 0.2, 2.8, M.weiss, KX, 0.24, KZ);
  box(3.4, 1.0, 0.14, M.weiss, KX, 0.64, KZ - 1.33); box(3.4, 1.0, 0.14, M.weiss, KX, 0.64, KZ + 1.33);
  box(0.14, 1.0, 2.8, M.weiss, KX - 1.63, 0.64, KZ); box(0.14, 1.0, 2.8, M.weiss, KX + 1.63, 0.64, KZ);
  for (let k = 0; k < 5; k++) box(0.95, 0.05, 1.25, M.akte, KX - 0.7 + (k % 3) * 0.7, 0.37 + k * 0.05, KZ - 0.3 + (k % 2) * 0.5, scene, { kanten:true }).rotation.y = k * 0.4;
  { const e = etikett('ROUTINE', 0.42); e.position.set(KX, 0.62, KZ + 1.41); scene.add(e); }

  /* ---------- 03 Leser ---------- */
  steh(4.2, 3.4, 0.5, M.weiss, -13, 1.45); steh(4.2, 3.4, 0.5, M.weiss, -13, -1.45);
  box(4.7, 0.9, 3.5, M.weiss, -13, 3.85, 0);
  box(3.7, 0.04, 2.9, M.dunkel, -13, 4.32, 0, scene, { kanten:false, schatten:false });
  const scan = box(0.16, 0.08, 2.8, ROTLICHT, -13, 4.37, 0, scene, { kanten:false, schatten:false });
  { const e = etikett('PDF → TEXT', 0.5); e.position.set(-13, 3.85, 1.76); scene.add(e); }
  steh(1.7, 1.0, 1.4, M.hell, -10.6, 3.6);
  { const e = etikett('ANLAGEN', 0.34); e.position.set(-10.6, 0.55, 4.31); scene.add(e); }
  box(1.2, 0.04, 0.04, M.dunkel, -10.6, 1.03, 3.6, scene, { kanten:false }).rotation.y = 0.8;
  box(1.2, 0.04, 0.04, M.dunkel, -10.6, 1.03, 3.6, scene, { kanten:false }).rotation.y = -0.8;

  /* ---------- 04 Sprachmodell ---------- */
  const SZ = -0.2;
  zyl(3.05, 0.4, M.hell, 0, 0.34, SZ);
  zyl(2.7, 5.6, M.weiss, 0, 3.0, SZ);
  zyl(2.74, 0.55, M.blau, 0, 3.9, SZ, scene, { kanten:false });
  zyl(2.74, 0.1, M.blau, 0, 4.9, SZ, scene, { kanten:false });
  zyl(1.9, 0.6, M.hell, 0, 6.1, SZ);
  const ring = new THREE.Group(); ring.position.set(0, 6.75, SZ); scene.add(ring);
  for (let k = 0; k < 6; k++){ const a = k / 6 * Math.PI * 2; const f = box(0.32, 0.55, 1.3, M.weiss, Math.cos(a) * 1.45, 0, Math.sin(a) * 1.45, ring); f.rotation.y = -a; }
  steh(0.18, 2.4, 0.18, M.dunkel, 0, SZ, 6.4, scene, { kanten:false });
  const mastLicht = box(0.36, 0.36, 0.36, ROTLICHT, 0, 8.95, SZ, scene, { kanten:false, schatten:false });
  // Trichter mit dem Regelwerk
  [[-1, -6.6], [1, -6.6], [-1, -8.6], [1, -8.6]].forEach(([x, z]) => steh(0.2, 5.6, 0.2, M.hell, x, z));
  const trichter = zyl(0.5, 2.3, M.weiss, 0, 6.75, -7.6, scene, { oben: 1.9, seg: 4 }); trichter.rotation.y = Math.PI / 4;
  const rohr = zyl(0.24, 5.2, M.hell, 0, 5.45, -5.0); rohr.rotation.x = Math.PI / 2;
  { const e = etikett('REGELN · KURATION.md', 0.5); e.position.set(0, 8.25, -6.45); scene.add(e); }
  for (let k = 0; k < 4; k++) box(0.8, 0.05, 1.05, M.papier, -0.3 + k * 0.2, 7.95 + k * 0.06, -7.6, scene).rotation.y = k * 0.5;

  /* ---------- 05 Prüfstand ---------- */
  steh(0.5, 4.2, 0.7, M.weiss, 13, 1.75); steh(0.5, 4.2, 0.7, M.weiss, 13, -1.75);
  box(1.0, 0.85, 4.2, M.weiss, 13, 4.6, 0);
  box(0.06, 2.6, 0.6, M.dunkel, 12.72, 2.6, 1.45, scene, { kanten:false }); box(0.06, 2.6, 0.6, M.dunkel, 12.72, 2.6, -1.45, scene, { kanten:false });
  const lampe = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  lampe.position.set(13, 5.4, 0); scene.add(lampe);
  lampe.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.4, 0.4, 0.2, 24), 25), KANTE));
  box(1.7, 1.3, 1.4, M.weiss, 14.6, 1.5, 2.6);
  const schieber5 = box(1.4, 0.55, 0.14, M.dunkel, 14.6, 1.6, 1.6);
  const stange5 = box(0.16, 0.16, 1, M.mittel, 14.6, 1.6, 2.0, scene, { kanten:false });
  { const e = etikett('16 PRÜFUNGEN', 0.42); e.position.set(13.52, 4.6, 0); e.rotation.y = Math.PI / 2; scene.add(e); }
  { const e = etikett('ZURÜCK', 0.42); e.position.set(5.2, 0.95, -3.79); scene.add(e); }

  /* ---------- 06 Stempel ---------- */
  steh(0.6, 5.8, 0.8, M.weiss, 26, 1.8); steh(0.6, 5.8, 0.8, M.weiss, 26, -1.8);
  box(1.9, 1.2, 4.4, M.weiss, 26, 6.4, 0);
  const ramme = new THREE.Group(); ramme.position.set(26, 4.4, 0); scene.add(ramme);
  box(1.2, 1.6, 1.2, M.hell, 0, 0, 0, ramme);
  zyl(0.52, 0.16, M.dunkel, 0, -0.88, 0, ramme, { kanten:false });
  steh(2.6, 1.1, 1.8, M.hell, 26.2, -4.4);
  for (let k = 0; k < 5; k++) box(1.6, 0.24, 1.15, k % 2 ? M.mittel : M.dunkel, 26.2 + (k % 2) * 0.12, 1.24 + k * 0.24, -4.4, scene, { kanten:true }).rotation.y = (k % 3) * 0.06;
  { const e = etikett('NIEDERSCHRIFTEN', 0.36); e.position.set(26.2, 0.6, -3.49); scene.add(e); }

  /* ---------- 07 Ausgabe ---------- */
  const RX = 34.6, RW = 2.2, RZ = -5;
  for (let i = 0; i <= 4; i++){ steh(0.16, 8.4, 0.16, M.hell, RX + i * RW, RZ + 1.12); steh(0.16, 8.4, 0.16, M.hell, RX + i * RW, RZ - 1.12); }
  for (let r = 0; r <= 4; r++) box(RW * 4 + 0.16, 0.1, 2.4, M.weiss, RX + RW * 2, r * 2 + 0.2, RZ);
  const fuell = [0.6, 0.3, 0.9, 0.5, 0, 1.0, 0.4, 0.7, 0.8, 0.2, 0.6, 1.1, 0.5, 0.9, 0.3, 0.7];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++){
    const h = fuell[r * 4 + c]; if (!h) continue;
    if (r === 2 && c === 0) continue; // Fach für das rote Werkstück
    box(1.5, h, 1.5, M.papier, RX + c * RW + RW / 2, r * 2 + 0.25 + h / 2, RZ, scene);
  }
  { const e = etikett('12 BEZIRKE + STADTWEIT', 0.5); e.position.set(RX + RW * 2, 8.95, RZ + 1.2); scene.add(e); }
  // Bildschirm: die Website
  const bild = new THREE.Group(); bild.position.set(47.6, 0, -0.8); bild.rotation.y = -0.42; scene.add(bild);
  steh(0.45, 2.6, 0.45, M.dunkel, 0, 0, 0, bild, { kanten:false });
  box(6.6, 4.3, 0.35, M.weiss, 0, 4.75, 0, bild);
  {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 760; const x = c.getContext('2d');
    x.fillStyle = '#f8f7f4'; x.fillRect(0, 0, 1200, 760);
    x.fillStyle = '#003e59'; x.fillRect(0, 0, 1200, 90);
    x.fillStyle = '#b00e2b'; x.fillRect(0, 90, 1200, 8);
    x.fillStyle = '#fff'; x.font = '700 44px "Source Serif 4", Georgia, serif'; x.textBaseline = 'middle'; x.fillText('PapierPanther', 40, 46);
    const karte = (y, rot) => {
      x.fillStyle = '#fff'; x.fillRect(40, y, 1120, 180);
      x.strokeStyle = rot ? '#b00e2b' : '#e4e0d8'; x.lineWidth = rot ? 6 : 4; x.strokeRect(40, y, 1120, 180);
      x.fillStyle = '#003e59'; x.fillRect(70, y + 30, rot ? 640 : 520, 28);
      x.fillStyle = '#d6d3cc'; x.fillRect(70, y + 80, 960, 14); x.fillRect(70, y + 106, 880, 14);
      x.fillStyle = rot ? '#1e6b3a' : '#e4e0d8'; x.fillRect(70, y + 136, 260, 22);
    };
    karte(130, true); karte(340, false); karte(550, false);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6.1, 3.86), new THREE.MeshBasicMaterial({ map: t }));
    p.position.set(0, 4.75, 0.18); bild.add(p);
    const e = etikett('SCHANZER-PAPIERPANTHER.DE', 0.42); e.position.set(0, 7.3, 0); bild.add(e);
  }

  /* ---------- Schilder ---------- */
  // rechts neben jeder Station, damit die Kamera das eigene Schild sieht und nicht das der nächsten
  schild('01 ANNAHME', -35.8, 3.8);
  schild('02 SORTIERER', -22.0, 3.6);
  schild('03 LESER', -9.0, 2.4);
  schild('04 SPRACHMODELL', 4.6, 3.6, { hoehe: 6.4 });
  schild('05 PRÜFSTAND', 17.2, 3.4);
  schild('06 STEMPEL', 29.4, 3.0);
  schild('07 AUSGABE', 43.4, 3.6);

  /* ---------- Blätter auf dem Band ---------- */
  const XS = -39, XE = 44.2, SY = BAND_OBEN;
  const XA = -24.6, XB = 14.6, XR = -4;
  const LAENGE = [XE - XS, (XA - XS) + 6.1, (XB - XS) + 5 + (XB - XR) + 5 + (XE - XR)];
  const EINHEIT = boxGeo(1, 1, 1);
  const blaetter = [];
  const N = 40, ABSTAND = (XE - XS) / N * 1.0;
  for (let i = 0; i < N; i++){
    const g = new THREE.Group();
    const m = new THREE.Mesh(EINHEIT, M.akte); m.castShadow = true; m.receiveShadow = true;
    m.add(new THREE.LineSegments(kanten(EINHEIT), KANTE));
    g.add(m);
    const stempel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 24), M.dunkel);
    stempel.visible = false; g.add(stempel);
    scene.add(g);
    const route = (i % 7 === 3) ? 1 : (i % 9 === 5) ? 2 : 0;
    blaetter.push({ g, m, stempel, route, off: i * ABSTAND * 1.7 + (i % 3) * 0.4, st: i % 6 === 0 });
  }
  const P = { x: 0, y: 0, z: 0, seg: 0, v: 0 };
  const sm = t => t * t * (3 - 2 * t);
  const cl = (t, a = 0, b = 1) => Math.max(a, Math.min(b, t));
  function aufRoute(r, u){
    P.seg = 0; P.v = 0; P.z = 0; P.y = SY;
    if (r === 0){ P.x = XS + u; return; }
    if (r === 1){
      const a = XA - XS;
      if (u < a){ P.x = XS + u; return; }
      const v = cl((u - a) / 6.1); P.x = XA; P.z = v * 6.1; P.seg = 9; P.v = v;
      P.y = SY - (SY - 0.42) * sm(cl((v - 0.8) / 0.2));
      return;
    }
    const a = XB - XS, b = XB - XR;
    if (u < a){ P.x = XS + u; return; }
    if (u < a + 5){ P.x = XB; P.z = -(u - a); P.seg = 1; P.v = (u - a) / 5; return; }
    if (u < a + 5 + b){ P.x = XB - (u - a - 5); P.z = -5; P.seg = 2; return; }
    if (u < a + 10 + b){ P.x = XR; P.z = -5 + (u - a - 5 - b); P.seg = 3; return; }
    P.x = XR + (u - a - 10 - b); P.seg = 4;
  }
  function form(x, seg){ if (seg === 2 || seg === 3) return 2; return x < ST[2] ? 0 : x < ST[3] ? 1 : 2; }
  const FORM = [[0.95, 0.24, 1.25], [0.95, 0.04, 1.25], [0.95, 0.09, 1.25]];

  /* ---------- Das rote Werkstück: das Beispiel ---------- */
  const stueck = new THREE.Group(); scene.add(stueck);
  const sAkte = box(1.05, 0.3, 1.35, M.rot, 0, 0.15, 0, stueck);
  const sBlatt = new THREE.Group(); stueck.add(sBlatt);
  box(1.05, 0.05, 1.35, M.rot, 0, 0.025, 0, sBlatt);
  for (let k = 0; k < 4; k++) box(k === 3 ? 0.45 : 0.75, 0.012, 0.07, M.dunkel, k === 3 ? -0.12 : 0, 0.057, -0.42 + k * 0.26, sBlatt, { kanten:false, schatten:false });
  const sDoppel = new THREE.Group(); stueck.add(sDoppel);
  box(1.05, 0.05, 1.35, M.rot, 0, 0.025, 0, sDoppel);
  box(1.05, 0.05, 1.35, M.rot, 0.2, 0.078, -0.16, sDoppel);
  for (let k = 0; k < 4; k++) box(k === 3 ? 0.45 : 0.75, 0.012, 0.07, M.dunkel, 0.2 + (k === 3 ? -0.12 : 0), 0.11, -0.58 + k * 0.26, sDoppel, { kanten:false, schatten:false });
  const sHaken = new THREE.Group(); sHaken.position.set(-0.36, 0.11, 0.42); sDoppel.add(sHaken);
  box(0.09, 0.03, 0.22, M.dunkel, -0.06, 0, 0.02, sHaken, { kanten:false }).rotation.y = 0.7;
  box(0.09, 0.03, 0.42, M.dunkel, 0.1, 0, -0.06, sHaken, { kanten:false }).rotation.y = -0.6;
  const sStempel = zyl(0.3, 0.035, M.dunkel, 0.28, 0.12, -0.05, sDoppel, { kanten:false });
  const strahlMat = new THREE.MeshBasicMaterial({ color: '#b00e2b', transparent: true, opacity: 0 });
  const strahl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 12, 0.08), strahlMat);
  strahl.position.y = 6.3; stueck.add(strahl);
  const kreisMat = new THREE.MeshBasicMaterial({ color: '#b00e2b', transparent: true, opacity: 0, side: THREE.DoubleSide });
  const kreis = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.85, 48), kreisMat);
  kreis.rotation.x = -Math.PI / 2; kreis.position.y = 0.35; stueck.add(kreis);

  const fach = { x: RX + RW * 0.5, y: 4.25, z: RZ };
  const RAST = [-40.6, -38.2, -23.4, -10.4, 3.5, 16.0, 28.2, fach.x, fach.x]; // Halt je Station
  function stueckPos(s, out){
    const i = Math.min(7, Math.floor(s)), f = s - i, e = sm(cl((f - 0.18) / 0.64));
    out.y = SY; out.z = 0;
    if (i >= 7){ out.x = fach.x; out.y = fach.y; out.z = fach.z; return; }
    if (i === 6){
      const e1 = cl(e / 0.62), e2 = cl((e - 0.62) / 0.38);
      out.x = RAST[6] + (fach.x - RAST[6]) * sm(e1);
      out.y = SY + (fach.y - SY) * sm(e2); out.z = fach.z * sm(e2);
      return;
    }
    out.x = RAST[i] + (RAST[i + 1] - RAST[i]) * e;
  }

  /* ---------- Kamera ---------- */
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const KAM = [
    { p: V(-74, 40, 60), t: V(4, 0, -6) },
    { p: V(-29.5, 12.5, 18.5), t: V(-39.5, 4.3, -1.6) },
    { p: V(-17.5, 9.5, 16.5), t: V(-25, 1.8, 1.6) },
    { p: V(-4.8, 8.5, 14.5), t: V(-12, 2.2, 0) },
    { p: V(10.5, 11.5, 19.5), t: V(0.5, 3.4, -2.2) },
    { p: V(21.5, 11, 16.5), t: V(11.5, 2.0, -2.6) },
    { p: V(34, 9, 15.5), t: V(26.5, 2.6, -1.2) },
    { p: V(50.5, 11, 18), t: V(40.5, 3.8, -2.6) },
    { p: V(-62, 78, 74), t: V(6, 0, -8) }
  ];
  // Stationen: Abstand zur Maschine strecken, ohne den Blickwinkel zu ändern
  [1, 1.55, 1.75, 1.75, 1.45, 1.5, 1.75, 1.5, 1].forEach((z, i) => { KAM[i].p.sub(KAM[i].t).multiplyScalar(z).add(KAM[i].t); });
  const kp = new THREE.Vector3(), kt = new THREE.Vector3(), tmp = new THREE.Vector3();
  function kamera(s, zeit){
    const i = Math.min(7, Math.floor(s)), f = s - i, e = sm(cl((f - 0.12) / 0.76));
    kp.lerpVectors(KAM[i].p, KAM[i + 1].p, e);
    kt.lerpVectors(KAM[i].t, KAM[i + 1].t, e);
    if (i >= 1 && i <= 6) kp.y += Math.sin(e * Math.PI) * 5;
    if (!reduce){
      tmp.subVectors(kp, kt); const w = Math.sin(zeit * 0.18) * 0.035;
      tmp.applyAxisAngle(THREE.Object3D.DEFAULT_UP, w); kp.addVectors(kt, tmp);
    }
    camera.position.copy(kp); camera.lookAt(kt);
  }

  /* ---------- Größe ---------- */
  // Gebaut für ein Querformat um 16:10. Bei schmalerem Bild den Blickwinkel
  // öffnen, damit seitlich gleich viel Fabrik zu sehen ist wie im Vortrag.
  const HFOV_HALB = Math.atan(Math.tan(THREE.MathUtils.degToRad(15)) * 1.6);
  function groesse(){
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect >= 1.6 ? 30 : Math.min(62, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(HFOV_HALB) / camera.aspect)));
    // Breit: Text links, Fabrik nach rechts schieben. Schmal: Text unten, Fabrik nach oben.
    if (w >= 1100) camera.setViewOffset(w, h, -w * 0.15, 0, w, h);
    else if (w <= 760) camera.setViewOffset(w, h, 0, h * 0.2, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    zeichne(0);
  }
  new ResizeObserver(groesse).observe(stage);

  /* ---------- Bewegung ---------- */
  let zeit = 0, sJetzt = window.FAB ? window.FAB.s : 0, zuletzt = performance.now(), laeuft = false;
  const SP = { x: 0, y: 0, z: 0 };
  function zeichne(dt){
    const sZiel = window.FAB ? window.FAB.s : 0;
    sJetzt = (reduce || dt === 0) ? sZiel : sJetzt + (sZiel - sJetzt) * (1 - Math.exp(-dt * 4.5));
    kamera(sJetzt, zeit);

    // Greifer
    const zyklus = 7, k = Math.floor(zeit / zyklus) % 3, ph = (zeit % zyklus) / zyklus;
    let j = 0; while (j < GK.length - 2 && ph > GK[j + 1][0]) j++;
    const A = GK[j], B = GK[j + 1], q = sm(cl((ph - A[0]) / (B[0] - A[0])));
    const zielX = n => n === 'schrank' ? SCHR[k] : n === 'band' ? -39 : SCHR[(k + 1) % 3];
    bruecke.position.z = A[1] + (B[1] - A[1]) * q;
    katze.position.x = zielX(A[2]) + (zielX(B[2]) - zielX(A[2])) * q + 39;
    const gy = A[3] + (B[3] - A[3]) * q;
    greifer.position.y = gy - KATZE_Y;
    const seilL = Math.max(0.05, KATZE_Y - 0.4 - (gy + 0.18));
    seil.scale.y = seilL; seil.position.y = -0.4 - seilL / 2;
    fracht.visible = !!A[4] && ph < 0.68;

    scan.position.x = -13 + Math.sin(zeit * 2.2) * 1.6;
    ring.rotation.y = zeit * 0.9;
    mastLicht.visible = reduce || Math.sin(zeit * 4) > -0.3;
    const rp = (zeit % 1.9) / 1.9; const runter = rp < 0.12 ? sm(rp / 0.12) : rp < 0.3 ? 1 - sm((rp - 0.12) / 0.18) : 0;
    ramme.position.y = 4.4 - runter * 2.15;

    // Blätter
    let push2 = null, push5 = null;
    for (const b of blaetter){
      const L = LAENGE[b.route];
      const u = ((zeit * 1.45 + b.off) % L + L) % L;
      aufRoute(b.route, u);
      const fo = form(P.x, P.seg), d = FORM[fo];
      let sk = 1;
      if (P.x > XE - 1.4 && P.seg !== 2 && P.seg !== 3) sk = cl((XE - P.x) / 1.4);
      b.m.scale.set(d[0] * sk, d[1], d[2] * sk);
      b.m.material = fo === 0 ? M.akte : M.papier;
      b.g.position.set(P.x, P.y + d[1] / 2, P.z);
      b.g.visible = sk > 0.02;
      b.stempel.visible = b.st && P.x > ST[5] + 0.2 && P.seg !== 2 && P.seg !== 3;
      b.stempel.position.y = d[1] / 2 + 0.02;
      if (P.seg === 9 && P.v < 0.45) push2 = P.z;
      if (P.seg === 1) push5 = P.z;
    }
    const z2 = push2 !== null ? push2 - 0.75 : -1.4;
    schieber2.position.z = z2; stange2.scale.z = Math.max(0.05, z2 + 1.7); stange2.position.z = (-1.7 + z2) / 2;
    const z5 = push5 !== null ? push5 + 0.75 : 1.6;
    schieber5.position.z = z5; stange5.scale.z = Math.max(0.05, 1.9 - z5); stange5.position.z = (1.9 + z5) / 2;
    lampe.material.color.set(push5 !== null ? '#d0213f' : '#ffffff');

    // Werkstück
    stueckPos(sJetzt, SP);
    stueck.position.set(SP.x, SP.y, SP.z);
    const fx = SP.x;
    sAkte.visible = fx < ST[2] + 0.3;
    sBlatt.visible = !sAkte.visible && fx < ST[3] + 0.3;
    sDoppel.visible = !sAkte.visible && !sBlatt.visible;
    sHaken.visible = fx > ST[4] + 0.6 || sJetzt > 6.5;
    sStempel.visible = fx > ST[5] + 0.6 || sJetzt > 6.5;
    const ueber = Math.max(cl(1 - sJetzt * 1.4), cl((sJetzt - 7.3) * 1.5));
    strahlMat.opacity = ueber * 0.9; strahl.visible = ueber > 0.01;
    strahl.scale.y = sJetzt > 7 ? 1.6 : 1;
    kreisMat.opacity = ueber; kreis.visible = ueber > 0.01;

    renderer.render(scene, camera);
  }
  function schleife(now){
    if (!laeuft) return;
    // Kamerafahrt mit echter Zeit, damit sie auch bei wenigen Bildern pro Sekunde ankommt; Maschinen höchstens 50 ms pro Bild
    const dt = Math.min(1, (now - zuletzt) / 1000); zuletzt = now;
    if (!reduce) zeit += Math.min(0.05, dt);
    zeichne(dt || 0.0001);
    requestAnimationFrame(schleife);
  }
  new IntersectionObserver(es => {
    const sicht = es[0].isIntersecting;
    if (sicht && !laeuft){ laeuft = true; zuletzt = performance.now(); sJetzt = window.FAB ? window.FAB.s : 0; requestAnimationFrame(schleife); }
    else if (!sicht) laeuft = false;
  }, { rootMargin: '120px 0px' }).observe(fab);
  groesse();
}
})();
