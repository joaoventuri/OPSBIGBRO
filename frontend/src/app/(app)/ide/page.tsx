"use client";

import { Suspense, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { Code2, Play, Square, ExternalLink, Server, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";

interface ServerItem { id: string; name: string; host: string; isOnline: boolean }

export default function IdePage() {
  return <Suspense><IdeContent /></Suspense>;
}

function IdeContent() {
  const searchParams = useSearchParams();
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [activeSession, setActiveSession] = useState<{ serverId: string; url: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ServerItem[]>("/servers").then(setServers).catch(() => {});
  }, []);

  useEffect(() => {
    const sid = searchParams.get("serverId");
    if (sid) startIde(sid);
  }, [searchParams]);

  const startIde = async (serverId: string) => {
    setLoading(serverId);
    setError(null);
    try {
      const data = await api(`/ide/start/${serverId}`, { method: "POST" });
      // Direct tunnel URL — code-server runs natively, no proxy needed
      setActiveSession({ serverId, url: data.url });
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(null);
  };

  const stopIde = async (serverId: string) => {
    await api(`/ide/stop/${serverId}`, { method: "POST" });
    setActiveSession(null);
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Cloud IDE</h1>
        <p className="text-sm text-muted-foreground mt-1">Remote VS Code via code-server with SSH tunnel</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}

      {/* Server list */}
      <div className="grid gap-3 mb-6">
        {servers.map(s => (
          <Card key={s.id} className="border-border/50">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Server className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="font-medium text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{s.host}</span>
                </div>
                <Badge variant={s.isOnline ? "success" : "secondary"}>{s.isOnline ? "Online" : "Offline"}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {activeSession?.serverId === s.id ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => window.open(activeSession.url, "_blank")}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open IDE
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => stopIde(s.id)}>
                      <Square className="h-3.5 w-3.5 mr-1" /> Stop
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => startIde(s.id)} disabled={loading === s.id}>
                    {loading === s.id ? (
                      <span className="animate-pulse">Starting...</span>
                    ) : (
                      <><Play className="h-3.5 w-3.5 mr-1" /> Launch IDE</>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Embedded IDE */}
      {activeSession && (
        <Card className="border-primary/20 neon-glow overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">VS Code — {servers.find(s => s.id === activeSession.serverId)?.name}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => window.open(activeSession.url, "_blank")}>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
          <iframe
            src={activeSession.url}
            className="w-full border-0"
            style={{ height: "calc(100vh - 260px)" }}
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
          />
        </Card>
      )}

      {!activeSession && (
        <Card className="border-dashed border-border/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Code2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p>Select a server and launch the IDE to start coding remotely.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
