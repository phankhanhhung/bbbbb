import { describe, expect, it } from 'vitest';
import { boardCommands, boardTools } from '@combviz/engine-board';
import { graphCommands, graphTools } from '@combviz/engine-graph';
import { sequenceCommands, sequenceTools } from '@combviz/engine-sequence';
import { setCommands, setTools } from '@combviz/engine-set';
import { pointCommands, pointTools } from '@combviz/engine-point';
import { gameCommands, gameTools } from '@combviz/engine-game';
import { derivationCommands, derivationTools } from '@combviz/engine-derivation';
import type { Scene } from '@combviz/schema';
import type { CommandRegistry, SandboxTool, SandboxToolsFn } from '../src/index.js';

/**
 * Hợp đồng giữa thanh công cụ và tập lệnh (SBX-01).
 *
 * Đây là lưới bắt đúng cái lỗi mà chính chủ gặp khi bấm thử: sandbox bày ra
 * những nút **không thuộc về engine đang mở**. Trước lớp `SandboxTool`, cả bảy
 * engine dùng chung một thanh công cụ gõ cứng trong `apps/player` toàn lệnh
 * `board/*`, nên ở năm engine còn lại mọi nút đều im lặng không làm gì.
 *
 * Test này hỏi đúng hai câu, và cả hai đều kiểm được bằng máy:
 *
 *   1. Nút nào hiện ra thì lệnh sau nó **phải có** trong registry của engine ấy.
 *   2. Engine nào có lệnh sửa scene thì **phải có** ít nhất một nút gọi tới —
 *      một sandbox chỉ có nút "Chọn" trong khi engine có sáu lệnh là một cái
 *      khung chết.
 */

interface Case {
  readonly engine: string;
  readonly tools: SandboxToolsFn;
  readonly commands: CommandRegistry;
  readonly scenes: readonly Scene[];
}

const board: Scene = {
  engine: 'board',
  config: { rows: 3, cols: 3 },
  elements: [],
};

const graph: Scene = {
  engine: 'graph',
  config: {},
  elements: [
    { id: 'a', type: 'vertex', pos: [0, 0] },
    { id: 'b', type: 'vertex', pos: [10, 0] },
  ],
};

const seqOrdered: Scene = {
  engine: 'sequence',
  config: { mode: 'sequence' },
  elements: [{ id: 'i0', type: 'item', value: 1, pos: 0 }],
};

const seqPiles: Scene = { ...seqOrdered, config: { mode: 'piles' } };

const setMatrix: Scene = {
  engine: 'set',
  config: { view: 'matrix' },
  elements: [
    { id: 's1', type: 'set', order: 0 },
    { id: 't1', type: 'token', sets: [] },
  ],
};

const setVenn: Scene = { ...setMatrix, config: { view: 'venn' } };

const point: Scene = {
  engine: 'point',
  config: {},
  elements: [
    { id: 'p1', type: 'point', pos: [0, 0] },
    { id: 'p2', type: 'point', pos: [10, 0] },
  ],
};

const gameTake: Scene = {
  engine: 'game',
  config: { rule: { type: 'subtract', min: 1, max: 3 } },
  elements: [{ id: 'p0', type: 'pile', count: 7 }],
};

const gameSplit: Scene = {
  engine: 'game',
  config: { rule: { type: 'split-unequal' } },
  elements: [{ id: 'p0', type: 'pile', count: 6 }],
};

const derivation: Scene = {
  engine: 'derivation',
  config: { align: 'left' },
  elements: [
    { id: 'r1', type: 'row' },
    { id: 't1', type: 'term', row: 'r1', tex: '1' },
  ],
};

const CASES: readonly Case[] = [
  { engine: 'board', tools: boardTools, commands: boardCommands, scenes: [board] },
  { engine: 'graph', tools: graphTools, commands: graphCommands, scenes: [graph] },
  {
    engine: 'sequence',
    tools: sequenceTools,
    commands: sequenceCommands,
    scenes: [seqOrdered, seqPiles],
  },
  { engine: 'set', tools: setTools, commands: setCommands, scenes: [setMatrix, setVenn] },
  { engine: 'point', tools: pointTools, commands: pointCommands, scenes: [point] },
  { engine: 'game', tools: gameTools, commands: gameCommands, scenes: [gameTake, gameSplit] },
  {
    engine: 'derivation',
    tools: derivationTools,
    commands: derivationCommands,
    scenes: [derivation],
  },
];

function commandOf(tool: SandboxTool): string | null {
  return tool.action.type === 'select' ? null : tool.action.command;
}

