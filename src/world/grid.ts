export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface GridRectangle extends GridPoint {
  readonly width: number;
  readonly height: number;
}

const requirePositiveInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} 必須是正整數`);
  }
};

export class TileGrid {
  readonly width: number;
  readonly height: number;
  readonly #blocked: Uint8Array;

  private constructor(width: number, height: number, blocked: Uint8Array) {
    this.width = width;
    this.height = height;
    this.#blocked = blocked.slice();
  }

  static fromRows(rows: readonly string[]): TileGrid {
    if (rows.length === 0) {
      throw new RangeError('網格至少需要一列');
    }
    const firstRow = rows[0];
    if (firstRow === undefined || firstRow.length === 0) {
      throw new RangeError('網格至少需要一欄');
    }

    const blocked = new Uint8Array(firstRow.length * rows.length);
    rows.forEach((row, y) => {
      if (row.length !== firstRow.length) {
        throw new RangeError('網格每列寬度必須相同');
      }
      for (let x = 0; x < row.length; x += 1) {
        const tile = row[x];
        if (tile !== '.' && tile !== '#') {
          throw new TypeError(`不支援的網格字元：${tile ?? ''}`);
        }
        if (tile === '#') {
          blocked[y * firstRow.length + x] = 1;
        }
      }
    });

    return new TileGrid(firstRow.length, rows.length, blocked);
  }

  static fromBlockedRectangles(
    width: number,
    height: number,
    rectangles: readonly GridRectangle[],
  ): TileGrid {
    requirePositiveInteger(width, '網格寬度');
    requirePositiveInteger(height, '網格高度');
    const blocked = new Uint8Array(width * height);

    for (const rectangle of rectangles) {
      requirePositiveInteger(rectangle.width, '碰撞矩形寬度');
      requirePositiveInteger(rectangle.height, '碰撞矩形高度');
      if (
        !Number.isInteger(rectangle.x) ||
        !Number.isInteger(rectangle.y) ||
        rectangle.x < 0 ||
        rectangle.y < 0 ||
        rectangle.x + rectangle.width > width ||
        rectangle.y + rectangle.height > height
      ) {
        throw new RangeError('碰撞矩形超出網格範圍');
      }
      for (let y = rectangle.y; y < rectangle.y + rectangle.height; y += 1) {
        for (let x = rectangle.x; x < rectangle.x + rectangle.width; x += 1) {
          blocked[y * width + x] = 1;
        }
      }
    }

    return new TileGrid(width, height, blocked);
  }

  isInBounds(point: GridPoint): boolean {
    return (
      Number.isInteger(point.x) &&
      Number.isInteger(point.y) &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x < this.width &&
      point.y < this.height
    );
  }

  isWalkable(point: GridPoint): boolean {
    return this.isInBounds(point) && this.#blocked[point.y * this.width + point.x] === 0;
  }
}
