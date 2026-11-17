// This file is an adaptation of the class PhysicEngine from Spacer (https://github.com/Zabuzard/Spacer, by Zabuzard),
// licensed GPL-3.0. Upstream source commit 52ebaf94760818808f811ac6a3a8e82e416ed086; release SWF: tag v1, commit
// 2c7326cd1ab68f2122f5e15405ec5b689633b882 (see samples/spacer/PROVENANCE.md). Adapted for SWF Resurrect
// (TypeScript, PixiJS). Licence text: handwritten/spacer/LICENSE. These files are GPL-3.0; the rest of the repository is MIT.
import { pixelsOverlap } from '../runtime/overlap';
import type { DisplayObject, Stage } from '../shim';
import type { Bullet } from './Bullet';
import type { Fly } from './Fly';
import type { FlyBoss } from './FlyBoss';
import type { LevelScene } from './LevelScene';
import type { Player } from './Player';
import { SceneCollisionReaction } from './SceneCollisionReaction';
import type { Sprite } from './Sprite';

// Differences from the AS3 class (design D16): areaOfCollision, which drew both hitboxes into a BitmapData with a
// ColorTransform and BlendMode.DIFFERENCE and read getColorBoundsRect, is replaced by the runtime helper pixelsOverlap.
// The AS3 method returned the overlapping Rectangle, but every caller only tests it for null, so the replacement,
// `collides`, returns a boolean. This is an approximation (Named_Limit collision-coverage-mask).
export class PhysicEngine {
  private static readonly INERTIA_LIMIT: number = 0.5;
  private stageRef: Stage;

  public constructor(stage: Stage) {
    this.stageRef = stage;
  }

  public affect(sprite: Sprite, scene: LevelScene): void {
    this.applyInertia(sprite);
    if (sprite.getForm().isCollidesWithSceneBound()) {
      this.applySceneBounds(sprite, scene);
    } else {
      sprite.setX(sprite.getX() + sprite.getXA());
      sprite.setY(sprite.getY() + sprite.getYA());
    }
  }

  public checkSpriteCollisions(flies: Fly[], boss: FlyBoss | null, bullets: Bullet[], player: Player | null, scene: LevelScene): void {
    for (let i = 0; i < flies.length; i++) {
      const fly = flies[i];
      if (!(fly == null || fly.mc_FlyHitbox == null)) {
        if (player != null && player.mc_PlayerHitbox != null && this.collides(fly.mc_FlyHitbox, player.mc_PlayerHitbox)) {
          fly.setXA(0);
          fly.setYA(0);
          fly.setX(fly.getXOld());
          fly.setY(fly.getYOld());
          player.setXA(0);
          player.setYA(0);
          scene.collisionFlyPlayer(fly, player);
        }
        for (let j = 0; j < bullets.length; j++) {
          const bullet = bullets[j];
          if (!(bullet == null || bullet.mc_BulletHitbox == null)) {
            if (this.collides(fly.mc_FlyHitbox, bullet.mc_BulletHitbox)) {
              fly.setXA(0);
              fly.setYA(0);
              scene.collisionFlyBullet(fly, bullet);
            }
          }
        }
      }
    }
    if (boss != null && boss.mc_FlyBossHitbox != null) {
      if (player != null && player.mc_PlayerHitbox != null && this.collides(boss.mc_FlyBossHitbox, player.mc_PlayerHitbox)) {
        boss.setXA(0);
        boss.setYA(0);
        boss.setX(boss.getXOld());
        boss.setY(boss.getYOld());
        player.setXA(0);
        player.setYA(0);
        scene.collisionFlyBossPlayer(boss, player);
      }
      for (let k = 0; k < bullets.length; k++) {
        const bullet = bullets[k];
        if (!(bullet == null || bullet.mc_BulletHitbox == null)) {
          if (this.collides(boss.mc_FlyBossHitbox, bullet.mc_BulletHitbox)) {
            boss.setXA(0);
            boss.setYA(0);
            scene.collisionFlyBossBullet(boss, bullet);
          }
        }
      }
    }
  }

  private applyInertia(sprite: Sprite): void {
    sprite.setXA(sprite.getXA() * sprite.getForm().getInertia());
    sprite.setYA(sprite.getYA() * sprite.getForm().getInertia());
    if (Math.abs(sprite.getXA()) < PhysicEngine.INERTIA_LIMIT) {
      sprite.setXA(0);
    }
    if (Math.abs(sprite.getYA()) < PhysicEngine.INERTIA_LIMIT) {
      sprite.setYA(0);
    }
  }

  private applySceneBounds(sprite: Sprite, scene: LevelScene): void {
    const newX = sprite.getX() + sprite.getXA();
    const newY = sprite.getY() + sprite.getYA();
    const minX = scene.getLeftBound() + sprite.getWidth() / 2;
    const maxX = scene.getRightBound() - sprite.getWidth() / 2;
    const minY = scene.getTopBound() + sprite.getHeight() / 2;
    const maxY = scene.getBottomBound() - sprite.getHeight() / 2;
    let destroyed = false;
    const destroys = sprite.getForm().getSceneCollisionReaction() == SceneCollisionReaction.DESTROY;
    if (newX < minX) {
      sprite.setX(minX);
      if (destroys) {
        destroyed = true;
      }
    } else if (newX >= maxX) {
      sprite.setX(maxX - 1);
      if (destroys) {
        destroyed = true;
      }
    } else {
      sprite.setX(sprite.getX() + sprite.getXA());
    }
    if (newY < minY) {
      sprite.setY(minY);
      if (destroys) {
        destroyed = true;
      }
    } else if (newY >= maxY) {
      sprite.setY(maxY - 1);
      if (destroys) {
        destroyed = true;
      }
    } else {
      sprite.setY(sprite.getY() + sprite.getYA());
    }
    if (destroyed) {
      sprite.die();
    }
  }

  /** Replaces the AS3 areaOfCollision: do the two hitboxes cover a common pixel? */
  private collides(a: DisplayObject, b: DisplayObject): boolean {
    return pixelsOverlap(a, b);
  }
}
