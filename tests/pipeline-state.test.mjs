import assert from 'node:assert/strict';
import { PIPELINE_STEPS, pipelineMask, visibleIndex } from '../src/js/pipeline-view.js';

assert.equal(PIPELINE_STEPS.length, 11);
assert.deepEqual(PIPELINE_STEPS.map(s => s.short), ['窗口', '分块', '投影', '位置', '遮挡', '编码', '插回', '解码', '损失', '池化', '线性头']);

// 65% of 192 = 125 (rounded); structured modes keep the same fraction approximately.
assert.equal(pipelineMask(6, 'random').size, 125);
assert.equal(pipelineMask(6, 'time').size, 126);
assert.equal(pipelineMask(6, 'channel').size, 128);
assert.equal(pipelineMask(6, 'inference').size, 0);
assert.equal(pipelineMask(3, 'random').size, 62);
assert.equal(pipelineMask(3, 'inference').size, 0);

// Every mask index is unique and in range.
for (const mode of ['random', 'time', 'channel']) {
  const mask = pipelineMask(6, mode);
  assert.equal(new Set(mask).size, mask.size);
  for (const i of mask) assert.ok(Number.isInteger(i) && i >= 0 && i < 192, `${mode} ${i}`);
}

// Visible ordinals count only unmasked tokens before the target.
const mask = pipelineMask(6, 'random');
let ordinal = 0, checked = 0;
for (let i = 0; i < 192; i++) {
  const row = Math.floor(i / 32), col = i % 32;
  if (mask.has(i)) {
    assert.equal(visibleIndex(6, mask, row, col), -1);
  } else {
    assert.equal(visibleIndex(6, mask, row, col), ordinal);
    ordinal++;
    checked++;
  }
}
assert.equal(ordinal, 192 - mask.size);
assert.equal(checked, 192 - mask.size);

// Time masking hides whole columns, channel masking hides whole rows.
const time = pipelineMask(6, 'time');
for (let c = 0; c < 32; c++) {
  const hidden = Array.from({ length: 6 }, (_, r) => time.has(r * 32 + c));
  assert.ok(hidden.every(Boolean) || hidden.every(v => !v), `column ${c}`);
}
const channel = pipelineMask(6, 'channel');
for (let r = 0; r < 6; r++) {
  const hidden = Array.from({ length: 32 }, (_, c) => channel.has(r * 32 + c));
  assert.ok(hidden.every(Boolean) || hidden.every(v => !v), `row ${r}`);
}

console.log('pipeline steps, masking modes, and visible ordinals passed');
