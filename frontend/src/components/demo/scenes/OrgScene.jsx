import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Chip, FlowLine, Label, Node3D, StagePad } from "../parts";
import { useClock } from "../clock";
import { PALETTE, STAGE_Z, clamp01, easeOutCubic } from "../demoScript";

const LEVELS = [
  {
    level: "Level 1",
    y: 5.4,
    nodes: [
      { name: "Priya Raman", role: "CEO", x: 0, color: PALETTE.indigo },
      { name: "A. Whitfield", role: "CFO", x: -6.2, color: PALETTE.cyan },
      { name: "M. Osei", role: "COO", x: 6.2, color: PALETTE.purple },
    ],
  },
  {
    level: "Level 2",
    y: 2.4,
    nodes: [
      { name: "Dan Kovac", role: "HR Lead", x: -7.6, color: PALETTE.emerald },
      { name: "Sara Iqbal", role: "Finance Lead", x: -2.6, color: PALETTE.amber },
      { name: "Tom Achebe", role: "Ops Lead", x: 2.6, color: PALETTE.pink },
      { name: "Lin Zhou", role: "IT Lead", x: 7.6, color: PALETTE.rose },
    ],
  },
  {
    level: "Level 3",
    y: -0.6,
    nodes: [
      { name: "J. Mensah", role: "Analyst", x: -9, color: PALETTE.slate },
      { name: "R. Alvarez", role: "Auditor", x: -5.6, color: PALETTE.slate },
      { name: "K. Sørensen", role: "Reviewer", x: -1.2, color: PALETTE.slate },
      { name: "H. Tanaka", role: "Reviewer", x: 1.2, color: PALETTE.slate },
      { name: "P. Nakamura", role: "Clerk", x: 5.6, color: PALETTE.slate },
      { name: "E. Duarte", role: "Clerk", x: 9, color: PALETTE.slate },
    ],
  },
];

const LEVEL_REVEAL = [0.5, 2.6, 4.8];

export default function OrgScene() {
  const clock = useClock();

  const links = useMemo(() => {
    const result = [];
    const [l1, l2, l3] = LEVELS;
    l1.nodes.forEach((parent, pi) => {
      l2.nodes.forEach((child, ci) => {
        const owned = (pi === 0 && ci < 2) || (pi === 1 && ci === 2) || (pi === 2 && ci > 2);
        if (owned) result.push({ parent, child, from: LEVEL_REVEAL[1] + ci * 0.18 });
      });
    });
    l2.nodes.forEach((parent, pi) => {
      l3.nodes.forEach((child, ci) => {
        const owned = (pi === 0 && ci < 2) || (pi === 1 && ci < 2) || (pi === 2 && ci > 1) || (pi === 3 && ci > 3);
        if (owned) result.push({ parent, child, from: LEVEL_REVEAL[2] + ci * 0.14 });
      });
    });
    return result;
  }, []);

  const cascade = useRef(null);

  useFrame((state) => {
    const t = clock.current.chapterTime;
    if (!cascade.current) return;
    const progress = clamp01((t - 5.6) / 2.4);
    cascade.current.visible = progress > 0 && progress < 1;
    cascade.current.position.set(0, 1.4 + progress * 3.6, 0);
    const scale = 0.6 + progress * 1.5;
    cascade.current.scale.setScalar(scale);
    cascade.current.rotation.y = state.clock.elapsedTime * 0.6;
    cascade.current.children.forEach((child, i) => {
      const local = clamp01(progress * 3 - i * 0.5);
      if (child.material) {
        child.material.opacity = 0.75 * local * (1 - clamp01((progress - 0.86) / 0.14));
      }
    });
  });

  return (
    <group position={[0, 0, STAGE_Z.org]}>
      <StagePad y={-2.4} radius={16} color={PALETTE.emerald} intensity={0.1} />

      {LEVELS.map((level, li) => (
        <group key={level.level}>
          <mesh position={[0, level.y, -1.6]} rotation-x={Math.PI / 2}>
            <planeGeometry args={[24 - li * 3, 0.06]} />
            <meshBasicMaterial
              color={level.nodes[0].color}
              transparent
              opacity={0.14}
              toneMapped={false}
            />
          </mesh>

          <Chip
            position={[-12.4, level.y, -1.6]}
            text={level.level}
            color={level.nodes[0].color}
            icon={li === 0 ? "①" : li === 1 ? "②" : "③"}
          />

          {level.nodes.map((node) => (
            <Node3D
              key={node.name}
              position={[node.x, level.y, 0]}
              color={node.color}
              size={li === 0 ? 0.6 : li === 1 ? 0.48 : 0.38}
              shape={li === 0 ? "octa" : "sphere"}
              label={node.name}
              sub={node.role}
              labelDy={li === 0 ? 1.5 : 1.1}
            />
          ))}
        </group>
      ))}

      {links.map((link, i) => (
        <FlowLine
          key={i}
          points={[
            [link.parent.x, link.parent.y - 0.5, 0],
            [link.parent.x, (link.parent.y + link.child.y) / 2, -0.8],
            [link.child.x, link.child.y + 0.55, 0],
          ]}
          color={link.child.color}
          width={1.2}
          opacity={0.55}
          flow={0.4}
          drawFrom={link.from}
          drawSpan={0.7}
        />
      ))}

      {/* Level reveal pops */}
      {LEVELS.map((level, li) => (
        <LevelPop key={level.level} y={level.y} from={LEVEL_REVEAL[li]} color={level.nodes[0].color} />
      ))}

      {/* Permission cascade over the tree */}
      <group ref={cascade}>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[4.2, 0.035, 8, 72]} />
          <meshBasicMaterial color={PALETTE.amber} transparent opacity={0.7} toneMapped={false} />
        </mesh>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[7.6, 0.03, 8, 72]} />
          <meshBasicMaterial color={PALETTE.amber} transparent opacity={0.55} toneMapped={false} />
        </mesh>
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[10.6, 0.025, 8, 72]} />
          <meshBasicMaterial color={PALETTE.amber} transparent opacity={0.4} toneMapped={false} />
        </mesh>
      </group>

      <Chip position={[0, 8.4, 0]} text="employee.assign propagates down" color={PALETTE.amber} icon="↓" />
      <Label
        position={[0, -3.4, 4]}
        title="Reporting lines from live org data"
        sub="positions map to roles · approvers resolve from the tree"
        color={PALETTE.emerald}
      />
    </group>
  );
}

function LevelPop({ y, from, color }) {
  const clock = useClock();
  const mesh = useRef(null);

  useFrame(() => {
    const t = clock.current.chapterTime;
    const local = (t - from) / 1.1;
    const k = clamp01(local);
    if (!mesh.current) return;
    mesh.visible = k > 0 && k < 1;
    const s = easeOutCubic(k);
    mesh.scale.set(s * 15, s * 2.4, 1);
    mesh.material.opacity = (1 - k) * 0.5;
    void y;
  });

  return (
    <mesh ref={mesh} position={[0, y - 1.3, 0]}>
      <planeGeometry args={[15, 2.4]} />
      <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
    </mesh>
  );
}