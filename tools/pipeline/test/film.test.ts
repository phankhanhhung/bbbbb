import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createRenderer, timelineLength, type LabelAtlas, type SvgNode } from '@combviz/render';
import type { Choreography, Problem, Step } from '@combviz/schema';
import { ENGINE_RENDERERS } from '../src/engines.js';
import {
  collapse,
  effectiveChoreography,
  frameNodes,
  frameSvg,
  frameTimes,
  rasterFrame,
} from '../src/commands/film.js';
import { toApng, readChunks } from '../src/apng.js';

/**
 * CHO-08 — **lời hứa tất định, lần đầu được kiểm**.
 *
 * Đặc tả viết từ M-đầu: *"Player gọi mỗi rAF, render video gọi theo timestep cố định,
 * và hai bên phải ra byte giống nhau."* Từ đó tới M62, `applyChoreography` chỉ có
 * **một** call site là Player, nên vế "render video" chưa từng chạy — và một lời hứa
 * chưa ai chạy thì không phải một lời hứa, nó là một câu văn.
 *
 * Test này chạy vế ấy. Nó không đo "clip đẹp không"; nó đo đúng ba thứ mà lời hứa nói:
 *
 * 1. cùng `ms` → **cùng chuỗi SVG**, cả với choreography engine tự sinh lẫn tay viết;
 * 2. cùng chuỗi SVG → **cùng bytes PNG** (resvg không lén đọc giờ);
 * 3. khung `ms = 0` **không lộ** thứ chưa `show` — bài học M51, và cũng là chỗ dễ hỏng
 *    nhất khi ai đó "tối ưu" nhánh `progress <= 0` của `applyChoreography`.
 */
const CONTENT = fileURLToPath(new URL('../../../packages/content/problems', import.meta.url));
const ATLAS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../packages/content/labels.json', import.meta.url)), 'utf8'),
) as LabelAtlas;

const renderer = createRenderer(ENGINE_RENDERERS);

function load(id: string): Problem {
  return JSON.parse(readFileSync(`${CONTENT}/${id}.json`, 'utf8')) as Problem;
}

function stepOf(id: string, stepId: string): Step {
  const step = load(id).solutions.flatMap((s) => s.steps).find((s) => s.id === stepId);
  if (!step) throw new Error(`không có step ${stepId} trong ${id}`);
  return step;
}

function shoot(step: Step, spec: Choreography, ms: number): string {
  if (!step.scene) throw new Error('step không có scene');
  return frameSvg(step.scene, spec, ms, {
    renderer,
    labels: ATLAS,
    width: 480,
    ...(step.anchors ? { anchors: step.anchors } : {}),
  });
}

/** Hai nguồn choreography khác nhau — engine tự sinh, và tác giả viết tay. */
const SOURCES = [
  { name: 'algebra (choreography sinh)', problem: 'extraneous-root-by-squaring', step: 'end' },
  { name: 'board (choreography tay)', problem: 'sieve-primes-100', step: 's1' },
] as const;

describe('CHO-08 — render offline tất định', () => {
  for (const source of SOURCES) {
    const step = stepOf(source.problem, source.step);
    const spec = effectiveChoreography(step);

    it(`${source.name}: có timeline để dựng phim`, () => {
      expect(spec).toBeDefined();
      expect(spec!.phases.length).toBeGreaterThan(0);
    });

    it(`${source.name}: cùng ms cho cùng chuỗi SVG`, () => {
      const length = timelineLength(spec!);
      // Đầu, giữa, cuối. Mốc giữa quan trọng nhất: đó là chỗ duy nhất có pha đang
      // **chạy dở**, tức chỗ duy nhất một phép nội suy sai lệch sẽ hiện ra.
      for (const ms of [0, Math.round(length / 2), length]) {
        expect(shoot(step, spec!, ms)).toBe(shoot(step, spec!, ms));
      }
    });

    it(`${source.name}: cùng chuỗi SVG cho cùng bytes PNG`, () => {
      const svg = shoot(step, spec!, Math.round(timelineLength(spec!) / 2));
      expect(rasterFrame(svg).equals(rasterFrame(svg))).toBe(true);
    });

    it(`${source.name}: hai mốc khác nhau cho hai khung khác nhau`, () => {
      // Không có dòng này thì ba test trên vẫn xanh với một hàm trả hằng số.
      const length = timelineLength(spec!);
      expect(shoot(step, spec!, 0)).not.toBe(shoot(step, spec!, length));
    });
  }
});

describe('khung đầu không lộ thứ chưa hiện', () => {
  for (const source of SOURCES) {
    it(`${source.name}: mọi target của pha \`show\` muộn đều trong suốt ở ms = 0`, () => {
      const step = stepOf(source.problem, source.step);
      const spec = effectiveChoreography(step)!;

      const later = new Set(
        spec.phases.filter((p) => p.kind === 'show' && p.at > 0).flatMap((p) => [...p.targets]),
      );
      expect(later.size).toBeGreaterThan(0);

      // **Đếm số node chạm tới** — bài học M48. Bản đầu dò danh tính bằng regex trên
      // chuỗi SVG; engine bàn cờ đeo danh tính ở `key` (trường của node, không phải
      // thuộc tính), nên nó quét $0$ node và xanh cả khi nhánh `show` của
      // `applyChoreography` đã bị bẻ gãy. Một test không với tới nhánh của nó là một
      // test rỗng đội lốt.
      let checked = 0;
      const seek = (nodes: readonly SvgNode[]): void => {
        for (const node of nodes) {
          const owner = node.attrs['data-el'];
          const id = typeof owner === 'string' ? owner : node.key;
          if (id !== undefined && later.has(id)) {
            expect(node.attrs['opacity']).toBe(0);
            checked += 1;
          }
          if (node.children) seek(node.children);
        }
      };
      seek(frameNodes(step.scene!, spec, 0, { renderer, labels: ATLAS, width: 480 }));
      expect(checked).toBeGreaterThan(0);
    });
  }
});

