"use client";

import Image from "next/image";
import {
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  FileText,
  ImageIcon,
  Inbox,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  Megaphone,
  Menu,
  MessageCircleMore,
  Pause,
  Play,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Video,
  Wifi,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ContentType = "text" | "image" | "video";
type RuntimeState = "starting" | "connecting" | "qr_pending" | "connected" | "disconnected" | "logged_out" | "disabled" | "error" | "stopped";

type StatusResponse = {
  ok: boolean;
  runtime: {
    status: RuntimeState;
    qrAvailable: boolean;
    qrUpdatedAt: string | null;
    phoneJid: string | null;
    lastError: string | null;
    updatedAt: string;
  };
  database: { connected: boolean; error: string | null };
  safety: { dryRun: boolean; commandsEnabled: boolean; publishingEnabled: boolean };
};

type Channel = {
  channel_jid: string;
  name: string | null;
  enabled: boolean;
  publish_mode: "off" | "dry_run" | "active";
  admin_confirmed_at: string | null;
  queued_count: number;
  published_count: number;
  failed_count: number;
};

type Campaign = {
  id: number;
  channel_jid: string;
  name: string;
  schedule_time: string;
  timezone: string;
  status: "paused" | "running" | "waiting" | "failed";
  pending_count: number;
  queued_count: number;
  published_count: number;
  failed_count: number;
  text_count: number;
  image_count: number;
  video_count: number;
  total_count: number;
  last_error: string | null;
};

type QueueItem = {
  id: number;
  channel_jid: string;
  channel_name: string | null;
  content_type: ContentType;
  text_content: string | null;
  media_path: string | null;
  status: "queued" | "publishing" | "published" | "failed" | "cancelled";
  scheduled_at: string;
  published_at: string | null;
  error_text: string | null;
};

type DashboardData = {
  ok: boolean;
  session: { phone_jid: string | null; status: string; last_seen_at: string | null } | null;
  controlChat: { chat_jid: string; name: string | null; active_channel_jid: string | null } | null;
  summary: {
    published: number;
    queued: number;
    failed: number;
    nextScheduledAt: string | null;
    activeCampaigns: number;
    campaignStock: number;
  };
  channels: Channel[];
  campaigns: Campaign[];
  queue: QueueItem[];
  actions: Array<{
    action_key: string;
    mode: string;
    reason: string | null;
    details_json: unknown;
    created_at: string;
  }>;
};

const navigation = [
  { label: "Resumen", icon: LayoutDashboard, target: "summary" },
  { label: "Campañas", icon: Megaphone, target: "campaigns" },
  { label: "Cola editorial", icon: Inbox, target: "queue" },
  { label: "Canales", icon: Radio, target: "channels" },
  { label: "Conexión", icon: QrCode, target: "connection" },
];

const contentTypeMeta = {
  text: { label: "Texto", icon: FileText },
  image: { label: "Imagen", icon: ImageIcon },
  video: { label: "Video", icon: Video },
};

function apiOrigin() {
  if (typeof window === "undefined") return "http://127.0.0.1:3210";
  const hostname = window.location.hostname === "localhost" ? "127.0.0.1" : window.location.hostname;
  return `http://${hostname}:3210`;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin()}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({ error: "Respuesta inválida de CanalBot." }));
  if (!response.ok) throw new Error(payload.error || "CanalBot no pudo completar esta acción.");
  return payload as T;
}

function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", options ?? {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function actionLabel(action: DashboardData["actions"][number]) {
  const labels: Record<string, string> = {
    channel_added_from_dashboard: "Canal registrado desde el panel",
    channel_added_from_command: "Canal registrado por comando",
    publication_queued_from_dashboard: "Publicación agregada a la cola",
    channel_queue_published: "Contenido publicado",
    channel_queue_failed: "Falló una publicación",
    session_connected: "WhatsApp vinculado",
    qr_generated: "Nuevo QR generado",
  };
  return labels[action.action_key] || action.action_key.replaceAll("_", " ");
}

function maskedPhone(phoneJid: string | null | undefined) {
  return phoneJid ? "Número vinculado ••••" : "Sesión local";
}

const demoStatus: StatusResponse = {
  ok: true,
  runtime: {
    status: "connected",
    qrAvailable: false,
    qrUpdatedAt: null,
    phoneJid: "demo@s.whatsapp.net",
    lastError: null,
    updatedAt: "2026-08-12T15:30:00.000Z",
  },
  database: { connected: true, error: null },
  safety: { dryRun: true, commandsEnabled: false, publishingEnabled: false },
};

