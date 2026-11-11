/**
 * Every request carries a server-minted id (plan §7.1). It is set once by the
 * `requestId` middleware and read by the logger and the error envelope.
 */
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export {};
