// No store on the web build (used for the walkthrough tests): Pro can't be bought here.
import type { ProStore } from './purchases';

export const store: ProStore = {
  connect: async () => false,
  price: async () => null,
  owned: async () => false,
  buy: async () => {},
  restore: async () => false,
  listen: () => () => {},
  disconnect: async () => {},
};
