export interface SpriteAtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const NPC_FRAME_COLUMNS = 16;
const NPC_FRAME_ROWS = 5;
const NPC_POSES_PER_ENTRY = 4;
const NPC_ENTRIES_PER_ROW = NPC_FRAME_COLUMNS / NPC_POSES_PER_ENTRY;

export const npcAtlasFrame = (
  sourceWidth: number,
  sourceHeight: number,
  entryIndex: number,
  poseIndex: number,
): SpriteAtlasFrame | null => {
  const frameWidth = Math.floor(sourceWidth / NPC_FRAME_COLUMNS);
  const frameHeight = Math.floor(sourceHeight / NPC_FRAME_ROWS);
  const maxEntries = NPC_ENTRIES_PER_ROW * NPC_FRAME_ROWS;
  if (
    frameWidth <= 0 ||
    frameHeight <= 0 ||
    entryIndex < 0 ||
    entryIndex >= maxEntries ||
    poseIndex < 0 ||
    poseIndex >= NPC_POSES_PER_ENTRY
  ) {
    return null;
  }

  const row = Math.floor(entryIndex / NPC_ENTRIES_PER_ROW);
  const entryColumn = entryIndex % NPC_ENTRIES_PER_ROW;
  return {
    x: (entryColumn * NPC_POSES_PER_ENTRY + poseIndex) * frameWidth,
    y: row * frameHeight,
    width: frameWidth,
    height: frameHeight,
  };
};
