import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Atmosphere,
  Comet,
  FlowLine,
  GatewayCore,
  ServiceTower,
  Shockwave,
  StagePad,
} from "../parts";
import { useClock } from "../clock";
import makeCurve from "../makeCurve";
import { PALETTE, STAGE_Z, clamp01, easeOutCubic, ramp } from "../demoScript";

const FLEET = [
  { name: "Auth", color: PALETTE.indigo },
  { name: "Platform", color: PALETTE.cyan },
  { name: "Org", color: PALETTE.emerald },
  { name: "Forms", color: PALETTE.amber },
  { name: "Workflow", color: PALETTE.pink },
  { name: "KYC", color: PALETTE.purple },
  { name: "Documents", color: PALETTE.rose },
  { name: "Notifications", color: PALETTE.slate },
];

export default function OutroScene() {
  const clock = useClock();
  const core = useRef(null);
  const ring = useRef(null);
  const particles = useRef(null);

  const ringPositions = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = -Math.PI * 0.78 + (i / 7) * Math.PI * 1.56;
        const radius = 7.8;
        return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius * 0.7];
      }),
    [],
  );

  const orbit = useMemo(
    () =>
      ringPositions.map((pos, i) => ({
        curve: makeCurve(
          [
            [0, 5.4, 0],
            [pos[0] * 0.55, 6.4, pos[2] * 0.55],
            [pos[0], 4.2, pos[2]],
          ],
          1,
        ),
        color: FLEET[i].color,
        offset: i / 8,
      })),
    [ringPositions],
  );

  useFrame((state) => {
    const t = clock.current.chapterTime;
    const s = easeOutCubic(ramp(t, 0.4, 1.6));

    if (core.current) {
      core.current.visible = s > 0.02;
      core.current.scale.setScalar(Math.max(s, 0.001));
      core.current.rotation.y = state.clock.elapsedTime * 0.3;
      core.current.position.y = 3.2 + Math.sin(state.clock.elapsedTime * 0.7) * 0.2;
    }
    if (ring.current) {
      ring.current.visible = s > 0.02;
      ring.current.rotation.z = state.clock.elapsedTime * 0.25;
      ring.current.rotation.x = Math.PI / 2 + Math.sin(state.clock.elapsedTime * 0.4) * 0.2;
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.6) * 0.04;
      ring.current.scale.setScalar(pulse * Math.max(s, 0.001));
    }
    if (particles.current) {
      const converge = clamp01((t - 2) / 3);
      particles.current.rotation.y = state.clock.elapsedTime * (0.4 + converge * 0.5);
      particles.current.scale.setScalar(1 - converge * 0.55);
    }
  });

  return (
    <group position={[0, 0, STAGE_Z.outro]}>
      <Atmosphere count={340} spread={40} color={PALETTE.purple} />
      <StagePad y={-2.8} radius={17} color={PALETTE.purple} intensity={0.12} />

      {/* the platform reassembles one last time */}
      <GatewayCore
        position={[0, 0, 0]}
        color={PALETTE.indigo}
        radius={2.4}
        height={5.6}
        title="Pinktech"
        sub="one command to boot it all"
        reveal={0.5}
        revealSpan={1.4}
      />

      {ringPositions.map((pos, i) => (
        <ServiceTower
          key={FLEET[i].name}
          position={pos}
          color={FLEET[i].color}
          title={FLEET[i].name}
          height={2.6 + (i % 3) * 0.4}
          radius={0.8}
          reveal={1.2 + i * 0.1}
          revealSpan={1}
        />
      ))}

      {orbit.map((link, i) => (
        <FlowLine
          key={i}
          points={link.curve.getPoints(32)}
          color={link.color}
          width={1.6}
          flow={1.4}
          drawFrom={2.4 + i * 0.08}
          drawSpan={1}
        />
      ))}

      {orbit.map((link, i) => (
        <Comet
          key={`c-${i}`}
          curve={link.curve}
          color={link.color}
          speed={0.16}
          offset={link.offset}
          size={0.12}
          tail={1.1}
          activeFrom={3.6}
        />
      ))}

      <Shockwave
        position={[0, 0.1, 0]}
        color={PALETTE.indigo}
        start={4.4}
        span={1.8}
        maxRadius={26}
        rings={4}
      />
      <Shockwave
        position={[0, 0.1, 0]}
        color={PALETTE.cyan}
        start={5.6}
        span={1.8}
        maxRadius={30}
        rings={4}
      />

      {/* converging light motes */}
      <group ref={particles}>
        {Array.from({ length: 40 }, (_, i) => {
          const angle = (i / 40) * Math.PI * 2;
          const radius = 12 + (i % 5);
          const height = Math.sin((i / 40) * Math.PI * 3) * 5;
          return (
            <mesh
              key={i}
              position={[
                Math.cos(angle) * radius,
                height + 2,
                Math.sin(angle) * radius * 0.6,
              ]}
            >
              <sphereGeometry args={[0.08 + (i % 3) * 0.03, 8, 8]} />
              <meshBasicMaterial
                color={i % 2 === 0 ? PALETTE.cyan : PALETTE.indigo}
                toneMapped={false}
              />
            </mesh>
          );
        })}
      </group>

      <mesh ref={ring} position={[0, 3.2, 0]}>
        <torusGeometry args={[6.2, 0.07, 10, 90]} />
        <meshBasicMaterial color={PALETTE.cyan} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh ref={core}>
        <octahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial
          color="#f8fafc"
          emissive={PALETTE.purple}
          emissiveIntensity={2.2}
          roughness={0.1}
          metalness={0.2}
        />
      </mesh>

      <pointLight position={[0, 3.2, 0]} color={PALETTE.purple} intensity={40} distance={40} />
    </group>
  );
}