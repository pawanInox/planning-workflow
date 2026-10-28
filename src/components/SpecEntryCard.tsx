import { Fragment, type ReactNode } from 'react'
import type { SpecEntry } from '../lib/api'

// A hint, NOT a schema: if an entry happens to carry one of these it reads better as the block's
// heading than as a table row. Everything else — including keys this app has never heard of — is
// rendered generically below, so an entry with none of them loses nothing.
const NAME_KEYS = ['name', 'title', 'label']

const displayName = (entry: SpecEntry) => {
  const key = NAME_KEYS.find(k => typeof entry[k] === 'string' && (entry[k] as string).trim())
  return key ? { key, value: entry[key] as string } : null
}

// Values are undeclared, so nested data is rendered by shape, never by key: objects become nested
// key/value rows, lists of objects a separated stack headed by each item's name, single-field items
// (`{ rule }`, `{ step }`) plain bullets, and short lists of words chips. Raw JSON stays one click
// away in the Spec tab for anything this reads oddly.
type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

const isObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v)
type Scalar = string | number | boolean | null
const isScalar = (v: Json): v is Scalar => v === null || typeof v !== 'object'
// signatures, types, paths and bare identifiers read as code; sentences read as prose even when they
// mention code (`proxy-body-size >= 110m`), so only a value that STARTS like code or is a function type counts
const CODE_KEYS = /^(signature|type|types|path|route|method|syntax|source|returns?|body|response|query|params?|shape|value|values|columns|exts|mime)$/i
const looksLikeCode = (s: string, key?: string) =>
  (key !== undefined && CODE_KEYS.test(key)) || !/\s/.test(s.trim()) || /^[{[(<'"`]|^\S+\(|=>/.test(s.trim())
const HEAD_KEYS = [...NAME_KEYS, 'field', 'id', 'step', 'rule']

function ScalarValue({ v, k }: { v: Scalar; k?: string }) {
  const s = String(v)
  return <span className={typeof v === 'string' && !looksLikeCode(s, k) ? 'sv-text' : 'sv-code'}>{s}</span>
}

// a few scalar fields that fit on a line (`{ th: string, en: string }`) read best inline
const isSmallObject = (v: Json): v is Record<string, Scalar> => isObject(v) && Object.keys(v).length <= 4
  && Object.values(v).every(isScalar) && Object.entries(v).join(' ').length <= 64
const isOneFieldList = (v: Json[]) => v.every(x => isObject(x) && Object.keys(x).length === 1 && isScalar(Object.values(x)[0]))
// Block values get the row's full width under their key: nested in the value column instead, each
// level would add another key column until the values were a few letters wide.
const isBlock = (v: Json) => (isObject(v) && !isSmallObject(v)) || (Array.isArray(v) && !v.every(isScalar) && !isOneFieldList(v))

function SpecValue({ v, k }: { v: Json; k?: string }): ReactNode {
  if (isScalar(v)) return <ScalarValue v={v} k={k} />
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="sv-empty">none</span>
    if (v.every(isScalar)) {
      const words = v.map(String)
      return words.every(w => w.length <= 32)
        ? <ul className="sv-chips">{words.map((w, i) => <li key={i} className="chip code">{w}</li>)}</ul>
        : <ul className="sv-bullets">{words.map((w, i) => <li key={i}><ScalarValue v={w} k={k} /></li>)}</ul>
    }
    // a list of one-field items is really a list of their values
    if (isOneFieldList(v))
      return <ul className="sv-bullets">{v.map((x, i) => <li key={i}><ScalarValue v={Object.values(x as object)[0]} k={Object.keys(x as object)[0]} /></li>)}</ul>
    return <ul className="sv-stack">{v.map((x, i) => <li key={i}><SpecValue v={x} /></li>)}</ul>
  }
  if (isSmallObject(v)) return (
    <span className="sv-inline">
      {Object.entries(v).map(([kk, vv]) => <span key={kk}><span className="sv-k">{kk}</span> <ScalarValue v={vv} k={kk} /></span>)}
    </span>
  )
  const head = HEAD_KEYS.find(h => typeof v[h] === 'string' && (v[h] as string).trim())
  const rows = Object.entries(v).filter(([key]) => key !== head)
  return (
    <div className="sv-obj">
      {head && <div className="sv-head">{v[head] as string}</div>}
      {rows.length > 0 && <Rows rows={rows} />}
    </div>
  )
}

function Rows({ rows }: { rows: [string, Json][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => {
        // a plain object gets a left rule; a list of objects already rules each item
        const wide = isBlock(v) ? (isObject(v) ? ' wide nest' : ' wide') : ''
        return <Fragment key={k}><dt className={wide}>{k}</dt><dd className={wide}><SpecValue v={v} k={k} /></dd></Fragment>
      })}
    </dl>
  )
}

/**
 * One spec entry: id chip, optional display name, then every other field as a key/value row.
 * The Spec tab and the sequence-arrow hover card both print entries through this, so they cannot
 * drift. No `dim` prop — the Spec tab dims through CSS (`.has-hl .entry:not(.hl)`), which is why
 * the same card renders undimmed anywhere else.
 */
export function SpecEntryCard({ entry, hot = false }: { entry: SpecEntry; hot?: boolean }) {
  const named = displayName(entry)
  const rows = Object.entries(entry).filter(([k]) => k !== 'id' && k !== named?.key)
  return (
    // data-entry: SpecPanel finds entries by it for scroll-to-match and the chip "ping"
    <div data-entry={entry.id} className={`entry${hot ? ' hl' : ''}`}>
      <div className="entry-h">
        <span className={`chip code${hot ? ' accent' : ''}`}>{entry.id}</span>
        {named && <b>{named.value}</b>}
      </div>
      {rows.length > 0 && <Rows rows={rows as [string, Json][]} />}
    </div>
  )
}
