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
const makeCode = () => crypto.randomBytes(2).toString("hex").toUpperCase();

io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}, reply = () => {}) => {
    let code;
    do { code = makeCode(); } while (rooms.has(code));
    const player = { id: socket.id, name: cleanName(name), x: 0, y: 1, z: 8, hp: 100, lastShot: 0 };
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
    const player = { id: socket.id, name: cleanName(name), x: 0, y: 1, z: -8, hp: 100, lastShot: 0 };
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
    p.x = clamp(Number(data.x) || 0, -48, 48);
    p.y = clamp(Number(data.y) || 1, 0.5, 30);
    p.z = clamp(Number(data.z) || 0, -48, 48);
    p.rot = Number(data.rot) || 0;
    socket.to(socket.data.room).emit("opponentMove", { id: socket.id, x: p.x, y: p.y, z: p.z, rot: p.rot });
  });

  socket.on("build", data => {
    const room = rooms.get(socket.data.room);
    if (!room || room.builds.length >= 180 || !data) return;
    const piece = {
      id: crypto.randomUUID(), owner: socket.id,
      type: ["wall", "ramp", "floor"].includes(data.type) ? data.type : "wall",
      x: clamp(Number(data.x) || 0, -48, 48),
      y: clamp(Number(data.y) || 0.1, 0.1, 20),
      z: clamp(Number(data.z) || 0, -48, 48),
      rot: Number(data.rot) || 0
    };
    room.builds.push(piece);
    io.to(socket.data.room).emit("built", piece);
  });

  socket.on("shoot", ({ targetId, origin, direction } = {}, reply = () => {}) => {
    const room = rooms.get(socket.data.room);
    const shooter = room?.players.get(socket.id);
    const target = room?.players.get(targetId);
    if (!shooter || !target || target.hp <= 0 || !origin || !direction) return;
    const now = Date.now();
    if (now - shooter.lastShot < 250) return;
    const ox = Number(origin.x), oy = Number(origin.y), oz = Number(origin.z);
    const dx = Number(direction.x), dy = Number(direction.y), dz = Number(direction.z);
    const len = Math.hypot(dx, dy, dz);
    if (![ox, oy, oz, dx, dy, dz].every(Number.isFinite) || len < .9 || len > 1.1) return;
    if (Math.hypot(ox - shooter.x, oy - shooter.y, oz - shooter.z) > 3.5) return;
    const tx = target.x - ox, ty = (target.y - .15) - oy, tz = target.z - oz;
    const distance = Math.hypot(tx, ty, tz);
    if (distance > 55 || distance < .1) return;
    const projection = (tx * dx + ty * dy + tz * dz) / distance;
    const perpendicular = Math.sqrt(Math.max(0, 1 - projection * projection)) * distance;
    if (projection < .995 || perpendicular > 1.15) return;
    shooter.lastShot = now;
    target.hp = Math.max(0, target.hp - 25);
    io.to(socket.data.room).emit("health", { id: target.id, hp: target.hp });
    if (target.hp === 0) io.to(socket.data.room).emit("roundOver", { winner: shooter.name, loser: target.name });
    reply({ ok: true });
  });

  socket.on("restartRound", () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    const firstId = [...room.players.keys()][0];
    for (const p of room.players.values()) { p.hp = 100; p.x = 0; p.y = 1; p.z = p.id === firstId ? 8 : -8; }
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
  return { players: [...room.players.values()].map(({ lastShot, ...p }) => p), builds: room.builds };
}
function cleanName(n) { return String(n || "Jogador").trim().slice(0, 16) || "Jogador"; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

server.listen(PORT, "0.0.0.0", () => console.log(`BuildBattle rodando na porta ${PORT}`));