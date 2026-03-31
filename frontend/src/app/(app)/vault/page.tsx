"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { Plus, FolderOpen, Copy, Eye, EyeOff, Trash2, KeyRound, Shield } from "lucide-react";

interface Group { id: string; name: string; icon?: string; _count: { credentials: number } }
interface Cred {
  id: string; title: string; login: string; url?: string;
  isOtp: boolean; password?: string; otpSecret?: string;
  groupId: string;
}

export default function VaultPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [credForm, setCredForm] = useState({
    title: "", login: "", url: "", isOtp: false, password: "", otpSecret: "", groupId: "",
  });

  const loadGroups = () => api<Group[]>("/vault/groups").then(setGroups).catch(() => {});
  const loadCreds = (gid?: string) => {
    const q = gid ? `?groupId=${gid}` : "";
    api<Cred[]>(`/vault/credentials${q}`).then(setCreds).catch(() => {});
  };

  useEffect(() => { loadGroups(); loadCreds(); }, []);

  const selectGroup = (id: string | null) => {
    setActiveGroup(id);
    loadCreds(id ?? undefined);
  };

  const createGroup = async () => {
    await api("/vault/groups", { method: "POST", body: { name: newGroup } });
    setNewGroup("");
    setGroupOpen(false);
    loadGroups();
  };

  const createCred = async () => {
    await api("/vault/credentials", { method: "POST", body: { ...credForm, groupId: credForm.groupId || activeGroup } });
    setCredOpen(false);
    setCredForm({ title: "", login: "", url: "", isOtp: false, password: "", otpSecret: "", groupId: "" });
    loadCreds(activeGroup ?? undefined);
  };

  const deleteCred = async (id: string) => {
    await api(`/vault/credentials/${id}`, { method: "DELETE" });
    loadCreds(activeGroup ?? undefined);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Access Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">Credential vault and OTP management</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><FolderOpen className="h-4 w-4 mr-2" /> New Group</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader><DialogTitle>New Group</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-4">
                <Input value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="Group name" />
                <Button className="w-full" onClick={createGroup}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={credOpen} onOpenChange={setCredOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Add Credential</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Credential</DialogTitle></DialogHeader>
              <div className="space-y-3 mt-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Group</label>
                  <select
                    className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={credForm.groupId || activeGroup || ""}
                    onChange={e => setCredForm({ ...credForm, groupId: e.target.value })}
                  >
                    <option value="">Select group...</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <Input placeholder="Title" value={credForm.title} onChange={e => setCredForm({ ...credForm, title: e.target.value })} />
                <Input placeholder="Login (user/email)" value={credForm.login} onChange={e => setCredForm({ ...credForm, login: e.target.value })} />
                <Input placeholder="URL (optional)" value={credForm.url} onChange={e => setCredForm({ ...credForm, url: e.target.value })} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isOtp" checked={credForm.isOtp} onChange={e => setCredForm({ ...credForm, isOtp: e.target.checked })} className="accent-primary" />
                  <label htmlFor="isOtp" className="text-sm">OTP (2FA) Credential</label>
                </div>
                {credForm.isOtp ? (
                  <Input placeholder="TOTP Secret Seed" value={credForm.otpSecret} onChange={e => setCredForm({ ...credForm, otpSecret: e.target.value })} />
                ) : (
                  <Input type="password" placeholder="Password" value={credForm.password} onChange={e => setCredForm({ ...credForm, password: e.target.value })} />
                )}
                <Button className="w-full" onClick={createCred}>Save Credential</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar groups */}
        <div className="w-48 shrink-0 space-y-1">
          <button
            onClick={() => selectGroup(null)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${!activeGroup ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
          >
            All Credentials
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => selectGroup(g.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between ${activeGroup === g.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
            >
              <span className="truncate">{g.name}</span>
              <span className="text-xs opacity-50">{g._count.credentials}</span>
            </button>
          ))}
        </div>

        {/* Credential list */}
        <div className="flex-1 space-y-2">
          {creds.length === 0 && (
            <Card className="border-dashed border-border/50">
              <CardContent className="p-8 text-center text-muted-foreground">
                <KeyRound className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p>No credentials found. Add one to get started.</p>
              </CardContent>
            </Card>
          )}
          {creds.map(c => (
            <CredentialCard key={c.id} cred={c} onDelete={() => deleteCred(c.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CredentialCard({ cred, onDelete }: { cred: Cred; onDelete: () => void }) {
  const [showPw, setShowPw] = useState(false);

  return (
    <Card className="border-border/50">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${cred.isOtp ? "bg-yellow-500/10 text-yellow-400" : "bg-primary/10 text-primary"}`}>
            {cred.isOtp ? <Shield className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm flex items-center gap-2">
              {cred.title}
              {cred.isOtp && <Badge variant="warning" className="text-[10px]">OTP</Badge>}
            </div>
            <div className="text-xs text-muted-foreground font-mono truncate">{cred.login}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cred.isOtp && cred.otpSecret ? (
            <OtpDisplay secret={cred.otpSecret} />
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-sm font-mono">{showPw ? cred.password : "••••••••"}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setShowPw(!showPw)}>
                {showPw ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigator.clipboard.writeText(cred.password || "")}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OtpDisplay({ secret }: { secret: string }) {
  const [code, setCode] = useState("------");
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const generate = async () => {
      try {
        const { authenticator } = await import("otplib");
        const c = authenticator.generate(secret);
        setCode(c);
      } catch {
        setCode("ERROR");
      }
    };

    const tick = () => {
      const epoch = Math.floor(Date.now() / 1000);
      const remaining = 30 - (epoch % 30);
      setProgress((remaining / 30) * 100);
      if (remaining === 30) generate();
    };

    generate();
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [secret]);

  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <span className="text-lg font-mono font-bold tracking-[0.3em] text-primary neon-text">{code}</span>
      <svg width="44" height="44" className="-rotate-90">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="#262626" strokeWidth="3" />
        <circle
          cx="22" cy="22" r={radius} fill="none" stroke="#22c55e" strokeWidth="3"
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="transition-all duration-1000 linear"
          style={{ filter: "drop-shadow(0 0 3px rgba(34,197,94,0.5))" }}
        />
      </svg>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigator.clipboard.writeText(code)}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
