import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Star,
  GitCommitVertical,
  GitPullRequest,
  CircleDot,
  GitBranch,
  Bell,
  KeyRound,
  ArrowLeft,
  Folder,
  File,
  GitFork,
  ExternalLink,
  Lock,
  Globe,
  MessageSquare,
} from 'lucide-react'
import { useStore, setSetting, setUi, navigate, newTab } from '../store'
import { play } from '../sound'
import { isNative } from '../native'
import Aura from '../components/Aura'
import {
  me,
  repos,
  notifications,
  assigned,
  events,
  webUrl,
  kindLabel,
  timeAgo,
  LANG_COLOR,
  startGitHubPoll,
  clientId,
  startDeviceLogin,
  pollDeviceLogin,
  useGhInvalid,
  repo as fetchRepo,
  readme,
  contents,
  rawFile,
  commits,
  commit,
  issues,
  pulls,
  issueDetail,
  issueComments,
  renderMarkdown,
  cleanHtml,
} from './gh'
import './github.css'

const TABS = { feed: 'Akış', repos: 'Depolar', notifs: 'Bildirimler', assigned: 'Bana atananlar' }
const RTABS = { readme: 'README', files: 'Dosyalar', commits: 'Commitler', issues: "Issue'lar", prs: "PR'lar" }
const FEED = new Set(['PushEvent', 'PullRequestEvent', 'IssuesEvent', 'WatchEvent', 'CreateEvent'])
const ACT = { opened: 'açtı', closed: 'kapattı', reopened: 'yeniden açtı' }
const REF = { repository: 'depo', branch: 'dal', tag: 'etiket' }
const IMG = /\.(png|jpe?g|gif|svg|webp)$/i
const MD = /\.(md|markdown)$/i
const MAX_SRC = 300 * 1024
const fmt = (n) => (n ?? 0).toLocaleString('tr-TR')
const bytes = (n) =>
  n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1).replace('.', ',')} KB` : `${(n / 1048576).toFixed(1).replace('.', ',')} MB`

// Harici bağlantı: native'de uygulama içinde açılır, web'de yeni sekmede.
const ext = (url) => (isNative ? navigate(url) : window.open(url, '_blank', 'noopener'))

// Depo görünümü dışarıdan açılabilsin diye modül düzeyinde bir abone listesi.
// Panel kapalıyken çağrılırsa istek bekletilir ve bir sonraki mount'ta uygulanır.
let pendingRepo = null
let seq = 0
const repoSubs = new Set()
const pick = (full, initial) => ({ id: ++seq, full, initial: initial || null })
export function openRepo(full, initial) {
  if (!full) return
  pendingRepo = pick(full, initial)
  repoSubs.forEach((f) => f())
}

// Etkinliği satır bilgisine çevirir.
function describe(e) {
  const p = e.payload || {}
  const full = e.repo?.name || ''
  if (!full) return null
  switch (e.type) {
    case 'PushEvent': {
      const n = p.size ?? p.distinct_size ?? p.commits?.length
      const msg = p.commits?.[p.commits.length - 1]?.message
      return {
        Icon: GitCommitVertical,
        text: n > 0 ? `${n} commit → ${full}` : `Gönderim → ${full}`,
        sub: msg ? String(msg).split('\n')[0] : undefined,
        meta: full,
        open: { full },
      }
    }
    case 'PullRequestEvent': {
      const pr = p.pull_request || {}
      const act = p.action === 'closed' && pr.merged ? 'birleştirdi' : ACT[p.action] || 'güncelledi'
      return {
        Icon: GitPullRequest,
        text: pr.title || `PR #${pr.number}`,
        meta: `PR #${pr.number} ${act} · ${full}`,
        open: { full, initial: { tab: 'prs', num: pr.number } },
      }
    }
    case 'IssuesEvent': {
      const is = p.issue || {}
      const act = ACT[p.action] || 'güncelledi'
      return {
        Icon: CircleDot,
        text: is.title || `issue #${is.number}`,
        meta: `issue #${is.number} ${act} · ${full}`,
        open: { full, initial: { tab: 'issues', num: is.number } },
      }
    }
    case 'WatchEvent':
      return { Icon: Star, text: `${full} deposunu yıldızladı`, meta: full, open: { full } }
    case 'CreateEvent':
      return { Icon: GitBranch, text: p.ref || full, meta: `${REF[p.ref_type] || 'öğe'} oluşturuldu · ${full}`, open: { full } }
    default:
      return null
  }
}

