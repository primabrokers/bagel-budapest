import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGET_ORDER, WIDGET_REGISTRY, resolveWidgetOrder } from './widgetRegistry';

describe('WIDGET_REGISTRY', () => {
  it('gives every widget a non-empty key and label', () => {
    for (const widget of WIDGET_REGISTRY) {
      expect(widget.key.trim()).not.toBe('');
      expect(widget.label.trim()).not.toBe('');
    }
  });

  it('has no duplicate keys', () => {
    const keys = WIDGET_REGISTRY.map((w) => w.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('DEFAULT_WIDGET_ORDER', () => {
  it('lists every registry key exactly once', () => {
    const registryKeys = new Set(WIDGET_REGISTRY.map((w) => w.key));
    expect(new Set(DEFAULT_WIDGET_ORDER).size).toBe(DEFAULT_WIDGET_ORDER.length);
    expect(DEFAULT_WIDGET_ORDER.length).toBe(registryKeys.size);
    for (const key of DEFAULT_WIDGET_ORDER) {
      expect(registryKeys.has(key)).toBe(true);
    }
  });
});

describe('resolveWidgetOrder', () => {
  it('falls back to the default order when nothing is persisted', () => {
    expect(resolveWidgetOrder(undefined)).toEqual(DEFAULT_WIDGET_ORDER);
  });

  it('falls back to the default order for an empty persisted list', () => {
    expect(resolveWidgetOrder([])).toEqual(DEFAULT_WIDGET_ORDER);
  });

  it('keeps a persisted order that matches the registry exactly', () => {
    const reversed = [...DEFAULT_WIDGET_ORDER].reverse();
    expect(resolveWidgetOrder(reversed)).toEqual(reversed);
  });

  it('drops a key the registry no longer recognises', () => {
    const persisted = ['countdown', 'retiredWidget', 'eventCard'];
    const result = resolveWidgetOrder(persisted);
    expect(result).not.toContain('retiredWidget');
    expect(result[0]).toBe('countdown');
    expect(result[1]).toBe('eventCard');
  });

  it('appends a registry key missing from a stale persisted list, in registry order', () => {
    const persisted = DEFAULT_WIDGET_ORDER.filter((key) => key !== 'quickAdd');
    const result = resolveWidgetOrder(persisted);
    expect(result).toEqual(DEFAULT_WIDGET_ORDER);
  });

  it('drops duplicate keys in a persisted list', () => {
    const persisted = ['countdown', 'countdown', 'eventCard'];
    const result = resolveWidgetOrder(persisted);
    expect(result.filter((key) => key === 'countdown')).toHaveLength(1);
  });

  it('always returns every registry key exactly once, regardless of garbage input', () => {
    const persisted = ['bogus', 'countdown', 'alsoBogus'];
    const result = resolveWidgetOrder(persisted);
    const registryKeys = new Set(WIDGET_REGISTRY.map((w) => w.key));
    expect(new Set(result).size).toBe(result.length);
    expect(result.length).toBe(registryKeys.size);
    for (const key of result) expect(registryKeys.has(key)).toBe(true);
  });
});
