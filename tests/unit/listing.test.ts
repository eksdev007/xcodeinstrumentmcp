import { describe, expect, test } from 'vitest';

import { normalizeDeviceSelector } from '../../src/application/listing.js';

describe('device selector normalization', () => {
  test('extracts simulator UUIDs from xctrace display labels', () => {
    expect(normalizeDeviceSelector('iPhone Air Simulator (26.2) (BE673C04-EC65-4D6A-B3B1-F93AB9406D3C)')).toBe(
      'BE673C04-EC65-4D6A-B3B1-F93AB9406D3C',
    );
  });

  test('passes through plain names unchanged', () => {
    expect(normalizeDeviceSelector('iPhone 17 Pro')).toBe('iPhone 17 Pro');
  });
});
