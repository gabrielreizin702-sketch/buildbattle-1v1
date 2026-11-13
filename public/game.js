import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import {
  PLAYER_HEIGHT,
  findSupportHeight,
  resolveBuildCollisions,
  resolveFloorCeiling
} from "./physics.mjs";

const socket = io();
const $ = id => document.getElementById(id);
let scene, camera, renderer, clock, localMesh, remoteMesh, remoteId = null;
let playerId = "", yaw = 0, pitch = 0, velocityY = 0, onGround = true, started = false, weaponIndex = 0, lastShotAt = 0;
const weapons = [
  { name: "RIFLE", damage: 18, delay: 140, range: 75, color: 0xffe08a },
  { name: "SHOTGUN", damage: 9, delay: 650, range: 32, color: 0xffa45c }
];
const buildData = new Map();
const builds = new Map();
const keys = {};
let lastMoveSend = 0, toastTimer;
const mats = {
  ground: new THREE.MeshStandardMaterial({ color: 0x315c84, roughness: 0.9 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x38a8e8, transparent: true, opacity: 0.78 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x49d9bd, transparent: true, opacity: 0.82 }),
  ramp: new THREE.MeshStandardMaterial({ color: 0xf2b84b, roughness: 0.78, side: THREE.DoubleSide })
};

