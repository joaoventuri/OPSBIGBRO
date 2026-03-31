"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { Plus, Trash2, Bell, Webhook } from "lucide-react";

const ALL_EVENTS = [
  "health.down", "health.up", "ssl.expiring",
  "container.exited", "metric.alert",
];

interface WebhookItem {
  id: string; name: string; url: string; events: string[]; isActive: boolean;
}

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", events: [] as string[] });

  const load = () => api<WebhookItem[]>("/webhooks").then(setWebhooks).catch(() => {});
  useEffect(() => { load(); }, []);

  const create = async () => {
    await api("/webhooks", { method: "POST", body: form });
    setOpen(false);
    setForm({ name: "", url: "", events: [] });
    load();
  };

  const remove = async (id: string) => {
    await api(`/webhooks/${id}`, { method: "DELETE" });
    load();
  };

  const toggleEvent = (event: string) => {
    setForm(f => ({
      ...f,
      events: f.events.includes(event) ? f.events.filter(e => e !== event) : [...f.events, event],
    }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure alert endpoints for Slack, Discord, or any URL</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Add Webhook</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Webhook</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-4">
              <Input placeholder="Name (e.g. Slack Alerts)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <Input placeholder="https://hooks.slack.com/..." value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Events</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {ALL_EVENTS.map(ev => (
                    <button
                      key={ev}
                      type="button"
                      onClick={() => toggleEvent(ev)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        form.events.includes(ev)
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-secondary text-muted-foreground border-border hover:bg-secondary/80"
                      }`}
                    >
                      {ev}
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={create} disabled={!form.name || !form.url || form.events.length === 0}>
                Create Webhook
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {webhooks.length === 0 && (
          <Card className="border-dashed border-border/50">
            <CardContent className="p-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p>No webhooks configured. Add one to receive alerts.</p>
            </CardContent>
          </Card>
        )}
        {webhooks.map(w => (
          <Card key={w.id} className="border-border/50">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Webhook className="h-4 w-4 text-primary" />
                <div>
                  <div className="font-medium text-sm">{w.name}</div>
                  <div className="text-xs text-muted-foreground font-mono truncate max-w-xs">{w.url}</div>
                  <div className="flex gap-1 mt-1">
                    {w.events.map(ev => (
                      <Badge key={ev} variant="secondary" className="text-[10px]">{ev}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => remove(w.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