// Bildirim konusunun API adresinden sekme ve numara çıkarır (pulls, issues, commits).
function subjectTarget(s) {
  const m = (s?.url || '').match(/\/(pulls|issues|commits)\/([^/?#]+)$/)
  if (!m) return undefined
  if (m[1] === 'commits') return { tab: 'commits', sha: m[2] }
  return { tab: m[1] === 'pulls' ? 'prs' : 'issues', num: Number(m[2]) }
}

// Veri yükleyici: token/bağımlılık değişince ya da "yeniden dene"de yeniden çeker. İstek iptal edilebilir.
function useData(load, deps) {
  const [s, setS] = useState({ status: 'loading' })
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    const ctl = new AbortController()
    setS({ status: 'loading' })
    load(ctl.signal).then(
      (data) => live && setS({ status: 'ok', data }),
      (e) => live && setS({ status: 'error', msg: e.message }),
    )
    return () => {
      live = false
      ctl.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n])
  return [s, () => setN((x) => x + 1)]
}

const Shell = ({ children }) => (
  <div className="page gh tex">
    <Aura kind="orb" still />
    <div className="settings-inner gh-inner">{children}</div>
  </div>
)

const Skeleton = ({ n = 3 }) => (
  <div className="stack" aria-hidden>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="card ghost" style={{ '--i': i }} />
    ))}
  </div>
)

const ErrBox = ({ msg, onRetry }) => (
  <div className="card gh-err" role="alert">
    <p>{msg}</p>
    <button className="link" onClick={onRetry}>
      Yeniden dene
    </button>
  </div>
)

// Yükleniyor / hata / boş / liste durumlarını tek yerde toplar.
function Panel({ s, again, n, empty, children }) {
  if (s.status === 'loading') return <Skeleton />
  if (s.status === 'error') return <ErrBox msg={s.msg} onRetry={again} />
  if (!n) return <p className="gh-empty">{empty}</p>
  return <div className="stack">{children}</div>
}

const Row = ({ Icon, text, sub, meta, time, unread, onClick, i }) => (
  <button className="card gh-row" style={{ '--i': i }} onClick={onClick}>
    <span className="gh-ic">
      <Icon size={16} strokeWidth={1.75} />
    </span>
    <span className="gh-main">
      <span className="gh-text">{text}</span>
      {sub && <span className="gh-sub">{sub}</span>}
      <span className="gh-meta">
        <span>{meta}</span>
        {time && <time>{time}</time>}
      </span>
    </span>
    {unread && <i className="gh-unread" aria-label="okunmamış" />}
  </button>
)

// Etiket haplari (issue ve PR).
const Labels = ({ list }) =>
  list?.length ? (
    <span className="gh-labels">
      {list.map((l) => (
        <span key={typeof l === 'string' ? l : l.id || l.name} className="gh-label">
          {l.color && <i className="gh-dot" style={{ background: `#${l.color}` }} />}
          {typeof l === 'string' ? l : l.name}
        </span>
      ))}
    </span>
  ) : null

// Depo içi alt görünümlerin üst çubuğu (kendi geri oku).
const SubBar = ({ onBack, title }) => (
  <div className="gh-subbar">
    <button className="gh-back" onClick={onBack} aria-label="Geri">
      <ArrowLeft size={20} strokeWidth={1.75} />
    </button>
    <span className="gh-subtitle">{title}</span>
  </div>
)

// Markdown/HTML içindeki bağlantılar uygulama dışında, harici olarak açılır.
const openLink = (e) => {
  const a = e.target.closest?.('a[href]')
  if (!a) return
  e.preventDefault()
  ext(a.href)
}

// Erişim anahtarı formu: anahtar önce doğrulanır; geçersizse kaydedilmez.
function TokenForm() {
  const [v, setV] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const save = async (e) => {
    e.preventDefault()
    const t = v.trim()
    if (!t || busy) return
    setBusy(true)
    setErr('')
    try {
      await me(t)
      setSetting('ghToken', t)
      play('toggle')
    } catch (x) {
      setErr(x.message)
      setBusy(false)
    }
  }

  return (
    <>
      <p>
        <button className="link" onClick={() => navigate('https://github.com/settings/tokens')}>
          github.com/settings/tokens
        </button>{' '}
        adresinden “repo, notifications, read:user” yetkili bir anahtar oluştur ve aşağıya yapıştır. Anahtar yalnızca bu cihazda saklanır.
      </p>
      <form className="gh-form" onSubmit={save}>
        <input
          className="text"
          type="password"
          value={v}
          placeholder="ghp_… ya da github_pat_…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setV(e.target.value)}
          aria-label="GitHub anahtarı"
        />
        <button className="gh-go" type="submit" disabled={busy || !v.trim()}>
          {busy ? 'Denetleniyor' : 'Bağla'}
        </button>
      </form>
      {err && <p className="gh-err-line">{err}</p>}
    </>
  )
}