$("createBtn").onclick = () => {
  const name = $("playerName").value.trim() || "Jogador";
  socket.emit("createRoom", { name }, result => {
    if (!result.ok) return message(result.error);
    enterGame(result.code, result.playerId);
  });
};
$("joinBtn").onclick = () => {
  const name = $("playerName").value.trim() || "Jogador";
  socket.emit("joinRoom", { code: $("roomCode").value, name }, result => {
    if (!result.ok) return message(result.error);
    enterGame(result.code, result.playerId);
  });
};
function message(text) { $("lobbyMsg").textContent = text; }
function enterGame(code, id) {
  playerId = id;
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("roomLabel").textContent = "SALA " + code;
  $("status").textContent = "Compartilhe o código: " + code;
  started = true;
  init3D();
  toast("Sala criada! Envie o código " + code + " para seu amigo.");
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").style.display = "none", 3000);
}
function init3D() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x78bce9);
  scene.fog = new THREE.Fog(0x78bce9, 45, 115);
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 220);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  $("game").appendChild(renderer.domElement);
  clock = new THREE.Clock();

  scene.add(new THREE.HemisphereLight(0xdaf2ff, 0x36506c, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-20, 35, 15);
  sun.castShadow = true;
  scene.add(sun);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(100, 1, 100), mats.ground);
  floor.position.y = -0.55;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(100, 50, 0x78b9e7, 0x477da7);
  grid.position.y = -0.04;
  scene.add(grid);

  for (let i = -1; i <= 1; i += 2) {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(100, 1.2, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x163e68 })
    );
    rail.position.set(0, 0.1, i * 50);
    scene.add(rail);
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 100), rail.material);
    side.position.set(i * 50, 0.1, 0);
    scene.add(side);
  }

  for (let i = 0; i < 24; i++) {
    const h = 4 + Math.random() * 12;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2 + Math.random() * 3, 0),
      new THREE.MeshStandardMaterial({ color: 0x5489ae, flatShading: true })
    );
    rock.position.set((Math.random() - 0.5) * 130, h / 2 - 3, (Math.random() - 0.5) * 130);
    scene.add(rock);
  }

  localMesh = makePlayer(0x20c8ff, true);
  scene.add(localMesh);
  window.addEventListener("resize", resize);
  renderer.domElement.addEventListener("click", () => {
    if (!document.pointerLockElement) renderer.domElement.requestPointerLock();
  });
  document.addEventListener("mousemove", event => {
    if (document.pointerLockElement === renderer.domElement) {
      yaw -= event.movementX * 0.0022;
      pitch -= event.movementY * 0.0022;
      pitch = Math.max(-1.35, Math.min(1.35, pitch));
    }
  });
  document.addEventListener("keydown", event => {
    keys[event.code] = true;
    if (["Space", "ArrowUp", "ArrowDown"].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === "KeyQ") placeBuild("wall");
    if (event.code === "KeyE") placeBuild("ramp");
    if (event.code === "KeyF") placeBuild("floor");
    if (event.code === "Digit1") selectWeapon(0);
    if (event.code === "Digit2") selectWeapon(1);
  });
  document.addEventListener("keyup", event => keys[event.code] = false);
  document.addEventListener("mousedown", event => {
    if (event.button === 0 && document.pointerLockElement === renderer.domElement) shoot();
  });

  selectWeapon(0);
  animate();
}
function makePlayer(color, isLocal = false) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.72 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172638, roughness: 0.55 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a77d, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.92, 0.42), suit);
  torso.position.y = 1.18;
  torso.castShadow = true;
  group.add(torso);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.48, 0.45), dark);
  vest.position.set(0, 1.2, -0.015);
  group.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), skin);
  head.position.y = 1.88;
  head.castShadow = true;
  group.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), dark);
  helmet.position.y = 1.96;
  group.add(helmet);

  const legPivots = [];
  for (const x of [-0.23, 0.23]) {
    const leg = new THREE.Group();
    leg.position.set(x, 0.78, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.52, 0.28), dark);
    thigh.position.y = -0.26;
    thigh.castShadow = true;
    leg.add(thigh);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.18, 0.4), suit);
    boot.position.set(0, -0.52, -0.055);
    leg.add(boot);
    group.add(leg);
    legPivots.push(leg);
  }

  const armPivots = [];
  for (const x of [-0.48, 0.48]) {
    const arm = new THREE.Group();
    arm.position.set(x, 1.48, 0);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.24), suit);
    upper.position.y = -0.23;
    upper.castShadow = true;
    arm.add(upper);
    group.add(arm);
    armPivots.push(arm);
  }

  const gun = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x273746, metalness: 0.72, roughness: 0.3 });
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.17, 0.72), metal);
  receiver.position.z = -0.28;
  gun.add(receiver);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.48, 10), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.015, -0.82);
  gun.add(barrel);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.28), dark);
  stock.position.z = 0.2;
  gun.add(stock);
  gun.position.set(0.03, 1.37, -0.42);
  group.add(gun);
  const muzzle = new THREE.PointLight(0xffc36a, 0, 5);
  muzzle.position.set(0, 0.02, -1.02);
  gun.add(muzzle);

  group.userData = { legPivots, armPivots, gun, muzzle, walk: 0, isLocal };
  return group;
}
function selectWeapon(index) {
  weaponIndex = index;
  const weapon = weapons[index];
  const label = $("weaponName");
  if (label) label.textContent = weapon.name;
  const info = $("weaponInfo");
  if (info) info.textContent = index === 0 ? "AUTOMÁTICO • 18 DANO" : "DISPERSÃO • 9 DANO";
  toast("Arma equipada: " + weapon.name);
}
function showTracer(from, to, color = 0xffe08a) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(from.x, from.y, from.z),
    new THREE.Vector3(to.x, to.y, to.z)
  ]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geometry.dispose();
    line.material.dispose();
  }, 100);
}
function resize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
function animate() {
  if (!started) return;
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  updatePlayer(dt);

  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  camera.position.copy(localMesh.position).add(new THREE.Vector3(Math.sin(yaw) * 5.2, 2.65, Math.cos(yaw) * 5.2));
  const aimPoint = localMesh.position.clone()
    .add(new THREE.Vector3(0, 1.55, 0))
    .add(forward.clone().multiplyScalar(24 * Math.cos(pitch)))
    .add(new THREE.Vector3(0, 24 * Math.sin(pitch), 0));
  camera.lookAt(aimPoint);
  renderer.render(scene, camera);
}
function updatePlayer(dt) {
  const previous = {
    x: localMesh.position.x,
    y: localMesh.position.y,
    z: localMesh.position.z
  };
  const wasGrounded = onGround;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3();
  if (keys.KeyW) move.add(forward);
  if (keys.KeyS) move.sub(forward);
  if (keys.KeyD) move.add(right);
  if (keys.KeyA) move.sub(right);
  if (move.lengthSq()) move.normalize().multiplyScalar((keys.ShiftLeft ? 9 : 6) * dt);

  if (keys.Space && onGround) {
    velocityY = 8;
    onGround = false;
  }
  velocityY -= 22 * dt;
  let nextY = previous.y + velocityY * dt;
  const colliders = [...buildData.values()];
  let candidate = {
    x: previous.x + move.x,
    y: nextY,
    z: previous.z
  };
  candidate = resolveBuildCollisions(candidate, colliders, { height: PLAYER_HEIGHT, previous });
  candidate.z += move.z;
  candidate = resolveBuildCollisions(candidate, colliders, { height: PLAYER_HEIGHT, previous });
  candidate.x = THREE.MathUtils.clamp(candidate.x, -48, 48);
  candidate.z = THREE.MathUtils.clamp(candidate.z, -48, 48);

  const ceiling = resolveFloorCeiling(previous.y, nextY, candidate.x, candidate.z, colliders, {
    height: PLAYER_HEIGHT
  });
  if (ceiling.hit) {
    nextY = ceiling.y;
    velocityY = 0;
  }
  candidate.y = nextY;

  const support = findSupportHeight(previous, candidate, colliders, velocityY, wasGrounded);
  if (support !== null && velocityY <= 0 && candidate.y <= support + 0.04) {
    candidate.y = support;
    velocityY = 0;
    onGround = true;
  } else {
    onGround = false;
  }

  if (candidate.y < 0) {
    candidate.y = 0;
    velocityY = 0;
    onGround = true;
  }
  localMesh.position.set(candidate.x, candidate.y, candidate.z);
  localMesh.rotation.y = yaw;

  const moving = move.lengthSq() > 0.0001;
  localMesh.userData.walk += dt * (moving ? 11 : 2);
  const swing = moving ? Math.sin(localMesh.userData.walk) * 0.62 : 0;
  localMesh.userData.legPivots[0].rotation.x = swing;
  localMesh.userData.legPivots[1].rotation.x = -swing;
  localMesh.userData.armPivots[0].rotation.x = -0.48;
  localMesh.userData.armPivots[1].rotation.x = -0.72;

  const now = performance.now();
  if (now - lastMoveSend > 50) {
    socket.emit("move", {
      x: localMesh.position.x,
      y: localMesh.position.y + 1,
      z: localMesh.position.z,
      rot: yaw
    });
    lastMoveSend = now;
  }
}
function placeBuild(type) {
  const direction = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const position = localMesh.position.clone().add(direction.multiplyScalar(3));
  position.x = Math.round(position.x / 2) * 2;
  position.z = Math.round(position.z / 2) * 2;
  socket.emit("build", {
    type,
    x: position.x,
    z: position.z,
    rot: yaw
  }, result => {
    if (result && !result.ok) toast(result.error || "Não foi possível construir.");
  });
}
function addBuild(piece) {
  if (builds.has(piece.id)) return;
  buildData.set(piece.id, piece);
  let mesh;

  if (piece.type === "wall") {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 3.2, 0.28), mats.wall);
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.rotation.y = piece.rot;
  } else if (piece.type === "floor") {
    mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 0.22, 4), mats.floor);
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.rotation.y = piece.rot;
  } else if (piece.type === "ramp") {
    // Closed triangular prism: a real sloped top with solid side faces.
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      -2, 0, 2,   2, 0, 2,
      -2, 0, -2,  2, 0, -2,
      -2, 2.8, -2, 2, 2.8, -2
    ]);
    const indices = [
      0, 1, 5, 0, 5, 4,       // walkable sloped surface
      0, 2, 3, 0, 3, 1,       // underside
      2, 4, 5, 2, 5, 3,       // high end
      0, 4, 2,                // left side
      1, 3, 5                 // right side
    ];
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    mesh = new THREE.Mesh(geometry, mats.ramp);
    mesh.position.set(piece.x, piece.y, piece.z);
    mesh.rotation.y = piece.rot;
  } else {
    buildData.delete(piece.id);
    return;
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  builds.set(piece.id, mesh);
}
function shoot() {
  const weapon = weapons[weaponIndex];
  const now = performance.now();
  if (now - lastShotAt < weapon.delay) return;
  lastShotAt = now;

  const origin = camera.position.clone();
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.normalize();
  const spread = weaponIndex === 1 ? 0.055 : 0.006;
  const pellets = weaponIndex === 1 ? 8 : 1;

  for (let i = 0; i < pellets; i++) {
    const shotDirection = direction.clone()
      .add(new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * spread
      ))
      .normalize();
    const hit = origin.clone().add(shotDirection.clone().multiplyScalar(weapon.range));

    if (remoteMesh) {
      const center = new THREE.Vector3(remoteMesh.position.x, remoteMesh.position.y + 1.05, remoteMesh.position.z);
      const along = center.clone().sub(origin).dot(shotDirection);
      const closest = origin.clone().add(shotDirection.clone().multiplyScalar(Math.max(0, along)));
      if (along > 0 && along < weapon.range && closest.distanceTo(center) < (weaponIndex === 1 ? 1.25 : 0.72)) {
        socket.emit("shoot", {
          targetId: remoteId,
          origin: { x: origin.x, y: origin.y, z: origin.z },
          direction: { x: shotDirection.x, y: shotDirection.y, z: shotDirection.z },
          weapon: weaponIndex
        });
        hit.copy(center);
      }
    }
    showTracer(
      { x: origin.x, y: origin.y, z: origin.z },
      { x: hit.x, y: hit.y, z: hit.z },
      weapon.color
    );
  }

  if (localMesh.userData.muzzle) {
    localMesh.userData.muzzle.intensity = 2;
    setTimeout(() => {
      if (localMesh?.userData.muzzle) localMesh.userData.muzzle.intensity = 0;
    }, 55);
  }
}
function updateHealth(id, hp) {
  if (id === playerId) {
    $("myHp").textContent = hp + " HP";
    $("myHealth").style.width = hp + "%";
  } else {
    $("enemyHp").textContent = hp + " HP";
    $("enemyHealth").style.width = hp + "%";
  }
}

