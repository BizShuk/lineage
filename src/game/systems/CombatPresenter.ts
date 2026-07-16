import type Phaser from 'phaser';

import type { DomainEvent } from '../../core/events';

type PositionLookup = (id: string) => Readonly<{ x: number; y: number }> | null;

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
