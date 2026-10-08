import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Bar3D, Chip, FlowLine, Label, StagePad } from "../parts";
import { useClock } from "../clock";
import { PALETTE, STAGE_Z, clamp01, easeOutCubic, ramp } from "../demoScript";

const METRICS = [
  { label: "Submissions", value: 0.86, color: PALETTE.indigo },
  { label: "Approvals", value: 0.68, color: PALETTE.cyan },
  { label: "On SLA", value: 0.94, color: PALETTE.emerald },
  { label: "KYC passes", value: 0.72, color: PALETTE.purple },
  { label: "Escalations", value: 0.31, color: PALETTE.amber },
  { label: "Rejected", value: 0.22, color: PALETTE.rose },
];

const KPI = [
  { label: "Pending approvals", value: "2.4K", color: PALETTE.indigo },
  { label: "SLA compliance", value: "98%", color: PALETTE.emerald },
  { label: "Active tenants", value: "156", color: PALETTE.cyan },
];

export default function OpsScene() {
  const notifications = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        from: new THREE.Vector3(-1.2, 4.6, 6),
        to: new THREE.Vector3(-13 + i * 0.2, 3.4 - i * 0.55, 7.2),
        phase: i * 0.42,
        color: [PALETTE.indigo, PALETTE.emerald, PALETTE.amber, PALETTE.cyan, PALETTE.purple][i],
        text: [
          "approval.requested",
          "kyc.verified",
          "sla.warning",
          "form.submitted",
          "role.updated",
        ][i],
      })),
    [],
  );

  return (
    <group position={[0, 0, STAGE_Z.ops]}>
      <StagePad y={-2.8} radius={18} color={PALETTE.cyan} intensity={0.09} />

      {/* KPI wall */}
      <group position={[-1.4, 3.4, -6]}>
        {KPI.map((kpi, i) => (
          <KpiCard key={kpi.label} kpi={kpi} index={i} />
        ))}
      </group>

      {/* Throughput chart */}
      <group position={[9.5, -1.4, 0]}>
        <mesh position={[0, 2.6, 0]}>
          <planeGeometry args={[7.4, 5.4]} />
          <meshPhysicalMaterial
            color="#0a1330"
            transparent
            opacity={0.6}
            roughness={0.3}
            metalness={0.2}
          />
        </mesh>

        {METRICS.map((metric, i) => (
          <Bar3D
            key={metric.label}
            position={[-3 + i * 1.2, 0, 0.4]}
            width={0.78}
            depth={0.78}
            maxHeight={4.6}
            value={metric.value}
            color={metric.color}
            growFrom={0.8}
            growSpan={1.1}
            delay={i * 0.14}
          />
        ))}

        <mesh position={[0, 0.06, 0.4]}>
          <boxGeometry args={[7, 0.05, 1.1]} />
          <meshBasicMaterial color={PALETTE.slate} transparent opacity={0.3} toneMapped={false} />
        </mesh>

        <Label
          position={[0, 5.9, 0]}
          title="Approval throughput"
          sub="aggregated across all eight services"
          color={PALETTE.cyan}
        />
      </group>

      {/* Notification stream */}
      <group>
        {notifications.map((note, i) => (
          <NotificationCard key={i} note={note} index={i} />
        ))}
        <NotificationBell />
      </group>

      {/* SLA gauge */}
      <SlaGauge />

      <Chip position={[9.5, 7.4, 0]} text="updated every 5s" color={PALETTE.cyan} icon="⟳" />
    </group>
  );
}

function KpiCard({ kpi, index }) {
  const clock = useClock();
  const group = useRef(null);
  const value = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, 0.5 + index * 0.22, 0.8));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.position.y = 1.4 - (1 - s) * 0.6;
      group.current.scale.setScalar(Math.max(s, 0.001));
    }
    if (value.current) {
      const shimmer = 0.75 + Math.sin(state.clock.elapsedTime * 2.4 + index) * 0.25;
      value.current.material.opacity = shimmer;
    }
  });

  return (
    <group ref={group} position={[-5.4 + index * 4, 1.4, 0]}>
      <mesh>
        <planeGeometry args={[3.7, 2.3]} />
        <meshPhysicalMaterial
          color="#0b1330"
          transparent
          opacity={0.78}
          roughness={0.25}
          metalness={0.3}
        />
      </mesh>
      <mesh position={[-1.72, 0.98, 0.02]}>
        <planeGeometry args={[0.09, 2.1]} />
        <meshBasicMaterial color={kpi.color} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh ref={value} position={[-0.2, 0.28, 0.03]}>
        <planeGeometry args={[2.4, 0.85]} />
        <meshBasicMaterial color={kpi.color} transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh position={[-0.7, -0.62, 0.03]}>
        <planeGeometry args={[2.8, 0.16]} />
        <meshBasicMaterial color={PALETTE.slate} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[-1.1, -0.92, 0.03]}>
        <planeGeometry args={[2.0, 0.12]} />
        <meshBasicMaterial color={PALETTE.slate} transparent opacity={0.28} toneMapped={false} />
      </mesh>
    </group>
  );
}