socket.on("roomState", state => {
  if (!started) return;
  const self = state.players.find(player => player.id === playerId);
  const opponent = state.players.find(player => player.id !== playerId);
  if (self) updateHealth(playerId, self.hp);

  if (opponent) {
    remoteId = opponent.id;
    if (!remoteMesh) {
      remoteMesh = makePlayer(0xffa53d, false);
      scene.add(remoteMesh);
    }
    remoteMesh.position.set(opponent.x, Math.max(0, opponent.y - 1), opponent.z);
    remoteMesh.rotation.y = opponent.rot || 0;
    $("status").textContent = "Adversário conectado: " + opponent.name;
    updateHealth(remoteId, opponent.hp);
  } else {
    $("status").textContent = "Aguardando seu amigo entrar...";
  }
  state.builds.forEach(addBuild);
});
socket.on("opponentMove", player => {
  if (player.id !== remoteId || !remoteMesh) return;
  remoteMesh.position.set(player.x, Math.max(0, player.y - 1), player.z);
  remoteMesh.rotation.y = player.rot || 0;
});
socket.on("shotFx", data => showTracer(data.from, data.to, data.color || 0xffe08a));
socket.on("built", addBuild);
socket.on("health", data => updateHealth(data.id, data.hp));
socket.on("notice", toast);
socket.on("opponentLeft", () => {
  remoteId = null;
  if (remoteMesh) {
    scene.remove(remoteMesh);
    remoteMesh = null;
  }
  $("status").textContent = "O adversário saiu. Aguardando outro jogador...";
  toast("Seu amigo saiu da sala.");
});
socket.on("roundOver", data => {
  $("roundText").textContent = data.winner + " VENCEU!";
  $("roundModal").classList.remove("hidden");
  document.exitPointerLock?.();
});
socket.on("resetRound", state => {
  builds.forEach(mesh => {
    scene.remove(mesh);
    mesh.geometry?.dispose();
  });
  builds.clear();
  buildData.clear();
  velocityY = 0;
  onGround = true;
  localMesh.position.set(0, 0, playerId === state.players[0]?.id ? 8 : -8);
  $("roundModal").classList.add("hidden");
  const self = state.players.find(player => player.id === playerId);
  const opponent = state.players.find(player => player.id !== playerId);
  if (self) updateHealth(playerId, self.hp);
  if (opponent) {
    remoteId = opponent.id;
    if (!remoteMesh) {
      remoteMesh = makePlayer(0xffa53d, false);
      scene.add(remoteMesh);
    }
    remoteMesh.position.set(opponent.x, Math.max(0, opponent.y - 1), opponent.z);
    remoteMesh.rotation.y = opponent.rot || 0;
    updateHealth(remoteId, opponent.hp);
  }
  state.builds.forEach(addBuild);
  toast("Nova rodada!");
});
$("restartBtn").onclick = () => socket.emit("restartRound");
$("exitBtn").onclick = () => location.reload();