// Android: tek dokunuşla cihaz akışı (kullanıcı kodu GitHub sayfasına girer).
function DeviceLogin() {
  const [st, setSt] = useState('idle') // idle | starting | waiting | error
  const [info, setInfo] = useState(null)
  const [msg, setMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const ctl = useRef(null)

  useEffect(() => () => ctl.current?.abort(), [])

  const cancel = () => {
    ctl.current?.abort()
    setSt('idle')
    setInfo(null)
  }

  const start = async () => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    setSt('starting')
    setInfo(null)
    setMsg('')
    setCopied(false)
    try {
      const d = await startDeviceLogin()
      if (c.signal.aborted) return
      setInfo(d)
      setSt('waiting')
      newTab(d.verification_uri, { keepUi: true })
      const token = await pollDeviceLogin(d.device_code, d.interval, c.signal)
      if (c.signal.aborted) return
      setSetting('ghToken', token)
      setUi('github')
      play('open')
    } catch (x) {
      if (c.signal.aborted) return
      setMsg(x.message)
      setSt('error')
    }
  }

  const copy = () =>
    navigator.clipboard?.writeText(info.user_code).then(
      () => setCopied(true),
      () => setCopied(false),
    )

  return (
    <section className="card gh-device" style={{ '--i': 0 }}>
      {st === 'waiting' && info ? (
        <>
          <p className="gh-hint">Açılan GitHub sayfasına bu kodu gir</p>
          <div className="gh-code" aria-label={`Doğrulama kodu ${info.user_code}`}>
            {info.user_code}
          </div>
          <div className="gh-device-row">
            <button className="gh-go" type="button" onClick={copy}>
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
            <button className="link" onClick={() => newTab(info.verification_uri, { keepUi: true })}>
              Sayfayı yeniden aç
            </button>
          </div>
          <p className="gh-wait">Onay bekleniyor…</p>
          <button className="link" onClick={cancel}>
            İptal
          </button>
        </>
      ) : (
        <>
          <button className="gh-cta" type="button" disabled={st === 'starting'} onClick={start}>
            {st === 'starting' ? 'Kod alınıyor…' : st === 'error' ? 'Tekrar dene' : 'GitHub ile giriş yap'}
          </button>
          {st === 'error' && (
            <p className="gh-err-line" role="alert">
              {msg}
            </p>
          )}
        </>
      )}
    </section>
  )
}

// Android: OAuth uygulaması kimliği henüz girilmemiş. Bir kez girilir, sonra cihaz akışı açılır.
function ClientIdSetup() {
  const [v, setV] = useState('')

  const save = (e) => {
    e.preventDefault()
    const t = v.trim()
    if (t) setSetting('ghClientId', t)
  }

  return (
    <section className="card gh-connect gh-setup" style={{ '--i': 0 }}>
      <p>
        GitHub ile giriş için bir kez OAuth uygulaması kimliği gerekir: github.com/settings/developers → New OAuth App → ‘Enable Device Flow’
        işaretle → Client ID’yi buraya yapıştır.
      </p>
      <form className="gh-form" onSubmit={save}>
        <input
          className="text"
          value={v}
          placeholder="Client ID"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setV(e.target.value)}
          aria-label="GitHub OAuth Client ID"
        />
        <button className="gh-go" type="submit" disabled={!v.trim()}>
          Kaydet
        </button>
      </form>
      <button className="link" onClick={() => newTab('https://github.com/settings/applications/new')}>
        Geliştirici ayarlarını aç
      </button>
      <details className="gh-more">
        <summary>Ya da erişim anahtarıyla bağlan</summary>
        <div className="gh-connect">
          <TokenForm />
        </div>
      </details>
    </section>
  )
}

function Connect() {
  // Client ID değişince (ClientIdSetup'tan kaydedilince) ekran yeniden çizilir.
  useStore((s) => s.settings.ghClientId)
  const hasId = !!clientId()

  return (
    <Shell>
      <h1 className="gh-title">GitHub</h1>
      {isNative && hasId && <DeviceLogin />}
      {isNative && !hasId && <ClientIdSetup />}
      {!isNative && (
        <section className="card gh-connect" style={{ '--i': 0 }}>
          <p>GitHub ile tek dokunuşla giriş Android uygulamasında. Burada bir erişim anahtarıyla bağlanabilirsin.</p>
          <TokenForm />
        </section>
      )}
      <Foot connected={false} />
    </Shell>
  )
}

function Hero({ u }) {
  return (
    <>
      <header className="gh-hero" style={{ '--i': 0 }}>
        <img className="gh-avatar" src={u.avatar_url} alt="" />
        <div className="gh-id">
          <h1>{u.name || u.login}</h1>
          <p className="gh-login">@{u.login}</p>
        </div>
      </header>
      {u.bio && <p className="gh-bio">{u.bio}</p>}
      <div className="gh-stats" style={{ '--i': 1 }}>
        <div>
          <b>{fmt(u.followers)}</b>
          <small>takipçi</small>
        </div>
        <div>
          <b>{fmt(u.following)}</b>
          <small>takip</small>
        </div>
        <div>
          <b>{fmt(u.public_repos)}</b>
          <small>repo</small>
        </div>
      </div>
    </>
  )
}

