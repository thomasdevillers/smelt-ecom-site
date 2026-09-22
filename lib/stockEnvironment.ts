// Development uses a separate namespace even if .env.local contains live credentials.
export const localStockTest = () => process.env.NODE_ENV === 'development' && !process.env.VERCEL;
export const stockScope = () => localStockTest() ? 'local-preorder-test' : process.env.PAYSTACK_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test';
