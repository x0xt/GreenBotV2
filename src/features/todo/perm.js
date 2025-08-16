// src/features/todo/perm.js
import { OWNER_ID, ADMIN_ID_LIST } from '../../shared/constants.js';

export function isOwner(userId) {
  return !!OWNER_ID && String(userId) === String(OWNER_ID);
}

// If you ever want to allow admins too, flip callers to use this:
export function isOwnerOrAdmin(userId) {
  if (isOwner(userId)) return true;
  return ADMIN_ID_LIST.includes(String(userId));
}
