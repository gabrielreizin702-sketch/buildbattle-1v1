const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));

const rooms = new Map();
const BUILD_LIMIT = 180;
const BUILD_COOLDOWN_MS = 120;
const makeCode = () => crypto.randomBytes(2).toString("hex").toUpperCase();

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}, reply = () => {}) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const player = {
      id: socket.id, name: cleanName(name),
      x: 0, y: 1, z: 8, rot: 0, hp: 100,
      lastShot: 0, lastBuild: 0
    };
    rooms.set(code, { players: new Map([[socket.id, player]]), builds: [] });
    socket.join(code);
    socket.data.room = code;
    reply({ ok: true, code, playerId: socket.id });
    socket.emit("roomState", roomSnapshot(code));
  });

  socket.on("joinRoom", ({ code, name } = {}, reply = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return reply({ ok: false, error: "Sala não encontrada." });
    if (room.players.size >= 2) return reply({ ok: false, error: "A sala já está cheia." });
    const player = {
      id: socket.id, name: cleanName(name),
      x: 0, y: 1, z: -8, rot: 0, hp: 100,
      lastShot: 0, lastBuild: 0
    };
    room.players.set(socket.id, player);
    socket.join(code);
    socket.data.room = code;
    reply({ ok: true, code, playerId: socket.id });
    io.to(code).emit("roomState", roomSnapshot(code));
    io.to(code).emit("notice", `${player.name} entrou na partida!`);
  });

  socket.on("move", data => {
    const room = rooms.get(socket.data.room);
    const p = room?.players.get(socket.id);
    if (!p || !data) return;

    const x = Number(data.x);
    const y = Number(data.y);
    const z = Number(data.z);
    const rot = Number(data.rot);
    if (![x, y, z].every(Number.isFinite)) return;

    p.x = clamp(x, -48, 48);
    p.y = clamp(y, 0.5, 30);
    p.z = clamp(z, -48, 48);
    p.rot = Number.isFinite(rot) ? rot : 0;
    socket.to(socket.data.room).emit("opponentMove", {
      id: socket.id, x: p.x, y: p.y, z: p.z, rot: p.rot
    });
  });

  socket.on("build", (data, reply = () => {}) => {
    const room = rooms.get(socket.data.room);
    const player = room?.players.get(socket.id);
    const reject = error => reply({ ok: false, error });
    if (!room || !player) return reject("Você não está em uma sala.");
    if (player.hp <= 0) return reject("Aguarde a próxima rodada.");
    if (room.builds.length >= BUILD_LIMIT) return reject("Limite de construções desta rodada atingido.");

    const type = ["wall", "ramp", "floor"].includes(data?.type) ? data.type : null;
    const x = Number(data?.x);
    const z = Number(data?.z);
    const rawRot = Number(data?.rot);
    if (!type || !Number.isFinite(x) || !Number.isFinite(z)) {
      return reject("Construção inválida.");
    }

    const now = Date.now();
    if (now - player.lastBuild < BUILD_COOLDOWN_MS) return reject("Espere um instante para construir novamente.");

    const buildX = clamp(x, -48, 48);
    const buildZ = clamp(z, -48, 48);
    if (Math.hypot(buildX - player.x, buildZ - player.z) > 8.5) {
      return reject("A construção está longe demais.");
    }

    const rot = Number.isFinite(rawRot) ? Math.atan2(Math.sin(rawRot), Math.cos(rawRot)) : 0;
    // The server derives height from the player's authoritative last position.
    // wall.y is its center, floor.y its center, and ramp.y its lower edge.
    const y = type === "wall" ? player.y + 0.6 : type === "floor" ? player.y : player.y - 1;
    const piece = {
      id: crypto.randomUUID(),
      owner: socket.id,
      type,
      x: buildX,
      y: clamp(y, 0, 24),
      z: buildZ,
      rot
    };

    player.lastBuild = now;
    room.builds.push(piece);
    io.to(socket.data.room).emit("built", piece);
    reply({ ok: true, id: piece.id });
  });

  socket.on("shoot", ({ targetId, origin, direction, weapon = 0 } = {}, reply = () => {}) => {
    const room = rooms.get(socket.data.room);
    const shooter = room?.players.get(socket.id);
    const target = room?.players.get(targetId);
    if (!shooter || !target || target.hp <= 0 || !origin || !direction) return;

    const now = Date.now();
    const shotgun = Number(weapon) === 1;
    if (now - shooter.lastShot < (shotgun ? 600 : 120)) return;

    const ox = Number(origin.x), oy = Number(origin.y), oz = Number(origin.z);
    const dx = Number(direction.x), dy = Number(direction.y), dz = Number(direction.z);
    const len = Math.hypot(dx, dy, dz);
    if (![ox, oy, oz, dx, dy, dz].every(Number.isFinite) || len < 0.9 || len > 1.1) return;
    if (Math.hypot(ox - shooter.x, oy - shooter.y, oz - shooter.z) > 9) return;

    const tx = target.x - ox, ty = (target.y + 0.05) - oy, tz = target.z - oz;
    const distance = Math.hypot(tx, ty, tz);
    const maxRange = shotgun ? 32 : 75;
    if (distance > maxRange || distance < 0.1) return;

    const projection = (tx * dx + ty * dy + tz * dz) / distance;
    const perpendicular = Math.sqrt(Math.max(0, 1 - projection * projection)) * distance;
    if (projection < 0.985 || perpendicular > (shotgun ? 1.25 : 0.72)) return;

    shooter.lastShot = now;
    target.hp = Math.max(0, target.hp - (shotgun ? 9 : 18));
    io.to(socket.data.room).emit("shotFx", {
      from: { x: ox, y: oy, z: oz },
      to: { x: target.x, y: target.y + 0.05, z: target.z },
      color: shotgun ? "#ffa45c" : "#ffe08a"
    });
    io.to(socket.data.room).emit("health", { id: target.id, hp: target.hp });
    if (target.hp === 0) {
      io.to(socket.data.room).emit("roundOver", { winner: shooter.name, loser: target.name });
    }
    reply({ ok: true });
  });

  socket.on("restartRound", () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    const firstId = [...room.players.keys()][0];
    for (const p of room.players.values()) {
      p.hp = 100;
      p.x = 0;
      p.y = 1;
      p.z = p.id === firstId ? 8 : -8;
      p.rot = 0;
      p.lastShot = 0;
      p.lastBuild = 0;
    }
    room.builds = [];
    io.to(socket.data.room).emit("resetRound", roomSnapshot(socket.data.room));
  });

  socket.on("disconnect", () => {
    const code = socket.data.room;
    const room = rooms.get(code);
    if (!room) return;
    room.players.delete(socket.id);
    socket.to(code).emit("opponentLeft");
    if (room.players.size === 0) rooms.delete(code);
    else io.to(code).emit("roomState", roomSnapshot(code));
  });
});

function roomSnapshot(code) {
  const room = rooms.get(code);
  return {
    players: [...room.players.values()].map(({ lastShot, lastBuild, ...p }) => p),
    builds: room.builds
  };
}
function cleanName(name) {
  return String(name || "Jogador").trim().slice(0, 16) || "Jogador";
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

server.listen(PORT, "0.0.0.0", () => console.log(`BuildBattle rodando na porta ${PORT}`));
