import { useMemo } from "react";
import * as THREE from "three";

/**
 * Builds a smoothed path through the given points.
 *
 * Two-point paths become a lifted quadratic arc so long hops read as routed
 * traffic; three or more points become a Catmull-Rom spline. Lives outside the
 * components module so react-refresh stays happy.
 */
export default function makeCurve(points, lift = 1.4) {
  const vectors = points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));

  if (vectors.length === 2) {
    const [a, b] = vectors;
    const mid = a.clone().lerp(b, 0.5);
    mid.y += Math.max(a.distanceTo(b) * lift * 0.14, 0.5);
    return new THREE.QuadraticBezierCurve3(a, mid, b);
  }

  if (vectors.length === 1) {
    return new THREE.LineCurve3(vectors[0], vectors[0]);
  }

  return new THREE.CatmullRomCurve3(vectors, false, "catmullrom", 0.4);
}

export function useCurve(points, lift = 1.4) {
  return useMemo(() => makeCurve(points, lift), [points, lift]);
}