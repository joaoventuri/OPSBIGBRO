"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import {
  Globe, Plus, Trash2, Power, RefreshCw, Loader2, CheckCircle2, AlertCircle,
  Rocket, ExternalLink, Shield,
} from "lucide-react";

interface DomainItem {
  id: string; domain: string; containerName: string; containerPort: number;
  ssl: boolean; enabled: boolean; serverId: string;
  server: { id: string; name: string; host: string };
}

interface ServerItem { id: string; name: string; host: string }

export default function DomainsPage() {
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [open, setOpen] = useState(false);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [form, setForm] = useState({ domain: "", containerName: "", containerPort: 80, ssl: true, serverId: "" });

  const load = () => api<DomainItem[]>("/domains").then(setDomains).catch(() => {});
  useEffect(() => {
    load();
    api<ServerItem[]>("/servers").then(setServers).catch(() => {});
  }, []);

  const create = async () => {
    await api("/domains", { method: "POST", body: form });
    setOpen(false);
    setForm({ domain: "", containerName: "", containerPort: 80, ssl: true, serverId: "" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this domain route?")) return;
    await api(`/domains/${id}`, { method: "DELETE" });
    load();
  };

  const toggle = async (id: string) => {
    await api(`/domains/${id}/toggle`, { method: "PUT" });
    load();
  };

  const deploy = async (serverId: string) => {
    setDeploying(serverId);
    setToast(null);
    try {
      const data = await api(`/domains/deploy/${serverId}`, { method: "POST", body: { email: "admin@opsbigbro.local" } });
      setToast({ type: "success", message: data.message });
    } catch (err: any) {
      setToast({ type: "error", message: err.message });
    }
    setDeploying(null);
    setTimeout(() => setToast(null), 8000);
  };

  const sync = async (serverId: string) => {
    setDeploying(serverId);
    try {
      const data = await api(`/domains/sync/${serverId}`, { method: "POST" });
      setToast({ type: "success", message: `Synced ${data.synced} route(s) — Traefik will reload automatically` });
    } catch (err: any) {
      setToast({ type: "error", message: err.message });
    }
    setDeploying(null);
    setTimeout(() => setToast(null), 5000);
  };

  // Group domains by server
  const grouped = servers
    .filter(s => domains.some(d => d.serverId === s.id))
    .map(s => ({ server: s, domains: domains.filter(d => d.serverId === s.id) }));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Domains</h1>
          <p className="text-sm text-muted-foreground mt-1">Route domains to containers via Traefik with automatic SSL</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add Route</Button>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New Domain Route</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Server</label>
                <select className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={form.serverId} onChange={e => setForm({ ...form, serverId: e.target.value })}>
                  <option value="">Select server...</option>
                  {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.host})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Domain</label>
                <Input className="mt-1 font-mono" placeholder="app.example.com" value={form.domain}
                  onChange={e => setForm({ ...form, domain: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Container Name</label>
                  <Input className="mt-1 font-mono" placeholder="my-app" value={form.containerName}
                    onChange={e => setForm({ ...form, containerName: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Port</label>
                  <Input className="mt-1" type="number" value={form.containerPort}
                    onChange={e => setForm({ ...form, containerPort: parseInt(e.target.value) || 80 })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="ssl" checked={form.ssl}
                  onChange={e => setForm({ ...form, ssl: e.target.checked })} className="accent-primary" />
                <label htmlFor="ssl" className="text-sm">Enable SSL (Let's Encrypt)</label>
              </div>
              <Button className="w-full" onClick={create} disabled={!form.domain || !form.containerName || !form.serverId}>
                Add Domain Route
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
          toast.type === "success" ? "border-green-500/30 bg-green-500/10 text-green-400" : "border-red-500/30 bg-red-500/10 text-red-400"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-auto opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

      {domains.length === 0 && (
        <Card className="border-dashed border-border/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Globe className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="mb-2">No domain routes configured.</p>
            <p className="text-xs">Add a route to point a domain to a Docker container. Traefik handles SSL automatically.</p>
          </CardContent>
        </Card>
      )}

      {grouped.map(({ server, domains: serverDomains }) => (
        <div key={server.id} className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">{server.name} <span className="font-mono text-xs">({server.host})</span></h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => sync(server.id)} disabled={deploying === server.id}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync
              </Button>
              <Button size="sm" onClick={() => deploy(server.id)} disabled={deploying === server.id}>
                {deploying === server.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Rocket className="h-3.5 w-3.5 mr-1" />}
                Deploy Traefik
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {serverDomains.map(d => (
              <Card key={d.id} className={`border-border/50 ${!d.enabled ? "opacity-50" : ""}`}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Globe className={`h-5 w-5 ${d.enabled ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm font-mono">{d.domain}</span>
                        {d.ssl && <Badge variant="success" className="text-[10px]"><Shield className="h-2.5 w-2.5 mr-0.5" />SSL</Badge>}
                        {!d.enabled && <Badge variant="secondary" className="text-[10px]">Disabled</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        → {d.containerName}:{d.containerPort}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => window.open(`http${d.ssl ? "s" : ""}://${d.domain}`, "_blank")} title="Open">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle(d.id)} title={d.enabled ? "Disable" : "Enable"}>
                      <Power className={`h-3.5 w-3.5 ${d.enabled ? "text-green-400" : ""}`} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => remove(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
