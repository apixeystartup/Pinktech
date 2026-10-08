import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import {
  Beam,
  Chip,
  Comet,
  FlowLine,
  Label,
  RingGate,
  StagePad,
} from "../parts";
import { useClock } from "../clock";
import makeCurve from "../makeCurve";
import { PALETTE, STAGE_Z, clamp01, easeOutCubic, ramp, seeded } from "../demoScript";

/* ---- Left: ID document + scan ---- */
function DocumentStack() {
  const clock = useClock();
  const group = useRef(null);
  const scan = useRef(null);
  const top = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, 0.5, 1));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.scale.setScalar(Math.max(s, 0.001));
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.16;
    }
    // Scan sweep travels top → bottom between 1.6s and 3.4s.
    const scanT = clamp01((t - 1.6) / 1.8);
    if (scan.current) {
      scan.current.visible = scanT > 0 && scanT < 1 && t > 1.6 && t < 3.6;
      scan.current.position.y = 2.3 - scanT * 4.6;
      scan.current.material.opacity = 0.85 * Math.sin(scanT * Math.PI);
    }
    if (top.current) {
      top.current.rotation.z = -0.12 + Math.sin(state.clock.elapsedTime * 0.7) * 0.03;
    }
  });

  return (
    <group ref={group} position={[-9, 0, 0]}>
      <DocumentCard y={-0.55} color={PALETTE.slate} opacity={0.35} label="Passport" />
      <DocumentCard y={-0.28} color={PALETTE.cyan} opacity={0.55} label="Proof of address" />
      <group ref={top} position={[0, 0, 0]} rotation-z={-0.12}>
        <DocumentCard y={0} color={PALETTE.indigo} label="Selfie + liveness" />
      </group>

      {/* scanner bar */}
      <mesh ref={scan}>
        <boxGeometry args={[5.4, 0.1, 4.6]} />
        <meshBasicMaterial
          color={PALETTE.cyan}
          transparent
          opacity={0.8}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <Label
        position={[0, 3.4, 0]}
        title="Document upload"
        sub="3 files · liveness + OCR"
        color={PALETTE.indigo}
      />
    </group>
  );
}

function DocumentCard({ y, color, opacity = 1, label }) {
  const lines = useMemo(
    () => Array.from({ length: 4 }, (_, i) => 0.5 + seeded(i + 21) * 0.45),
    [],
  );

  return (
    <group position={[0, y, 0]}>
      <mesh>
        <planeGeometry args={[5, 3.2]} />
        <meshPhysicalMaterial
          color="#0c1330"
          transparent
          opacity={opacity}
          roughness={0.22}
          metalness={0.2}
          side={THREE.DoubleSide}
          emissive={color}
          emissiveIntensity={0.22}
        />
      </mesh>

      {/* portrait box */}
      <mesh position={[-1.35, 0.5, 0.02]}>
        <planeGeometry args={[1.5, 1.9]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} toneMapped={false} />
      </mesh>
      <mesh position={[-1.35, 0.5, 0.03]}>
        <circleGeometry args={[0.42, 20]} />
        <meshBasicMaterial color="#e2e8ff" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[-1.35, -0.15, 0.03]}>
        <planeGeometry args={[1.1, 0.7]} />
        <meshBasicMaterial color="#e2e8ff" transparent opacity={0.35} toneMapped={false} />
      </mesh>

      {lines.map((w, i) => (
        <mesh key={i} position={[0.35 + w * 0.8, 0.85 - i * 0.5, 0.03]}>
          <planeGeometry args={[2.4 * w, 0.14]} />
          <meshBasicMaterial color={color} transparent opacity={0.55} toneMapped={false} />
        </mesh>
      ))}

      <mesh position={[1.7, -1.25, 0.03]}>
        <planeGeometry args={[0.9, 0.4]} />
        <meshBasicMaterial color={PALETTE.emerald} transparent opacity={0.6} toneMapped={false} />
      </mesh>

      {label && <Label position={[0, 1.95, 0]} title={label} color={color} />}
    </group>
  );
}

