import { createMemoryRepository } from '@/data/memory/memory-repository';
import { runRepositoryContract, rec, txn } from '@/data/memory/repository-contract';

runRepositoryContract('memory', async () => createMemoryRepository());

describe('memory repository seed', () => {
  it('starts from the seed', async () => {
    const repo = createMemoryRepository({ recurring: [rec()], transactions: [txn()] });
    await repo.init();
    expect(await repo.listRecurring()).toHaveLength(1);
    expect(await repo.listTransactions()).toHaveLength(1);
    expect((await repo.listCategories()).length).toBeGreaterThan(10);
  });
});
