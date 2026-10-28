import { forwardRef, useEffect, useState } from 'react'
import { api, type ApiToken } from '../lib/api'
import { CopyButton } from './TaskCard'
import { Icon } from './Icon'

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
// last use moves within a day, so it carries the time too
const at = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never'

/**
 * Personal API tokens for agents (`/yak-dai`, curl): create one named token, copy it once, revoke it
 * when done. A native <dialog> opened by the account menu; the raw token exists only in `fresh`.
 */
export const TokensDialog = forwardRef<HTMLDialogElement, { open: boolean; onClose: () => void }>(function TokensDialog({ open, onClose }, ref) {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(null)
  const [armed, setArmed] = useState<string | null>(null) // the token whose Revoke was clicked once
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const reload = () => api.listTokens().then(setTokens).catch(e => setError(String(e.message ?? e)))
  // refetch on every open: last-used times move while the dialog is closed
  useEffect(() => { if (open) { setFresh(null); setArmed(null); setError(''); void reload() } }, [open])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (creating) return // a double submit would mint two tokens
    setCreating(true)
    try {
      const t = await api.createToken(name.trim())
      setFresh({ name: t.name, token: t.token })
      setName(''); setError('')
      await reload()
    } catch (err: any) { setError(String(err.message ?? err)) } finally { setCreating(false) }
  }

  async function revoke(id: string) {
    if (armed !== id) { setArmed(id); return } // second click confirms; no nested dialog
    try { await api.revokeToken(id); setArmed(null); setError(''); await reload() } catch (err: any) { setError(String(err.message ?? err)) }
  }

  return (
    <dialog ref={ref} className="tokens" aria-labelledby="tokens-title" onClose={() => { setFresh(null); onClose() }}>
      <div className="tokens-head">
        <h3 id="tokens-title">API tokens</h3>
        <form method="dialog"><button className="btn btn-ghost sq" aria-label="Close"><Icon name="x" /></button></form>
      </div>
      <p>Agents like <code>/yak-dai</code> send a token as <code>Authorization: Bearer …</code> and act as you. Set it with <code>export YAK_DAI_TOKEN=…</code>.</p>

      {fresh && (
        <div className="token-fresh" role="status">
          <b>{fresh.name}</b>
          <code className="token-raw">{fresh.token}</code>
          <div className="token-fresh-row">
            <span>Copy it now — it won't be shown again.</span>
            <CopyButton icon="copy" label="Copy token" title="Copy the token" text={() => fresh.token} />
          </div>
        </div>
      )}

      <form className="token-new" onSubmit={create}>
        <label htmlFor="token-name" className="sr">Token name</label>
        <input id="token-name" className="input" placeholder="Name, e.g. laptop claude" maxLength={60}
          value={name} onChange={e => setName(e.target.value)} />
        <button className="btn btn-primary" disabled={!name.trim() || creating}>Create token</button>
      </form>

      {error && <div className="callout warn" role="alert"><Icon name="alert" /><span>{error}</span></div>}

      <ul className="token-list">
        {tokens?.length === 0 && <li className="token-empty">No tokens yet.</li>}
        {tokens?.map(t => (
          <li key={t.id}>
            <div className="token-meta">
              <b>{t.name}</b>
              <span className="mono">ydk_…{t.last4}</span>
              <span>created {day(t.createdAt)} · last used {at(t.lastUsedAt)}</span>
            </div>
            <button className={`btn sm ${armed === t.id ? 'btn-danger' : 'btn-ghost'}`} onClick={() => revoke(t.id)}>
              {armed === t.id ? 'Confirm revoke' : 'Revoke'}
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  )
})