/* ---- Centre: verification shield ---- */
function VerifyShield() {
  const clock = useClock();
  const group = useRef(null);
  const shield = useRef(null);
  const check = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, 3.2, 1.1));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.scale.setScalar(Math.max(s, 0.001));
    }
    if (shield.current) {
      shield.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.24;
      shield.current.position.y = Math.sin(state.clock.elapsedTime * 1.1) * 0.16;
      shield.current.material.emissiveIntensity = 1.1 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
    }
    if (check.current) {
      const pop = easeOutCubic(clamp01((t - 4.4) / 0.6));
      check.current.visible = t > 4.4;
      check.current.scale.setScalar(0.3 + pop * 0.9);
    }
  });

  return (
    <group ref={group} position={[0, 2.2, 0]}>
      <mesh ref={shield}>
        <icosahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial
          color="#0f2a3d"
          emissive={PALETTE.cyan}
          emissiveIntensity={1.2}
          roughness={0.2}
          metalness={0.4}
          wireframe
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.28, 0]} />
        <meshStandardMaterial
          color="#1b5f77"
          transparent
          opacity={0.55}
          roughness={0.2}
          metalness={0.3}
          emissive={PALETTE.cyan}
          emissiveIntensity={0.75}
        />
      </mesh>

      <group ref={check}>
        <mesh position={[0, 0.1, 1.3]}>
          <torusGeometry args={[0.55, 0.08, 10, 32]} />
          <meshBasicMaterial color={PALETTE.emerald} toneMapped={false} />
        </mesh>
        <CheckMark position={[0, 0.1, 1.35]} scale={0.75} />
      </group>

      <RingGate position={[0, 0, 0]} radius={2.3} color={PALETTE.cyan} spokes={6} speed={0.3} />

      <Label
        position={[0, 2.6, 0]}
        title="KYC verified"
        sub="risk score · sanctions · liveness"
        color={PALETTE.emerald}
        className="d3-tag-lg"
      />
    </group>
  );
}

function CheckMark({ position, scale = 1, color = "#052e22" }) {
  return (
    <group position={position} scale={scale}>
      <mesh rotation-z={-Math.PI / 4}>
        <boxGeometry args={[0.12, 0.44, 0.12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0.16, 0.18, 0]} rotation-z={Math.PI / 4}>
        <boxGeometry args={[0.12, 0.62, 0.12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---- Right: e-signature pad ---- */
function SignaturePad() {
  const clock = useClock();
  const group = useRef(null);
  const stroke = useRef(null);

  const strokeCurve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-1.5, 0.1, 0),
          new THREE.Vector3(-1.0, 0.7, 0.05),
          new THREE.Vector3(-0.5, -0.2, 0.08),
          new THREE.Vector3(0.1, 0.6, 0.05),
          new THREE.Vector3(0.6, 0.0, 0.03),
          new THREE.Vector3(1.1, 0.5, 0),
          new THREE.Vector3(1.6, 0.1, 0),
        ],
        false,
        "catmullrom",
        0.3,
      ),
    [],
  );

  useFrame(() => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, 5.4, 0.9));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.scale.setScalar(Math.max(s, 0.001));
    }
    if (stroke.current) {
      // Signature draws itself between 6.2s and 7.6s.
      const draw = clamp01((t - 6.2) / 1.4);
      const total = stroke.current.geometry.attributes.instanceStart?.count ?? 0;
      stroke.current.visible = draw > 0;
      stroke.current.geometry.instanceCount = Math.round(total * draw);
    }
  });

  return (
    <group ref={group} position={[9, 0.6, 0]} rotation-y={-0.22}>
      <mesh>
        <planeGeometry args={[5.4, 3.4]} />
        <meshPhysicalMaterial
          color="#0c1330"
          transparent
          opacity={0.92}
          roughness={0.2}
          metalness={0.25}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.4, 0.02]}>
        <planeGeometry args={[3.6, 0.14]} />
        <meshBasicMaterial color={PALETTE.slate} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[0, -1.5, 0.02]}>
        <planeGeometry args={[4.6, 0.04]} />
        <meshBasicMaterial color={PALETTE.slate} transparent opacity={0.4} toneMapped={false} />
      </mesh>

      <FlowLine
        points={strokeCurve.getPoints(64)}
        color={PALETTE.indigo}
        width={3.4}
        dashed={false}
        opacity={0.95}
        drawFrom={6.2}
        drawSpan={1.4}
      />

      <SignatureCaret curve={strokeCurve} start={6.2} span={1.4} />

      <Label
        position={[0, 2.3, 0]}
        title="Digital signature"
        sub="legally binding · hash-sealed"
        color={PALETTE.indigo}
      />
    </group>
  );
}

function SignatureCaret({ curve, start, span }) {
  const clock = useClock();
  const mesh = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const p = clamp01((t - start) / span);
    if (!mesh.current) return;
    mesh.current.visible = t > start && p < 1;
    if (!mesh.current.visible) return;
    mesh.current.position.copy(curve.getPointAt(Math.min(p, 1)));
    mesh.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 12) * 0.2);
  });

  return (
    <mesh ref={mesh}>
      <sphereGeometry args={[0.16, 12, 12]} />
      <meshBasicMaterial color={PALETTE.indigo} toneMapped={false} />
    </mesh>
  );
}

