import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Chip, Label, RingGate, StagePad } from "../parts";
import { useClock } from "../clock";
import { PALETTE, STAGE_Z, clamp01, easeOutCubic, ramp, seeded } from "../demoScript";

const TENANTS = [
  { name: "Acme Corp", code: "ACME", color: PALETTE.indigo, users: 12, x: -9 },
  { name: "Northwind", code: "NWD", color: PALETTE.cyan, users: 8, x: 0 },
  { name: "Helios Ltd", code: "HLS", color: PALETTE.purple, users: 15, x: 9 },
];

const GATE_PERMISSIONS = [
  { code: "tenant.manage", color: PALETTE.amber, y: 5.6 },
  { code: "employee.assign", color: PALETTE.emerald, y: 3.9 },
  { code: "form.dispatch", color: PALETTE.pink, y: 2.2 },
];

export default function TenancyScene() {
  const clock = useClock();

  const chipRefs = useRef([]);
  const leakRef = useRef(null);
  const blockedRef = useRef(null);

  const permissionAngles = useMemo(
    () => GATE_PERMISSIONS.map((_, i) => (i / GATE_PERMISSIONS.length) * Math.PI * 2 + 0.6),
    [],
  );

  useFrame((state) => {
    const t = clock.current.chapterTime;

    chipRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const angle = permissionAngles[i] + state.clock.elapsedTime * 0.55;
      const radius = 4.3;
      mesh.position.set(Math.cos(angle) * radius, GATE_PERMISSIONS[i].y, Math.sin(angle) * radius);
      mesh.rotation.y = state.clock.elapsedTime * 0.9;
    });

    // A rogue cross-tenant read attempts to leak, then gets rejected.
    const leak = t - 5.6;
    const progress = clamp01(leak / 1.5);
    if (leakRef.current) {
      leakRef.current.visible = leak > 0 && leak < 2.6;
      leakRef.current.position.x = -9 + progress * 9;
      leakRef.current.position.y = 1.6 + Math.sin(progress * Math.PI) * 1.1;
    }
    if (blockedRef.current) {
      blockedRef.current.visible = leak > 1.3 && leak < 2.6;
      const pop = clamp01((leak - 1.3) / 0.35);
      blockedRef.current.scale.setScalar(0.2 + easeOutCubic(pop) * 1.2);
      blockedRef.current.rotation.z = state.clock.elapsedTime * 2;
      blockedRef.current.material.opacity = 0.85 * (1 - clamp01((leak - 2.1) / 0.5));
    }
  });

  return (
    <group position={[0, 0, STAGE_Z.tenancy]}>
      <StagePad y={-2.8} radius={16} color={PALETTE.purple} intensity={0.09} />

      {/* Central permission gate */}
      <group position={[0, 0, 0]}>
        <RingGate
          position={[0, 4, 0]}
          radius={3.1}
          color={PALETTE.purple}
          spokes={8}
          speed={0.28}
        />
        <RingGate
          position={[0, 4, 0]}
          radius={4.3}
          color={PALETTE.cyan}
          spokes={6}
          speed={-0.42}
        />

        {GATE_PERMISSIONS.map((perm, i) => (
          <mesh
            key={perm.code}
            ref={(node) => {
              chipRefs.current[i] = node;
            }}
          >
            <boxGeometry args={[0.42, 0.42, 0.42]} />
            <meshStandardMaterial
              color="#131c44"
              emissive={perm.color}
              emissiveIntensity={1.2}
              roughness={0.2}
              metalness={0.5}
            />
          </mesh>
        ))}

        <Label
          position={[0, 8.2, 0]}
          title="Permission Gate"
          sub="role → permission catalog"
          color={PALETTE.purple}
          className="d3-tag-lg"
        />

        {GATE_PERMISSIONS.map((perm, i) => (
          <Chip
            key={perm.code}
            position={[
              Math.cos(permissionAngles[i] + 1.2) * 5.4,
              perm.y + 1.4,
              Math.sin(permissionAngles[i] + 1.2) * 5.4,
            ]}
            text={perm.code}
            color={perm.color}
          />
        ))}
      </group>

      {/* Tenant vaults */}
      {TENANTS.map((tenant, i) => (
        <TenantVault
          key={tenant.code}
          tenant={tenant}
          index={i}
          reveal={0.8 + i * 0.45}
        />
      ))}

      {/* Isolation membranes between vaults */}
      {[-4.5, 4.5].map((x, i) => (
        <Wall key={i} x={x} color={PALETTE.slate} reveal={2.6 + i * 0.3} />
      ))}

      {/* Rejected cross-tenant read */}
      <mesh ref={leakRef}>
        <sphereGeometry args={[0.18, 14, 14]} />
        <meshBasicMaterial color={PALETTE.rose} toneMapped={false} />
      </mesh>
      <mesh ref={blockedRef} position={[0, 1.6, 0]} rotation-x={Math.PI / 2}>
        <ringGeometry args={[0.5, 0.72, 8]} />
        <meshBasicMaterial
          color={PALETTE.rose}
          transparent
          opacity={0.85}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      <Chip position={[0, 3.6, 0]} text="403 · cross-tenant blocked" color={PALETTE.rose} icon="✕" />
    </group>
  );
}

