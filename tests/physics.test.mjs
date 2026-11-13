import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYER_HEIGHT,
  findSupportHeight,
  rampSurfaceHeight,
  resolveBuildCollisions,
  resolveFloorCeiling
} from "../public/physics.mjs";

test("parede bloqueia o jogador e empurra para fora da espessura", () => {
  const wall = { type: "wall", x: 0, y: 1.6, z: 0, rot: 0 };
  const result = resolveBuildCollisions({ x: 0, y: 0, z: 0 }, [wall]);
  assert.ok(Math.abs(result.z) >= 0.52);
});

test("colisão da parede respeita sua rotação", () => {
  const wall = { type: "wall", x: 0, y: 1.6, z: 0, rot: Math.PI / 2 };
  const result = resolveBuildCollisions({ x: 0, y: 0, z: 0 }, [wall]);
  assert.ok(Math.abs(result.x) >= 0.52);
});

test("piso sustenta o jogador ao cair sobre sua face superior", () => {
  const floor = { type: "floor", x: 0, y: 1, z: 0, rot: 0 };
  const support = findSupportHeight(
    { x: 0, y: 1.3, z: 0 },
    { x: 0, y: 0.9, z: 0 },
    [floor],
    -5,
    false
  );
  assert.equal(support, 1.11);
});

test("jogador permanece apoiado no piso enquanto se move sobre ele", () => {
  const floor = { type: "floor", x: 0, y: 1, z: 0, rot: 0 };
  const support = findSupportHeight(
    { x: 0, y: 1.11, z: 0 },
    { x: 0.5, y: 1.09, z: 0 },
    [floor],
    -0.5,
    true
  );
  assert.equal(support, 1.11);
});

test("rampa fornece altura progressiva do início ao topo", () => {
  const ramp = { type: "ramp", x: 0, y: 0, z: 0, rot: 0 };
  assert.equal(rampSurfaceHeight(ramp, 0, 2), 0);
  assert.equal(rampSurfaceHeight(ramp, 0, 0), 1.4);
  assert.equal(rampSurfaceHeight(ramp, 0, -2), 2.8);
});

test("rampa sustenta o jogador ao aterrissar na superfície inclinada", () => {
  const ramp = { type: "ramp", x: 0, y: 0, z: 0, rot: 0 };
  const support = findSupportHeight(
    { x: 0, y: 1.48, z: 0 },
    { x: 0, y: 1.35, z: 0 },
    [ramp],
    -2,
    false
  );
  assert.equal(support, 1.4);
});

test("piso impede que o jogador salte através de sua parte inferior", () => {
  const floor = { type: "floor", x: 0, y: 1, z: 0, rot: 0 };
  const result = resolveFloorCeiling(-1.4, -1.1, 0, 0, [floor]);
  assert.equal(result.hit, true);
  assert.ok(Math.abs(result.y - ((1 - 0.11) - PLAYER_HEIGHT)) < 1e-9);
});

test("parede não bloqueia jogador que já está acima dela", () => {
  const wall = { type: "wall", x: 0, y: 1.6, z: 0, rot: 0 };
  const result = resolveBuildCollisions({ x: 0, y: 3.3, z: 0 }, [wall]);
  assert.equal(result.x, 0);
  assert.equal(result.z, 0);
});

test("aterrissagem em piso não é desviada pela colisão lateral", () => {
  const floor = { type: "floor", x: 0, y: 1, z: 0, rot: 0 };
  const previous = { x: 0, y: 1.3, z: 0 };
  const result = resolveBuildCollisions(
    { x: 0, y: 0.8, z: 0 },
    [floor],
    { previous }
  );
  assert.equal(result.x, 0);
  assert.equal(result.z, 0);
});

test("rampa permite subir em passos de corrida sem perder o apoio", () => {
  const ramp = { type: "ramp", x: 0, y: 0, z: 0, rot: 0 };
  const support = findSupportHeight(
    { x: 0, y: 2.45, z: -1.5 },
    { x: 0, y: 2.414, z: -1.86 },
    [ramp],
    -0.9,
    true
  );
  assert.equal(support, 2.702);
});

test("lateral da rampa bloqueia entrada por baixo", () => {
  const ramp = { type: "ramp", x: 0, y: 0, z: 0, rot: 0 };
  const result = resolveBuildCollisions({ x: 1.9, y: 0, z: 0 }, [ramp]);
  assert.ok(result.x >= 2.38);
});

test("pulo contra a parte inferior do piso é resolvido verticalmente", () => {
  const floor = { type: "floor", x: 0, y: 1, z: 0, rot: 0 };
  const previous = { x: 0, y: -1.4, z: 0 };
  const result = resolveBuildCollisions(
    { x: 0, y: -1.1, z: 0 },
    [floor],
    { previous }
  );
  assert.equal(result.x, 0);
  assert.equal(result.z, 0);
  const ceiling = resolveFloorCeiling(previous.y, -1.1, result.x, result.z, [floor]);
  assert.equal(ceiling.hit, true);
  assert.ok(Math.abs(ceiling.y - -1.36) < 1e-9);
});
