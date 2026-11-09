import { ShieldCheck, UserCheck, UserMinus, Users as UsersIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { ErrorBanner, Field, NoticeBanner, Section, SimpleTable, Td } from '@/components/order-to-cash/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { StatCard } from '@/components/ui/stat-card'
import { approveUser, listAppUsers, removeUser, setUserRole, type AppUser } from '@/lib/api/users'
import { useAuth } from '@/lib/auth'
import { formatDate } from '@/lib/format'
import { useAction, useAsync } from '@/lib/use-async'

export function Users() {
  const { profile, refreshProfile, signOut } = useAuth()
  const { data, loading, error, reload } = useAsync(listAppUsers, [])
  const users = useMemo(() => data ?? [], [data])
  const action = useAction()
  const [removing, setRemoving] = useState<AppUser | null>(null)

  const admins = users.filter((u) => u.role === 'admin')
  const pending = users.filter((u) => u.status === 'pending')
  const firstUserId = users[0]?.id

  const run = async (fn: () => Promise<unknown>) => {
    if (await action.run(fn)) {
      reload()
      await refreshProfile()
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <PageHeader title="Users" description="Who can sign in, and who can manage access." />
      <div className="grid grid-cols-2 gap-4 px-6 py-5 lg:grid-cols-3">
        <StatCard label="Users" value={users.length.toString()} icon={UsersIcon} />
        <StatCard label="Admins" value={admins.length.toString()} icon={ShieldCheck} />
        <StatCard
          label="Awaiting Approval"
          value={pending.length.toString()}
          icon={UserCheck}
          tone={pending.length ? 'danger' : 'default'}
        />
      </div>

      <div className="space-y-6 px-6 pb-6">
        <ErrorBanner message={error ?? action.error} />
        {admins.length === 1 && (
          <NoticeBanner>
            There must always be an admin. To remove {admins[0].id === profile?.id ? 'yourself' : admins[0].email},
            you’ll be asked to choose who takes over.
          </NoticeBanner>
        )}

        <Section title="Accounts" flush>
          {loading && !data ? (
            <div className="px-5 py-6 text-sm text-ink-muted">Loading...</div>
          ) : (
            <SimpleTable head={['Email', 'Role', 'Status', 'Signed up', '']}>
              {users.map((u) => {
                const isMe = u.id === profile?.id
                const lastAdmin = u.role === 'admin' && admins.length === 1
                return (
                  <tr key={u.id}>
                    <Td>
                      <span className="font-medium">{u.email}</span>
                      {isMe && <span className="ml-2 text-xs text-ink-subtle">(you)</span>}
                      {u.id === firstUserId && <span className="ml-2 text-xs text-ink-subtle">· first sign-up</span>}
                    </Td>
                    <Td>
                      <Badge variant={u.role === 'admin' ? 'info' : 'neutral'}>
                        {u.role === 'admin' ? 'Admin' : 'Member'}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge variant={u.status === 'active' ? 'success' : 'warning'} dot>
                        {u.status === 'active' ? 'Active' : 'Pending approval'}
                      </Badge>
                    </Td>
                    <Td>{formatDate(u.createdAt.slice(0, 10))}</Td>
                    <Td className="text-right">
                      <span className="flex justify-end gap-1">
                        {u.status === 'pending' && (
                          <Button size="sm" disabled={action.pending} onClick={() => run(() => approveUser(u.id))}>
                            Approve
                          </Button>
                        )}
                        {u.role === 'member' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={action.pending}
                            onClick={() => run(() => setUserRole(u.id, 'admin'))}
                          >
                            Make admin
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={action.pending || lastAdmin}
                            title={lastAdmin ? 'There must always be an admin' : undefined}
                            onClick={() => run(() => setUserRole(u.id, 'member'))}
                          >
                            Make member
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={action.pending} onClick={() => setRemoving(u)}>
                          <UserMinus className="h-4 w-4" />
                          {u.status === 'pending' ? 'Reject' : 'Remove'}
                        </Button>
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </SimpleTable>
          )}
        </Section>
      </div>

      {removing && (
        <RemoveUserDialog
          user={removing}
          users={users}
          isSelf={removing.id === profile?.id}
          onClose={() => setRemoving(null)}
          onRemoved={async () => {
            if (removing.id === profile?.id) {
              await signOut()
              return
            }
            setRemoving(null)
            reload()
          }}
        />
      )}
    </div>
  )
}

function RemoveUserDialog({
  user,
  users,
  isSelf,
  onClose,
  onRemoved,
}: {
  user: AppUser
  users: AppUser[]
  isSelf: boolean
  onClose: () => void
  onRemoved: () => void
}) {
  const otherAdmins = users.filter((u) => u.role === 'admin' && u.id !== user.id)
  const needsSuccessor = user.role === 'admin' && otherAdmins.length === 0
  const candidates = users.filter((u) => u.id !== user.id)
  const [successor, setSuccessor] = useState('')
  const action = useAction()

  const submit = async () => {
    if (await action.run(() => removeUser(user.id, needsSuccessor ? successor : null))) onRemoved()
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={user.status === 'pending' ? 'Reject sign-up' : isSelf ? 'Remove your account' : 'Remove user'}
      subtitle={user.email}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          {user.status === 'pending'
            ? 'Their account is deleted. They can sign up again later.'
            : 'Their account is deleted and they lose access immediately. The records they created stay.'}
          {isSelf && ' You will be signed out.'}
        </p>
        {needsSuccessor &&
          (candidates.length === 0 ? (
            <ErrorBanner message="This is the only account, so there is no one to take over as admin. Invite someone first." />
          ) : (
            <Field
              label="New admin"
              hint="There must always be an admin. They are approved and promoted before this account is removed."
            >
              <Select value={successor} onChange={(e) => setSuccessor(e.target.value)}>
                <option value="">Choose who takes over…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                    {u.status === 'pending' ? ' (pending approval)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ))}
        <ErrorBanner message={action.error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={action.pending || (needsSuccessor && !successor)}>
            {action.pending ? 'Removing…' : needsSuccessor ? 'Assign admin & remove' : 'Remove'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
