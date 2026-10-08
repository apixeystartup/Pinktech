import { useMemo, useRef } from "react";
import { useClock } from "./clock";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import {
  PALETTE,
  clamp01,
  easeOutCubic,
  lerp,
  ramp,
  seeded,
  smoothstep,
} from "./demoScript";

const UP = new THREE.Vector3(0, 1, 0);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ============================================================
   Text / labels (DOM overlay — crisp, zero font downloads)
   ============================================================ */
export function Label({ position, title, sub, color = PALETTE.indigo, className = "" }) {
  return (
    <Html position={position} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <div className={`d3-tag ${className}`} style={{ "--tag": color }}>
        {title && <span className="d3-tag-title">{title}</span>}
        {sub && <span className="d3-tag-sub">{sub}</span>}
      </div>
    </Html>
  );
}

export function Chip({ position, text, color = PALETTE.cyan, icon }) {
  return (
    <Html position={position} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <div className="d3-chip" style={{ "--tag": color }}>
        {icon && <span className="d3-chip-icon">{icon}</span>}
        {text}
      </div>
    </Html>
  );
}

/* ============================================================
   Stage floor
   ============================================================ */
function gridGeometry(radius, step) {
  const points = [];
  const half = Math.floor(radius / step);
  for (let i = -half; i <= half; i += 1) {
    const v = i * step;
    const edge = Math.abs(v);
    const run = Math.sqrt(Math.max(radius * radius - edge * edge, 0));
    points.push(-run, 0, v, run, 0, v);
    points.push(v, 0, -run, v, 0, run);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

export function StagePad({
  y = -2.6,
  radius = 15,
  color = PALETTE.indigo,
  intensity = 0.16,
  ticks = 24,
}) {
  const grid = useMemo(() => gridGeometry(radius, 2.5), [radius]);
  const tickAngles = useMemo(
    () => Array.from({ length: ticks }, (_, i) => (i / ticks) * Math.PI * 2),
    [ticks],
  );

  return (
    <group position={[0, y, 0]}>
      <mesh rotation-x={-Math.PI / 2}>
        <circleGeometry args={[radius, 72]} />
        <meshBasicMaterial color="#060b1a" transparent opacity={0.72} />
      </mesh>

      <lineSegments position={[0, 0.01, 0]} geometry={grid}>
        <lineBasicMaterial color={color} transparent opacity={intensity} />
      </lineSegments>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[radius * 0.965, radius, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} toneMapped={false} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[radius * 0.42, radius * 0.428, 72]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} toneMapped={false} />
      </mesh>

      {tickAngles.map((angle, i) => (
        <mesh
          key={i}
          position={[Math.cos(angle) * radius * 0.995, 0.03, Math.sin(angle) * radius * 0.995]}
          rotation-y={-angle}
        >
          <boxGeometry args={[i % 6 === 0 ? 1.1 : 0.5, 0.05, 0.12]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={i % 6 === 0 ? 0.75 : 0.3}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ============================================================
   Connection lines
   ============================================================ */
export function Beam({ from, to, color = PALETTE.indigo, width = 1.4, opacity = 0.5 }) {
  const geometry = useMemo(() => {
    const a = V3(...from);
    const b = V3(...to);
    const curve = new THREE.QuadraticBezierCurve3(
      a,
      a.clone().lerp(b, 0.5).add(V3(0, Math.max(a.distanceTo(b) * 0.16, 0.6), 0)),
      b,
    );
    return curve.getPoints(48);
  }, [from, to]);

  return (
    <Line
      points={geometry}
      color={color}
      lineWidth={width}
      transparent
      opacity={opacity}
      toneMapped={false}
    />
  );
}

/**
 * Animated link: draws itself in, then flows dashes toward the target.
 */
export function FlowLine({
  points,
  color = PALETTE.cyan,
  width = 1.6,
  dashed = true,
  flow = 0.9,
  opacity = 0.85,
  reveal = null,
  drawFrom = 0,
  drawSpan = 0.9,
}) {
  const clock = useClock();
  const line = useRef(null);
  const key = useMemo(() => points.map((p) => p.join(",")).join("|"), [points]);

  useFrame((_, delta) => {
    const mesh = line.current;
    if (!mesh) return;
    if (mesh.material?.dashOffset !== undefined) {
      mesh.material.dashOffset -= delta * flow * 12;
    }
    const t = clock.current.chapterTime;
    const total = mesh.geometry.attributes.instanceStart?.count ?? 0;
    const grow = reveal === null ? 1 : ramp(t, reveal, 1.1);
    const draw = ramp(t, drawFrom, drawSpan);
    const shown = Math.max(0, Math.min(total, Math.round(total * Math.min(grow, draw))));
    if (mesh.geometry.instanceCount !== shown) mesh.geometry.instanceCount = shown;
  });

  return (
    <Line
      key={key}
      ref={line}
      points={points}
      color={color}
      lineWidth={width}
      dashed={dashed}
      dashScale={2}
      dashSize={0.35}
      gapSize={0.22}
      transparent
      opacity={opacity}
      toneMapped={false}
    />
  );
}

/* ============================================================
   Travelling data packets
   ============================================================ */
export function Comet({
  curve,
  color = PALETTE.cyan,
  speed = 0.2,
  offset = 0,
  size = 0.14,
  tail = 1.1,
  activeFrom = 0,
  activeSpan = 999,
}) {
  const clock = useClock();
  const group = useRef(null);
  const head = useRef(null);
  const tailMesh = useRef(null);
  const scratch = useMemo(() => ({ p: new THREE.Vector3(), t: new THREE.Vector3() }), []);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = clock.current.chapterTime;
    const alive = clamp01((t - activeFrom) / 0.6) * (1 - ramp(t, activeFrom + activeSpan - 0.5, 0.5));
    g.visible = alive > 0.01;
    if (!g.visible) return;

    let progress = (t * speed + offset) % 1;
    if (progress < 0) progress += 1;

    const { p, tan } = scratch;
    curve.getPointAt(progress, p);
    curve.getTangentAt(progress, tan);
    g.position.copy(p);
    g.quaternion.setFromUnitVectors(UP, tan);

    const pulseScale = 0.85 + Math.sin(state.clock.elapsedTime * 9 + offset * 20) * 0.15;
    head.current.scale.setScalar(pulseScale);
    tailMesh.current.position.y = -tail * 0.5;
    tailMesh.current.scale.y = tail;
  });

  return (
    <group ref={group}>
      <mesh ref={head}>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={head}>
        <sphereGeometry args={[size * 3.4, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={tailMesh}>
        <coneGeometry args={[size * 0.85, 1, 10, 1, true]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ============================================================
   Architecture pieces
   ============================================================ */
export function ServiceTower({
  position,
  color = PALETTE.indigo,
  height = 4.2,
  radius = 1.05,
  title,
  sub,
  labelOffset = [0, 0, 0],
  reveal = 0,
  revealSpan = 1.1,
  spin = 0,
}) {
  const clock = useClock();
  const group = useRef(null);
  const cap = useRef(null);
  const light = useRef(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, reveal, revealSpan));
    g.scale.setScalar(Math.max(s, 0.001));
    g.visible = s > 0.01;
    if (cap.current) cap.current.rotation.y += delta * (0.5 + spin);
    if (light.current) {
      light.current.position.y = height * 0.6 + Math.sin(state.clock.elapsedTime * 1.3) * 0.12;
    }
  });

  return (
    <group ref={group} position={position}>
      {/* plinth */}
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[radius * 1.32, radius * 1.42, 0.32, 6]} />
        <meshStandardMaterial color="#0d1430" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[0, 0.33, 0]}>
        <cylinderGeometry args={[radius * 1.16, radius * 1.24, 0.06, 6]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
      </mesh>

      {/* glass body */}
      <mesh position={[0, 0.36 + height / 2, 0]}>
        <cylinderGeometry args={[radius, radius * 0.92, height, 6]} />
        <meshStandardMaterial
          color="#26356e"
          roughness={0.28}
          metalness={0.45}
          transparent
          opacity={0.82}
          emissive={color}
          emissiveIntensity={0.55}
        />
      </mesh>

      {/* edge rails */}
      {[0, 1, 2].map((i) => {
        const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius * 0.99,
              0.36 + height / 2,
              Math.sin(angle) * radius * 0.99,
            ]}
          >
            <boxGeometry args={[0.06, height, 0.06]} />
            <meshBasicMaterial color={color} transparent opacity={0.65} toneMapped={false} />
          </mesh>
        );
      })}

      {/* floor bands */}
      {[0.34, 0.68].map((f, i) => (
        <mesh key={i} position={[0, 0.36 + height * f, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[radius * 1.03, 0.022, 8, 6]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} toneMapped={false} />
        </mesh>
      ))}

      {/* floating cap ring */}
      <mesh ref={cap} position={[0, 0.36 + height + 0.3, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[radius * 0.78, 0.05, 10, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
      </mesh>

      {/* core column */}
      <mesh ref={light} position={[0, 0.36 + height * 0.5, 0]}>
        <cylinderGeometry args={[0.09, 0.09, height * 0.92, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} toneMapped={false} />
      </mesh>

      <pointLight color={color} intensity={6} distance={9} position={[0, 0.36 + height * 0.6, 0]} />

      {title && (
        <Label
          position={[labelOffset[0], 0.36 + height + 0.75, labelOffset[2]]}
          title={title}
          sub={sub}
          color={color}
        />
      )}
    </group>
  );
}

export function GatewayCore({
  position,
  color = PALETTE.indigo,
  radius = 2.1,
  height = 6.4,
  title = "API Gateway",
  sub = ":5001 · JWT + tenant scope",
  reveal = 0,
  revealSpan = 1.2,
}) {
  const clock = useClock();
  const group = useRef(null);
  const rings = useRef([]);
  const beam = useRef(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, reveal, revealSpan));
    g.scale.set(1, Math.max(s, 0.001), 1);
    g.visible = s > 0.01;

    rings.current.forEach((ring, i) => {
      if (!ring) return;
      ring.rotation.z += delta * (0.18 + i * 0.09) * (i % 2 === 0 ? 1 : -1);
      ring.position.y = 0.4 + height * (0.22 + i * 0.2);
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.6 + i) * 0.03;
      ring.scale.setScalar(breathe);
    });

    if (beam.current) {
      beam.current.material.opacity =
        0.35 + Math.sin(state.clock.elapsedTime * 2.2) * 0.18 + ramp(t, 3, 1) * 0.2;
    }
  });

  return (
    <group ref={group} position={position}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[radius * 1.18, radius * 1.3, 0.36, 8]} />
        <meshStandardMaterial color="#0b1230" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* glass column */}
      <mesh position={[0, 0.36 + height / 2, 0]}>
        <cylinderGeometry args={[radius * 0.72, radius, height, 8, 1, true]} />
        <meshStandardMaterial
          color="#2b3a7d"
          roughness={0.22}
          metalness={0.5}
          transparent
          opacity={0.72}
          side={THREE.DoubleSide}
          emissive={color}
          emissiveIntensity={0.7}
        />
      </mesh>

      {/* vertical light beam */}
      <mesh ref={beam} position={[0, 0.36 + height * 0.5, 0]}>
        <cylinderGeometry args={[0.16, 0.16, height * 1.05, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          ref={(node) => {
            rings.current[i] = node;
          }}
          rotation-x={Math.PI / 2}
        >
          <torusGeometry args={[radius * (0.86 + i * 0.09), 0.045, 8, 40]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? color : PALETTE.cyan}
            transparent
            opacity={0.75}
            toneMapped={false}
          />
        </mesh>
      ))}

      <mesh position={[0, 0.36 + height + 0.35, 0]}>
        <octahedronGeometry args={[0.42, 0]} />
        <meshStandardMaterial
          color="#e2e8ff"
          emissive={color}
          emissiveIntensity={1.6}
          roughness={0.15}
          metalness={0.1}
        />
      </mesh>

      <pointLight color={color} intensity={22} distance={22} position={[0, 0.36 + height * 0.6, 0]} />

      <Label
        position={[0, 0.36 + height + 1.25, 0]}
        title={title}
        sub={sub}
        color={color}
        className="d3-tag-lg"
      />
    </group>
  );
}

export function DataDisc({
  position,
  radius = 6,
  color = PALETTE.cyan,
  title = "MongoDB",
  sub = "tenant-partitioned collections",
  reveal = 0,
  revealSpan = 1.2,
}) {
  const clock = useClock();
  const group = useRef(null);
  const ring = useRef(null);
  const ring2 = useRef(null);
  const plates = useMemo(() => [0, 1, 2, 3].map((i) => ({ i, r: radius * (0.28 + i * 0.2) })), [radius]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, reveal, revealSpan));
    g.scale.setScalar(Math.max(s, 0.001));
    g.visible = s > 0.01;
    if (ring.current) ring.current.rotation.z -= delta * 0.22;
    if (ring2.current) ring2.current.rotation.z += delta * 0.13;
  });

  return (
    <group ref={group} position={position}>
      {plates.map(({ i, r }) => (
        <mesh key={i} position={[0, -0.5 - i * 0.34, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[r, r, 0.16, 40]} />
          <meshPhysicalMaterial
            color="#0a1330"
            roughness={0.3}
            metalness={0.5}
            transparent
            opacity={0.5}
          />
        </mesh>
      ))}

      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <circleGeometry args={[radius, 64]} />
        <meshBasicMaterial color="#071024" transparent opacity={0.9} />
      </mesh>

      <mesh ref={ring} rotation-x={-Math.PI / 2} position={[0, 0.05, 0]}>
        <ringGeometry args={[radius * 0.52, radius * 0.545, 80, 1, 0, Math.PI * 1.5]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh ref={ring2} rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[radius * 0.74, radius * 0.76, 80, 1, 0, Math.PI * 1.1]} />
        <meshBasicMaterial color={PALETTE.indigo} transparent opacity={0.6} toneMapped={false} />
      </mesh>

      {Array.from({ length: 28 }, (_, i) => {
        const angle = (i / 28) * Math.PI * 2;
        const r = radius * (0.3 + seeded(i + 3) * 0.62);
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * r, 0.08, Math.sin(angle) * r]}
            rotation-x={-Math.PI / 2}
          >
            <circleGeometry args={[0.07 + seeded(i + 11) * 0.08, 8]} />
            <meshBasicMaterial
              color={i % 5 === 0 ? PALETTE.cyan : PALETTE.indigo}
              transparent
              opacity={0.45}
              toneMapped={false}
            />
          </mesh>
        );
      })}

      <Label position={[0, 0.5, radius + 1.4]} title={title} sub={sub} color={color} />
    </group>
  );
}

