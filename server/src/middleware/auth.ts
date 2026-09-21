import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth';

declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
      user?: {
        id: string;
        userId: string;
        role: string;
      };
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded.tenantId) {
      return res.status(401).json({ error: 'Token inválido: tenantId ausente' });
    }

    req.tenantId = decoded.tenantId;
    
    if (decoded.userId && decoded.role) {
      req.user = {
        id: decoded.userId,
        userId: decoded.userId,
        role: decoded.role,
      };
    }

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Sessão expirada ou token inválido' });
  }
};
