import type { GridPoint, TileGrid } from './grid';

interface Direction {
  readonly dx: number;
  readonly dy: number;
  readonly cost: 10 | 14;
}

interface OpenNode {
  readonly index: number;
  readonly g: number;
  readonly h: number;
  readonly f: number;
  readonly sequence: number;
}

const directions: readonly Direction[] = [
  { dx: 0, dy: -1, cost: 10 },
  { dx: 1, dy: -1, cost: 14 },
  { dx: 1, dy: 0, cost: 10 },
  { dx: 1, dy: 1, cost: 14 },
  { dx: 0, dy: 1, cost: 10 },
  { dx: -1, dy: 1, cost: 14 },
  { dx: -1, dy: 0, cost: 10 },
  { dx: -1, dy: -1, cost: 14 },
];

const compareNodes = (left: OpenNode, right: OpenNode): number =>
  left.f - right.f || left.h - right.h || left.sequence - right.sequence;

class MinHeap {
  readonly #nodes: OpenNode[] = [];

  get size(): number {
    return this.#nodes.length;
  }

  push(node: OpenNode): void {
    this.#nodes.push(node);
    let childIndex = this.#nodes.length - 1;
    while (childIndex > 0) {
      const parentIndex = Math.floor((childIndex - 1) / 2);
      const child = this.#nodes[childIndex];
      const parent = this.#nodes[parentIndex];
      if (child === undefined || parent === undefined || compareNodes(child, parent) >= 0) {
        break;
      }
      this.#nodes[parentIndex] = child;
      this.#nodes[childIndex] = parent;
      childIndex = parentIndex;
    }
  }

  pop(): OpenNode | undefined {
    const root = this.#nodes[0];
    const last = this.#nodes.pop();
    if (root === undefined || last === undefined) {
      return undefined;
    }
    if (this.#nodes.length === 0) {
      return root;
    }

    this.#nodes[0] = last;
    let parentIndex = 0;
    while (parentIndex * 2 + 1 < this.#nodes.length) {
      const leftIndex = parentIndex * 2 + 1;
      const rightIndex = leftIndex + 1;
      let smallestIndex = parentIndex;
      const smallest = this.#nodes[smallestIndex];
      const left = this.#nodes[leftIndex];
      if (smallest !== undefined && left !== undefined && compareNodes(left, smallest) < 0) {
        smallestIndex = leftIndex;
      }
      const candidate = this.#nodes[smallestIndex];
      const right = this.#nodes[rightIndex];
      if (candidate !== undefined && right !== undefined && compareNodes(right, candidate) < 0) {
        smallestIndex = rightIndex;
      }
      if (smallestIndex === parentIndex) {
        break;
      }
      const parent = this.#nodes[parentIndex];
      const child = this.#nodes[smallestIndex];
      if (parent === undefined || child === undefined) {
        break;
      }
      this.#nodes[parentIndex] = child;
      this.#nodes[smallestIndex] = parent;
      parentIndex = smallestIndex;
    }
    return root;
  }
}

const octileDistance = (from: GridPoint, to: GridPoint): number => {
  const dx = Math.abs(from.x - to.x);
  const dy = Math.abs(from.y - to.y);
  const diagonal = Math.min(dx, dy);
  return diagonal * 14 + (Math.max(dx, dy) - diagonal) * 10;
};

const pointIndex = (grid: TileGrid, point: GridPoint): number => point.y * grid.width + point.x;

const pointFromIndex = (grid: TileGrid, index: number): GridPoint => ({
  x: index % grid.width,
  y: Math.floor(index / grid.width),
});

const canMoveDiagonally = (
  grid: TileGrid,
  current: GridPoint,
  direction: Direction,
): boolean =>
  direction.dx === 0 ||
  direction.dy === 0 ||
  (grid.isWalkable({ x: current.x + direction.dx, y: current.y }) &&
    grid.isWalkable({ x: current.x, y: current.y + direction.dy }));

const reconstructPath = (
  grid: TileGrid,
  cameFrom: Int32Array,
  startIndex: number,
  goalIndex: number,
): readonly GridPoint[] => {
  const reversed: GridPoint[] = [];
  let currentIndex = goalIndex;
  while (currentIndex !== startIndex) {
    reversed.push(pointFromIndex(grid, currentIndex));
    const previousIndex = cameFrom[currentIndex];
    if (previousIndex === undefined || previousIndex < 0) {
      return [];
    }
    currentIndex = previousIndex;
  }
  reversed.push(pointFromIndex(grid, startIndex));
  return reversed.reverse();
};

export const findPath = (
  grid: TileGrid,
  start: GridPoint,
  goal: GridPoint,
): readonly GridPoint[] => {
  if (!grid.isWalkable(start) || !grid.isWalkable(goal)) {
    return [];
  }

  const startIndex = pointIndex(grid, start);
  const goalIndex = pointIndex(grid, goal);
  if (startIndex === goalIndex) {
    return [{ x: start.x, y: start.y }];
  }

  const searchBound = grid.width * grid.height;
  const cameFrom = new Int32Array(searchBound);
  cameFrom.fill(-1);
  const scores = new Float64Array(searchBound);
  scores.fill(Number.POSITIVE_INFINITY);
  scores[startIndex] = 0;
  const closed = new Uint8Array(searchBound);
  const open = new MinHeap();
  let sequence = 0;
  const startHeuristic = octileDistance(start, goal);
  open.push({ index: startIndex, g: 0, h: startHeuristic, f: startHeuristic, sequence });
  let expanded = 0;

  while (open.size > 0 && expanded < searchBound) {
    const currentNode = open.pop();
    if (
      currentNode === undefined ||
      closed[currentNode.index] === 1 ||
      currentNode.g !== scores[currentNode.index]
    ) {
      continue;
    }
    if (currentNode.index === goalIndex) {
      return reconstructPath(grid, cameFrom, startIndex, goalIndex);
    }

    closed[currentNode.index] = 1;
    expanded += 1;
    const current = pointFromIndex(grid, currentNode.index);
    for (const direction of directions) {
      const neighbor = { x: current.x + direction.dx, y: current.y + direction.dy };
      if (!grid.isWalkable(neighbor) || !canMoveDiagonally(grid, current, direction)) {
        continue;
      }
      const neighborIndex = pointIndex(grid, neighbor);
      if (closed[neighborIndex] === 1) {
        continue;
      }
      const tentativeScore = currentNode.g + direction.cost;
      const knownScore = scores[neighborIndex];
      if (knownScore !== undefined && tentativeScore >= knownScore) {
        continue;
      }
      cameFrom[neighborIndex] = currentNode.index;
      scores[neighborIndex] = tentativeScore;
      const heuristic = octileDistance(neighbor, goal);
      sequence += 1;
      open.push({
        index: neighborIndex,
        g: tentativeScore,
        h: heuristic,
        f: tentativeScore + heuristic,
        sequence,
      });
    }
  }

  return [];
};

export const isReachable = (grid: TileGrid, start: GridPoint, goal: GridPoint): boolean =>
  findPath(grid, start, goal).length > 0;
