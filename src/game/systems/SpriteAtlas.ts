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
const ISOMETRIC_VILLAGE_COLUMNS = 4;
const ISOMETRIC_VILLAGE_ROWS = 4;
const CLASS_POSE_COLUMNS = 8;
const CLASS_POSE_ROWS = 6;
const CLASS_FRONT_POSE_COLUMN = 4;
const ROW_MONSTER_POSE_COLUMNS = 5;
const ROW_MONSTER_ENTRY_ROWS = 6;

export interface SpriteDisplaySize {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

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

export const isometricVillageAtlasFrame = (
  sourceWidth: number,
  sourceHeight: number,
  index: number,
): SpriteAtlasFrame | null => {
  const width = Math.floor(sourceWidth / ISOMETRIC_VILLAGE_COLUMNS);
  const height = Math.floor(sourceHeight / ISOMETRIC_VILLAGE_ROWS);
  if (
    width <= 0 ||
    height <= 0 ||
    index < 0 ||
    index >= ISOMETRIC_VILLAGE_COLUMNS * ISOMETRIC_VILLAGE_ROWS
  ) {
    return null;
  }
  return {
    x: (index % ISOMETRIC_VILLAGE_COLUMNS) * width,
    y: Math.floor(index / ISOMETRIC_VILLAGE_COLUMNS) * height,
    width,
    height,
  };
};

export const fitSpriteFrame = (
  sourceWidth: number,
  sourceHeight: number,
  maximumWidth: number,
  maximumHeight: number,
): SpriteDisplaySize | null => {
  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0 ||
    maximumWidth <= 0 ||
    maximumHeight <= 0
  ) {
    return null;
  }
  const scale = Math.min(maximumWidth / sourceWidth, maximumHeight / sourceHeight);
  return { width: sourceWidth * scale, height: sourceHeight * scale, scale };
};

export const classIsometricIdleFrame = (
  sourceWidth: number,
  sourceHeight: number,
): SpriteAtlasFrame | null => {
  const width = Math.floor(sourceWidth / CLASS_POSE_COLUMNS);
  const height = Math.floor(sourceHeight / CLASS_POSE_ROWS);
  if (width <= 0 || height <= 0) return null;
  return {
    x: CLASS_FRONT_POSE_COLUMN * width,
    y: 0,
    width,
    height,
  };
};

export const rowMonsterAtlasFrame = (
  sourceWidth: number,
  sourceHeight: number,
  entryIndex: number,
  poseIndex: number,
): SpriteAtlasFrame | null => {
  const width = Math.floor(sourceWidth / ROW_MONSTER_POSE_COLUMNS);
  const height = Math.floor(sourceHeight / ROW_MONSTER_ENTRY_ROWS);
  if (
    width <= 0 ||
    height <= 0 ||
    entryIndex < 0 ||
    entryIndex >= ROW_MONSTER_ENTRY_ROWS ||
    poseIndex < 0 ||
    poseIndex >= ROW_MONSTER_POSE_COLUMNS
  ) {
    return null;
  }
  return {
    x: poseIndex * width,
    y: entryIndex * height,
    width,
    height,
  };
};
