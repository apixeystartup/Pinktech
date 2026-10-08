import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { Chip, Comet, Label, Node3D, Panel, StagePad } from "../parts";
import { useClock } from "../clock";
import makeCurve from "../makeCurve";
import { PALETTE, STAGE_Z, clamp01, easeOutCubic, ramp } from "../demoScript";

const STATIONS = [
  { name: "Form builder", color: PALETTE.indigo, x: -10.5, t: 0.6, form: true },
  { name: "Dispatch", color: PALETTE.cyan, x: -4.2, t: 3.0 },
  { name: "L1 · Team lead", color: PALETTE.amber, x: 2.1, t: 4.6 },
  { name: "L2 · Manager", color: PALETTE.purple, x: 8.4, t: 6.2 },
  { name: "Approved", color: PALETTE.emerald, x: 14.7, t: 8.2 },
];

export default function WorkflowScene() {
  const curve = useMemo(
    () =>
      makeCurve(
        [
          [-10.5, 1.6, 0],
          [-4.2, 1.9, 0.4],
          [2.1, 2.2, -0.2],
          [8.4, 2.5, 0.3],
          [14.7, 3.2, 0],
        ],
        0.8,
      ),
    [],
  );

  return (
    <group position={[0, 0, STAGE_Z.workflow]}>
      <StagePad y={-2.6} radius={17} color={PALETTE.pink} intensity={0.09} />

      {/* the approval rail */}
      <mesh position={[2, -2.5, 0]}>
        <boxGeometry args={[28, 0.12, 0.7]} />
        <meshBasicMaterial color={PALETTE.slate} transparent opacity={0.25} toneMapped={false} />
      </mesh>

      {STATIONS.map((station) => (
        <Station key={station.name} station={station} />
      ))}

      {/* the dispatched form card riding the rail */}
      <FormCard curve={curve} />

      <Comet curve={curve} color={PALETTE.cyan} speed={0.11} offset={0} size={0.13} tail={1.2} />
      <Comet curve={curve} color={PALETTE.indigo} speed={0.11} offset={0.5} size={0.1} tail={1} />

      <Chip position={[-10.5, 5.4, 0]} text="12 fields · conditional logic" color={PALETTE.indigo} icon="⌘" />
      <Chip position={[2.1, 5.6, -0.2]} text="SLA 24h" color={PALETTE.amber} icon="⏱" />
      <Chip position={[8.4, 6.1, 0.3]} text="SLA 48h · escalate" color={PALETTE.purple} icon="⏱" />
      <Chip position={[14.7, 6.6, 0]} text="status: APPROVED" color={PALETTE.emerald} icon="✓" />

      <Label
        position={[0, -3.6, 5]}
        title="Tokenised public dispatch link"
        sub="the submitter never needs a login"
        color={PALETTE.cyan}
      />
    </group>
  );
}

function Station({ station }) {
  const clock = useClock();
  const group = useRef(null);
  const ring = useRef(null);
  const stampRef = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, station.t, 0.9));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.scale.setScalar(Math.max(s, 0.001));
    }
    if (ring.current) {
      const active = t > station.t + 0.9 && t < station.t + 2.2;
      ring.current.material.opacity = active
        ? 0.5 + Math.sin(state.clock.elapsedTime * 6) * 0.4
        : 0.35;
      ring.current.rotation.z += 0.01;
    }
    if (stampRef.current) {
      const pop = clamp01((t - (station.t + 1.1)) / 0.5);
      stampRef.current.visible = pop > 0 && pop < 1;
      stampRef.current.scale.setScalar(0.4 + easeOutCubic(pop) * 0.9);
      stampRef.current.material.opacity = 1 - clamp01((pop - 0.75) / 0.25);
    }
  });

  const isLast = station.name === "Approved";

  return (
    <group position={[station.x, 0, 0]}>
      <group ref={group}>
        {/* base pad */}
        <mesh position={[0, -2.4, 0]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[2.1, 32]} />
          <meshBasicMaterial color={station.color} transparent opacity={0.14} toneMapped={false} />
        </mesh>
        <mesh position={[0, -2.36, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.9, 2.1, 48]} />
          <meshBasicMaterial color={station.color} transparent opacity={0.55} toneMapped={false} />
        </mesh>

        {/* mast */}
        <mesh position={[0, -0.6, 0]}>
          <cylinderGeometry args={[0.11, 0.14, 3.6, 8]} />
          <meshStandardMaterial color="#131c44" emissive={station.color} emissiveIntensity={0.4} roughness={0.3} />
        </mesh>

        {/* approval stamp */}
        <mesh ref={ring} position={[0, 1.2, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[1.15, 0.05, 8, 40]} />
          <meshBasicMaterial color={station.color} transparent opacity={0.35} toneMapped={false} />
        </mesh>

        {station.form ? (
          <Panel
            position={[0, 2.6, 0]}
            width={3.4}
            height={4.4}
            rows={5}
            color={station.color}
            revealFrom={station.t + 0.15}
            revealSpan={0.7}
            rowReveal={0.16}
            title="Expense Claim v3"
          />
        ) : (
          <Node3D
            position={[0, 2.6, 0]}
            color={station.color}
            size={isLast ? 0.7 : 0.55}
            shape={isLast ? "octa" : "sphere"}
          />
        )}

        <Label
          position={[0, isLast ? 4.4 : 4.1, 0]}
          title={station.name}
          color={station.color}
        />

        <mesh ref={stampRef} position={[0, 2.6, 0.9]}>
          <planeGeometry args={[1.5, 0.55]} />
          <meshBasicMaterial
            color={station.color}
            transparent
            opacity={0.9}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <StampText show={station} />
      </group>
    </group>
  );
}

