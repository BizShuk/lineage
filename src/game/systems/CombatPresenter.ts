import type Phaser from 'phaser';

import type { DomainEvent } from '../../core/events';

type PositionLookup = (id: string) => Readonly<{ x: number; y: number }> | null;
export type CombatEffect = 'melee' | 'projectile' | 'spell' | 'damage' | 'level-up' | 'loot';

export class CombatPresenter {
  readonly #scene: Phaser.Scene;
  readonly #positionOf: PositionLookup;

  constructor(scene: Phaser.Scene, positionOf: PositionLookup) {
    this.#scene = scene;
    this.#positionOf = positionOf;
  }

  present(events: readonly DomainEvent[]): readonly string[] {
    return events.map((event) => {
      const message = this.#message(event);
      const entityId = event.type === 'death' || event.type === 'level-up'
        ? event.entityId
        : event.targetId;
      const position = this.#positionOf(entityId);
      if (position !== null) {
        this.playEffect(this.#effectFor(event), entityId);
        const text = this.#scene.add
          .text(position.x, position.y - 14, message, {
            color: event.type === 'damage' ? '#ffccbc' : '#f4df8f',
            fontSize: '11px',
          })
          .setOrigin(0.5)
          .setDepth(100_000);
        this.#scene.tweens.add({
          targets: text,
          y: position.y - 28,
          alpha: 0,
          duration: 500,
          onComplete: () => {
            text.destroy();
          },
        });
      }
      return message;
    });
  }

  playEffect(effect: CombatEffect, entityId: string): void {
    const position = this.#positionOf(entityId);
    if (position === null) return;
    const key = `effect:${effect}`;
    if (!this.#scene.anims.exists(key)) {
      this.#playFallback(effect, position);
      return;
    }
    const animation = this.#scene.anims.get(key);
    const firstFrame = animation.frames[0];
    if (firstFrame !== undefined) {
      const sprite = this.#scene.add
        .sprite(position.x, position.y, firstFrame.textureKey, firstFrame.textureFrame)
        .setDisplaySize(30, 30)
        .setDepth(99_999);
      sprite.once('animationcomplete', () => {
        sprite.destroy();
      });
      sprite.play(key);
      return;
    }

    this.#playFallback(effect, position);
  }

  #playFallback(effect: CombatEffect, position: Readonly<{ x: number; y: number }>): void {
    const fallback = this.#scene.add
      .circle(position.x, position.y, 7, effect === 'damage' ? 0xc85b4a : 0xe0bd6f, 0.7)
      .setDepth(99_999);
    this.#scene.tweens.add({
      targets: fallback,
      alpha: 0,
      scale: 1.8,
      duration: 250,
      onComplete: () => {
        fallback.destroy();
      },
    });
  }

  #effectFor(event: DomainEvent): CombatEffect {
    switch (event.type) {
      case 'damage':
        return 'damage';
      case 'miss':
        return 'melee';
      case 'heal':
      case 'status-applied':
        return 'spell';
      case 'death':
        return 'loot';
      case 'level-up':
        return 'level-up';
    }
  }

  #message(event: DomainEvent): string {
    switch (event.type) {
      case 'damage':
        return `傷害 ${String(event.amount)}`;
      case 'miss':
        return '未命中';
      case 'heal':
        return `恢復 ${String(event.amount)}`;
      case 'death':
        return '倒下';
      case 'level-up':
        return `升到 ${String(event.level)} 級`;
      case 'status-applied':
        return '狀態生效';
    }
  }
}
