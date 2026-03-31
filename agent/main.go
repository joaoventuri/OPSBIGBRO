package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Metric struct {
	Token       string      `json:"token"`
	CPUPercent  float64     `json:"cpuPercent"`
	RAMUsedMb   float64     `json:"ramUsedMb"`
	RAMTotalMb  float64     `json:"ramTotalMb"`
	DiskUsedGb  float64     `json:"diskUsedGb"`
	DiskTotalGb float64     `json:"diskTotalGb"`
	DiskReadKb  float64     `json:"diskReadKb"`
	DiskWriteKb float64     `json:"diskWriteKb"`
	NetRxKb     float64     `json:"netRxKb"`
	NetTxKb     float64     `json:"netTxKb"`
	Containers  []Container `json:"containers,omitempty"`
}

type Container struct {
	ContainerID string  `json:"containerId"`
	Name        string  `json:"name"`
	Image       string  `json:"image"`
	Status      string  `json:"status"`
	CPUPercent  float64 `json:"cpuPercent"`
	RAMUsageMb  float64 `json:"ramUsageMb"`
	RAMLimitMb  float64 `json:"ramLimitMb"`
}

var (
	token    string
	apiURL   string
	interval int
)

func init() {
	flag.StringVar(&token, "token", "", "Agent authentication token")
	flag.StringVar(&apiURL, "api", "http://localhost:3001", "API base URL")
	flag.IntVar(&interval, "interval", 60, "Collection interval in seconds")
}

func main() {
	flag.Parse()

	if token == "" {
		log.Fatal("--token is required")
	}

	log.Printf("[OBB Agent] Starting. API=%s Interval=%ds", apiURL, interval)

	for {
		metric := collect()
		metric.Token = token
		send(metric)
		time.Sleep(time.Duration(interval) * time.Second)
	}
}

func collect() Metric {
	m := Metric{}

	// CPU
	if out, err := exec.Command("bash", "-c",
		"top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").Output(); err == nil {
		val, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
		m.CPUPercent = val
	}

	// RAM
	if out, err := exec.Command("bash", "-c",
		"free -m | awk 'NR==2{printf \"%s %s\", $3, $2}'").Output(); err == nil {
		parts := strings.Fields(strings.TrimSpace(string(out)))
		if len(parts) == 2 {
			m.RAMUsedMb, _ = strconv.ParseFloat(parts[0], 64)
			m.RAMTotalMb, _ = strconv.ParseFloat(parts[1], 64)
		}
	}

	// Disk
	if out, err := exec.Command("bash", "-c",
		"df -BG / | awk 'NR==2{gsub(/G/,\"\"); printf \"%s %s\", $3, $2}'").Output(); err == nil {
		parts := strings.Fields(strings.TrimSpace(string(out)))
		if len(parts) == 2 {
			m.DiskUsedGb, _ = strconv.ParseFloat(parts[0], 64)
			m.DiskTotalGb, _ = strconv.ParseFloat(parts[1], 64)
		}
	}

	// Network (simplified)
	if out, err := exec.Command("bash", "-c",
		"cat /proc/net/dev | awk 'NR>2{rx+=$2; tx+=$10} END{printf \"%.0f %.0f\", rx/1024, tx/1024}'").Output(); err == nil {
		parts := strings.Fields(strings.TrimSpace(string(out)))
		if len(parts) == 2 {
			m.NetRxKb, _ = strconv.ParseFloat(parts[0], 64)
			m.NetTxKb, _ = strconv.ParseFloat(parts[1], 64)
		}
	}

	// Docker containers
	if _, err := os.Stat("/var/run/docker.sock"); err == nil {
		m.Containers = collectDockerContainers()
	}

	_ = runtime.NumCPU()
	return m
}

func collectDockerContainers() []Container {
	out, err := exec.Command("docker", "ps", "-a",
		"--format", "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}").Output()
	if err != nil {
		return nil
	}

	var containers []Container
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "|", 4)
		if len(parts) < 4 {
			continue
		}
		status := "running"
		if strings.Contains(strings.ToLower(parts[3]), "exited") {
			status = "exited"
		} else if strings.Contains(strings.ToLower(parts[3]), "paused") {
			status = "paused"
		}
		containers = append(containers, Container{
			ContainerID: parts[0],
			Name:        parts[1],
			Image:       parts[2],
			Status:      status,
		})
	}

	// Get stats for running containers
	statsOut, err := exec.Command("docker", "stats", "--no-stream",
		"--format", "{{.ID}}|{{.CPUPerc}}|{{.MemUsage}}").Output()
	if err == nil {
		statsLines := strings.Split(strings.TrimSpace(string(statsOut)), "\n")
		for _, sl := range statsLines {
			sp := strings.SplitN(sl, "|", 3)
			if len(sp) < 3 {
				continue
			}
			id := sp[0]
			cpuStr := strings.TrimSuffix(sp[1], "%")
			cpu, _ := strconv.ParseFloat(cpuStr, 64)

			for i, c := range containers {
				if c.ContainerID == id {
					containers[i].CPUPercent = cpu
					// Parse mem like "100MiB / 512MiB"
					memParts := strings.Split(sp[2], "/")
					if len(memParts) == 2 {
						containers[i].RAMUsageMb = parseMem(strings.TrimSpace(memParts[0]))
						containers[i].RAMLimitMb = parseMem(strings.TrimSpace(memParts[1]))
					}
				}
			}
		}
	}

	return containers
}

func parseMem(s string) float64 {
	s = strings.TrimSpace(s)
	if strings.HasSuffix(s, "GiB") {
		v, _ := strconv.ParseFloat(strings.TrimSuffix(s, "GiB"), 64)
		return v * 1024
	}
	if strings.HasSuffix(s, "MiB") {
		v, _ := strconv.ParseFloat(strings.TrimSuffix(s, "MiB"), 64)
		return v
	}
	if strings.HasSuffix(s, "KiB") {
		v, _ := strconv.ParseFloat(strings.TrimSuffix(s, "KiB"), 64)
		return v / 1024
	}
	return 0
}

func send(m Metric) {
	body, _ := json.Marshal(m)
	resp, err := http.Post(apiURL+"/api/telemetry/ingest", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[OBB Agent] Send failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("[OBB Agent] API returned %d", resp.StatusCode)
	} else {
		fmt.Printf(".")
	}
}
