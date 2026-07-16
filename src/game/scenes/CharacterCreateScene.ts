import Phaser from 'phaser';

import { GAME_VERSION } from '../../app/version';
import type { GameContent } from '../../content/catalog';
import type { ClassDefinition } from '../../content/schema';
import type { CharacterClass, CharacterState } from '../../core/model';
import { createQuestState } from '../../core/quests';
import { createCharacter, deriveStats } from '../../core/stats';
import type { SaveRepository } from '../../storage/SaveRepository';
import {
  sealSaveV1,
  type SaveGameV1,
  type SaveSlot,
} from '../../storage/saveSchema';
import {
  CONTENT_REGISTRY_KEY,
  SAVE_REPOSITORY_REGISTRY_KEY,
} from './BootScene';

const CLASS_IDS = ['prince', 'knight', 'elf', 'wizard'] as const;

const fixtureMapIds: Readonly<Record<string, string>> = {
  village: 'talking-island-village',
  'north-field': 'north-field',
  'black-knight-area': 'black-knight-area',
  'dungeon-1': 'talking-island-dungeon-1',
  'dungeon-2': 'talking-island-dungeon-2',
  inventory: 'talking-island-village',
  spells: 'talking-island-village',
  shop: 'talking-island-village',
  settings: 'talking-island-village',
};

const e2eInitialMapId = (): string | undefined => {
  const search = new URLSearchParams(window.location.search);
  if (search.get('e2e') !== '1') return undefined;
  const fixture = search.get('fixture');
  return fixture === null ? undefined : fixtureMapIds[fixture];
};

const nameKey = (name: string): string => name.normalize('NFKC').trim().toLocaleLowerCase('zh-Hant');

const visibleCharacterCount = (name: string): number => {
  const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });
  return [...segmenter.segment(name.trim())].filter(({ segment }) =>
    /[^\p{C}\p{Z}\s]/u.test(segment),
  ).length;
};

const isValidCharacterName = (name: string): boolean => {
  const count = visibleCharacterCount(name);
  return count >= 2 && count <= 12 && !/\p{Cc}/u.test(name);
};

const firstEmptySlot = (usedSlots: ReadonlySet<number>): SaveSlot | null => {
  for (const slot of [1, 2, 3] as const) {
    if (!usedSlots.has(slot)) return slot;
  }
  return null;
};

const createInitialSave = (
  slot: SaveSlot,
  characterState: CharacterState,
  classDefinition: ClassDefinition,
  content: GameContent,
  initialMapId?: string,
): SaveGameV1 => {
  const initialMap = content.map(initialMapId ?? 'talking-island-village');
  const initialPosition =
    initialMapId === undefined
      ? initialMap.entry
      : {
          x: Math.floor(initialMap.width / 2),
          y:
            initialMap.id === 'talking-island-village'
              ? 30
              : Math.floor(initialMap.height / 2),
        };
  const stacks = classDefinition.startingItemIds.map((itemId) => ({ itemId, quantity: 1 }));
  const carriedWeight = stacks.reduce(
    (weight, stack) => weight + content.item(stack.itemId).weight * stack.quantity,
    0,
  );
  const character = { ...characterState, carriedWeight };

  return sealSaveV1({
    schemaVersion: 1,
    gameVersion: GAME_VERSION,
    slot,
    updatedAt: new Date().toISOString(),
    checksum: '',
    character,
    inventory: {
      stacks,
      adena: 0,
      carriedWeight,
      weightLimit: deriveStats(character).weightLimit,
    },
    equipment: {},
    quests: createQuestState(),
    world: {
      player: { mapId: initialMap.id, x: initialPosition.x, y: initialPosition.y },
      defeatedBosses: [],
      flags: {},
      worldTimeMs: 0,
    },
    quickSlots: [null, null, null, null, null, null, null, null],
    settings: { music: 0.7, ambient: 0.5, effects: 0.8, muted: false, scale: 2 },
  });
};

export class CharacterCreateScene extends Phaser.Scene {
  #overlay: HTMLElement | null = null;

  constructor() {
    super('character-create');
  }

