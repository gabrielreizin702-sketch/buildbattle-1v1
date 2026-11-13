const EPS = 1e-6;

export const PLAYER_RADIUS = 0.38;
export const PLAYER_HEIGHT = 2.25;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function localXZ(piece, x, z) {
  const dx = x - piece.x;
  const dz = z - piece.z;
  const angle = Number(piece.rot) || 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

function worldXZ(piece, x, z) {
  const angle = Number(piece.rot) || 0;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: piece.x + x * c + z * s,
    z: piece.z - x * s + z * c
  };
}

function circleOverlapsRect(x, z, halfX, halfZ, radius) {
  const closestX = clamp(x, -halfX, halfX);
  const closestZ = clamp(z, -halfZ, halfZ);
  const dx = x - closestX;
  const dz = z - closestZ;
  return dx * dx + dz * dz <= radius * radius;
}

export function rampSurfaceHeight(piece, x, z, radius = PLAYER_RADIUS) {
  const local = localXZ(piece, x, z);
  if (!circleOverlapsRect(local.x, local.z, 2, 2, radius)) return null;
  const along = clamp(local.z, -2, 2);
  return piece.y + (2 - along) * 0.7;
}

export function resolveBuildCollisions(position, builds, options = {}) {
  const radius = options.radius ?? PLAYER_RADIUS;
  const height = options.height ?? PLAYER_HEIGHT;
  const result = { x: position.x, y: position.y, z: position.z };

  // Several short passes handle corners where two pieces meet.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;

    for (const piece of builds) {
      if (piece.type === "wall" || piece.type === "floor") {
        const halfX = 2;
        const halfZ = piece.type === "wall" ? 0.14 : 2;
        const bottom = piece.type === "wall" ? piece.y - 1.6 : piece.y - 0.11;
        const top = piece.type === "wall" ? piece.y + 1.6 : piece.y + 0.11;

        // A player standing on the top surface is not embedded in the box.
        if (result.y + height <= bottom + EPS || result.y >= top - EPS) continue;
        // A player falling from above should land on the platform, not be pushed off its edge.
        const crossedFloorTop = options.previous && options.previous.y >= top - 0.18 && result.y <= top + 0.03;
        const hitFloorCeiling = options.previous && options.previous.y + height <= bottom + 0.02 && result.y + height > bottom;
        if (piece.type === "floor" && (result.y >= bottom - 0.02 || crossedFloorTop || hitFloorCeiling)) continue;

        const local = localXZ(piece, result.x, result.z);
        const closestX = clamp(local.x, -halfX, halfX);
        const closestZ = clamp(local.z, -halfZ, halfZ);
        let dx = local.x - closestX;
        let dz = local.z - closestZ;
        let distance = Math.hypot(dx, dz);

        if (distance >= radius) continue;

        if (distance > EPS) {
          const push = radius - distance + 0.001;
          local.x += (dx / distance) * push;
          local.z += (dz / distance) * push;
        } else {
          const penetrationX = halfX - Math.abs(local.x);
          const penetrationZ = halfZ - Math.abs(local.z);
          if (penetrationX < penetrationZ) {
            local.x = (Math.sign(local.x) || 1) * (halfX + radius + 0.001);
          } else {
            local.z = (Math.sign(local.z) || 1) * (halfZ + radius + 0.001);
          }
        }

        const world = worldXZ(piece, local.x, local.z);
        result.x = world.x;
        result.z = world.z;
        changed = true;
        continue;
      }

      if (piece.type === "ramp") {
        const local = localXZ(piece, result.x, result.z);
        const surface = piece.y + (2 - clamp(local.z, -2, 2)) * 0.7;
        const verticalOverlap = result.y + height > piece.y && result.y < piece.y + 2.8;

        // The sloped prism has solid side faces. Keep the capsule outside them
        // unless its feet are already on the walkable slope.
        if (
          verticalOverlap &&
          Math.abs(local.z) <= 2 + radius &&
          Math.abs(local.x) > 2 - radius &&
          result.y < surface - 0.25
        ) {
          local.x = (Math.sign(local.x) || 1) * (2 + radius + 0.001);
          const world = worldXZ(piece, local.x, local.z);
          result.x = world.x;
          result.z = world.z;
          changed = true;
        }

        // The high end of the ramp is a vertical face; the low end stays open.
        if (
          verticalOverlap &&
          local.z < -2 + radius &&
          Math.abs(local.x) <= 2 + radius &&
          result.y < piece.y + 2.8 &&
          result.y < surface - 0.25
        ) {
          local.z = -2 - radius - 0.001;
          const world = worldXZ(piece, local.x, local.z);
          result.x = world.x;
          result.z = world.z;
          changed = true;
        }
      }
    }

    if (!changed) break;
  }

  return result;
}

export function findSupportHeight(previous, current, builds, velocityY, wasGrounded, options = {}) {
  const radius = options.radius ?? PLAYER_RADIUS;
  if (velocityY > 0) return null;

  let best = null;
  const consider = y => {
    if (best === null || y > best) best = y;
  };

  if (
    (previous.y >= -0.18 && current.y <= 0.05) ||
    (wasGrounded && previous.y <= 0.18 && current.y <= 0.18)
  ) {
    consider(0);
  }

  for (const piece of builds) {
    if (piece.type === "floor") {
      const local = localXZ(piece, current.x, current.z);
      if (!circleOverlapsRect(local.x, local.z, 2, 2, radius)) continue;
      const top = piece.y + 0.11;
      const fallingOnto = previous.y >= top - 0.18 && current.y <= top + 0.03;
      const stayingOn = wasGrounded && Math.abs(previous.y - top) <= 0.18;
      if (fallingOnto || stayingOn) consider(top);
      continue;
    }

    if (piece.type === "ramp") {
      const surface = rampSurfaceHeight(piece, current.x, current.z, radius);
      if (surface === null) continue;
      const previousSurface = rampSurfaceHeight(piece, previous.x, previous.z, radius);
      const fallingOnto = previous.y >= surface - 0.22 && current.y <= surface + 0.03;
      const walkingAlong =
        wasGrounded &&
        previousSurface !== null &&
        Math.abs(previous.y - previousSurface) < 0.3 &&
        surface - previous.y <= 0.35 &&
        surface - previous.y >= -0.8;
      if (fallingOnto || walkingAlong) consider(surface);
    }
  }

  return best;
}

export function resolveFloorCeiling(previousFeetY, nextFeetY, x, z, builds, options = {}) {
  const height = options.height ?? PLAYER_HEIGHT;
  if (nextFeetY <= previousFeetY) return { y: nextFeetY, hit: false };

  let resolvedY = nextFeetY;
  let hit = false;

  for (const piece of builds) {
    if (piece.type !== "floor") continue;
    const local = localXZ(piece, x, z);
    if (!circleOverlapsRect(local.x, local.z, 2, 2, options.radius ?? PLAYER_RADIUS)) continue;

    const underside = piece.y - 0.11;
    const previousHead = previousFeetY + height;
    const nextHead = nextFeetY + height;
    if (previousHead <= underside + 0.02 && nextHead > underside) {
      resolvedY = Math.min(resolvedY, underside - height);
      hit = true;
    }
  }

  return { y: resolvedY, hit };
}