function Feed({ token, login, onRepo }) {
  const [s, again] = useData(() => events(token, login), [token, login])
  const rows = (s.data || []).filter((e) => FEED.has(e.type)).map((e) => ({ e, d: describe(e) })).filter((x) => x.d)
  return (
    <Panel s={s} again={again} n={rows.length} empty="Henüz gösterilecek etkinlik yok.">
      {rows.map(({ e, d }, i) => (
        <Row
          key={e.id}
          i={i}
          Icon={d.Icon}
          text={d.text}
          sub={d.sub}
          meta={d.meta}
          time={timeAgo(e.created_at)}
          onClick={() => onRepo(d.open.full, d.open.initial)}
        />
      ))}
    </Panel>
  )
}

function Repos({ token, onRepo }) {
  const [s, again] = useData(() => repos(token), [token])
  const list = s.data || []
  return (
    <Panel s={s} again={again} n={list.length} empty="Gösterilecek depo yok.">
      {list.map((r, i) => (
        <button key={r.id} className="card gh-repo" style={{ '--i': i }} onClick={() => onRepo(r.full_name)}>
          <span className="gh-repo-top">
            <b className="gh-repo-name">{r.name}</b>
            {r.private && <span className="gh-tag">özel</span>}
            {r.fork && <span className="gh-tag">çatal</span>}
          </span>
          {r.description && <span className="gh-desc">{r.description}</span>}
          <span className="gh-meta">
            {r.language && (
              <span className="gh-lang">
                <i className="gh-dot" style={{ background: LANG_COLOR[r.language] || 'var(--muted)' }} />
                {r.language}
              </span>
            )}
            <span className="gh-star">
              <Star size={12} strokeWidth={1.75} />
              {fmt(r.stargazers_count)}
            </span>
            <time>{timeAgo(r.pushed_at)}</time>
          </span>
        </button>
      ))}
    </Panel>
  )
}

function Notifs({ token, onRepo }) {
  const [s, again] = useData(() => notifications(token), [token])
  const list = s.data || []
  return (
    <Panel s={s} again={again} n={list.length} empty="Okunmamış bildirim yok.">
      {list.map((n, i) => (
        <Row
          key={n.id}
          i={i}
          Icon={Bell}
          text={n.subject.title}
          meta={`${n.repository.full_name} · ${kindLabel(n.subject.type)}`}
          time={timeAgo(n.updated_at)}
          unread={n.unread}
          onClick={() => onRepo(n.repository.full_name, subjectTarget(n.subject))}
        />
      ))}
    </Panel>
  )
}

function Assigned({ token, onRepo }) {
  const [s, again] = useData(() => assigned(token), [token])
  const list = s.data?.items || []
  return (
    <Panel s={s} again={again} n={list.length} empty="Sana atanmış açık bir öğe yok.">
      {list.map((it, i) => {
        const full = (it.repository_url || '').replace('https://api.github.com/repos/', '')
        const Icon = it.pull_request ? GitPullRequest : CircleDot
        return (
          <button
            key={it.id}
            className="card gh-row"
            style={{ '--i': i }}
            onClick={() => onRepo(full, { tab: it.pull_request ? 'prs' : 'issues', num: it.number })}
          >
            <span className="gh-ic">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span className="gh-main">
              <span className="gh-text">{it.title}</span>
              <span className="gh-meta">
                <span>
                  {full} #{it.number}
                </span>
                <span className="gh-badge" data-state={it.state}>
                  {it.state === 'open' ? 'açık' : 'kapalı'}
                </span>
                <time>{timeAgo(it.updated_at)}</time>
              </span>
            </span>
          </button>
        )
      })}
    </Panel>
  )
}

function Foot({ connected }) {
  return (
    <footer className="gh-foot">
      {connected && (
        <button className="link" onClick={() => (setSetting('ghToken', ''), play('close'))}>
          Bağlantıyı kes
        </button>
      )}
      <button className="link" onClick={() => newTab('https://github.com/?anfo')}>
        github.com’u web’de aç
      </button>
    </footer>
  )
}