function NotificationBell() {
  const clock = useClock();
  const group = useRef(null);

  useFrame((state) => {
    const s = easeOutCubic(ramp(clock.current.chapterTime, 2.4, 0.8));
    if (!group.current) return;
    group.current.visible = s > 0.02;
    group.current.scale.setScalar(Math.max(s, 0.001));
    const ring = Math.sin(state.clock.elapsedTime * 4) * 0.04;
    group.current.rotation.z = ring;
  });

  return (
    <group ref={group} position={[-1.2, 4.6, 6]}>
      <mesh>
        <sphereGeometry args={[0.5, 20, 20]} />
        <meshStandardMaterial
          color="#131c44"
          emissive={PALETTE.indigo}
          emissiveIntensity={1.1}
          roughness={0.25}
          metalness={0.4}
        />
      </mesh>
      <mesh position={[0, 0, 0.2]}>
        <torusGeometry args={[0.82, 0.04, 8, 40]} />
        <meshBasicMaterial color={PALETTE.cyan} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, -0.2]}>
        <torusGeometry args={[1.05, 0.03, 8, 40]} />
        <meshBasicMaterial color={PALETTE.cyan} transparent opacity={0.4} toneMapped={false} />
      </mesh>
      <Label position={[0, 1.5, 0]} title="notifications-service" sub=":4008" color={PALETTE.indigo} />
    </group>
  );
}

function NotificationCard({ note, index }) {
  const clock = useClock();
  const group = useRef(null);
  const card = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const local = ((t * 0.42 + note.phase) % 2.2) / 2.2;
    const s = easeOutCubic(ramp(t, 3.4, 0.8));
    if (!group.current || !card.current) return;
    group.current.visible = s > 0.02 && local < 1;
    if (!group.current.visible) return;

    const p = clamp01(local);
    const grow = easeOutCubic(clamp01((t - 3.4 - note.phase) / 0.4));
    group.current.position.lerpVectors(note.from, note.to, p);
    group.current.position.x += Math.sin(p * 8 + index) * 0.25;
    group.current.rotation.y = -0.4 + p * 0.5 + state.clock.elapsedTime * 0.05;
    group.current.rotation.z = Math.sin(p * 5) * 0.08;
    group.current.scale.setScalar(Math.max(grow, 0.001) * (1 - p * 0.12));
    card.current.material.opacity = Math.sin(p * Math.PI) * 0.85;
  });

  return (
    <group ref={group} position={note.from}>
      <mesh ref={card}>
        <planeGeometry args={[3.4, 0.95]} />
        <meshBasicMaterial
          color={note.color}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[-1.5, 0, 0.01]}>
        <planeGeometry args={[0.12, 0.7]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh position={[0.2, 0.14, 0.01]}>
        <planeGeometry args={[1.8, 0.16]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh position={[-0.2, -0.24, 0.01]}>
        <planeGeometry args={[2.4, 0.11]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.3} toneMapped={false} />
      </mesh>
    </group>
  );
}

function SlaGauge() {
  const clock = useClock();
  const group = useRef(null);
  const needle = useRef(null);

  const gaugePoints = useMemo(() => {
    const points = [];
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) {
      const angle = Math.PI * 0.75 + (i / steps) * Math.PI * 1.5;
      points.push([Math.cos(angle) * 2.1, Math.sin(angle) * 2.1, 0]);
    }
    return points;
  }, []);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, 4.6, 1));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.scale.setScalar(Math.max(s, 0.001));
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.2;
    }
    if (needle.current) {
      const sweep = easeOutCubic(clamp01((t - 5.2) / 2));
      needle.current.rotation.z = Math.PI * 0.75 - sweep * Math.PI * 1.5;
    }
  });

  return (
    <group ref={group} position={[2.6, 1.2, 7]}>
      <mesh position={[0, 0, -0.2]}>
        <circleGeometry args={[2.6, 48]} />
        <meshPhysicalMaterial
          color="#0b1330"
          transparent
          opacity={0.7}
          roughness={0.3}
          metalness={0.25}
        />
      </mesh>

      <FlowLine
        points={gaugePoints}
        color={PALETTE.emerald}
        width={3.2}
        dashed={false}
        opacity={0.9}
        drawFrom={5.2}
        drawSpan={2}
      />

      <mesh ref={needle} position={[0, 0, 0.08]}>
        <boxGeometry args={[0.08, 1.7, 0.08]} />
        <meshBasicMaterial color={PALETTE.white} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.1]}>
        <circleGeometry args={[0.24, 20]} />
        <meshBasicMaterial color={PALETTE.emerald} toneMapped={false} />
      </mesh>

      <Label position={[0, -3.2, 0]} title="SLA compliance" sub="98% within window" color={PALETTE.emerald} />
    </group>
  );
}