describe('công cụ sandbox khớp tập lệnh của engine', () => {
  for (const item of CASES) {
    describe(item.engine, () => {
      it('mọi nút đều gọi một lệnh **engine này có**', () => {
        for (const scene of item.scenes) {
          for (const tool of item.tools(scene)) {
            const type = commandOf(tool);
            if (type === null) continue;
            expect({ engine: item.engine, tool: tool.id, type }).toEqual({
              engine: item.engine,
              tool: tool.id,
              type: Object.hasOwn(item.commands, type) ? type : `THIẾU LỆNH: ${type}`,
            });
          }
        }
      });

      it('lệnh **của engine khác** không lọt vào', () => {
        // Lỗi gốc: `board/paint-cells` hiện ở cả bảy engine.
        for (const scene of item.scenes) {
          for (const tool of item.tools(scene)) {
            const type = commandOf(tool);
            if (type === null) continue;
            expect(type.split('/')[0]).toBe(item.engine);
          }
        }
      });

      it('có lệnh thì phải có nút — sandbox không được là khung chết', () => {
        const used = new Set(
          item.scenes.flatMap((scene) =>
            item.tools(scene).map(commandOf).filter((t): t is string => t !== null),
          ),
        );
        expect(used.size).toBeGreaterThan(0);
      });

      it('luôn có công cụ chọn, và id không trùng nhau', () => {
        for (const scene of item.scenes) {
          const tools = item.tools(scene);
          expect(tools.some((t) => t.action.type === 'select')).toBe(true);
          expect(new Set(tools.map((t) => t.id)).size).toBe(tools.length);
        }
      });
    });
  }
});

describe('công cụ theo thế, không theo bài', () => {
  it('game: mỗi nước bốc hợp lệ là **một** nút, và số nút đổi theo luật', () => {
    const take13 = gameTools(gameTake)
      .filter((t) => t.id.startsWith('take-'))
      .map((t) => t.label);
    expect(take13).toEqual(['Bốc 1', 'Bốc 2', 'Bốc 3']);

    const set134 = gameTools({
      ...gameTake,
      config: { rule: { type: 'subtract-set', allowed: [1, 3, 4] } },
    })
      .filter((t) => t.id.startsWith('take-'))
      .map((t) => t.label);
    expect(set134).toEqual(['Bốc 1', 'Bốc 3', 'Bốc 4']);
  });

  it('game: "bốc tối đa nửa đống" — số nút **đổi theo cỡ đống**', () => {
    const half = { type: 'subtract-fraction', denominator: 2 };
    const at7 = gameTools({ ...gameTake, config: { rule: half } });
    const at3 = gameTools({
      ...gameTake,
      config: { rule: half },
      elements: [{ id: 'p0', type: 'pile', count: 3 }],
    });
    expect(at7.filter((t) => t.id.startsWith('take-'))).toHaveLength(3);
    expect(at3.filter((t) => t.id.startsWith('take-'))).toHaveLength(1);
  });

  it('game: đống rỗng thì không còn nước nào để bày', () => {
    const empty = gameTools({
      ...gameTake,
      elements: [{ id: 'p0', type: 'pile', count: 0 }],
    });
    expect(empty.filter((t) => t.id.startsWith('take-'))).toHaveLength(0);
  });

  it('sequence: đa tập thì gộp, dãy có thứ tự thì đổi chỗ — không bao giờ cả hai', () => {
    const piles = sequenceTools(seqPiles).map((t) => t.id);
    const ordered = sequenceTools(seqOrdered).map((t) => t.id);
    expect(piles.some((id) => id.startsWith('combine-'))).toBe(true);
    expect(piles).not.toContain('swap');
    expect(ordered).toContain('swap');
    expect(ordered.some((id) => id.startsWith('combine-'))).toBe(false);
  });

  it('sequence: bày **đủ** năm luật gộp, không phải ba luật chép tay', () => {
    // Bản gõ tay ở `apps/player` chỉ liệt kê sum / abs-diff / max.
    expect(sequenceTools(seqPiles).filter((t) => t.id.startsWith('combine-'))).toHaveLength(5);
  });

  it('set: bảng incidence bấm **một** lần, Venn bấm **hai** lần', () => {
    expect(setTools(setMatrix).find((t) => t.id === 'toggle-cell')?.action.type).toBe('one');
    expect(setTools(setVenn).find((t) => t.id === 'toggle-venn')?.action.type).toBe('two');
  });

  it('graph: không có đỉnh thì không bày nút sắp lại', () => {
    const bare = graphTools({ engine: 'graph', config: {}, elements: [] });
    expect(bare.some((t) => t.id === 'layout-circle')).toBe(false);
    expect(graphTools(graph).some((t) => t.id === 'layout-circle')).toBe(true);
  });
});