const demoDashboard: DashboardData = {
  ok: true,
  session: { phone_jid: demoStatus.runtime.phoneJid, status: "connected", last_seen_at: "2026-08-12T15:30:00.000Z" },
  controlChat: { chat_jid: "120363400000000099@g.us", name: "Mesa editorial", active_channel_jid: "120363400000000001@newsletter" },
  summary: {
    published: 128,
    queued: 9,
    failed: 1,
    nextScheduledAt: "2026-08-12T17:00:00.000Z",
    activeCampaigns: 2,
    campaignStock: 34,
  },
  channels: [
    { channel_jid: "120363400000000001@newsletter", name: "Ideas que sí sirven", enabled: true, publish_mode: "dry_run", admin_confirmed_at: "2026-08-10T18:00:00.000Z", queued_count: 5, published_count: 82, failed_count: 0 },
    { channel_jid: "120363400000000002@newsletter", name: "Estudio creativo", enabled: true, publish_mode: "dry_run", admin_confirmed_at: "2026-08-09T18:00:00.000Z", queued_count: 3, published_count: 34, failed_count: 1 },
    { channel_jid: "120363400000000003@newsletter", name: "Comunidad CanalBot", enabled: true, publish_mode: "off", admin_confirmed_at: "2026-08-08T18:00:00.000Z", queued_count: 1, published_count: 12, failed_count: 0 },
  ],
  campaigns: [
    { id: 101, channel_jid: "120363400000000001@newsletter", name: "Tip diario", schedule_time: "09:00", timezone: "America/Mexico_City", status: "running", pending_count: 15, queued_count: 1, published_count: 24, failed_count: 0, text_count: 24, image_count: 10, video_count: 5, total_count: 39, last_error: null },
    { id: 102, channel_jid: "120363400000000001@newsletter", name: "Mini tutoriales", schedule_time: "18:30", timezone: "America/Mexico_City", status: "waiting", pending_count: 19, queued_count: 2, published_count: 11, failed_count: 0, text_count: 8, image_count: 14, video_count: 8, total_count: 30, last_error: null },
    { id: 103, channel_jid: "120363400000000002@newsletter", name: "Detrás del estudio", schedule_time: "13:00", timezone: "America/Mexico_City", status: "paused", pending_count: 8, queued_count: 0, published_count: 17, failed_count: 1, text_count: 7, image_count: 12, video_count: 6, total_count: 25, last_error: "Una pieza requiere revisión antes de reanudar." },
  ],
  queue: [
    { id: 201, channel_jid: "120363400000000001@newsletter", channel_name: "Ideas que sí sirven", content_type: "image", text_content: "Tres formas de organizar una semana de contenido", media_path: "demo/semana-editorial.png", status: "queued", scheduled_at: "2026-08-12T17:00:00.000Z", published_at: null, error_text: null },
    { id: 202, channel_jid: "120363400000000001@newsletter", channel_name: "Ideas que sí sirven", content_type: "video", text_content: "Así se prepara una campaña desde el teléfono", media_path: "demo/campana-movil.mp4", status: "queued", scheduled_at: "2026-08-12T19:00:00.000Z", published_at: null, error_text: null },
    { id: 203, channel_jid: "120363400000000001@newsletter", channel_name: "Ideas que sí sirven", content_type: "text", text_content: "Una buena cola editorial te deja crear hoy y publicar con calma mañana.", media_path: null, status: "queued", scheduled_at: "2026-08-12T21:00:00.000Z", published_at: null, error_text: null },
    { id: 204, channel_jid: "120363400000000001@newsletter", channel_name: "Ideas que sí sirven", content_type: "image", text_content: "Checklist antes de publicar", media_path: "demo/checklist.png", status: "queued", scheduled_at: "2026-08-13T15:00:00.000Z", published_at: null, error_text: null },
    { id: 205, channel_jid: "120363400000000002@newsletter", channel_name: "Estudio creativo", content_type: "video", text_content: "Recorrido del nuevo espacio de trabajo", media_path: "demo/recorrido.mp4", status: "queued", scheduled_at: "2026-08-12T18:30:00.000Z", published_at: null, error_text: null },
  ],
  actions: [
    { action_key: "publication_queued_from_dashboard", mode: "executed", reason: null, details_json: { content_type: "image" }, created_at: "2026-08-12T15:24:00.000Z" },
    { action_key: "channel_queue_published", mode: "executed", reason: null, details_json: { content_type: "text" }, created_at: "2026-08-12T15:05:00.000Z" },
    { action_key: "channel_added_from_dashboard", mode: "executed", reason: null, details_json: { channel: "Comunidad CanalBot" }, created_at: "2026-08-12T14:40:00.000Z" },
    { action_key: "qr_generated", mode: "preview", reason: "Modo demostración", details_json: null, created_at: "2026-08-12T14:15:00.000Z" },
  ],
};