describe('mốc thời gian tôn trọng hold', () => {
  const spec: Choreography = {
    phases: [
      { id: 'p1', kind: 'show', targets: ['a'], at: 0, duration: 200, anchor: 'a1', hold: true },
      { id: 'p2', kind: 'show', targets: ['b'], at: 200, duration: 200, anchor: 'a1' },
    ],
  };

  it('rơi **trúng** mốc hold, không xấp xỉ', () => {
    const times = frameTimes(spec, 25, 0);
    expect(times).toContain(200);
    expect(times.at(-1)).toBe(400);
  });

  it('mỗi mốc hold và khung cuối đứng hình đúng --hold ms', () => {
    // 25fps = 40ms/khung; --hold 200 ⇒ 5 khung đứng thêm ở mỗi mốc.
    const times = frameTimes(spec, 25, 200);
    expect(times.filter((t) => t === 200)).toHaveLength(6);
    expect(times.filter((t) => t === 400)).toHaveLength(6);
  });

  it('không hold thì không đứng hình giữa chừng', () => {
    const flat: Choreography = { phases: [{ ...spec.phases[0]!, hold: false }, spec.phases[1]!] };
    const times = frameTimes(flat, 25, 200);
    expect(times.filter((t) => t === 200)).toHaveLength(1);
  });
});

describe('gộp khung trùng', () => {
  it('khung byte-identical liền kề gộp thành một, cộng dồn thời lượng', () => {
    const a = Buffer.from('aaa');
    const b = Buffer.from('bbb');
    expect(collapse([a, a, a, b, a], 40)).toEqual([
      { png: a, delayMs: 120 },
      { png: b, delayMs: 40 },
      { png: a, delayMs: 40 },
    ]);
  });
});

describe('ghép APNG', () => {
  const frames = ['x', 'y', 'z'].map((seed, i) =>
    rasterFrame(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="20" height="20">` +
        `<rect width="10" height="10" fill="#fff"/><rect x="${i}" y="0" width="3" height="10" fill="#000"/></svg>`,
    ),
  );

  it('acTL đếm đúng số khung, khung đầu giữ IDAT, khung sau thành fdAT', () => {
    const chunks = readChunks(toApng(frames.map((png) => ({ png, delayMs: 40 }))));
    const kinds = chunks.map((c) => c.type);
    expect(kinds.filter((t) => t === 'acTL')).toHaveLength(1);
    expect(kinds.filter((t) => t === 'fcTL')).toHaveLength(3);
    expect(kinds.filter((t) => t === 'IDAT').length).toBeGreaterThan(0);
    expect(kinds.filter((t) => t === 'fdAT').length).toBeGreaterThan(0);
    expect(kinds.at(-1)).toBe('IEND');

    const actl = chunks.find((c) => c.type === 'acTL')!;
    expect(actl.data.readUInt32BE(0)).toBe(3);
  });

  it('số thứ tự fcTL/fdAT tăng nghiêm ngặt — APNG hỏng nếu không', () => {
    const chunks = readChunks(toApng(frames.map((png) => ({ png, delayMs: 40 }))));
    const seq = chunks
      .filter((c) => c.type === 'fcTL' || c.type === 'fdAT')
      .map((c) => c.data.readUInt32BE(0));
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
    expect(new Set(seq).size).toBe(seq.length);
  });

  it('khung lệch kích thước bị **từ chối**, không ghép bừa', () => {
    const odd = rasterFrame(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="40" height="40"><rect width="10" height="10" fill="#fff"/></svg>`,
    );
    expect(() => toApng([{ png: frames[0]!, delayMs: 40 }, { png: odd, delayMs: 40 }])).toThrow(
      /IHDR khác khung đầu/,
    );
  });
});

describe('từ chối có lời', () => {
  it('engine không tự sinh nhịp và không khai choreography thì không có timeline', () => {
    // Bài bàn cờ không khai choreography: `film` phải nói ra, không dựng một clip
    // đứng hình rồi để người dùng đoán.
    const step = load('sieve-primes-100').solutions[0]!.steps.find(
      (s) => s.scene?.engine === 'board' && !s.choreography,
    );
    expect(step).toBeDefined();
    expect(effectiveChoreography(step!)).toBeUndefined();
  });
});

describe('quầng focus vẽ ra được khi không có CSS', () => {
  it('pha `focus` đang chạy sinh filter trong SVG', () => {
    const step = stepOf('extraneous-root-by-squaring', 'end');
    const spec = effectiveChoreography(step)!;
    const focus = spec.phases.find((p) => p.kind === 'focus')!;
    // Giữa pha `focus` đầu tiên — chỗ `data-phase` đang ở khoảng $(0,1)$.
    const svg = shoot(step, spec, focus.at + Math.round(focus.duration / 2));
    expect(svg).toContain('feDropShadow');
    expect(svg).toMatch(/filter="url\(#focus-\d\)"/);
  });

  it('không có pha nào chạy thì không có defs thừa', () => {
    const step = stepOf('extraneous-root-by-squaring', 'end');
    const spec = effectiveChoreography(step)!;
    expect(shoot(step, spec, 0)).not.toContain('feDropShadow');
  });
});
