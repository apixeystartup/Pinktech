import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Beam,
  Chip,
  Comet,
  DataDisc,
  FlowLine,
  GatewayCore,
  Label,
  ServiceTower,
  StagePad,
} from "../parts";
import { useClock } from "../clock";
import makeCurve from "../makeCurve";
import { PALETTE, STAGE_Z, easeOutCubic, ramp } from "../demoScript";

const STAGES = [
  { label: "TLS + Helmet", color: PALETTE.slate, from: 0.4, to: 1.5 },
  { label: "Rate limit", color: PALETTE.amber, from: 1.5, to: 2.6 },
  { label: "JWT verify", color: PALETTE.indigo, from: 2.6, to: 3.7 },
  { label: "Tenant scope", color: PALETTE.cyan, from: 3.7, to: 4.8 },
  { label: "Route match", color: PALETTE.purple, from: 4.8, to: 5.9 },
  { label: "Proxy + log", color: PALETTE.emerald, from: 5.9, to: 7.0 },
];

export default function RoutingScene() {
  const clock = useClock();

  const inboundCurve = useMemo(
    () =>
      makeCurve([
        [0, 1.6, 11],
        [0, 2.4, 8],
        [0, 3.0, 5],
      ]),
    [],
  );

  const requestCurve = useMemo(
    () =>
      makeCurve([
        [0, 3.0, 5],
        [-1.2, 4.4, 2],
        [0, 5.2, -1],
        [0, 5.0, -4.5],
      ]),
    [],
  );

  const dbCurve = useMemo(
    () =>
      makeCurve([
        [0, 5.0, -4.5],
        [0, 3.0, -5.5],
        [0, 1.4, -6],
      ]),
    [],
  );

  const returnCurve = useMemo(
    () =>
      makeCurve([
        [0, 1.4, -6],
        [0, 3.4, -5],
        [0, 5.6, -2],
        [0, 5.4, 2],
        [0, 3.4, 6],
        [0, 1.9, 10],
      ]),
    [],
  );

  const pipelineRows = useMemo(
    () => STAGES.map((stage, i) => [1.5, 3.1 + i * 1.55]),
    [],
  );

  const gateNodes = useRef([]);

  useFrame(() => {
    const t = clock.current.chapterTime;
    gateNodes.current.forEach((group, i) => {
      if (!group) return;
      const s = easeOutCubic(ramp(t, 0.6 + i * 0.95, 0.6));
      group.scale.setScalar(Math.max(s, 0.001));
      group.visible = s > 0.02;
    });
  });

  return (
    <group position={[0, 0, STAGE_Z.routing]}>
      <StagePad y={-2.8} radius={14} color={PALETTE.indigo} intensity={0.1} />

      {/* Left rail: the gateway pipeline, one rung per security stage */}
      <group position={[-8.4, 0, 0]}>
        <mesh position={[-3.9, 3.2, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[0.05, 12.4]} />
          <meshBasicMaterial color={PALETTE.indigo} transparent opacity={0.35} toneMapped={false} />
        </mesh>

        {pipelineRows.map(([x, y], i) => (
          <group
            key={STAGES[i].label}
            ref={(node) => {
              gateNodes.current[i] = node;
            }}
            position={[x, y, 0]}
          >
            <mesh>
              <octahedronGeometry args={[0.3, 0]} />
              <meshStandardMaterial
                color="#101a3c"
                emissive={STAGES[i].color}
                emissiveIntensity={1.1}
                roughness={0.25}
                metalness={0.4}
              />
            </mesh>
            <mesh rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.5, 0.02, 8, 32]} />
              <meshBasicMaterial
                color={STAGES[i].color}
                transparent
                opacity={0.7}
                toneMapped={false}
              />
            </mesh>
            <Label
              position={[0, 0.72, 0]}
              title={STAGES[i].label}
              sub={i === 0 ? "helmet · cors" : i === 5 ? "pino audit log" : undefined}
              color={STAGES[i].color}
            />
          </group>
        ))}

        {pipelineRows.slice(0, -1).map(([, y], i) => (
          <Beam
            key={`rail-${i}`}
            from={[-2.4, y - 0.75, 0]}
            to={[-2.4, y + 0.75, 0]}
            color={PALETTE.slate}
            width={0.8}
            opacity={0.22}
          />
        ))}
      </group>

      {/* Right: the happy path */}
      <GatewayCore
        position={[2.6, 0, 3]}
        color={PALETTE.indigo}
        radius={1.5}
        height={5}
        title="API Gateway"
        sub=":5001"
        reveal={0.3}
        revealSpan={1}
      />

      <ServiceTower
        position={[2.6, 0, -6]}
        color={PALETTE.pink}
        height={4.6}
        radius={1.1}
        title="Workflow Service"
        sub=":4005"
        reveal={1.6}
        revealSpan={1}
      />

      <ServiceTower
        position={[-3.4, 0, -6]}
        color={PALETTE.slate}
        height={3.4}
        radius={0.9}
        title="Auth Service"
        sub=":4001"
        reveal={1.9}
        revealSpan={1}
      />

      <ServiceTower
        position={[7.8, 0, -6]}
        color={PALETTE.cyan}
        height={3.8}
        radius={0.9}
        title="Platform Service"
        sub=":4002"
        reveal={2.2}
        revealSpan={1}
      />

      <DataDisc position={[2.6, -2.2, -1]} radius={5.4} reveal={2.6} revealSpan={1.2} />

      {/* request/response lanes */}
      <FlowLine points={inboundCurve.getPoints(24)} color={PALETTE.white} width={1.4} dashed={false} opacity={0.3} />
      <FlowLine points={requestCurve.getPoints(40)} color={PALETTE.cyan} width={2} />
      <FlowLine points={dbCurve.getPoints(24)} color={PALETTE.cyan} width={1.6} />
      <FlowLine points={returnCurve.getPoints(48)} color={PALETTE.emerald} width={2} flow={1.2} />

      <Comet curve={inboundCurve} color={PALETTE.white} speed={0.1} offset={0} size={0.13} tail={1.2} />
      <Comet curve={requestCurve} color={PALETTE.cyan} speed={0.14} offset={0.1} size={0.15} tail={1.5} />
      <Comet curve={requestCurve} color={PALETTE.indigo} speed={0.14} offset={0.55} size={0.11} tail={1.2} />
      <Comet curve={dbCurve} color={PALETTE.cyan} speed={0.16} offset={0.3} size={0.12} tail={1} />
      <Comet curve={returnCurve} color={PALETTE.emerald} speed={0.11} offset={0.2} size={0.14} tail={1.4} />

      {/* Annotations pinned to the lane */}
      <Chip position={[0, 3.9, 9]} text="POST /api/v1/auth/login" color={PALETTE.white} icon="→" />
      <Chip position={[3.6, 6.0, -1.4]} text="tenantId + permissionCodes" color={PALETTE.cyan} icon="⚿" />
      <Chip position={[-4.4, 6.4, -6]} text="401 / 403 rejected" color={PALETTE.rose} icon="✕" />
      <Chip position={[8.8, 4.6, -6]} text="audit.record()" color={PALETTE.slate} icon="≡" />
      <Chip position={[3.4, 0.6, 1]} text="200 OK · access + refresh" color={PALETTE.emerald} icon="✓" />

      <RequestToken curve={requestCurve} />
    </group>
  );
}

/** A JWT capsule that rides the request lane and pulses on each hop. */
function RequestToken({ curve }) {
  const clock = useClock();
  const mesh = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const p = Math.min(Math.max((t - 0.4) / 5.4, 0), 1);
    const point = curve.getPointAt(p);
    if (mesh.current) {
      mesh.current.position.copy(point);
      mesh.current.rotation.y = state.clock.elapsedTime * 1.6;
      mesh.current.rotation.x = 0.4;
      mesh.current.visible = t > 0.4 && t < 6.2;
    }
  });

  return (
    <mesh ref={mesh}>
      <capsuleGeometry args={[0.16, 0.34, 6, 12]} />
      <meshStandardMaterial
        color="#f8fafc"
        emissive={PALETTE.white}
        emissiveIntensity={1.8}
        roughness={0.15}
        metalness={0.3}
      />
    </mesh>
  );
}

