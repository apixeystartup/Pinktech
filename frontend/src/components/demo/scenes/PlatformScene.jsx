import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  Atmosphere,
  Beam,
  Comet,
  DataDisc,
  GatewayCore,
  ServiceTower,
  Shockwave,
  StagePad,
} from "../parts";
import { useClock } from "../clock";
import makeCurve from "../makeCurve";
import { PALETTE, STAGE_Z, easeOutCubic, ramp, seeded } from "../demoScript";

const SERVICES = [
  { name: "Auth", port: "4001", color: PALETTE.indigo },
  { name: "Platform", port: "4002", color: PALETTE.cyan },
  { name: "Org", port: "4003", color: PALETTE.emerald },
  { name: "Forms", port: "4004", color: PALETTE.amber },
  { name: "Workflow", port: "4005", color: PALETTE.pink },
  { name: "KYC", port: "4006", color: PALETTE.purple },
  { name: "Documents", port: "4007", color: PALETTE.rose },
  { name: "Notifications", port: "4008", color: PALETTE.slate },
];

/* ---- Opening act: one monolith cube that splits into the service fleet ---- */
function Monolith() {
  const clock = useClock();
  const shell = useRef(null);
  const edges = useRef(null);
  const shards = useRef([]);
  const group = useRef(null);

  const shardData = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = i === 0 ? 0 : 8.6;
        return {
          color: i === 0 ? PALETTE.white : SERVICES[i - 1].color,
          target: i === 0 ? [0, 3.1, 3.2] : [Math.cos(angle) * radius, 2.2, Math.sin(angle) * radius * 0.72 - 2],
          phase: seeded(i + 5) * Math.PI * 2,
        };
      }),
    [],
  );

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const split = easeOutCubic(ramp(t, 1.9, 2.6));
    const monoScale = 1 - split;

    if (shell.current) {
      shell.current.visible = monoScale > 0.02;
      shell.current.scale.setScalar(Math.max(monoScale, 0.001));
      shell.current.rotation.y = state.clock.elapsedTime * 0.25;
      shell.current.position.y = 3.1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.18;
    }
    if (edges.current) {
      edges.current.visible = monoScale > 0.02;
      edges.current.rotation.y = state.clock.elapsedTime * -0.4;
      edges.current.rotation.x = state.clock.elapsedTime * 0.12;
      edges.current.position.y = 3.1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.18;
      edges.current.material.opacity = monoScale * 0.85;
    }

    shards.current.forEach((mesh, i) => {
      if (!mesh) return;
      const data = shardData[i];
      const wobble = Math.sin(state.clock.elapsedTime * 1.1 + data.phase) * 0.14;
      mesh.visible = split > 0.02;
      mesh.position.set(
        data.target[0] * split + wobble,
        data.target[1] * split + 0.4 * (1 - split) + wobble * 0.6,
        data.target[2] * split,
      );
      mesh.rotation.set(
        state.clock.elapsedTime * 0.3 + data.phase,
        state.clock.elapsedTime * 0.45 + data.phase,
        0,
      );
      mesh.scale.setScalar(0.25 + split * 0.75);
      mesh.material.emissiveIntensity = 0.35 + split * 0.7;
    });
  });

  return (
    <group ref={group}>
      {/* the "before": a single opaque block */}
      <mesh ref={shell} position={[0, 3.1, 0]}>
        <boxGeometry args={[3.4, 3.4, 3.4]} />
        <meshStandardMaterial
          color="#33459b"
          roughness={0.24}
          metalness={0.6}
          transparent
          opacity={0.94}
          emissive={PALETTE.indigo}
          emissiveIntensity={0.85}
        />
      </mesh>

      <lineSegments ref={edges} position={[0, 3.1, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(3.9, 3.9, 3.9)]} />
        <lineBasicMaterial color={PALETTE.cyan} transparent opacity={0.85} toneMapped={false} />
      </lineSegments>

      {shardData.map((data, i) => (
        <mesh
          key={i}
          ref={(node) => {
            shards.current[i] = node;
          }}
        >
          <octahedronGeometry args={[0.72, 0]} />
          <meshStandardMaterial
            color="#111a3c"
            emissive={data.color}
            emissiveIntensity={0.5}
            roughness={0.22}
            metalness={0.5}
          />
        </mesh>
      ))}
    </group>
  );
}

