import * as THREE from 'three';

export interface RaycastHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
  isVertical: boolean;
}

export interface CollisionResult {
  isGrounded: boolean;
  impactVelocity: number; // Maximum impact deceleration for damage calculation
  hitNormal: THREE.Vector3;
}

export class PhysicsWorld {
  public collisionBoxes: THREE.Box3[] = [];
  public dynamicBoxes: THREE.Box3[] = [];
  public gravity: number = -24.0; // Snappy anime gravity (m/s^2)

  // Impact damage thresholds (m/s)
  public safeImpactSpeed: number = 18.0; // ~65 km/h
  public lethalImpactSpeed: number = 42.0; // ~150 km/h

  constructor(collisionBoxes: THREE.Box3[]) {
    this.collisionBoxes = collisionBoxes;
  }

  /**
   * Raycast against all world bounding boxes and dynamic entities to find closest anchor
   */
  public raycast(ray: THREE.Ray, maxDistance: number = 95): RaycastHit | null {
    let closestHit: RaycastHit | null = null;
    let minDistance = maxDistance;

    const hitPoint = new THREE.Vector3();

    // Check static world boxes
    for (let i = 0; i < this.collisionBoxes.length; i++) {
      const box = this.collisionBoxes[i];
      if (ray.intersectBox(box, hitPoint)) {
        const dist = ray.origin.distanceTo(hitPoint);
        if (dist < minDistance && dist > 1.2) {
          minDistance = dist;
          const normal = this.getBoxNormalAtPoint(box, hitPoint);
          closestHit = {
            point: hitPoint.clone(),
            normal: normal.clone(),
            distance: dist,
            isVertical: Math.abs(normal.y) < 0.35
          };
        }
      }
    }

    // Check dynamic entity boxes (e.g., Titans)
    for (let i = 0; i < this.dynamicBoxes.length; i++) {
      const box = this.dynamicBoxes[i];
      if (ray.intersectBox(box, hitPoint)) {
        const dist = ray.origin.distanceTo(hitPoint);
        if (dist < minDistance && dist > 1.2) {
          minDistance = dist;
          const normal = this.getBoxNormalAtPoint(box, hitPoint);
          closestHit = {
            point: hitPoint.clone(),
            normal: normal.clone(),
            distance: dist,
            isVertical: true
          };
        }
      }
    }

    return closestHit;
  }

  /**
   * Compute outward normal on an AABB at hit point
   */
  private getBoxNormalAtPoint(box: THREE.Box3, point: THREE.Vector3): THREE.Vector3 {
    const normal = new THREE.Vector3(0, 1, 0);
    const epsilon = 0.05;

    if (Math.abs(point.x - box.max.x) < epsilon) return new THREE.Vector3(1, 0, 0);
    if (Math.abs(point.x - box.min.x) < epsilon) return new THREE.Vector3(-1, 0, 0);
    if (Math.abs(point.y - box.max.y) < epsilon) return new THREE.Vector3(0, 1, 0);
    if (Math.abs(point.y - box.min.y) < epsilon) return new THREE.Vector3(0, -1, 0);
    if (Math.abs(point.z - box.max.z) < epsilon) return new THREE.Vector3(0, 0, 1);
    if (Math.abs(point.z - box.min.z) < epsilon) return new THREE.Vector3(0, 0, -1);

    return normal;
  }

  /**
   * Resolve player movement with swept box/capsule against world AABBs.
   * Resolves penetrations, cancels velocities into walls, and calculates impact force.
   */
  public resolveMovement(
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    playerRadius: number,
    playerHeight: number,
    dt: number
  ): CollisionResult {
    let isGrounded = false;
    let maxImpactVelocity = 0;
    const finalNormal = new THREE.Vector3();

    const preVelocity = velocity.clone();

    // 1. Move position by current velocity * dt
    position.addScaledVector(velocity, dt);

    // Hard boundary floor check
    if (position.y < playerHeight / 2) {
      const impactSpeed = Math.max(0, -preVelocity.y);
      if (impactSpeed > maxImpactVelocity) {
        maxImpactVelocity = impactSpeed;
        finalNormal.set(0, 1, 0);
      }
      position.y = playerHeight / 2;
      velocity.y = 0;
      isGrounded = true;
    }

    // Player bounding box for broadphase and unpenetration
    const playerBox = new THREE.Box3();

    // Iterative collision resolution to handle corners smoothly
    const maxIterations = 3;
    for (let iter = 0; iter < maxIterations; iter++) {
      playerBox.min.set(
        position.x - playerRadius,
        position.y - playerHeight / 2,
        position.z - playerRadius
      );
      playerBox.max.set(
        position.x + playerRadius,
        position.y + playerHeight / 2,
        position.z + playerRadius
      );

      let collided = false;

      for (const box of this.collisionBoxes) {
        if (playerBox.intersectsBox(box)) {
          collided = true;

          // Compute overlap along each axis
          const dx1 = box.max.x - playerBox.min.x;
          const dx2 = playerBox.max.x - box.min.x;
          const overlapX = Math.min(dx1, dx2);

          const dy1 = box.max.y - playerBox.min.y;
          const dy2 = playerBox.max.y - box.min.y;
          const overlapY = Math.min(dy1, dy2);

          const dz1 = box.max.z - playerBox.min.z;
          const dz2 = playerBox.max.z - box.min.z;
          const overlapZ = Math.min(dz1, dz2);

          // Find axis of minimum penetration
          if (overlapY < overlapX && overlapY < overlapZ) {
            if (position.y > (box.min.y + box.max.y) / 2) {
              // Stepped on top of box / roof
              position.y += overlapY;
              const impact = Math.max(0, -preVelocity.y);
              if (impact > maxImpactVelocity) {
                maxImpactVelocity = impact;
                finalNormal.set(0, 1, 0);
              }
              velocity.y = Math.max(0, velocity.y);
              isGrounded = true;
            } else {
              // Hit ceiling
              position.y -= overlapY;
              velocity.y = Math.min(0, velocity.y);
            }
          } else if (overlapX < overlapZ) {
            // X wall collision
            const sign = position.x > (box.min.x + box.max.x) / 2 ? 1 : -1;
            position.x += overlapX * sign;

            const intoWall = -preVelocity.x * sign;
            if (intoWall > maxImpactVelocity) {
              maxImpactVelocity = intoWall;
              finalNormal.set(sign, 0, 0);
            }
            if ((velocity.x > 0 && sign < 0) || (velocity.x < 0 && sign > 0)) {
              velocity.x = 0;
            }
          } else {
            // Z wall collision
            const sign = position.z > (box.min.z + box.max.z) / 2 ? 1 : -1;
            position.z += overlapZ * sign;

            const intoWall = -preVelocity.z * sign;
            if (intoWall > maxImpactVelocity) {
              maxImpactVelocity = intoWall;
              finalNormal.set(0, 0, sign);
            }
            if ((velocity.z > 0 && sign < 0) || (velocity.z < 0 && sign > 0)) {
              velocity.z = 0;
            }
          }
        }
      }

      if (!collided) break;
    }

    return {
      isGrounded,
      impactVelocity: maxImpactVelocity,
      hitNormal: finalNormal
    };
  }
}
