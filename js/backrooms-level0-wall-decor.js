/**
 * Level 0 墙面装饰：生存难度海报 + 切出墙旋涡
 */
import * as THREE from "three";

/** 出生点 (1,1) 正西侧外墙 — 转身即见 */
export const L0_POSTER_WALL_CELL = { row: 1, col: 0 };

const POSTER_TEX_PATH = "img/backrooms/level0/sd-class1.png";
const VORTEX_CANVAS_SIZE = 512;

/** @type {{ tex: THREE.CanvasTexture, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D } | null} */
let clipVortexState = null;

function walkable(matrix, row, col) {
  if (row < 0 || col < 0 || row >= matrix.length) return false;
  var line = matrix[row];
  if (!line || col >= line.length) return false;
  return line[col] === 0;
}

/** 找与墙相邻的可走格（优先离出生点最近） */
function pickPosterNeighbor(row, col, matrix, spawnRow, spawnCol) {
  var dirs = [
    { dr: 0, dc: 1 },
    { dr: 0, dc: -1 },
    { dr: 1, dc: 0 },
    { dr: -1, dc: 0 },
  ];
  var best = null;
  var bestDist = Infinity;
  var i;
  for (i = 0; i < dirs.length; i++) {
    var nr = row + dirs[i].dr;
    var nc = col + dirs[i].dc;
    if (!walkable(matrix, nr, nc)) continue;
    var dist = Math.hypot(nr - spawnRow, nc - spawnCol);
    if (dist < bestDist) {
      bestDist = dist;
      best = { row: nr, col: nc };
    }
  }
  return best;
}

function orientDecalToward(mesh, wx, wy, wz, targetX, targetZ, flipX) {
  mesh.position.set(wx, wy, wz);
  mesh.lookAt(targetX, wy, targetZ);
  mesh.rotateY(Math.PI);
  if (flipX) mesh.scale.x = -1;
}