export default function Home() {
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [setupVisible, setSetupVisible] = useState(true);
  const [activeNav, setActiveNav] = useState("Resumen");
  const [activeChannel, setActiveChannel] = useState("");
  const [queueFilter, setQueueFilter] = useState<"all" | ContentType>("all");
  const [publicationOpen, setPublicationOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null);

  const loadStatus = useCallback(async () => {
    if (demoMode) {
      setStatus(demoStatus);
      return;
    }
    try {
      setStatus(await api<StatusResponse>("/api/v1/status"));
    } catch (error) {
      setStatus(null);
      setToast({ message: error instanceof Error ? error.message : "CanalBot local no responde.", error: true });
    }
  }, [demoMode]);

  const loadDashboard = useCallback(async () => {
    if (demoMode) {
      setData(demoDashboard);
      setActiveChannel(current => current || demoDashboard.channels[0]?.channel_jid || "");
      return;
    }
    try {
      const snapshot = await api<DashboardData>("/api/v1/dashboard");
      setData(snapshot);
      setActiveChannel(current => current || snapshot.channels[0]?.channel_jid || "");
    } catch {
      setData(null);
    }
  }, [demoMode]);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const enabled = params.get("demo") === "1";
      setDemoMode(enabled);
      if (enabled) {
        setStatus(demoStatus);
        setData(demoDashboard);
        setActiveChannel(demoDashboard.channels[0]?.channel_jid || "");
        setSetupVisible(params.get("view") === "connection");
      }
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  useEffect(() => {
    if (demoMode === null) return;
    const initial = window.setTimeout(() => void loadStatus(), 0);
    const timer = window.setInterval(() => void loadStatus(), 2500);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [demoMode, loadStatus]);

  useEffect(() => {
    if (status?.database.connected) {
      const initial = window.setTimeout(() => void loadDashboard(), 0);
      const timer = window.setInterval(() => void loadDashboard(), 8000);
      return () => {
        window.clearTimeout(initial);
        window.clearInterval(timer);
      };
    }
  }, [status?.database.connected, loadDashboard]);

  const filteredQueue = useMemo(() => {
    if (!data) return [];
    return data.queue.filter(item =>
      (queueFilter === "all" || item.content_type === queueFilter) &&
      (!activeChannel || item.channel_jid === activeChannel),
    );
  }, [data, queueFilter, activeChannel]);

  function flash(message: string, error = false) {
    setToast({ message, error });
    window.setTimeout(() => setToast(null), 3200);
  }

  function navigate(label: string, target: string) {
    setMobileMenu(false);
    if (target === "connection") {
      setSetupVisible(true);
      return;
    }
    setSetupVisible(false);
    setActiveNav(label);
    window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  async function execute(action: () => Promise<void>) {
    if (demoMode) {
      flash("Vista de demostración: las acciones reales están desactivadas.");
      return;
    }
    setBusy(true);
    try {
      await action();
      await Promise.all([loadStatus(), loadDashboard()]);
    } catch (error) {
      flash(error instanceof Error ? error.message : "No fue posible completar la acción.", true);
    } finally {
      setBusy(false);
    }
  }

  if (setupVisible) {
    return (
      <SetupScreen
        status={status}
        demoMode={Boolean(demoMode)}
        onRefresh={() => void loadStatus()}
        onContinue={() => {
          setSetupVisible(false);
          void loadDashboard();
        }}
      />
    );
  }

  const selectedChannel = data?.channels.find(channel => channel.channel_jid === activeChannel) ?? null;

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`} aria-label="Navegación principal">
        <div className="brand brand-button">
          <button className="brand-home" onClick={() => setSetupVisible(true)}>
            <span className="brand-mark">
              <Image src="/canalbot-mascota.png" alt="Mascota de CanalBot" width={52} height={52} priority />
            </span>
            <span>
              <span className="brand-name">Canal<span>Bot</span></span>
              <small>Centro editorial local</small>
            </span>
          </button>
          <button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="Cerrar navegación">
            <X size={20} />
          </button>
        </div>

        <nav className="nav-list">
          <p className="nav-label">ESPACIO DE TRABAJO</p>
          {navigation.map(item => {
            const Icon = item.icon;
            const active = activeNav === item.label;
            return (
              <button key={item.label} className={`nav-item ${active ? "active" : ""}`} onClick={() => navigate(item.label, item.target)}>
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                {item.label === "Cola editorial" && Boolean(data?.summary.queued) && <span className="nav-badge">{data?.summary.queued}</span>}
              </button>
            );
          })}
        </nav>

        <section className="system-card" aria-label="Estado de CanalBot">
          <div className="system-robot"><Image src="/canalbot-mascota.png" alt="" width={74} height={74} /></div>
          <div>
            <span className="eyebrow"><span className={`live-dot ${status?.runtime.status !== "connected" ? "offline" : ""}`} /> {status?.runtime.status === "connected" ? "CANALBOT EN LÍNEA" : "REVISAR CONEXIÓN"}</span>
            <strong>{status?.safety.dryRun ? "Modo seguro activo" : "Publicación habilitada"}</strong>
            <p>{status?.safety.dryRun ? "Los envíos están bloqueados." : `Siguiente: ${formatDate(data?.summary.nextScheduledAt ?? null)}`}</p>
          </div>
          <button onClick={() => setSetupVisible(true)} aria-label="Ver conexión"><ChevronRight size={18} /></button>
        </section>

        <div className="account-card">
          <div className="avatar"><Smartphone size={18} /></div>
          <div><strong>{maskedPhone(status?.runtime.phoneJid)}</strong><span>Sesión local</span></div>
          <ShieldCheck size={19} />
        </div>
      </aside>

      {mobileMenu && <button className="menu-scrim" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir navegación"><Menu size={22} /></button>
            <div><p>{formatDate(new Date().toISOString(), { weekday: "long", day: "numeric", month: "long" })}</p><h1>Tu centro editorial <Sparkles size={20} /></h1></div>
          </div>
          <div className="topbar-actions">
            {demoMode && <span className="demo-mode-chip"><Sparkles size={15} /> DEMOSTRACIÓN</span>}
            <label className="channel-switcher">
              <span className="channel-icon"><Radio size={17} /></span>
              <span><small>CANAL ACTIVO</small><strong>{selectedChannel?.name || "Agrega un canal"}</strong></span>
              <ChevronDown size={17} />
              <select aria-label="Cambiar canal activo" value={activeChannel} onChange={event => setActiveChannel(event.target.value)}>
                {!data?.channels.length && <option value="">Sin canales</option>}
                {data?.channels.map(channel => <option key={channel.channel_jid} value={channel.channel_jid}>{channel.name || channel.channel_jid}</option>)}
              </select>
            </label>
            <button className="secondary-button top-add-channel" onClick={() => setChannelOpen(true)}><Plus size={17} /> Canal</button>
            <button className="primary-button" onClick={() => setPublicationOpen(true)} disabled={!data?.channels.length}><Plus size={18} /> Nueva publicación</button>
          </div>
        </header>

        <div className="dashboard" id="summary">
          {(!status?.database.connected || !data) && (
            <section className="connection-warning">
              <Database size={20} />
              <div><strong>MySQL todavía no está disponible</strong><p>Configura la base y ejecuta las migraciones para cargar canales, cola y estadísticas reales.</p></div>
              <button className="secondary-button" onClick={() => setSetupVisible(true)}>Ver preparación</button>
            </section>
          )}

          <section className="status-bar" aria-label="Estado de servicios">
            <div><Wifi size={17} /><span>WhatsApp</span><strong>{status?.runtime.status === "connected" ? "Conectado" : "Pendiente"}</strong></div>
            <div><Database size={17} /><span>MySQL</span><strong>{status?.database.connected ? "Activo" : "Pendiente"}</strong></div>
            <div><ShieldCheck size={17} /><span>Publicación</span><strong>{status?.safety.publishingEnabled && !status.safety.dryRun ? "Habilitada" : "Bloqueada"}</strong></div>
            <div className="status-next"><Clock3 size={17} /><span>Próxima salida</span><strong>{formatDate(data?.summary.nextScheduledAt ?? null)}</strong></div>
          </section>

          <section className="metrics-grid metrics-grid-five" aria-label="Resumen editorial">
            <article className="metric-card metric-published"><div className="metric-icon"><CheckCircle2 size={21} /></div><div><span>Contenido publicado</span><strong>{data?.summary.published ?? 0}</strong><small>Confirmado en MySQL</small></div><div className="metric-spark"><i /><i /><i /><i /></div></article>
            <article className="metric-card metric-campaigns"><div className="metric-icon"><Megaphone size={21} /></div><div><span>Campañas activas</span><strong>{data?.summary.activeCampaigns ?? 0}</strong><small>{data?.campaigns.length ?? 0} configuradas</small></div><div className="metric-visual campaign-bars"><i /><i /><i /><i /><i /></div></article>
            <article className="metric-card metric-stock"><div className="metric-icon"><Inbox size={21} /></div><div><span>Stock en campañas</span><strong>{data?.summary.campaignStock ?? 0}</strong><small>Piezas pendientes</small></div><div className="metric-ring"><span>{data?.summary.campaignStock ?? 0}</span></div></article>
            <article className="metric-card metric-queue"><div className="metric-icon"><CalendarDays size={21} /></div><div><span>En cola editorial</span><strong>{data?.summary.queued ?? 0}</strong><small>{data?.summary.failed ?? 0} requieren revisión</small></div><div className="mini-queue"><i /><i /><i /></div></article>
            <article className="metric-card metric-review"><div className="metric-icon"><Bot size={21} /></div><div><span>Canales registrados</span><strong>{data?.channels.length ?? 0}</strong><small>{data?.channels.filter(channel => channel.admin_confirmed_at).length ?? 0} con admin confirmado</small></div><button onClick={() => setChannelOpen(true)}>Agregar <ChevronRight size={15} /></button></article>
          </section>

          <section className="content-grid">
            <section className="panel campaigns-panel" id="campaigns">
              <div className="panel-header"><div><span className="section-kicker">INVENTARIO EDITORIAL</span><h2>Stock de campañas</h2></div><button className="text-button" onClick={() => setCampaignOpen(true)}><Plus size={15} /> Crear campaña</button></div>
              <div className="campaign-list">
                {!data?.campaigns.length && <EmptyState icon={Megaphone} title="Aún no hay campañas" detail="Crea la estructura aquí y agrega sus piezas desde el grupo de control con !camp iniciar." />}
                {data?.campaigns.map((campaign, index) => {
                  const progress = campaign.total_count ? Math.round((campaign.published_count / campaign.total_count) * 100) : 0;
                  const running = ["running", "waiting"].includes(campaign.status);
                  return (
                    <article className={`campaign-row accent-${["green", "cyan", "violet"][index % 3]}`} key={campaign.id}>
                      <div className="campaign-topline"><div><span className={`campaign-state ${running ? "running" : "paused"}`}>{campaign.status.toUpperCase()}</span><h3>{campaign.name}</h3><p><Clock3 size={13} /> Diario · {campaign.schedule_time} · {campaign.timezone}</p></div><button className="round-action" disabled={busy} onClick={() => void execute(async () => {
                        await api(`/api/v1/campaigns/${campaign.id}/status`, { method: "POST", body: JSON.stringify({ status: running ? "paused" : "running" }) });
                        flash(running ? "Campaña pausada" : "Campaña activada");
                      })} aria-label={running ? `Pausar ${campaign.name}` : `Activar ${campaign.name}`}>{running ? <Pause size={16} /> : <Play size={16} />}</button></div>
                      <div className="campaign-progress-label"><span>{campaign.published_count} publicadas</span><strong>{campaign.total_count} piezas</strong></div>
                      <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                      <div className="content-counts"><span><FileText size={14} /> {campaign.text_count} textos</span><span><ImageIcon size={14} /> {campaign.image_count} imágenes</span><span><Video size={14} /> {campaign.video_count} videos</span></div>
                      {campaign.last_error && <p className="row-error">{campaign.last_error}</p>}
                    </article>
                  );
                })}
              </div>
              <button className="add-campaign" onClick={() => setCampaignOpen(true)}><Plus size={17} /> Crear campaña real</button>
            </section>

            <section className="panel queue-panel" id="queue">
              <div className="panel-header queue-header"><div><span className="section-kicker">PROGRAMACIÓN REAL</span><h2>Cola editorial</h2></div><div className="queue-filters" aria-label="Filtrar cola">{(["all", "text", "image", "video"] as const).map(filter => <button key={filter} className={queueFilter === filter ? "active" : ""} onClick={() => setQueueFilter(filter)}>{filter === "all" ? "Todo" : contentTypeMeta[filter].label}</button>)}</div></div>
              <div className="timeline">
                {!filteredQueue.length && <EmptyState icon={Inbox} title="La cola está vacía" detail="Agrega una publicación o captura contenido desde WhatsApp con !pub iniciar." />}
                {filteredQueue.map(item => {
                  const TypeIcon = contentTypeMeta[item.content_type].icon;
                  return (
                    <article className="queue-item" key={item.id}>
                      <div className="queue-time"><strong>{formatDate(item.scheduled_at, { hour: "2-digit", minute: "2-digit" })}</strong><span>{formatDate(item.scheduled_at, { day: "2-digit", month: "short" })}</span></div>
                      <div className={`queue-thumb ${item.content_type}`}><TypeIcon size={22} />{item.content_type === "video" && <span className="play-chip"><Play size={10} fill="currentColor" /></span>}</div>
                      <div className="queue-copy"><div className="queue-title-line"><span className={`type-pill ${item.content_type}`}><TypeIcon size={12} /> {contentTypeMeta[item.content_type].label}</span><span className={`queue-status-pill status-${item.status}`}>{item.status}</span></div><h3>{item.channel_name || item.channel_jid}</h3><p>{item.text_content || (item.media_path ? "Archivo multimedia preparado" : "Sin vista previa")}</p>{item.error_text && <p className="row-error">{item.error_text}</p>}</div>
                    </article>
                  );
                })}
              </div>
              <button className="queue-footer" onClick={() => setPublicationOpen(true)} disabled={!data?.channels.length}><Plus size={17} /> Agregar contenido a la cola real</button>
            </section>

            <aside className="right-rail">
              <section className="agent-panel panel" id="agents">
                <div className="agent-heading"><div className="agent-avatar"><Image src="/canalbot-mascota.png" alt="" width={62} height={62} /></div><div><span className="section-kicker">REGISTRO DEL SISTEMA</span><h2>Actividad reciente</h2></div><span className="online-chip"><i /> {status?.runtime.status === "connected" ? "EN LÍNEA" : "LOCAL"}</span></div>
                <div className="agent-list">
                  {!data?.actions.length && <p className="empty-copy">Las acciones de CanalBot aparecerán aquí.</p>}
                  {data?.actions.slice(0, 5).map((action, index) => <article key={`${action.action_key}-${index}`} className={`agent-action ${action.mode === "failed" ? "warning" : action.mode === "executed" ? "success" : "info"}`}><span className="action-indicator">{action.mode === "failed" ? <X size={15} /> : action.mode === "executed" ? <Check size={15} /> : <MessageCircleMore size={15} />}</span><div><strong>{actionLabel(action)}</strong><p>{formatDate(action.created_at)}</p></div></article>)}
                </div>
              </section>

              <section className="panel channels-panel" id="channels">
                <div className="panel-header"><div><span className="section-kicker">DESTINOS REALES</span><h2>Canales</h2></div><button className="text-button" onClick={() => setChannelOpen(true)}><Plus size={14} /> Agregar</button></div>
                <div className="channel-list">
                  {!data?.channels.length && <p className="empty-copy">Agrega el primer canal mediante su enlace de invitación.</p>}
                  {data?.channels.map((channel, index) => <article key={channel.channel_jid} className={channel.channel_jid === activeChannel ? "active-channel" : ""}><div className={`channel-avatar ${["green", "cyan", "violet"][index % 3]}`}><Megaphone size={18} /></div><button className="channel-select" onClick={() => setActiveChannel(channel.channel_jid)}><strong>{channel.name || "Canal sin nombre"}</strong><span>{channel.published_count} publicadas · {channel.queued_count} en cola</span></button><span className="channel-status"><i /> {channel.publish_mode === "active" ? "Activo" : channel.publish_mode === "dry_run" ? "Seguro" : "Pausado"}</span></article>)}
                </div>
              </section>
            </aside>
          </section>
        </div>

        <nav className="mobile-bottom-nav" aria-label="Navegación móvil">{navigation.map(item => { const Icon = item.icon; return <button key={item.label} className={activeNav === item.label ? "active" : ""} onClick={() => navigate(item.label, item.target)}><Icon size={20} /><span>{item.label === "Cola editorial" ? "Cola" : item.label}</span></button>; })}</nav>
      </div>

      {publicationOpen && <PublicationModal channels={data?.channels ?? []} defaultChannel={activeChannel} busy={busy} onClose={() => setPublicationOpen(false)} onSubmit={form => void execute(async () => { await api("/api/v1/publications", { method: "POST", body: form }); setPublicationOpen(false); flash("Publicación agregada a la cola real"); })} />}
      {channelOpen && <ChannelModal busy={busy} onClose={() => setChannelOpen(false)} onSubmit={input => void execute(async () => { await api("/api/v1/channels", { method: "POST", body: JSON.stringify(input) }); setChannelOpen(false); flash("Canal registrado; permiso de administrador confirmado"); })} />}
      {campaignOpen && <CampaignModal channels={data?.channels ?? []} defaultChannel={activeChannel} busy={busy} onClose={() => setCampaignOpen(false)} onSubmit={input => void execute(async () => { await api("/api/v1/campaigns", { method: "POST", body: JSON.stringify(input) }); setCampaignOpen(false); flash("Campaña creada; agrega sus piezas desde WhatsApp"); })} />}
      {toast && <div className={`toast ${toast.error ? "toast-error" : ""}`}>{toast.error ? <X size={18} /> : <CheckCircle2 size={18} />} {toast.message}</div>}
    </main>
  );
}

function SetupScreen({ status, demoMode, onRefresh, onContinue }: { status: StatusResponse | null; demoMode: boolean; onRefresh: () => void; onContinue: () => void }) {
  const connected = status?.runtime.status === "connected";
  const qrPending = status?.runtime.status === "qr_pending" && status.runtime.qrAvailable;
  return (
    <main className="setup-shell">
      <header className="setup-header"><div className="brand setup-brand"><span className="brand-mark"><Image src="/canalbot-mascota.png" alt="Mascota de CanalBot" width={52} height={52} priority /></span><span><span className="brand-name">Canal<span>Bot</span></span><small>Activación local</small></span></div><span className="safe-mode-chip"><LockKeyhole size={15} /> {demoMode ? "Demostración segura" : "Modo seguro: envíos bloqueados"}</span></header>
      <section className="setup-grid">
        <div className="setup-copy"><span className="section-kicker">PRIMERA CONEXIÓN</span><h1>Conecta tu WhatsApp.<br /><span>CanalBot hará el resto.</span></h1><p>Vincula el número que administrará tus canales. Durante esta prueba CanalBot puede conectarse y leer la estructura, pero no enviará mensajes ni publicaciones.</p>
          <ol className="setup-steps">
            <li className={qrPending || connected ? "complete" : "active"}><span>1</span><div><strong>Abre dispositivos vinculados</strong><p>WhatsApp → Ajustes → Dispositivos vinculados.</p></div></li>
            <li className={connected ? "complete" : qrPending ? "active" : ""}><span>2</span><div><strong>Escanea el código QR</strong><p>Usa el teléfono que funcionará como CanalBot.</p></div></li>
            <li className={connected ? "complete" : ""}><span>3</span><div><strong>Confirma la conexión</strong><p>La sesión queda guardada sólo en esta computadora.</p></div></li>
          </ol>
          <div className="setup-services"><div className={connected ? "ok" : "pending"}><Wifi size={18} /><span><strong>WhatsApp</strong><small>{connected ? "Conectado" : status?.runtime.status === "connecting" ? "Preparando QR" : "Pendiente"}</small></span></div><div className={status?.database.connected ? "ok" : "pending"}><Database size={18} /><span><strong>MySQL</strong><small>{status?.database.connected ? "Listo" : "Falta configurar"}</small></span></div></div>
        </div>
        <section className={`qr-card ${connected ? "connected" : ""}`}>
          <div className="qr-card-top"><span><span className={`live-dot ${connected ? "" : "offline"}`} /> {connected ? "SESIÓN CONECTADA" : qrPending ? "QR LISTO" : "CONECTANDO"}</span><button onClick={onRefresh} aria-label="Actualizar estado"><RefreshCw size={17} /></button></div>
          {connected ? <div className="connected-visual"><div className="connected-robot"><Image src="/canalbot-mascota.png" alt="CanalBot conectado" width={180} height={180} /></div><CheckCircle2 size={44} /><h2>¡CanalBot está en línea!</h2><p>{maskedPhone(status?.runtime.phoneJid)}</p></div> : qrPending ? <div className="qr-image-frame"><Image unoptimized src={`${apiOrigin()}/api/v1/qr?updated=${encodeURIComponent(status?.runtime.qrUpdatedAt || "now")}`} alt="Código QR para vincular WhatsApp" width={320} height={320} /><span className="qr-corner top-left" /><span className="qr-corner top-right" /><span className="qr-corner bottom-left" /><span className="qr-corner bottom-right" /></div> : <div className="qr-loading"><div className="pulse-rings"><QrCode size={70} /></div><h2>Preparando la conexión</h2><p>El código aparecerá en cuanto WhatsApp responda.</p></div>}
          <div className="qr-card-footer">{connected ? <button className="primary-button setup-continue" onClick={onContinue}>Entrar al centro editorial <ChevronRight size={17} /></button> : <><Smartphone size={18} /><span>El QR se renueva automáticamente. No compartas esta pantalla.</span></>}</div>
        </section>
      </section>
      {!status?.database.connected && <section className="database-setup-note"><Database size={20} /><div><strong>La conexión del teléfono se puede probar ahora.</strong><p>Para habilitar datos reales del panel, instala MySQL, completa el bloque MYSQL_* en <code>.env</code> y ejecuta <code>npm run migrate</code>.</p></div></section>}
    </main>
  );
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof Inbox; title: string; detail: string }) {
  return <div className="empty-state"><Icon size={24} /><div><strong>{title}</strong><p>{detail}</p></div></div>;
}

function ModalShell({ children, onClose, title, kicker }: { children: React.ReactNode; onClose: () => void; title: string; kicker: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><dialog open className="composer-modal" aria-labelledby="modal-title"><div className="modal-heading"><div><span className="section-kicker">{kicker}</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button></div>{children}</dialog></div>;
}

function PublicationModal({ channels, defaultChannel, busy, onClose, onSubmit }: { channels: Channel[]; defaultChannel: string; busy: boolean; onClose: () => void; onSubmit: (form: FormData) => void }) {
  const [type, setType] = useState<ContentType>("text");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit(new FormData(event.currentTarget)); }
  return <ModalShell onClose={onClose} title="Nueva publicación" kicker="COLA REAL"><form onSubmit={submit}><div className="type-selector">{(Object.keys(contentTypeMeta) as ContentType[]).map(item => { const Icon = contentTypeMeta[item].icon; return <button type="button" key={item} className={type === item ? "active" : ""} onClick={() => setType(item)}><Icon size={19} />{contentTypeMeta[item].label}</button>; })}</div><label className="field-label" htmlFor="publication-copy">Contenido</label><textarea id="publication-copy" name="text" placeholder="Escribe el texto o pie de la publicación…" />{type !== "text" && <label className="upload-area" htmlFor="publication-file"><ImageIcon size={24} /><span>Selecciona tu {type === "video" ? "video" : "imagen"}</span><small>Se copiará al almacenamiento local de CanalBot</small><input id="publication-file" name="file" type="file" accept={type === "video" ? "video/*" : "image/*"} required /></label>}<div className="composer-fields"><label><span>Canal</span><select name="channelJid" defaultValue={defaultChannel || channels[0]?.channel_jid} required>{channels.map(channel => <option key={channel.channel_jid} value={channel.channel_jid}>{channel.name || channel.channel_jid}</option>)}</select></label><label><span>Publicación</span><input name="scheduledAt" type="datetime-local" /></label></div><p className="safe-form-note"><LockKeyhole size={14} /> Se guardará en MySQL, pero el modo seguro impide que se envíe.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Send size={17} /> Agregar a la cola</button></div></form></ModalShell>;
}

function ChannelModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: { reference: string; name: string; adminConfirmed: boolean }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ reference: String(form.get("reference")), name: String(form.get("name")), adminConfirmed: form.get("adminConfirmed") === "on" }); }
  return <ModalShell onClose={onClose} title="Agregar canal" kicker="DESTINO DE WHATSAPP"><form onSubmit={submit}><div className="form-field"><label htmlFor="channel-reference">Enlace del canal</label><div className="input-with-icon"><Link2 size={17} /><input id="channel-reference" name="reference" type="url" placeholder="https://whatsapp.com/channel/…" required /></div></div><label className="form-field"><span>Nombre para guardarlo</span><input name="name" placeholder="Ej. Novedades Tech" maxLength={255} required /><small>El nombre se envía explícitamente porque WhatsApp no siempre lo devuelve.</small></label><div className="command-equivalent"><span>COMANDO EQUIVALENTE</span><code>!ac &lt;enlace&gt; Nombre del canal</code></div><label className="admin-confirm" htmlFor="admin-confirmed"><span className="sr-only">Confirmación de administrador</span><input id="admin-confirmed" name="adminConfirmed" type="checkbox" required /><span><strong>Confirmo que el número vinculado es administrador del canal.</strong><small>Sin permiso de administrador, CanalBot no podrá publicar.</small></span></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><CheckCircle2 size={17} /> Resolver y guardar</button></div></form></ModalShell>;
}

function CampaignModal({ channels, defaultChannel, busy, onClose, onSubmit }: { channels: Channel[]; defaultChannel: string; busy: boolean; onClose: () => void; onSubmit: (input: { name: string; channelJid: string; scheduleTime: string; timezone: string }) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ name: String(form.get("name")), channelJid: String(form.get("channelJid")), scheduleTime: String(form.get("scheduleTime")), timezone: String(form.get("timezone")) }); }
  return <ModalShell onClose={onClose} title="Crear campaña" kicker="ESTRUCTURA REAL"><form onSubmit={submit}><label className="form-field"><span>Nombre</span><input name="name" placeholder="Ej. Frase del día" maxLength={80} required /></label><div className="composer-fields"><label><span>Canal</span><select name="channelJid" defaultValue={defaultChannel || channels[0]?.channel_jid} required>{channels.map(channel => <option key={channel.channel_jid} value={channel.channel_jid}>{channel.name || channel.channel_jid}</option>)}</select></label><label><span>Hora diaria</span><input name="scheduleTime" type="time" defaultValue="09:00" required /></label></div><label className="form-field"><span>Zona horaria</span><input name="timezone" defaultValue="America/Mexico_City" required /></label><p className="safe-form-note"><MessageCircleMore size={14} /> Después agrega sus piezas desde el grupo de control: <code>!camp iniciar Nombre</code>.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy}><Plus size={17} /> Crear campaña</button></div></form></ModalShell>;
}
