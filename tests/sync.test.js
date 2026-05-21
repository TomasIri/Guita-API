import { describe, it, expect } from 'vitest';
import { validateUrl } from '../src/services/sync.js';

describe('validateUrl', () => {
  it('accepts a valid Apps Script URL', () => {
    expect(validateUrl('https://script.google.com/macros/s/AKfy/exec')).toBe(true);
  });

  it('rejects empty string', () => expect(validateUrl('')).toBe(false));
  it('rejects null', () => expect(validateUrl(null)).toBe(false));
  it('rejects undefined', () => expect(validateUrl(undefined)).toBe(false));

  it('rejects javascript: scheme', () => {
    expect(validateUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URI', () => {
    expect(validateUrl('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('rejects http (not https)', () => {
    expect(validateUrl('http://script.google.com/macros/s/abc/exec')).toBe(false);
  });

  it('rejects a different host', () => {
    expect(validateUrl('https://evil.com/macros/s/abc/exec')).toBe(false);
  });

  it('rejects script.google.com without /macros/s/ path', () => {
    expect(validateUrl('https://script.google.com/other/path')).toBe(false);
  });

  it('rejects a plain URL with wrong path', () => {
    expect(validateUrl('https://script.google.com/')).toBe(false);
  });
});