  create(): void {
    const parent = this.game.canvas.parentElement;
    if (parent === null) return;
    parent.dataset.scene = 'character-create';

    this.add.rectangle(320, 240, 640, 480, 0x111713);
    this.add.text(320, 50, '建立角色', {
      color: '#d9bd7a',
      fontFamily: 'serif',
      fontSize: '28px',
    }).setOrigin(0.5);

    const content = this.registry.get(CONTENT_REGISTRY_KEY) as GameContent;
    const overlay = this.#buildForm(content);
    parent.append(overlay);
    this.#overlay = overlay;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.#removeOverlay();
    });
  }

  #buildForm(content: GameContent): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'scene-overlay character-form';
    form.noValidate = true;

    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = 'character-name';
    nameLabel.textContent = '角色名稱';
    const nameInput = document.createElement('input');
    nameInput.id = 'character-name';
    nameInput.name = 'character-name';
    nameInput.autocomplete = 'off';
    nameLabel.append(nameInput);
    form.append(nameLabel);

    const classGroup = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = '選擇職業';
    classGroup.append(legend);

    for (const [index, classId] of CLASS_IDS.entries()) {
      const definition = content.classes.find(({ id }) => id === classId);
      if (definition === undefined) continue;
      const label = document.createElement('label');
      label.className = 'class-option';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'class-id';
      radio.value = classId;
      radio.checked = index === 0;
      radio.addEventListener('change', () => {
        this.#renderPreview(form, definition);
      });
      label.append(radio, document.createTextNode(definition.name));
      classGroup.append(label);
    }
    form.append(classGroup);

    const preview = document.createElement('section');
    preview.dataset.testid = 'attribute-preview';
    preview.className = 'attribute-preview';
    form.append(preview);
    const initial = content.classes.find(({ id }) => id === 'prince');
    if (initial !== undefined) this.#renderPreview(form, initial);

    const error = document.createElement('p');
    error.className = 'form-error';
    error.hidden = true;
    form.append(error);

    const actions = document.createElement('div');
    actions.className = 'form-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = '返回';
    back.addEventListener('click', () => {
      this.scene.start('menu');
    });
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = '建立角色';
    actions.append(back, submit);
    form.append(actions);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.#submit(form, content, nameInput, submit, error);
    });
    return form;
  }

  #renderPreview(form: HTMLFormElement, definition: ClassDefinition): void {
    const preview = form.querySelector<HTMLElement>('[data-testid="attribute-preview"]');
    if (preview === null) return;
    const { str, dex, con, int, wis, cha } = definition.baseAttributes;
    preview.textContent = `${definition.description}\n力量 ${String(str)} / 敏捷 ${String(dex)} / 體質 ${String(con)}\n智力 ${String(int)} / 精神 ${String(wis)} / 魅力 ${String(cha)}`;
  }

  async #submit(
    form: HTMLFormElement,
    content: GameContent,
    input: HTMLInputElement,
    submit: HTMLButtonElement,
    error: HTMLElement,
  ): Promise<void> {
    const name = input.value.trim();
    if (!isValidCharacterName(name)) {
      this.#showError(error, '角色名稱必須包含 2–12 個可見字元');
      return;
    }

    const selected = form.querySelector<HTMLInputElement>('input[name="class-id"]:checked');
    if (selected === null || !CLASS_IDS.includes(selected.value as CharacterClass)) {
      this.#showError(error, '請選擇職業');
      return;
    }

    submit.disabled = true;
    try {
      const repository = this.registry.get(SAVE_REPOSITORY_REGISTRY_KEY) as SaveRepository;
      const summaries = await repository.list();
      if (summaries.some((summary) => nameKey(summary.name) === nameKey(name))) {
        this.#showError(error, '角色名稱已存在於其他存檔欄');
        return;
      }
      const slot = firstEmptySlot(new Set(summaries.map((summary) => summary.slot)));
      if (slot === null) {
        this.#showError(error, '三個存檔欄皆已使用');
        return;
      }

      const classId = selected.value as CharacterClass;
      const definition = content.classes.find(({ id }) => id === classId);
      if (definition === undefined) {
        this.#showError(error, '找不到選定職業的內容');
        return;
      }
      const save = createInitialSave(
        slot,
        createCharacter(name, classId),
        definition,
        content,
        e2eInitialMapId(),
      );
      await repository.put(save);
      if (!this.scene.isActive()) return;
      this.registry.set('active-save', save);
      this.scene.start('world');
    } catch (caught) {
      this.#showError(
        error,
        `建立角色失敗：${caught instanceof Error ? caught.message : String(caught)}`,
      );
    } finally {
      submit.disabled = false;
    }
  }

  #showError(element: HTMLElement, message: string): void {
    element.hidden = false;
    element.setAttribute('role', 'alert');
    element.textContent = message;
  }

  #removeOverlay(): void {
    this.#overlay?.remove();
    this.#overlay = null;
  }
}