function Account({ token, tab, setTab, onRepo }) {
  const [prof, again] = useData(() => me(token), [token])
  const bad = useGhInvalid()
  return (
    <Shell>
      {bad && (
        <div className="card gh-err" role="alert">
          <button className="link" onClick={() => setSetting('ghToken', '')}>
            Bağlantı geçersiz — yeniden bağlan
          </button>
        </div>
      )}
      {prof.status === 'loading' && <Skeleton n={2} />}
      {prof.status === 'error' && <ErrBox msg={prof.msg} onRetry={again} />}
      {prof.status === 'ok' && (
        <>
          <Hero u={prof.data} />
          <div className="gh-tabs">
            <div className="seg gh-seg" role="radiogroup" aria-label="GitHub bölümleri">
              {Object.entries(TABS).map(([k, label]) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={tab === k}
                  onClick={() => (setTab(k), play('nav'))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {tab === 'feed' && <Feed token={token} login={prof.data.login} onRepo={onRepo} />}
          {tab === 'repos' && <Repos token={token} onRepo={onRepo} />}
          {tab === 'notifs' && <Notifs token={token} onRepo={onRepo} />}
          {tab === 'assigned' && <Assigned token={token} onRepo={onRepo} />}
        </>
      )}
      <Foot connected />
    </Shell>
  )
}

// ---------- Depo görünümü ----------

const Badges = ({ d }) => (
  <div className="gh-rbadges">
    {d.language && (
      <span className="gh-chip">
        <i className="gh-dot" style={{ background: LANG_COLOR[d.language] || 'var(--muted)' }} />
        {d.language}
      </span>
    )}
    <span className="gh-chip" title="Yıldız">
      <Star size={13} strokeWidth={1.75} />
      {fmt(d.stargazers_count)}
    </span>
    <span className="gh-chip" title="Çatal">
      <GitFork size={13} strokeWidth={1.75} />
      {fmt(d.forks_count)}
    </span>
    <span className="gh-chip">
      <CircleDot size={13} strokeWidth={1.75} />
      {fmt(d.open_issues_count)} açık issue
    </span>
    <span className="gh-chip">
      {d.private ? <Lock size={13} strokeWidth={1.75} /> : <Globe size={13} strokeWidth={1.75} />}
      {d.private ? 'Özel' : 'Herkese açık'}
    </span>
    {d.pushed_at && <span className="gh-chip">Son güncelleme {timeAgo(d.pushed_at)}</span>}
  </div>
)

// Bir bildirim/etkinlik/atanan öğe için depo görünümünün başlangıç alt durumu.
const seedSub = (i) =>
  i?.sha ? { kind: 'commit', sha: i.sha } : i?.num ? { kind: 'thread', num: i.num, pr: i.tab === 'prs' } : null

function RepoView({ token, full, initial, onBack }) {
  const [owner, name] = full.split('/')
  const [info, again] = useData((sig) => fetchRepo(token, full, sig), [token, full])
  const [tab, setTab] = useState(initial?.tab || 'readme')
  const [sub, setSub] = useState(() => seedSub(initial))
  const [dir, setDir] = useState('')
  const d = info.status === 'ok' ? info.data : null

  const choose = (k) => {
    setTab(k)
    setSub(null)
    play('nav')
  }
  const back = () => (sub ? setSub(null) : onBack())

  return (
    <Shell>
      <header className="gh-rhead" style={{ '--i': 0 }}>
        <div className="gh-rbar">
          <button className="gh-back" onClick={back} aria-label={sub ? 'Önceki görünüm' : 'Profile dön'}>
            <ArrowLeft size={20} strokeWidth={1.75} />
          </button>
          <button className="link gh-ext" onClick={() => ext(d?.html_url || `https://github.com/${full}`)}>
            GitHub’da aç
            <ExternalLink size={14} strokeWidth={1.75} />
          </button>
        </div>
        <div className="gh-rtitle">
          {d?.owner?.avatar_url && <img className="gh-avatar-sm" src={d.owner.avatar_url} alt="" />}
          <h1 className="gh-rname">
            <span>{owner}</span> / <b>{name}</b>
          </h1>
        </div>
        {d?.description && <p className="gh-rdesc">{d.description}</p>}
        {d && <Badges d={d} />}
      </header>

      {info.status === 'error' && <ErrBox msg={info.msg} onRetry={again} />}

      <div className="gh-tabs" style={{ '--i': 1 }}>
        <div className="seg gh-seg" role="radiogroup" aria-label="Depo bölümleri">
          {Object.entries(RTABS).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={tab === k} onClick={() => choose(k)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'readme' && <Readme token={token} full={full} />}
      {tab === 'files' &&
        (sub?.kind === 'file' ? (
          <FileView token={token} full={full} item={sub.item} onBack={() => setSub(null)} />
        ) : (
          <Files token={token} full={full} name={name} dir={dir} setDir={setDir} onOpen={(item) => setSub({ kind: 'file', item })} />
        ))}
      {tab === 'commits' &&
        (sub?.kind === 'commit' ? (
          <CommitView token={token} full={full} sha={sub.sha} onBack={() => setSub(null)} />
        ) : (
          <Commits token={token} full={full} onOpen={(sha) => setSub({ kind: 'commit', sha })} />
        ))}
      {(tab === 'issues' || tab === 'prs') &&
        (sub?.kind === 'thread' ? (
          <ThreadView token={token} full={full} num={sub.num} pr={sub.pr} onBack={() => setSub(null)} />
        ) : (
          <Threads token={token} full={full} pr={tab === 'prs'} onOpen={(num) => setSub({ kind: 'thread', num, pr: tab === 'prs' })} />
        ))}
    </Shell>
  )
}

function Readme({ token, full }) {
  const [s, again] = useData((sig) => readme(token, full, sig), [token, full])
  const html = useMemo(() => cleanHtml(s.data || '', full), [s.data, full])
  if (s.status === 'loading') return <Skeleton n={2} />
  if (s.status === 'error') return <ErrBox msg={s.msg} onRetry={again} />
  if (!s.data) return <p className="gh-empty">Bu depoda README yok</p>
  return <article className="prose gh-readme" onClick={openLink} dangerouslySetInnerHTML={{ __html: html }} />
}

function Files({ token, full, name, dir, setDir, onOpen }) {
  const [s, again] = useData((sig) => contents(token, full, dir, sig), [token, full, dir])
  const parts = dir ? dir.split('/') : []
  const list = Array.isArray(s.data)
    ? [...s.data].sort((a, b) => (a.type === 'dir' ? 0 : 1) - (b.type === 'dir' ? 0 : 1) || a.name.localeCompare(b.name, 'tr'))
    : []
  return (
    <>
      <nav className="gh-crumbs" aria-label="Yol">
        <button onClick={() => setDir('')}>{name}</button>
        {parts.map((p, i) => {
          const to = parts.slice(0, i + 1).join('/')
          return (
            <span key={to} className="gh-crumb">
              <span className="gh-sep">/</span>
              <button onClick={() => setDir(to)}>{p}</button>
            </span>
          )
        })}
      </nav>
      {s.status === 'loading' && <Skeleton />}
      {s.status === 'error' && <ErrBox msg={s.msg} onRetry={again} />}
      {s.status === 'ok' &&
        (list.length ? (
          <div className="stack">
            {list.map((it, i) => {
              const isDir = it.type === 'dir'
              return (
                <button
                  key={it.path}
                  className="card gh-row"
                  style={{ '--i': i }}
                  onClick={() => (isDir ? setDir(it.path) : it.type === 'file' ? onOpen(it) : ext(it.html_url))}
                >
                  <span className="gh-ic">{isDir ? <Folder size={16} strokeWidth={1.75} /> : <File size={16} strokeWidth={1.75} />}</span>
                  <span className="gh-main">
                    <span className="gh-text">{it.name}</span>
                    <span className="gh-meta">
                      <span>{isDir ? 'klasör' : it.type === 'file' ? bytes(it.size) : 'bağlantı'}</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="gh-empty">Bu klasör boş</p>
        ))}
    </>
  )
}

// Satır numaralı, yatay kaydırılabilir kaynak görünümü.
function Code({ text }) {
  const lines = text.replace(/\r/g, '').split('\n')
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return (
    <div className="gh-src" role="region" aria-label="Dosya içeriği" tabIndex={0}>
      {lines.map((l, i) => (
        <div className="gh-ln" key={i}>
          <span className="gh-num">{i + 1}</span>
          <span className="gh-lc">{l || ' '}</span>
        </div>
      ))}
    </div>
  )
}

function FileView({ token, full, item, onBack }) {
  const tooBig = item.size > MAX_SRC
  const img = IMG.test(item.name)
  const md = MD.test(item.name)
  const [s, again] = useData(
    async (sig) => {
      if (tooBig || img) return null
      const text = await rawFile(token, full, item.path, sig)
      if (!md) return { text }
      const h = await renderMarkdown(token, text, full, sig)
      return { text, html: cleanHtml(h, full) }
    },
    [token, full, item.path],
  )

  let body
  if (tooBig)
    body = (
      <div className="card gh-note">
        <p>Dosya çok büyük — GitHub’da aç</p>
        <button className="link" onClick={() => ext(item.html_url)}>
          GitHub’da aç
        </button>
      </div>
    )
  else if (img)
    body = item.download_url ? (
      <div className="gh-imgwrap">
        <img className="gh-img" src={item.download_url} alt={item.name} loading="lazy" />
      </div>
    ) : (
      <p className="gh-empty">Görsel önizlenemiyor</p>
    )
  else if (s.status === 'loading') body = <Skeleton n={1} />
  else if (s.status === 'error') body = <ErrBox msg={s.msg} onRetry={again} />
  else if (md) body = <article className="prose gh-readme" onClick={openLink} dangerouslySetInnerHTML={{ __html: s.data.html }} />
  else body = <Code text={s.data.text} />

  return (
    <>
      <SubBar onBack={onBack} title={`${item.path} · ${bytes(item.size)}`} />
      {body}
    </>
  )
}

function Commits({ token, full, onOpen }) {
  const [s, again] = useData((sig) => commits(token, full, sig), [token, full])
  const list = Array.isArray(s.data) ? s.data : []
  return (
    <Panel s={s} again={again} n={list.length} empty="Henüz commit yok.">
      {list.map((c, i) => {
        const msg = c.commit?.message?.split('\n')[0] || ''
        const who = c.commit?.author?.name || c.author?.login || ''
        return (
          <button key={c.sha} className="card gh-row" style={{ '--i': i }} onClick={() => onOpen(c.sha)}>
            <span className="gh-ic gh-ic-img">
              {c.author?.avatar_url ? <img src={c.author.avatar_url} alt="" /> : <GitCommitVertical size={16} strokeWidth={1.75} />}
            </span>
            <span className="gh-main">
              <span className="gh-text">{msg}</span>
              <span className="gh-meta">
                <code className="gh-sha">{c.sha.slice(0, 7)}</code>
                <span>{who}</span>
                <time>{timeAgo(c.commit?.author?.date)}</time>
              </span>
            </span>
          </button>
        )
      })}
    </Panel>
  )
}

function CommitView({ token, full, sha, onBack }) {
  const [s, again] = useData((sig) => commit(token, full, sha, sig), [token, full, sha])
  const [f, setF] = useState(null)

  if (s.status === 'loading')
    return (
      <>
        <SubBar onBack={onBack} title={sha.slice(0, 7)} />
        <Skeleton n={3} />
      </>
    )
  if (s.status === 'error')
    return (
      <>
        <SubBar onBack={onBack} title={sha.slice(0, 7)} />
        <ErrBox msg={s.msg} onRetry={again} />
      </>
    )

  if (f) return <PatchView file={f} onBack={() => setF(null)} />

  const c = s.data
  const files = c.files || []
  return (
    <>
      <SubBar onBack={onBack} title={c.sha.slice(0, 7)} />
      <div className="card gh-commit">
        <p className="gh-cmsg">{c.commit?.message}</p>
        <div className="gh-meta">
          <span>{c.commit?.author?.name}</span>
          <time>{timeAgo(c.commit?.author?.date)}</time>
        </div>
        <div className="gh-stat">
          <span className="gh-add">+{fmt(c.stats?.additions)}</span>
          <span className="gh-del">−{fmt(c.stats?.deletions)}</span>
          <span>{files.length} dosya</span>
        </div>
      </div>
      <div className="stack">
        {files.map((x, i) => (
          <button key={x.filename} className="card gh-row" style={{ '--i': i }} onClick={() => setF(x)}>
            <span className="gh-ic">
              <File size={16} strokeWidth={1.75} />
            </span>
            <span className="gh-main">
              <span className="gh-text gh-mono">{x.filename}</span>
              <span className="gh-meta">
                <span>{x.status}</span>
                <span className="gh-add">+{x.additions}</span>
                <span className="gh-del">−{x.deletions}</span>
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

// Tek dosyanın farkı: eklenen satırlar vurgulu, silinenler soluk, hunk başlıkları muted.
function PatchView({ file, onBack }) {
  const lines = (file.patch || '').split('\n')
  return (
    <>
      <SubBar onBack={onBack} title={file.filename} />
      {!file.patch ? (
        <p className="gh-empty">Metin farkı yok (ikili dosya ya da çok büyük)</p>
      ) : (
        <div className="gh-src gh-diff" tabIndex={0}>
          {lines.map((l, i) => {
            const k = l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : l[0] === '@' ? 'hunk' : ''
            return (
              <div key={i} className={`gh-dl ${k}`}>
                {l || ' '}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

function Threads({ token, full, pr, onOpen }) {
  const [s, again] = useData((sig) => (pr ? pulls(token, full, sig) : issues(token, full, sig)), [token, full, pr])
  const list = (Array.isArray(s.data) ? s.data : []).filter((x) => pr || !x.pull_request)
  const Icon = pr ? GitPullRequest : CircleDot
  return (
    <Panel s={s} again={again} n={list.length} empty={pr ? 'Açık pull request yok.' : 'Açık issue yok.'}>
      {list.map((it, i) => (
        <button key={it.id} className="card gh-row" style={{ '--i': i }} onClick={() => onOpen(it.number)}>
          <span className="gh-ic">
            <Icon size={16} strokeWidth={1.75} />
          </span>
          <span className="gh-main">
            <span className="gh-text">{it.title}</span>
            <Labels list={it.labels} />
            <span className="gh-meta">
              <span>#{it.number}</span>
              <span>{it.user?.login}</span>
              {it.comments > 0 && (
                <span className="gh-cnt">
                  <MessageSquare size={12} strokeWidth={1.75} />
                  {fmt(it.comments)}
                </span>
              )}
              <time>{timeAgo(it.updated_at)}</time>
            </span>
          </span>
        </button>
      ))}
    </Panel>
  )
}

function ThreadView({ token, full, num, pr, onBack }) {
  const [s, again] = useData(
    async (sig) => {
      const [d, cs] = await Promise.all([issueDetail(token, full, num, sig), issueComments(token, full, num, sig)])
      return { d, cs }
    },
    [token, full, num],
  )

  if (s.status === 'loading')
    return (
      <>
        <SubBar onBack={onBack} title={`#${num}`} />
        <Skeleton n={2} />
      </>
    )
  if (s.status === 'error')
    return (
      <>
        <SubBar onBack={onBack} title={`#${num}`} />
        <ErrBox msg={s.msg} onRetry={again} />
      </>
    )

  const { d, cs } = s.data
  return (
    <>
      <SubBar onBack={onBack} title={`${pr ? 'PR' : 'Issue'} #${num}`} />
      <div className="card gh-thread">
        <h2 className="gh-thread-title">{d.title}</h2>
        <div className="gh-meta">
          <span className="gh-badge" data-state={d.state}>
            {d.state === 'open' ? 'açık' : 'kapalı'}
          </span>
          <span>{d.user?.login}</span>
          <time>{timeAgo(d.created_at)}</time>
        </div>
        <Labels list={d.labels} />
        {d.body_html ? (
          <div className="prose gh-readme gh-body" onClick={openLink} dangerouslySetInnerHTML={{ __html: cleanHtml(d.body_html, full) }} />
        ) : (
          <p className="gh-empty">Açıklama yok</p>
        )}
      </div>
      <h3 className="gh-sec">Yorumlar</h3>
      {cs.length ? (
        <div className="stack">
          {cs.map((c, i) => (
            <div key={c.id} className="card gh-comment" style={{ '--i': i }}>
              <div className="gh-meta">
                <img className="gh-av-sm" src={c.user?.avatar_url} alt="" />
                <span>{c.user?.login}</span>
                <time>{timeAgo(c.created_at)}</time>
              </div>
              <div className="prose gh-readme gh-body" onClick={openLink} dangerouslySetInnerHTML={{ __html: cleanHtml(c.body_html || '', full) }} />
            </div>
          ))}
        </div>
      ) : (
        <p className="gh-empty">Henüz yorum yok</p>
      )}
    </>
  )
}

export default function GitHub() {
  const token = useStore((s) => s.settings.ghToken)
  const [repo, setRepo] = useState(() => pendingRepo)
  const [tab, setTab] = useState('feed')

  // Dışarıdan openRepo çağrılınca ya da bekleyen istek varsa depo görünümünü aç.
  useEffect(() => {
    const sync = () => {
      if (!pendingRepo) return
      const p = pendingRepo
      pendingRepo = null
      setRepo(p)
    }
    repoSubs.add(sync)
    sync()
    return () => repoSubs.delete(sync)
  }, [])

  useEffect(() => {
    if (token) startGitHubPoll()
  }, [token])

  if (!token) return <Connect />
  if (repo)
    return <RepoView key={repo.id} token={token} full={repo.full} initial={repo.initial} onBack={() => setRepo(null)} />
  return <Account token={token} tab={tab} setTab={setTab} onRepo={(full, initial) => setRepo(pick(full, initial))} />
}

// Ana sayfa kartı: profil, okunmamış bildirim sayısı, son iki depo. Sonuç 5 dk önbellekte.
const WIDGET_TTL = 5 * 60 * 1000
let wCache = null

function loadWidget(token) {
  if (wCache && wCache.token === token && Date.now() - wCache.at < WIDGET_TTL) return Promise.resolve(wCache.data)
  return Promise.all([me(token), repos(token), notifications(token)]).then(([u, rs, ns]) => {
    const data = { login: u.login, avatar: u.avatar_url, unread: ns.length, repos: rs.slice(0, 2).map((r) => r.name) }
    wCache = { token, at: Date.now(), data }
    return data
  })
}

export function GitHubWidget() {
  const token = useStore((s) => s.settings.ghToken)
  const bad = useGhInvalid()
  const [d, setD] = useState(() => (wCache && wCache.token === token ? wCache.data : null))
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!token) {
      setD(null)
      return
    }
    startGitHubPoll()
    let live = true
    setErr(false)
    setD(wCache && wCache.token === token ? wCache.data : null)
    loadWidget(token).then(
      (x) => live && setD(x),
      () => live && setErr(true),
    )
    return () => {
      live = false
    }
  }, [token])

  if (!token)
    return (
      <button className="card ghw-card" onClick={() => setUi('github')}>
        <span className="ghw-top">
          <span className="ghw-ic">
            <KeyRound size={16} strokeWidth={1.75} />
          </span>
          <span className="ghw-who">
            <b className="ghw-login">GitHub’ı bağla</b>
            <small className="ghw-sub">Bildirimler, depolar ve etkinlik</small>
          </span>
        </span>
      </button>
    )

  if (!d)
    return (
      <button className="card ghw-card" onClick={() => setUi('github')}>
        <span className="ghw-sub">{err ? 'GitHub’a ulaşılamadı' : 'GitHub yükleniyor'}</span>
      </button>
    )

  return (
    <button className="card ghw-card" onClick={() => setUi('github')} aria-label={`GitHub, @${d.login}`}>
      <span className="ghw-top">
        <img className="ghw-av" src={d.avatar} alt="" />
        <span className="ghw-who">
          <b className="ghw-login">@{d.login}</b>
          <small className="ghw-sub">{bad ? 'Bağlantı geçersiz — yeniden bağlan' : d.unread ? 'okunmamış bildirim' : 'bildirim yok'}</small>
        </span>
        <span className="ghw-n">
          <Bell size={12} strokeWidth={1.75} />
          {d.unread >= 30 ? '30+' : d.unread}
        </span>
      </span>
      {d.repos.length > 0 && (
        <span className="ghw-repos">
          {d.repos.map((r) => (
            <span key={r}>{r}</span>
          ))}
        </span>
      )}
    </button>
  )
}
