"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { BarChart3, Cpu, HardDrive, MemoryStick, Network } from "lucide-react";
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ServerItem { id: string; name: string; host: string; isOnline: boolean }
interface Metric {
  cpuPercent: number; ramUsedMb: number; ramTotalMb: number;
  diskUsedGb: number; diskTotalGb: number; netRxKb: number; netTxKb: number;
  collectedAt: string;
}

export default function TelemetryPage() {
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [hours, setHours] = useState(6);

  useEffect(() => {
    api<ServerItem[]>("/servers").then((data) => {
      setServers(data);
      if (data.length > 0) setSelectedServer(data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedServer) return;
    api<Metric[]>(`/telemetry/servers/${selectedServer}/metrics?hours=${hours}`)
      .then(setMetrics).catch(() => setMetrics([]));
  }, [selectedServer, hours]);

  const latest = metrics[metrics.length - 1];
  const ramPercent = latest ? (latest.ramUsedMb / latest.ramTotalMb * 100).toFixed(1) : "—";
  const diskPercent = latest ? (latest.diskUsedGb / latest.diskTotalGb * 100).toFixed(1) : "—";

  const chartData = metrics.map(m => ({
    time: new Date(m.collectedAt).toLocaleTimeString(),
    cpu: m.cpuPercent,
    ram: (m.ramUsedMb / m.ramTotalMb * 100),
    disk: (m.diskUsedGb / m.diskTotalGb * 100),
    netRx: m.netRxKb,
    netTx: m.netTxKb,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Telemetry</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time server metrics and performance data</p>
        </div>
        <div className="flex gap-2">
          {[1, 6, 24, 72].map(h => (
            <Button key={h} size="sm" variant={hours === h ? "default" : "outline"} onClick={() => setHours(h)}>
              {h}h
            </Button>
          ))}
        </div>
      </div>

      {/* Server selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {servers.map(s => (
          <Button
            key={s.id} size="sm"
            variant={selectedServer === s.id ? "default" : "outline"}
            onClick={() => setSelectedServer(s.id)}
          >
            <span className={`h-1.5 w-1.5 rounded-full mr-2 ${s.isOnline ? "bg-green-400" : "bg-gray-500"}`} />
            {s.name}
          </Button>
        ))}
        {servers.length === 0 && (
          <p className="text-sm text-muted-foreground">No servers with active agents. Install an agent first.</p>
        )}
      </div>

      {/* Current stats */}
      {latest && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">CPU</span>
                <Cpu className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl font-bold font-mono">{latest.cpuPercent.toFixed(1)}%</div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">RAM</span>
                <MemoryStick className="h-4 w-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold font-mono">{ramPercent}%</div>
              <div className="text-xs text-muted-foreground">{latest.ramUsedMb.toFixed(0)} / {latest.ramTotalMb.toFixed(0)} MB</div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Disk</span>
                <HardDrive className="h-4 w-4 text-yellow-400" />
              </div>
              <div className="text-2xl font-bold font-mono">{diskPercent}%</div>
              <div className="text-xs text-muted-foreground">{latest.diskUsedGb.toFixed(1)} / {latest.diskTotalGb.toFixed(1)} GB</div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Network</span>
                <Network className="h-4 w-4 text-purple-400" />
              </div>
              <div className="text-lg font-bold font-mono">
                <span className="text-green-400">{latest.netRxKb.toFixed(0)}</span>
                <span className="text-muted-foreground text-xs mx-1">/</span>
                <span className="text-blue-400">{latest.netTxKb.toFixed(0)}</span>
                <span className="text-xs text-muted-foreground ml-1">KB/s</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">CPU Usage (%)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="time" stroke="#525252" fontSize={10} />
                  <YAxis stroke="#525252" fontSize={10} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #262626", borderRadius: "6px", fontSize: 11 }} />
                  <Area type="monotone" dataKey="cpu" stroke="#22c55e" fill="#22c55e" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">RAM Usage (%)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="time" stroke="#525252" fontSize={10} />
                  <YAxis stroke="#525252" fontSize={10} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #262626", borderRadius: "6px", fontSize: 11 }} />
                  <Area type="monotone" dataKey="ram" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Disk Usage (%)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="time" stroke="#525252" fontSize={10} />
                  <YAxis stroke="#525252" fontSize={10} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #262626", borderRadius: "6px", fontSize: 11 }} />
                  <Area type="monotone" dataKey="disk" stroke="#eab308" fill="#eab308" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Network (KB/s)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis dataKey="time" stroke="#525252" fontSize={10} />
                  <YAxis stroke="#525252" fontSize={10} />
                  <Tooltip contentStyle={{ backgroundColor: "#111", border: "1px solid #262626", borderRadius: "6px", fontSize: 11 }} />
                  <Line type="monotone" dataKey="netRx" stroke="#22c55e" strokeWidth={2} dot={false} name="RX" />
                  <Line type="monotone" dataKey="netTx" stroke="#3b82f6" strokeWidth={2} dot={false} name="TX" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {chartData.length === 0 && selectedServer && (
        <Card className="border-dashed border-border/50">
          <CardContent className="p-8 text-center text-muted-foreground">
            <BarChart3 className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p>No metrics data yet. Install the agent on this server to start collecting data.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