function StampText({ show }) {
  const clock = useClock();
  const group = useRef(null);

  useFrame(() => {
    const t = clock.current.chapterTime;
    const pop = clamp01((t - (show.t + 1.1)) / 0.5);
    if (!group.current) return;
    group.current.visible = pop > 0 && pop < 1;
    group.current.scale.setScalar(0.4 + easeOutCubic(pop) * 0.9);
    group.current.style.opacity = 1 - clamp01((pop - 0.75) / 0.25);
  });

  return (
    <Html position={[0, 2.6, 0.95]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <div ref={group} className="d3-stamp">
        {show.name === "Approved" ? "APPROVED" : "SIGNED"}
      </div>
    </Html>
  );
}

/** The form card: built field-by-field, then flies down the rail. */
function FormCard({ curve }) {
  const clock = useClock();
  const group = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    if (!group.current) return;

    // Phase 1 (0.9 → 2.9): build the form in place.
    // Phase 2 (3.0 → 8.6): travel the rail.
    const buildStart = 0.9;
    const travelStart = 3.0;
    const travelEnd = 8.6;
    const inTravel = t > travelStart && t < travelEnd;

    group.current.visible = t > buildStart && t < travelEnd + 0.6;
    if (!group.current.visible) return;

    if (inTravel) {
      const p = clamp01((t - travelStart) / (travelEnd - travelStart));
      const point = curve.getPointAt(p);
      group.current.position.copy(point);
      group.current.rotation.set(0.1, -0.5 + p * 0.6, Math.sin(p * 6) * 0.06);
      group.current.scale.setScalar(0.42);
    } else {
      const s = easeOutCubic(ramp(t, buildStart, 0.7));
      group.current.position.set(-10.5, 2.6, 0);
      group.current.rotation.set(0, 0, 0);
      group.current.scale.setScalar(s * (0.42 + (1 - ramp(t, 2.2, 0.8)) * 0.58));
      void state;
    }
  });

  return (
    <group ref={group} position={[-10.5, 2.6, 0]}>
      <CardBody rows={5} color={PALETTE.cyan} start={1.0} />
    </group>
  );
}

function CardBody({ rows, color, start }) {
  const clock = useClock();
  const rowsRef = useRef([]);

  useFrame(() => {
    const t = clock.current.chapterTime;
    rowsRef.current.forEach((mesh, i) => {
      if (!mesh) return;
      const s = easeOutCubic(ramp(t, start + i * 0.17, 0.4));
      mesh.scale.x = Math.max(s, 0.001);
      mesh.visible = s > 0.02;
    });
  });

  return (
    <group>
      <mesh>
        <planeGeometry args={[3.4, 4.4]} />
        <meshPhysicalMaterial
          color="#0b1330"
          transparent
          opacity={0.95}
          roughness={0.18}
          metalness={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.95, 0.02]}>
        <planeGeometry args={[3, 0.14]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      {Array.from({ length: rows }, (_, i) => (
        <mesh
          key={i}
          ref={(node) => {
            rowsRef.current[i] = node;
          }}
          position={[-1.35, 1.1 - i * 0.6, 0.03]}
        >
          <planeGeometry args={[1.6 + (i % 3) * 0.4, 0.13]} />
          <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, -1.95, 0.02]}>
        <planeGeometry args={[1.4, 0.34]} />
        <meshBasicMaterial color={PALETTE.emerald} transparent opacity={0.8} toneMapped={false} />
      </mesh>
    </group>
  );
}