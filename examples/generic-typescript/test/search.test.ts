import { expect, it } from 'vitest';

import { SearchService } from '../src/search.js';

it('proves the portable fixture service contract', async () => {
  const service = new SearchService({ search: async (query) => [query] });
  await expect(service.search(' context ')).resolves.toEqual(['context']);
});