export default function PlatformScene() {
  const clock = useClock();
  const revealed = useRef([]);

  const ringPositions = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = -Math.PI * 0.82 + (i / 7) * Math.PI * 1.64;
        const radius = 8.6;
        return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius * 0.72 - 2];
      }),
    [],
  );

  const links = useMemo(
    () =>
      ringPositions.map((pos, i) => ({
        to: [pos[0], 4.4, pos[2]],
        color: SERVICES[i].color,
        index: i,
      })),
    [ringPositions],
  );

  const inbound = useMemo(
    () =>
      ringPositions.map((pos, i) => {
        const curve = makeCurve(
          [
            [0, 6.2, 3.2],
            [pos[0] * 0.5, 6.6 + (i % 3) * 0.35, (pos[2] + 3.2) * 0.5],
            [pos[0], 4.5, pos[2]],
          ],
          1
        );
        return { curve, offset: i / 8, color: SERVICES[i].color };
      }),
    [ringPositions],
  );

  const dbLinks = useMemo(
    () =>
      ringPositions.map((pos, i) => ({
        curve: makeCurve(
          [
            [pos[0], 0.4, pos[2]],
            [pos[0] * 0.82, -1.5, pos[2] * 0.82 - 2],
            [0, -2.5, -2],
          ],
          0.4
        ),
        color: SERVICES[i].color,
        offset: (i % 4) / 4,
      })),
    [ringPositions],
  );

  const gatewayToDb = useMemo(
    () => [
      {
        curve: makeCurve(
          [
            [0, 0.4, 3.2],
            [0, -1.4, 2.4],
            [0, -2.5, 0],
          ],
          0.3
        ),
        color: PALETTE.indigo,
        offset: 0.1,
      },
      {
        curve: makeCurve(
          [
            [0, 0.4, 3.2],
            [0, -1.4, 2.4],
            [0, -2.5, 0],
          ],
          0.3
        ),
        color: PALETTE.cyan,
        offset: 0.55,
      },
    ],
    [],
  );

  const allPackets = useMemo(
    () => [...inbound, ...dbLinks, ...gatewayToDb],
    [inbound, dbLinks, gatewayToDb]
  );

  const cityGroup = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, 2.4, 2));
    if (cityGroup.current) {
      cityGroup.current.visible = s > 0.02;
      cityGroup.current.position.y = -1.2 * (1 - s);
    }
    void revealed;
    void state;
  });

  return (
    <group position={[0, 0, STAGE_Z.platform]}>
      <Atmosphere count={260} spread={44} />
      <StagePad y={-2.6} radius={15} color={PALETTE.indigo} intensity={0.13} />

      {/* Act 1 — monolith */}
      <Monolith />

      {/* Act 2 — the deployed platform */}
      <group ref={cityGroup}>
        <GatewayCore
          position={[0, 0, 3.2]}
          color={PALETTE.indigo}
          reveal={2.5}
          revealSpan={1.3}
          height={6.2}
        />

        {ringPositions.map((pos, i) => (
          <ServiceTower
            key={SERVICES[i].name}
            position={pos}
            color={SERVICES[i].color}
            title={SERVICES[i].name}
            sub={`:${SERVICES[i].port}`}
            height={3.2 + (i % 3) * 0.55}
            radius={0.95}
            reveal={3.1 + i * 0.11}
            revealSpan={1}
          />
        ))}

        {links.map((link, i) => (
          <Beam
            key={`l-${i}`}
            from={[0, 5.4, 3.2]}
            to={link.to}
            color={link.color}
            width={1}
            opacity={0.28 + (i % 3) * 0.06}
          />
        ))}

        <DataDisc position={[0, -2.5, -2]} radius={6.4} reveal={4} revealSpan={1.4} />

        {allPackets.map((packet, i) => (
          <Comet
            key={`p-${i}`}
            curve={packet.curve}
            color={packet.color}
            speed={0.19}
            offset={packet.offset}
            size={0.11}
            tail={0.9}
            activeFrom={4.6}
          />
        ))}

        <Shockwave
          position={[0, -2.5, -2]}
          color={PALETTE.cyan}
          start={4.1}
          span={1.5}
          maxRadius={13}
          rings={3}
        />
      </group>

      {/* Front-end client */}
      <ClientDevice clockRef={clock} />
    </group>
  );
}

function ClientDevice({ clockRef }) {
  const group = useRef(null);

  useFrame((state) => {
    const t = clockRef.current.chapterTime;
    const s = easeOutCubic(ramp(t, 5.4, 1.2));
    if (!group.current) return;
    group.current.visible = s > 0.02;
    group.current.position.y = 2.4 + Math.sin(state.clock.elapsedTime * 1.1) * 0.14;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.18;
  });

  return (
    <group ref={group} position={[0, 2.4, 13]}>
      <mesh>
        <boxGeometry args={[3.6, 2.1, 0.12]} />
        <meshPhysicalMaterial
          color="#0c1330"
          roughness={0.14}
          metalness={0.5}
          emissive={PALETTE.cyan}
          emissiveIntensity={0.35}
          transparent
          opacity={0.94}
        />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <planeGeometry args={[3.1, 1.6]} />
        <meshBasicMaterial color={PALETTE.indigo} transparent opacity={0.35} toneMapped={false} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-1.3 + i * 0.4, 0.72, 0.09]}>
          <circleGeometry args={[0.06, 8]} />
          <meshBasicMaterial color={PALETTE.slate} transparent opacity={0.8} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, -0.25, 0.09]}>
        <planeGeometry args={[1.9, 0.13]} />
        <meshBasicMaterial color={PALETTE.white} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <mesh position={[-0.6, -0.62, 0.09]}>
        <planeGeometry args={[0.95, 0.28]} />
        <meshBasicMaterial color={PALETTE.cyan} transparent opacity={0.75} toneMapped={false} />
      </mesh>
    </group>
  );
}