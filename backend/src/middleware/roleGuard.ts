import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '@/config';
import { AuthenticatedRequest, JWTPayload } from '@/types';

/**
 * Rejects admin JWTs from accessing SME business and user routes.
 * Enforces session isolation so administrative tokens cannot access
 * or mutate regular SME business records.
 */
export const rejectAdminOnUserRoutes = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  // If req.user was already populated by authenticate middleware
  if (req.user?.role === 'admin') {
    res.status(403).json({
      error: {
        code: 'ADMIN_CANNOT_USE_USER_APP',
        message:
          'Admin sessions cannot access SME business data — please log out of Admin and log in as a business user.',
      },
    });
    return;
  }

  // If req.user is not yet populated, verify the token to check role.
  // Using verify (not decode) ensures the role claim is cryptographically
  // trustworthy — a crafted token with role=admin but invalid signature
  // must not be treated as an admin session (it will be 401 downstream).
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, config.jwt.accessSecret, {
        algorithms: ['HS256'],
      }) as JWTPayload;
      if (decoded.role === 'admin') {
        res.status(403).json({
          error: {
            code: 'ADMIN_CANNOT_USE_USER_APP',
            message:
              'Admin sessions cannot access SME business data — please log out of Admin and log in as a business user.',
          },
        });
        return;
      }
    } catch {
      // Invalid/expired token — let downstream authenticate middleware
      // return the correct 401. We only block *verified* admin sessions here.
    }
  }

  next();
};
