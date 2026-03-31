"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { Plus, Trash2, Activity, ArrowUpCircle, ArrowDownCircle, Shield } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface HealthCheck {
  id: string; name: string; url: string; interval: number;
  isUp: boolean; lastCheckedAt?: string; sslExpiresAt?: string;
}

interface Ping {
  id: string; statusCode?: number; responseTimeMs?: number; isUp: boolean; checkedAt: string;
}

export default function HealthPage() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pings, setPings] = useState<Ping[]>([]);
  const [form, setForm] = useState({ name: "", url: "", interval: 60 });

  const load = () => api<HealthCheck[]>("/health-checks").then(setChecks).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    await api("/health-checks", { method: "POST", body: form });
    setOpen(false);
    setForm({ name: "", url: "", interval: 60 });
    load();
  };

  const remove = async (id: string) => {
    await api(`/health-checks/${id}`, { method: "DELETE" });
    load();
  };

  const viewPings = async (id: string) => {
    setSelectedId(id);
    const data = await api<Ping[]>(`/health-checks/${id}/pings?limit=50`);
    setPings(data.reverse());
  };

  const sslDaysLeft = (date?: string) => {
    if (!date) return null;
    return Math.floor((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WebHealth & SSL</h1>
          <p className="text-sm text-muted-foreground mt-1">Uptime monitoring and SSL certificate tracking</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Monitor</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>New Health Check</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-4">
              <Input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="https://example.com" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Check Interval</label>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={form.interval}
                  onChange={e => setForm({ ...form, interval: parseInt(e.target.value) })}
                >
                  <option value={60}>Every 1 minute</option>
                  <option value={300}>Every 5 minutes</option>
                  <option value={900}>Every 15 minutes</option>
                </select>
              </div>
              <Button className="w-full" onClick={create}>Create Monitor</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {checks.length === 0 && (
          <Card className="border-dashed border-border/50">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Activity className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>No monitors yet. Add a URL to start monitoring.</p>
            </CardContent>
          </Card>
        )}
        {checks.map(c => {
          const days = sslDaysLeft(c.sslExpiresAt);
          return (
            <Card key={c.id} className={`border-border/50 cursor-pointer hover:border-border transition-colors ${selectedId === c.id ? "ring-1 ring-primary/30" : ""}`} onClick={() => viewPings(c.id)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {c.isUp ? (
                    <ArrowUpCircle className="h-5 w-5 text-green-400 drop-shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                  ) : (
                    <ArrowDownCircle className="h-5 w-5 text-red-400" />
                  )}
                  <div>
                    <div className="font-medium text-sm">{c.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{c.url}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {days !== null && (
                    <Badge variant={days < 15 ? "destructive" : "success"} className="text-[10px]">
                      <Shield className="h-3 w-3 mr-1" /> SSL {days}d
                    </Badge>
                  )}
                  <Badge variant={c.isUp ? "success" : "destructive"}>
                    {c.isUp ? "UP" : "DOWN"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {c.interval < 60 ? `${c.interval}s` : `${c.interval / 60}m`}
                  </span>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); remove(c.id); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Ping history chart */}
      {selectedId && pings.length > 0 && (
        <Card className="mt-6 border-border/50">
          <CardContent className="p-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">Response Time (ms)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={pings}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis
                  dataKey="checkedAt" tickFormatter={(v) => new Date(v).toLocaleTimeString()}
                  stroke="#525252" fontSize={11}
                />
                <YAxis stroke="#525252" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#111", border: "1px solid #262626", borderRadius: "6px", fontSize: 12 }}
                  labelFormatter={(v) => new Date(v).toLocaleString()}
                />
                <Line
                  type="monotone" dataKey="responseTimeMs" stroke="#22c55e"
                  strokeWidth={2} dot={false}
                  style={{ filter: "drop-shadow(0 0 3px rgba(34,197,94,0.3))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
