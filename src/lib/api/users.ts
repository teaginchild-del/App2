import { supabase } from '@/lib/supabase'

export type AppUserRole = 'admin' | 'member'
export type AppUserStatus = 'pending' | 'active'

export interface AppUser {
  id: string
  email: string
  role: AppUserRole
  status: AppUserStatus
  createdAt: string
  approvedAt: string | null
}

function mapUser(row: Record<string, unknown>): AppUser {
  return {
    id: row.id as string,
    email: row.email as string,
    role: row.role as AppUserRole,
    status: row.status as AppUserStatus,
    createdAt: row.created_at as string,
    approvedAt: (row.approved_at as string | null) ?? null,
  }
}

/** The signed-in user's own access record, or null if their account was removed. */
export async function getMyProfile(userId: string): Promise<AppUser | null> {
  const { data, error } = await supabase.from('app_users').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data ? mapUser(data) : null
}

export async function listAppUsers(): Promise<AppUser[]> {
  const { data, error } = await supabase.from('app_users').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapUser)
}

// Admin actions. Each runs in the database, which checks the caller is an
// admin and refuses any change that would leave the app without an admin.

export async function approveUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('approve_app_user', { p_user_id: userId })
  if (error) throw error
}

export async function setUserRole(userId: string, role: AppUserRole): Promise<void> {
  const { error } = await supabase.rpc('set_app_user_role', { p_user_id: userId, p_role: role })
  if (error) throw error
}

/** Deletes the account. Removing the only admin requires naming `newAdminId`. */
export async function removeUser(userId: string, newAdminId?: string | null): Promise<void> {
  const { error } = await supabase.rpc('remove_app_user', { p_user_id: userId, p_new_admin_id: newAdminId ?? null })
  if (error) throw error
}
