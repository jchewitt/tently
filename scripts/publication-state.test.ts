import { expect, it } from 'vitest';
import { selectPublicationState } from './publication-state.mjs';

it('selects the latest earlier attempt without mixing releases or current-attempt artifacts', () => {
  const artifacts = [
    { name: 'weftlet-release-1' }, { name: 'weftlet-publication-state-2' },
    { name: 'weftlet-publication-state-1' }, { name: 'weftlet-publication-state-3' },
  ];
  expect(selectPublicationState(artifacts, 3)).toBe('weftlet-publication-state-2');
  expect(selectPublicationState(artifacts, 1)).toBe('');
});

it('fails rather than discarding expired or ambiguous acceptance receipts', () => {
  expect(() => selectPublicationState([{ name: 'weftlet-publication-state-1', expired: true }], 2)).toThrow('expired');
  expect(() => selectPublicationState([{ name: 'weftlet-publication-state-1' },
    { name: 'weftlet-publication-state-1' }], 2)).toThrow('Ambiguous');
});