function TenantVault({ tenant, index, reveal }) {
  const clock = useClock();
  const group = useRef(null);
  const dome = useRef(null);
  const inner = useRef(null);

  const people = useMemo(
    () =>
      Array.from({ length: tenant.users }, (_, i) => {
        const angle = (i / tenant.users) * Math.PI * 2;
        const radius = 0.75 + seeded(i + index * 13) * 0.75;
        return {
          pos: [Math.cos(angle) * radius, 0.85 + Math.floor(i / 6) * 0.55, Math.sin(angle) * radius],
          scale: 0.11 + seeded(i + 7) * 0.05,
          phase: seeded(i + 3) * Math.PI * 2,
        };
      }),
    [tenant.users, index],
  );

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, reveal, 1.3));
    if (group.current) {
      group.current.visible = s > 0.02;
      group.current.scale.set(Math.max(s, 0.001), Math.max(s, 0.001), Math.max(s, 0.001));
    }
    if (dome.current) dome.current.rotation.y = state.clock.elapsedTime * 0.2;
    if (inner.current) {
      inner.current.rotation.y = -state.clock.elapsedTime * 0.34;
      inner.current.material.opacity = 0.22 + Math.sin(state.clock.elapsedTime * 1.4 + index) * 0.08;
    }
  });

  return (
    <group ref={group} position={[tenant.x, 0, 0]}>
      <mesh position={[0, 0.14, 0]}>
        <cylinderGeometry args={[3.1, 3.3, 0.28, 40]} />
        <meshStandardMaterial color="#0b1230" roughness={0.55} metalness={0.5} />
      </mesh>

      {/* glass shell */}
      <mesh position={[0, 2.2, 0]}>
        <cylinderGeometry args={[2.9, 2.9, 4, 40, 1, true]} />
        <meshStandardMaterial
          color="#243469"
          transparent
          opacity={0.34}
          roughness={0.2}
          metalness={0.2}
          emissive={tenant.color}
          emissiveIntensity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* rotating core band */}
      <mesh ref={inner} position={[0, 1.9, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[2.4, 0.06, 8, 60]} />
        <meshBasicMaterial color={tenant.color} transparent opacity={0.7} toneMapped={false} />
      </mesh>

      {/* dome cap */}
      <mesh ref={dome} position={[0, 4.25, 0]}>
        <sphereGeometry args={[2.9, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          color={tenant.color}
          transparent
          opacity={0.26}
          roughness={0.25}
          metalness={0.25}
          side={THREE.DoubleSide}
          emissive={tenant.color}
          emissiveIntensity={0.7}
        />
      </mesh>

      <mesh position={[0, 4.25, 0]} rotation-x={Math.PI / 2}>
        <ringGeometry args={[2.55, 2.72, 64]} />
        <meshBasicMaterial color={tenant.color} transparent opacity={0.6} toneMapped={false} />
      </mesh>

      {/* users inside */}
      {people.map((person, i) => (
        <mesh key={i} position={person.pos}>
          <sphereGeometry args={[person.scale, 10, 10]} />
          <meshStandardMaterial
            color="#16214a"
            emissive={tenant.color}
            emissiveIntensity={0.9}
            roughness={0.3}
          />
        </mesh>
      ))}

      {/* tenant stack marker */}
      <mesh position={[0, 5.6, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 1.1, 6]} />
        <meshStandardMaterial
          color="#141d46"
          emissive={tenant.color}
          emissiveIntensity={0.85}
          roughness={0.25}
          metalness={0.4}
        />
      </mesh>

      <pointLight color={tenant.color} intensity={9} distance={11} position={[0, 2.4, 0]} />

      <Label
        position={[0, 6.7, 0]}
        title={tenant.name}
        sub={`${tenant.code} · ${tenant.users} users · isolated`}
        color={tenant.color}
        className="d3-tag-lg"
      />
    </group>
  );
}

function Wall({ x, color, reveal }) {
  const clock = useClock();
  const mesh = useRef(null);

  useFrame(() => {
    const s = easeOutCubic(ramp(clock.current.chapterTime, reveal, 1));
    if (!mesh.current) return;
    mesh.current.visible = s > 0.02;
    mesh.current.scale.y = Math.max(s, 0.001);
    mesh.current.material.opacity = 0.3 * s;
  });

  return (
    <mesh ref={mesh} position={[x, 2.2, 0]}>
      <boxGeometry args={[0.06, 4.4, 13]} />
      <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
    </mesh>
  );
}