function paintClipWallVortex(ctx, size, t) {
  var cx = size * 0.5;
  var cy = size * 0.5;
  ctx.clearRect(0, 0, size, size);

  var pulse = 0.65 + Math.sin(t * 4.2) * 0.35;
  var spin = t * 3.1;

  var hole = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.46);
  hole.addColorStop(0, "rgba(0,0,0,0.95)");
  hole.addColorStop(0.22, "rgba(12,4,28,0.88)");
  hole.addColorStop(0.55, "rgba(60,20,120,0.55)");
  hole.addColorStop(0.82, "rgba(120,200,255,0.35)");
  hole.addColorStop(1, "rgba(200,240,255,0)");
  ctx.fillStyle = hole;
  ctx.fillRect(0, 0, size, size);

  var arm;
  for (arm = 0; arm < 5; arm++) {
    var base = (arm / 5) * Math.PI * 2 + spin;
    ctx.beginPath();
    var step;
    for (step = 0; step <= 120; step++) {
      var ang = base + step * 0.105;
      var r = 10 + step * 1.55;
      var wobble = Math.sin(ang * 3 + t * 6) * (step * 0.06);
      var x = cx + Math.cos(ang) * (r + wobble);
      var y = cy + Math.sin(ang) * (r + wobble);
      if (step === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    var hue = arm % 2 === 0 ? "180,255,255" : "200,160,255";
    ctx.strokeStyle = "rgba(" + hue + "," + (0.45 + pulse * 0.5) + ")";
    ctx.lineWidth = 3 + pulse * 4;
    ctx.shadowColor = "rgba(160,240,255,0.9)";
    ctx.shadowBlur = 10 + pulse * 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.09, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.14, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255," + (0.35 + pulse * 0.45) + ")";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  var outer = ctx.createRadialGradient(cx, cy, size * 0.12, cx, cy, size * 0.48);
  outer.addColorStop(0, "rgba(255,255,255,0)");
  outer.addColorStop(0.65, "rgba(100,220,255," + (0.05 + pulse * 0.12) + ")");
  outer.addColorStop(1, "rgba(180,120,255," + (0.18 + pulse * 0.22) + ")");
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.fill();
}

export function createClipWallVortexTexture() {
  if (clipVortexState) return clipVortexState.tex;
  var canvas = document.createElement("canvas");
  canvas.width = VORTEX_CANVAS_SIZE;
  canvas.height = VORTEX_CANVAS_SIZE;
  var ctx = canvas.getContext("2d");
  if (!ctx) return null;
  paintClipWallVortex(ctx, VORTEX_CANVAS_SIZE, 0);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  clipVortexState = { tex: tex, canvas: canvas, ctx: ctx };
  return tex;
}

export function updateClipWallVortex(elapsed) {
  if (!clipVortexState) return;
  paintClipWallVortex(clipVortexState.ctx, VORTEX_CANVAS_SIZE, elapsed);
  clipVortexState.tex.needsUpdate = true;
}

function mountDecalOnWall(wallsGroup, wx, wz, walkRow, walkCol, opts, mesh) {
  var tx = opts.cellCenterX(walkCol);
  var tz = opts.cellCenterZ(walkRow);
  var dx = tx - wx;
  var dz = tz - wz;
  var len = Math.hypot(dx, dz) || 1;
  var inset = opts.gridSize * 0.5 + 0.04;
  orientDecalToward(
    mesh,
    wx + (dx / len) * inset,
    opts.decalY,
    wz + (dz / len) * inset,
    tx,
    tz,
    !!opts.flipX
  );
  mesh.renderOrder = 5;
  wallsGroup.add(mesh);
}

/**
 * @param {THREE.Group} wallsGroup
 * @param {object} opts
 */
export function mountLevel0WallDecor(wallsGroup, opts) {
  opts = opts || {};
  var matrix = opts.matrix;
  var gridSize = opts.gridSize != null ? opts.gridSize : 2;
  var wallH = opts.wallHeight != null ? opts.wallHeight : 2.4;
  var spawnRow = opts.spawnRow != null ? opts.spawnRow : 1;
  var spawnCol = opts.spawnCol != null ? opts.spawnCol : 1;
  // 显式传 null 可关闭海报，供随机切出墙单独挂载旋涡时使用。
  var posterCell =
    opts.posterCell === undefined ? L0_POSTER_WALL_CELL : opts.posterCell;
  var clipCell = opts.clipCell;

  if (matrix && posterCell) {
    var pr = posterCell.row;
    var pc = posterCell.col;
    var neighbor = pickPosterNeighbor(pr, pc, matrix, spawnRow, spawnCol);
    if (neighbor && matrix[pr] && matrix[pr][pc] === 1) {
      var px = opts.cellCenterX(pc);
      var pz = opts.cellCenterZ(pr);
      var posterTex = new THREE.TextureLoader().load(POSTER_TEX_PATH);
      posterTex.colorSpace = THREE.SRGBColorSpace;
      var posterW = 1.85;
      var posterH = posterW * 0.34;
      var poster = new THREE.Mesh(
        new THREE.PlaneGeometry(posterW, posterH),
        new THREE.MeshBasicMaterial({
          map: posterTex,
          toneMapped: true,
          side: THREE.DoubleSide,
        })
      );
      poster.name = "L0SurvivalPoster";
      mountDecalOnWall(wallsGroup, px, pz, neighbor.row, neighbor.col, {
        cellCenterX: opts.cellCenterX,
        cellCenterZ: opts.cellCenterZ,
        gridSize: gridSize,
        decalY: wallH * 0.55,
        flipX: true,
      }, poster);
    }
  }

  if (matrix && clipCell) {
    var cr = clipCell.row;
    var cc = clipCell.col;
    var clipNeighbor = pickPosterNeighbor(cr, cc, matrix, spawnRow, spawnCol);
    if (clipNeighbor && matrix[cr] && matrix[cr][cc] === 1) {
      var cx = opts.cellCenterX(cc);
      var cz = opts.cellCenterZ(cr);
      var vortexTex = createClipWallVortexTexture();
      if (vortexTex) {
        var vortexSize = gridSize * 0.94;
        var vortex = new THREE.Mesh(
          new THREE.PlaneGeometry(vortexSize, vortexSize),
          new THREE.MeshBasicMaterial({
            map: vortexTex,
            transparent: true,
            opacity: 1,
            toneMapped: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          })
        );
        vortex.name = "L0ClipVortexDecal";
        mountDecalOnWall(wallsGroup, cx, cz, clipNeighbor.row, clipNeighbor.col, {
          cellCenterX: opts.cellCenterX,
          cellCenterZ: opts.cellCenterZ,
          gridSize: gridSize,
          decalY: wallH * 0.52,
        }, vortex);
      }
    }
  }
}
