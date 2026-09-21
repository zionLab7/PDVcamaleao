/**
 * Client-side Auth Utilities
 * Pure helper functions for role-based access control (RBAC).
 * Actual authentication is done via API calls in api.ts.
 */

import { User } from '../types';

// ─── Role-Based Access Control ──────────────────────────────────────

export const auth = {
  canViewCostsAndProfit: (user: User | null): boolean =>
    !!user && (user.role === 'admin' || user.role === 'manager'),

  canAccessReports: (user: User | null): boolean =>
    !!user && (user.role === 'admin' || user.role === 'manager'),

  canCancelSale: (user: User | null): boolean =>
    !!user && (user.role === 'admin' || user.role === 'manager'),

  canManageStock: (user: User | null): boolean =>
    !!user && (user.role === 'admin' || user.role === 'manager'),

  canPerformCashMovement: (user: User | null): boolean =>
    !!user && (user.role === 'admin' || user.role === 'manager'),

  canManageUsers: (user: User | null): boolean =>
    !!user && user.role === 'admin',

  canManageSettings: (user: User | null): boolean =>
    !!user && user.role === 'admin',
};
