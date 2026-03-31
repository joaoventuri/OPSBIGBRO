"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { Server, KeyRound, Activity, Container } from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState({ servers: 0, online: 0, credentials: 0, healthChecks: 0, healthUp: 0, containers: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api("/servers").catch(() => []),
      api("/vault/credentials").catch(() => []),
      api("/health-checks").catch(() => []),
      api("/containers").catch(() => []),
    ]).then(([servers, credentials, healthChecks, containers]) => {
      setStats({
        servers: servers.length,
        online: servers.filter((s: any) => s.isOnline).length,
        credentials: credentials.length,
        healthChecks: healthChecks.length,
        healthUp: healthChecks.filter((h: any) => h.isUp).length,
        containers: containers.length,
      });
      setLoading(false);
    });
  }, []);

  const cards = [
    {
      title: "Servers",
      value: stats.servers,
      sub: `${stats.online} online`,
      icon: Server,
      color: "text-primary",
    },
    {
      title: "Credentials",
      value: stats.credentials,
      sub: "in vault",
      icon: KeyRound,
      color: "text-blue-400",
    },
    {
      title: "Health Checks",
      value: stats.healthChecks,
      sub: `${stats.healthUp} healthy`,
      icon: Activity,
      color: "text-yellow-400",
    },
    {
      title: "Containers",
      value: stats.containers,
      sub: "tracked",
      icon: Container,
      color: "text-purple-400",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Infrastructure overview at a glance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="neon-glow border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold font-mono">{loading ? "—" : card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Backend API</span>
                <Badge variant="success">Operational</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Database</span>
                <Badge variant="success">Connected</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Redis Queue</span>
                <Badge variant="success">Active</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              <a href="/servers" className="flex items-center gap-2 rounded-md bg-secondary p-3 text-sm hover:bg-secondary/80 transition-colors">
                <Server className="h-4 w-4 text-primary" /> Add Server
              </a>
              <a href="/vault" className="flex items-center gap-2 rounded-md bg-secondary p-3 text-sm hover:bg-secondary/80 transition-colors">
                <KeyRound className="h-4 w-4 text-blue-400" /> Add Credential
              </a>
              <a href="/health" className="flex items-center gap-2 rounded-md bg-secondary p-3 text-sm hover:bg-secondary/80 transition-colors">
                <Activity className="h-4 w-4 text-yellow-400" /> Add Monitor
              </a>
              <a href="/docker" className="flex items-center gap-2 rounded-md bg-secondary p-3 text-sm hover:bg-secondary/80 transition-colors">
                <Container className="h-4 w-4 text-purple-400" /> View Containers
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