/* ============================================================
   Generic nodes, rings, panels, bars
   ============================================================ */
export function Node3D({
  position,
  color = PALETTE.indigo,
  size = 0.42,
  shape = "sphere",
  label,
  sub,
  active = false,
  activeFrom = 0,
  labelDy = 0.85,
}) {
  const clock = useClock();
  const group = useRef(null);
  const core = useRef(null);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = clock.current.chapterTime;
    const on = active && t > activeFrom;
    const breathe = on ? 1 + Math.sin(state.clock.elapsedTime * 4) * 0.09 : 1;
    g.scale.setScalar(breathe);
    if (core.current) core.current.rotation.y += 0.004;
  });

  const geometry =
    shape === "cube" ? (
      <boxGeometry args={[size * 1.7, size * 1.7, size * 1.7]} />
    ) : shape === "octa" ? (
      <octahedronGeometry args={[size * 1.25, 0]} />
    ) : (
      <sphereGeometry args={[size, 20, 20]} />
    );

  return (
    <group ref={group} position={position}>
      <mesh>
        {geometry}
        <meshStandardMaterial
          color="#0f1836"
          emissive={color}
          emissiveIntensity={active ? 1.5 : 0.55}
          roughness={0.24}
          metalness={0.45}
        />
      </mesh>
      <mesh ref={core} rotation-x={Math.PI / 3}>
        <torusGeometry args={[size * 1.5, 0.022, 8, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[size * 1.9, 0.014, 8, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} toneMapped={false} />
      </mesh>
      {(label || sub) && (
        <Label position={[0, labelDy, 0]} title={label} sub={sub} color={color} />
      )}
    </group>
  );
}

export function RingGate({
  position,
  radius = 2.4,
  color = PALETTE.purple,
  speed = 0.4,
  tilt = [Math.PI / 2, 0, 0],
  spokes = 6,
}) {
  const ring = useRef(null);
  const spokeGroup = useRef(null);

  useFrame((state, delta) => {
    if (ring.current) ring.current.rotation.z += delta * speed;
    if (spokeGroup.current) spokeGroup.current.rotation.z -= delta * speed * 0.55;
    if (ring.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.02;
      ring.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={position} rotation={tilt}>
      <mesh ref={ring}>
        <torusGeometry args={[radius, 0.07, 10, 60]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <group ref={spokeGroup}>
        {Array.from({ length: spokes }, (_, i) => {
          const angle = (i / spokes) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}
              rotation-z={angle + Math.PI / 2}
            >
              <boxGeometry args={[0.5, 0.06, 0.06]} />
              <meshBasicMaterial color={PALETTE.cyan} transparent opacity={0.6} toneMapped={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

export function Shockwave({
  position,
  color = PALETTE.cyan,
  start = 0,
  span = 1.4,
  maxRadius = 16,
  rings = 3,
  tilt = [Math.PI / 2, 0, 0],
}) {
  const clock = useClock();
  const group = useRef(null);
  const items = useRef([]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = clock.current.chapterTime;
    const alive = t > start && t < start + span * rings * 0.55;
    g.visible = alive;
    if (!alive) return;
    items.current.forEach((mesh, i) => {
      if (!mesh) return;
      const local = (t - start - i * span * 0.32) / span;
      const k = clamp01(local);
      mesh.visible = k > 0 && k < 1;
      mesh.scale.setScalar(0.2 + easeOutCubic(k) * maxRadius);
      mesh.material.opacity = (1 - k) * 0.5;
    });
  });

  return (
    <group ref={group} position={position} rotation={tilt}>
      {Array.from({ length: rings }, (_, i) => (
        <mesh
          key={i}
          ref={(node) => {
            items.current[i] = node;
          }}
          rotation-x={Math.PI / 2}
        >
          <ringGeometry args={[0.94, 1, 96]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.4}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Glassy UI card with skeleton rows — stands in for a form / document. */
export function Panel({
  position,
  rotation = [0, 0, 0],
  width = 3,
  height = 4,
  color = PALETTE.indigo,
  rows = 5,
  revealFrom = 0,
  revealSpan = 1,
  rowReveal = 0.12,
  title,
}) {
  const clock = useClock();
  const group = useRef(null);
  const card = useRef(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, revealFrom, revealSpan));
    g.visible = s > 0.02;
    g.scale.setScalar(Math.max(s, 0.001));
    if (card.current) card.current.material.opacity = 0.9 * s;
  });

  const rowWidths = useMemo(
    () => Array.from({ length: rows }, (_, i) => 0.55 + seeded(i + 7) * 0.42),
    [rows],
  );
  const rowSpan = (height - 1) / rows;

  return (
    <group ref={group} position={position} rotation={rotation}>
      <mesh ref={card}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#1e2a5e"
          transparent
          opacity={0.92}
          roughness={0.28}
          metalness={0.35}
          emissive={color}
          emissiveIntensity={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[width - 0.3, 0.12]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
      </mesh>

      {rowWidths.map((w, i) => {
        const y = height / 2 - 0.65 - i * rowSpan;
        return (
          <FieldRow
            key={i}
            y={y}
            width={(width - 0.5) * w}
            index={i}
            color={color}
            revealFrom={revealFrom}
            revealSpan={revealSpan}
            rowReveal={rowReveal}
          />
        );
      })}

      {title && (
        <Label position={[0, height / 2 + 0.42, 0]} title={title} color={color} />
      )}
    </group>
  );
}

function FieldRow({ y, width, index, color, revealFrom, revealSpan, rowReveal }) {
  const clock = useClock();
  const group = useRef(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const s = easeOutCubic(
      ramp(clock.current.chapterTime, revealFrom + revealSpan + index * rowReveal, 0.45)
    );
    g.scale.x = Math.max(s, 0.001);
    g.visible = s > 0.02;
  });

  return (
    <group ref={group} position={[-width / 2, y, 0.02]}>
      <mesh position={[0.1, 0, 0]}>
        <planeGeometry args={[0.15, 0.15]} />
        <meshBasicMaterial color={PALETTE.emerald} transparent opacity={0.8} toneMapped={false} />
      </mesh>
      <mesh position={[0.22 + width * 0.36, 0, 0]}>
        <planeGeometry args={[width * 0.68, 0.1]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh position={[0.2 + width * 0.86, 0, 0]}>
        <planeGeometry args={[0.11, 0.11]} />
        <meshBasicMaterial color={PALETTE.amber} transparent opacity={0.7} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Bar3D({
  position,
  width = 0.7,
  depth = 0.7,
  maxHeight = 4,
  value = 0.6,
  color = PALETTE.indigo,
  growFrom = 0,
  growSpan = 0.8,
  delay = 0,
}) {
  const clock = useClock();
  const mesh = useRef(null);
  const cap = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const h = Math.max(easeOutCubic(ramp(t, growFrom + delay, growSpan)) * maxHeight * value, 0.001);
    if (mesh.current) {
      mesh.current.scale.y = h;
      mesh.current.position.y = h / 2;
    }
    if (cap.current) {
      cap.current.position.y = h;
      cap.current.material.opacity =
        0.5 + Math.sin(state.clock.elapsedTime * 2 + delay * 6) * 0.2;
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, maxHeight * 0.5, 0]}>
        <boxGeometry args={[width + 0.1, 0.04, depth + 0.1]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} toneMapped={false} />
      </mesh>
      <mesh ref={mesh} position={[0, 0, 0]}>
        <boxGeometry args={[width, 1, depth]} />
        <meshStandardMaterial
          color="#101a3c"
          emissive={color}
          emissiveIntensity={0.45}
          roughness={0.3}
          metalness={0.35}
        />
      </mesh>
      <mesh ref={cap} rotation-x={Math.PI / 2} position={[0, 0.01, 0]}>
        <planeGeometry args={[width * 0.96, depth * 0.96]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/* ============================================================
   Atmosphere
   ============================================================ */
export function Atmosphere({ count = 320, spread = 60, color = PALETTE.indigo }) {
  const points = useRef(null);

  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (seeded(i + 1) - 0.5) * spread * 2;
      positions[i * 3 + 1] = (seeded(i + 2) - 0.35) * spread * 0.55;
      positions[i * 3 + 2] = (seeded(i + 3) - 0.5) * spread * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count, spread]);

  // Drift is done with object transforms rather than per-vertex writes, so the
  // buffer stays immutable after mount.
  useFrame((state) => {
    const node = points.current;
    if (!node) return;
    const elapsed = state.clock.elapsedTime;
    node.rotation.y = elapsed * 0.008;
    node.position.y = Math.sin(elapsed * 0.22) * 0.6;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.09}
        color={color}
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* ============================================================
   Camera director
   ============================================================ */
export function CameraDirector({ clock, track }) {
  const { camera } = useThree();
  const smoothLook = useRef(new THREE.Vector3(0, 2, 0));
  // Scratch vectors live in refs so the frame loop can mutate them freely.
  const scratchPos = useRef(new THREE.Vector3());
  const scratchLook = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const time = clock.current.time;
    let index = 0;
    for (let i = 0; i < track.length - 1; i += 1) {
      if (time >= track[i].t) index = i;
    }
    const a = track[index];
    const b = track[Math.min(index + 1, track.length - 1)];
    const span = Math.max(b.t - a.t, 0.0001);
    const local = smoothstep((time - a.t) / span);

    const pos = scratchPos.current;
    const lookAt = scratchLook.current;

    pos.set(
      lerp(a.pos[0], b.pos[0], local),
      lerp(a.pos[1], b.pos[1], local),
      lerp(a.pos[2], b.pos[2], local),
    );
    lookAt.set(
      lerp(a.look[0], b.look[0], local),
      lerp(a.look[1], b.look[1], local),
      lerp(a.look[2], b.look[2], local),
    );

    // Handheld drift keeps the dolly from feeling like a CAD viewer.
    const elapsed = clock.current.time;
    pos.x += Math.sin(elapsed * 0.47) * 0.28 + Math.sin(elapsed * 0.21) * 0.18;
    pos.y += Math.cos(elapsed * 0.38) * 0.18;

    const k = 1 - Math.pow(0.0015, Math.min(delta, 0.05));
    camera.position.lerp(pos, k);
    smoothLook.current.lerp(lookAt, k);
    camera.lookAt(smoothLook.current);
    camera.updateProjectionMatrix();
  });

  return null;
}