/* ---- Far right: audit ledger ---- */
function AuditLedger() {
  const clock = useClock();
  const group = useRef(null);

  const entries = useMemo(
    () => [
      { action: "auth.login", color: PALETTE.indigo, from: 7.8 },
      { action: "kyc.verified", color: PALETTE.emerald, from: 8.1 },
      { action: "form.dispatched", color: PALETTE.cyan, from: 8.4 },
      { action: "sig.captured", color: PALETTE.purple, from: 8.7 },
      { action: "approval.granted", color: PALETTE.pink, from: 9.0 },
    ],
    [],
  );

  useFrame(() => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, 7.4, 1));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.scale.setScalar(Math.max(s, 0.001));
    }
  });

  return (
    <group ref={group} position={[0, 1.4, -9]}>
      {entries.map((entry, i) => (
        <LedgerSlab key={entry.action} index={i} entry={entry} />
      ))}

      <mesh position={[0, -1.5, 0]} rotation-x={Math.PI / 2}>
        <ringGeometry args={[4.4, 4.6, 64]} />
        <meshBasicMaterial color={PALETTE.amber} transparent opacity={0.45} toneMapped={false} />
      </mesh>

      <Label
        position={[0, 3.6, 0]}
        title="Append-only audit ledger"
        sub="every action sealed + hashed"
        color={PALETTE.amber}
      />
    </group>
  );
}

function LedgerSlab({ index, entry }) {
  const clock = useClock();
  const group = useRef(null);
  const seal = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, entry.from, 0.55));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.position.y = -1.1 + index * 0.52;
      group.current.scale.set(Math.max(s, 0.001), 0.12 + Math.max(s, 0.001) * 0.88, 1);
    }
    if (seal.current) {
      const pop = clamp01((t - entry.from - 0.4) / 0.4);
      seal.current.visible = pop > 0 && pop < 1;
      seal.current.scale.setScalar(0.2 + easeOutCubic(pop) * 0.8);
      seal.current.rotation.y = state.clock.elapsedTime * 1.4;
    }
  });

  return (
    <group ref={group}>
      <mesh position={[0, 0, -index * 0.06]}>
        <boxGeometry args={[5.2, 0.34, 1.9]} />
        <meshStandardMaterial
          color="#101a3c"
          emissive={entry.color}
          emissiveIntensity={0.4}
          roughness={0.3}
          metalness={0.4}
        />
      </mesh>
      <mesh position={[0, 0, 0.97]}>
        <planeGeometry args={[2.6, 0.11]} />
        <meshBasicMaterial color={entry.color} transparent opacity={0.75} toneMapped={false} />
      </mesh>
      <mesh position={[1.95, 0, 0.97]}>
        <planeGeometry args={[0.7, 0.1]} />
        <meshBasicMaterial color={PALETTE.white} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh ref={seal} position={[-2.1, 0, 0.98]}>
        <torusGeometry args={[0.14, 0.05, 8, 18]} />
        <meshBasicMaterial color={PALETTE.amber} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function KycScene() {
  const linkCurves = useMemo(
    () => [
      {
        curve: makeCurve(
          [
            [-9, 1.4, 0.6],
            [-6, 1.6, 0.4],
            [-1.6, 2.2, 0],
          ],
          0.5,
        ),
        color: PALETTE.indigo,
        offset: 0.1,
      },
      {
        curve: makeCurve(
          [
            [0, 2.2, 0],
            [5, 1.6, 0.3],
            [9, 1.2, 0.2],
          ],
          0.4,
        ),
        color: PALETTE.emerald,
        offset: 0.5,
      },
      {
        curve: makeCurve(
          [
            [9, 0.6, 0],
            [8, 0.4, -4],
            [3, 1.2, -8],
            [0, 1.4, -9],
          ],
          0.5,
        ),
        color: PALETTE.amber,
        offset: 0.3,
      },
    ],
    [],
  );

  return (
    <group position={[0, 0, STAGE_Z.kyc]}>
      <StagePad y={-2.8} radius={18} color={PALETTE.purple} intensity={0.09} />

      <DocumentStack />
      <VerifyShield />
      <SignaturePad />
      <AuditLedger />

      {linkCurves.map((link, i) => (
        <FlowLine
          key={i}
          points={link.curve.getPoints(40)}
          color={link.color}
          width={1.8}
          flow={0.8}
          drawFrom={3.2 + i * 1.4}
          drawSpan={1.1}
        />
      ))}

      {linkCurves.map((link, i) => (
        <Comet
          key={`c-${i}`}
          curve={link.curve}
          color={link.color}
          speed={0.13}
          offset={link.offset}
          size={0.12}
          tail={1.1}
          activeFrom={4.6 + i * 1.4}
          activeSpan={3.4}
        />
      ))}

      <Beam from={[-9, 2.9, 0]} to={[-4, 2.4, 0]} color={PALETTE.indigo} width={1} opacity={0.3} />

      <Chip position={[-13, -1.4, 2]} text="upload · ocr" color={PALETTE.cyan} icon="↑" />
      <Chip position={[0, -1.6, 2]} text="sanctions check" color={PALETTE.emerald} icon="✓" />
      <Chip position={[13, -1.4, 2]} text="signed by applicant" color={PALETTE.indigo} icon="✍" />

      <Html position={[0, -3.2, 6]} center zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
        <div className="d3-tag d3-tag-wide" style={{ "--tag": PALETTE.amber }}>
          <span className="d3-tag-title">documents-service :4007</span>
          <span className="d3-tag-sub">kyc-service :4006</span>
        </div>
      </Html>
    </group>
  );
}