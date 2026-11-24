// expo-iap needs the phone's store; tests use src/lib/purchases' ProStore with a fake store instead.
const sub = { remove() {} };
module.exports = {
  initConnection: async () => false,
  endConnection: async () => true,
  fetchProducts: async () => [],
  getAvailablePurchases: async () => [],
  finishTransaction: async () => {},
  requestPurchase: async () => null,
  restorePurchases: async () => {},
  purchaseUpdatedListener: () => sub,
  purchaseErrorListener: () => sub,
};
