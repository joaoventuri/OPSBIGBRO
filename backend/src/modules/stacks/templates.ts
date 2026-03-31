// Curated stack templates — marketplace of self-hosted apps
// Each template is a complete docker-compose.yml ready to deploy

export interface StackTemplate {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tags: string[];
  website: string;
  compose: string;
}

export const STACK_TEMPLATES: StackTemplate[] = [
  // ─── Productivity ─────────────────────────────────────────
  {
    slug: "n8n",
    name: "n8n",
    description: "Workflow automation tool — connect anything to everything",
    icon: "🔄",
    category: "Automation",
    tags: ["automation", "workflow", "integration", "no-code"],
    website: "https://n8n.io",
    compose: `services:
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      N8N_HOST: \${N8N_HOST:-localhost}
      N8N_PORT: "5678"
      N8N_PROTOCOL: \${N8N_PROTOCOL:-http}
      WEBHOOK_URL: \${WEBHOOK_URL:-http://localhost:5678/}
      GENERIC_TIMEZONE: \${TIMEZONE:-America/Sao_Paulo}
      N8N_ENCRYPTION_KEY: \${N8N_ENCRYPTION_KEY:-change-me-please}
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  n8n_data:`,
  },
  {
    slug: "nocodb",
    name: "NocoDB",
    description: "Open source Airtable alternative — turns any database into a spreadsheet",
    icon: "📊",
    category: "Database",
    tags: ["database", "spreadsheet", "airtable", "no-code"],
    website: "https://nocodb.com",
    compose: `services:
  nocodb:
    image: nocodb/nocodb:latest
    container_name: nocodb
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      NC_DB: "pg://nocodb-db:5432?u=nocodb&p=\${DB_PASSWORD:-nocodb123}&d=nocodb"
    volumes:
      - nocodb_data:/usr/app/data
    depends_on:
      nocodb-db:
        condition: service_healthy

  nocodb-db:
    image: postgres:16-alpine
    container_name: nocodb-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: nocodb
      POSTGRES_PASSWORD: \${DB_PASSWORD:-nocodb123}
      POSTGRES_DB: nocodb
    volumes:
      - nocodb_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nocodb"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  nocodb_data:
  nocodb_pgdata:`,
  },
  {
    slug: "baserow",
    name: "Baserow",
    description: "Open source no-code database and Airtable alternative",
    icon: "🗃️",
    category: "Database",
    tags: ["database", "spreadsheet", "airtable", "no-code"],
    website: "https://baserow.io",
    compose: `services:
  baserow:
    image: baserow/baserow:latest
    container_name: baserow
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      BASEROW_PUBLIC_URL: \${BASEROW_PUBLIC_URL:-http://localhost:8080}
    volumes:
      - baserow_data:/baserow/data

volumes:
  baserow_data:`,
  },
  {
    slug: "uptime-kuma",
    name: "Uptime Kuma",
    description: "Self-hosted monitoring tool like Uptime Robot",
    icon: "📈",
    category: "Monitoring",
    tags: ["monitoring", "uptime", "status-page"],
    website: "https://github.com/louislam/uptime-kuma",
    compose: `services:
  uptime-kuma:
    image: louislam/uptime-kuma:latest
    container_name: uptime-kuma
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - uptime_kuma_data:/app/data

volumes:
  uptime_kuma_data:`,
  },
  {
    slug: "chatwoot",
    name: "Chatwoot",
    description: "Open source customer engagement platform — live chat, email, social",
    icon: "💬",
    category: "Communication",
    tags: ["chat", "support", "crm", "customer-service"],
    website: "https://chatwoot.com",
    compose: `services:
  chatwoot-app:
    image: chatwoot/chatwoot:latest
    container_name: chatwoot-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      RAILS_ENV: production
      SECRET_KEY_BASE: \${SECRET_KEY_BASE:-$(openssl rand -hex 32)}
      FRONTEND_URL: \${FRONTEND_URL:-http://localhost:3000}
      POSTGRES_HOST: chatwoot-db
      POSTGRES_USERNAME: chatwoot
      POSTGRES_PASSWORD: \${DB_PASSWORD:-chatwoot123}
      POSTGRES_DATABASE: chatwoot
      REDIS_URL: redis://chatwoot-redis:6379
      RAILS_LOG_TO_STDOUT: "true"
    entrypoint: docker/entrypoints/rails.sh
    command: ["bundle", "exec", "rails", "s", "-p", "3000", "-b", "0.0.0.0"]
    volumes:
      - chatwoot_storage:/app/storage
    depends_on:
      chatwoot-db:
        condition: service_healthy
      chatwoot-redis:
        condition: service_healthy

  chatwoot-worker:
    image: chatwoot/chatwoot:latest
    container_name: chatwoot-worker
    restart: unless-stopped
    environment:
      RAILS_ENV: production
      SECRET_KEY_BASE: \${SECRET_KEY_BASE:-$(openssl rand -hex 32)}
      POSTGRES_HOST: chatwoot-db
      POSTGRES_USERNAME: chatwoot
      POSTGRES_PASSWORD: \${DB_PASSWORD:-chatwoot123}
      POSTGRES_DATABASE: chatwoot
      REDIS_URL: redis://chatwoot-redis:6379
    entrypoint: docker/entrypoints/rails.sh
    command: ["bundle", "exec", "sidekiq", "-C", "config/sidekiq.yml"]
    volumes:
      - chatwoot_storage:/app/storage
    depends_on:
      chatwoot-db:
        condition: service_healthy
      chatwoot-redis:
        condition: service_healthy

  chatwoot-db:
    image: postgres:16-alpine
    container_name: chatwoot-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: chatwoot
      POSTGRES_PASSWORD: \${DB_PASSWORD:-chatwoot123}
      POSTGRES_DB: chatwoot
    volumes:
      - chatwoot_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chatwoot"]
      interval: 5s
      timeout: 5s
      retries: 5

  chatwoot-redis:
    image: redis:7-alpine
    container_name: chatwoot-redis
    restart: unless-stopped
    volumes:
      - chatwoot_redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  chatwoot_storage:
  chatwoot_pgdata:
  chatwoot_redis:`,
  },
  {
    slug: "wordpress",
    name: "WordPress",
    description: "The most popular CMS in the world",
    icon: "📝",
    category: "CMS",
    tags: ["cms", "blog", "website"],
    website: "https://wordpress.org",
    compose: `services:
  wordpress:
    image: wordpress:latest
    container_name: wordpress
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: wordpress-db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: \${DB_PASSWORD:-wordpress123}
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - wordpress_data:/var/www/html
    depends_on:
      wordpress-db:
        condition: service_healthy

  wordpress-db:
    image: mariadb:11
    container_name: wordpress-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: \${DB_ROOT_PASSWORD:-root123}
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: \${DB_PASSWORD:-wordpress123}
    volumes:
      - wordpress_dbdata:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  wordpress_data:
  wordpress_dbdata:`,
  },
  {
    slug: "ghost",
    name: "Ghost",
    description: "Professional publishing platform — modern alternative to WordPress",
    icon: "👻",
    category: "CMS",
    tags: ["cms", "blog", "newsletter", "publishing"],
    website: "https://ghost.org",
    compose: `services:
  ghost:
    image: ghost:5-alpine
    container_name: ghost
    restart: unless-stopped
    ports:
      - "2368:2368"
    environment:
      url: \${GHOST_URL:-http://localhost:2368}
      database__client: mysql
      database__connection__host: ghost-db
      database__connection__user: ghost
      database__connection__password: \${DB_PASSWORD:-ghost123}
      database__connection__database: ghost
    volumes:
      - ghost_content:/var/lib/ghost/content
    depends_on:
      ghost-db:
        condition: service_healthy

  ghost-db:
    image: mysql:8.0
    container_name: ghost-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: \${DB_ROOT_PASSWORD:-root123}
      MYSQL_DATABASE: ghost
      MYSQL_USER: ghost
      MYSQL_PASSWORD: \${DB_PASSWORD:-ghost123}
    volumes:
      - ghost_dbdata:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  ghost_content:
  ghost_dbdata:`,
  },
  {
    slug: "gitea",
    name: "Gitea",
    description: "Lightweight self-hosted Git service",
    icon: "🍵",
    category: "Development",
    tags: ["git", "repository", "devops", "ci-cd"],
    website: "https://gitea.io",
    compose: `services:
  gitea:
    image: gitea/gitea:latest
    container_name: gitea
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "2222:22"
    environment:
      GITEA__database__DB_TYPE: postgres
      GITEA__database__HOST: gitea-db:5432
      GITEA__database__NAME: gitea
      GITEA__database__USER: gitea
      GITEA__database__PASSWD: \${DB_PASSWORD:-gitea123}
    volumes:
      - gitea_data:/data
    depends_on:
      gitea-db:
        condition: service_healthy

  gitea-db:
    image: postgres:16-alpine
    container_name: gitea-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: gitea
      POSTGRES_PASSWORD: \${DB_PASSWORD:-gitea123}
      POSTGRES_DB: gitea
    volumes:
      - gitea_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gitea"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  gitea_data:
  gitea_pgdata:`,
  },
  {
    slug: "minio",
    name: "MinIO",
    description: "High-performance S3-compatible object storage",
    icon: "🪣",
    category: "Storage",
    tags: ["storage", "s3", "object-storage", "backup"],
    website: "https://min.io",
    compose: `services:
  minio:
    image: minio/minio:latest
    container_name: minio
    restart: unless-stopped
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: \${MINIO_USER:-admin}
      MINIO_ROOT_PASSWORD: \${MINIO_PASSWORD:-minio12345}
    command: server /data --console-address ":9001"
    volumes:
      - minio_data:/data

volumes:
  minio_data:`,
  },
  {
    slug: "portainer",
    name: "Portainer",
    description: "Docker management UI",
    icon: "🐳",
    category: "DevOps",
    tags: ["docker", "management", "containers", "devops"],
    website: "https://portainer.io",
    compose: `services:
  portainer:
    image: portainer/portainer-ce:latest
    container_name: portainer
    restart: unless-stopped
    ports:
      - "9443:9443"
      - "9000:9000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - portainer_data:/data

volumes:
  portainer_data:`,
  },
  {
    slug: "grafana-prometheus",
    name: "Grafana + Prometheus",
    description: "Monitoring stack — metrics collection and dashboards",
    icon: "📊",
    category: "Monitoring",
    tags: ["monitoring", "metrics", "grafana", "prometheus", "dashboards"],
    website: "https://grafana.com",
    compose: `services:
  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_USER: \${GRAFANA_USER:-admin}
      GF_SECURITY_ADMIN_PASSWORD: \${GRAFANA_PASSWORD:-admin123}
    volumes:
      - grafana_data:/var/lib/grafana

  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - prometheus_data:/prometheus

volumes:
  grafana_data:
  prometheus_data:`,
  },
  {
    slug: "nextcloud",
    name: "Nextcloud",
    description: "Self-hosted file sync, share, and collaboration platform",
    icon: "☁️",
    category: "Storage",
    tags: ["cloud", "files", "sync", "collaboration", "office"],
    website: "https://nextcloud.com",
    compose: `services:
  nextcloud:
    image: nextcloud:latest
    container_name: nextcloud
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      POSTGRES_HOST: nextcloud-db
      POSTGRES_DB: nextcloud
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: \${DB_PASSWORD:-nextcloud123}
      REDIS_HOST: nextcloud-redis
    volumes:
      - nextcloud_data:/var/www/html
    depends_on:
      nextcloud-db:
        condition: service_healthy

  nextcloud-db:
    image: postgres:16-alpine
    container_name: nextcloud-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: nextcloud
      POSTGRES_PASSWORD: \${DB_PASSWORD:-nextcloud123}
      POSTGRES_DB: nextcloud
    volumes:
      - nextcloud_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nextcloud"]
      interval: 5s
      timeout: 5s
      retries: 5

  nextcloud-redis:
    image: redis:7-alpine
    container_name: nextcloud-redis
    restart: unless-stopped
    volumes:
      - nextcloud_redis:/data

volumes:
  nextcloud_data:
  nextcloud_pgdata:
  nextcloud_redis:`,
  },
  {
    slug: "plausible",
    name: "Plausible Analytics",
    description: "Privacy-friendly Google Analytics alternative",
    icon: "📈",
    category: "Analytics",
    tags: ["analytics", "privacy", "statistics", "web"],
    website: "https://plausible.io",
    compose: `services:
  plausible:
    image: ghcr.io/plausible/community-edition:latest
    container_name: plausible
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      BASE_URL: \${BASE_URL:-http://localhost:8000}
      SECRET_KEY_BASE: \${SECRET_KEY:-$(openssl rand -base64 48)}
      DATABASE_URL: postgres://plausible:\${DB_PASSWORD:-plausible123}@plausible-db:5432/plausible
      CLICKHOUSE_DATABASE_URL: http://plausible-events:8123/plausible_events
    depends_on:
      plausible-db:
        condition: service_healthy
      plausible-events:
        condition: service_healthy

  plausible-db:
    image: postgres:16-alpine
    container_name: plausible-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: plausible
      POSTGRES_PASSWORD: \${DB_PASSWORD:-plausible123}
      POSTGRES_DB: plausible
    volumes:
      - plausible_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U plausible"]
      interval: 5s
      timeout: 5s
      retries: 5

  plausible-events:
    image: clickhouse/clickhouse-server:latest
    container_name: plausible-events
    restart: unless-stopped
    volumes:
      - plausible_events:/var/lib/clickhouse
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:8123/ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  plausible_pgdata:
  plausible_events:`,
  },
  {
    slug: "vaultwarden",
    name: "Vaultwarden",
    description: "Lightweight Bitwarden-compatible password manager",
    icon: "🔐",
    category: "Security",
    tags: ["password", "security", "vault", "bitwarden"],
    website: "https://github.com/dani-garcia/vaultwarden",
    compose: `services:
  vaultwarden:
    image: vaultwarden/server:latest
    container_name: vaultwarden
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      DOMAIN: \${DOMAIN:-http://localhost:8080}
      ADMIN_TOKEN: \${ADMIN_TOKEN:-change-me}
    volumes:
      - vaultwarden_data:/data

volumes:
  vaultwarden_data:`,
  },
  {
    slug: "directus",
    name: "Directus",
    description: "Open data platform — headless CMS and API builder",
    icon: "🐰",
    category: "CMS",
    tags: ["cms", "headless", "api", "database", "admin"],
    website: "https://directus.io",
    compose: `services:
  directus:
    image: directus/directus:latest
    container_name: directus
    restart: unless-stopped
    ports:
      - "8055:8055"
    environment:
      SECRET: \${SECRET:-$(openssl rand -hex 32)}
      DB_CLIENT: pg
      DB_HOST: directus-db
      DB_PORT: "5432"
      DB_DATABASE: directus
      DB_USER: directus
      DB_PASSWORD: \${DB_PASSWORD:-directus123}
      ADMIN_EMAIL: \${ADMIN_EMAIL:-admin@example.com}
      ADMIN_PASSWORD: \${ADMIN_PASSWORD:-admin123}
    volumes:
      - directus_uploads:/directus/uploads
      - directus_extensions:/directus/extensions
    depends_on:
      directus-db:
        condition: service_healthy

  directus-db:
    image: postgres:16-alpine
    container_name: directus-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: directus
      POSTGRES_PASSWORD: \${DB_PASSWORD:-directus123}
      POSTGRES_DB: directus
    volumes:
      - directus_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U directus"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  directus_uploads:
  directus_extensions:
  directus_pgdata:`,
  },
  {
    slug: "appwrite",
    name: "Appwrite",
    description: "Backend-as-a-Service — auth, database, storage, functions",
    icon: "🏗️",
    category: "Development",
    tags: ["backend", "baas", "firebase", "api", "auth"],
    website: "https://appwrite.io",
    compose: `services:
  appwrite:
    image: appwrite/appwrite:latest
    container_name: appwrite
    restart: unless-stopped
    ports:
      - "8080:80"
    environment:
      _APP_ENV: production
      _APP_OPENSSL_KEY_V1: \${OPENSSL_KEY:-$(openssl rand -hex 16)}
      _APP_REDIS_HOST: appwrite-redis
      _APP_DB_HOST: appwrite-db
      _APP_DB_USER: appwrite
      _APP_DB_PASS: \${DB_PASSWORD:-appwrite123}
      _APP_DB_SCHEMA: appwrite
    volumes:
      - appwrite_uploads:/storage/uploads
      - appwrite_cache:/storage/cache
    depends_on:
      - appwrite-db
      - appwrite-redis

  appwrite-db:
    image: mariadb:11
    container_name: appwrite-db
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: \${DB_ROOT_PASSWORD:-root123}
      MYSQL_DATABASE: appwrite
      MYSQL_USER: appwrite
      MYSQL_PASSWORD: \${DB_PASSWORD:-appwrite123}
    volumes:
      - appwrite_dbdata:/var/lib/mysql

  appwrite-redis:
    image: redis:7-alpine
    container_name: appwrite-redis
    restart: unless-stopped
    volumes:
      - appwrite_redis:/data

volumes:
  appwrite_uploads:
  appwrite_cache:
  appwrite_dbdata:
  appwrite_redis:`,
  },
  {
    slug: "immich",
    name: "Immich",
    description: "Self-hosted Google Photos alternative with AI",
    icon: "📸",
    category: "Media",
    tags: ["photos", "gallery", "ai", "backup", "media"],
    website: "https://immich.app",
    compose: `services:
  immich:
    image: ghcr.io/immich-app/immich-server:release
    container_name: immich
    restart: unless-stopped
    ports:
      - "2283:2283"
    environment:
      DB_HOSTNAME: immich-db
      DB_USERNAME: immich
      DB_PASSWORD: \${DB_PASSWORD:-immich123}
      DB_DATABASE_NAME: immich
      REDIS_HOSTNAME: immich-redis
    volumes:
      - immich_upload:/usr/src/app/upload
    depends_on:
      immich-db:
        condition: service_healthy
      immich-redis:
        condition: service_healthy

  immich-db:
    image: tensorchord/pgvecto-rs:pg16-v0.2.0
    container_name: immich-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: immich
      POSTGRES_PASSWORD: \${DB_PASSWORD:-immich123}
      POSTGRES_DB: immich
    volumes:
      - immich_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U immich"]
      interval: 5s
      timeout: 5s
      retries: 5

  immich-redis:
    image: redis:7-alpine
    container_name: immich-redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  immich_upload:
  immich_pgdata:`,
  },
  {
    slug: "mattermost",
    name: "Mattermost",
    description: "Open source Slack alternative for team communication",
    icon: "💬",
    category: "Communication",
    tags: ["chat", "team", "slack", "collaboration"],
    website: "https://mattermost.com",
    compose: `services:
  mattermost:
    image: mattermost/mattermost-team-edition:latest
    container_name: mattermost
    restart: unless-stopped
    ports:
      - "8065:8065"
    environment:
      MM_SQLSETTINGS_DRIVERNAME: postgres
      MM_SQLSETTINGS_DATASOURCE: postgres://mattermost:\${DB_PASSWORD:-mattermost123}@mattermost-db:5432/mattermost?sslmode=disable
    volumes:
      - mattermost_data:/mattermost/data
      - mattermost_logs:/mattermost/logs
      - mattermost_config:/mattermost/config
      - mattermost_plugins:/mattermost/plugins
    depends_on:
      mattermost-db:
        condition: service_healthy

  mattermost-db:
    image: postgres:16-alpine
    container_name: mattermost-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: mattermost
      POSTGRES_PASSWORD: \${DB_PASSWORD:-mattermost123}
      POSTGRES_DB: mattermost
    volumes:
      - mattermost_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mattermost"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  mattermost_data:
  mattermost_logs:
  mattermost_config:
  mattermost_plugins:
  mattermost_pgdata:`,
  },
  {
    slug: "outline",
    name: "Outline",
    description: "Wiki and knowledge base for teams — beautiful and fast",
    icon: "📖",
    category: "Productivity",
    tags: ["wiki", "docs", "knowledge-base", "team"],
    website: "https://getoutline.com",
    compose: `services:
  outline:
    image: outlinewiki/outline:latest
    container_name: outline
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      SECRET_KEY: \${SECRET_KEY:-$(openssl rand -hex 32)}
      UTILS_SECRET: \${UTILS_SECRET:-$(openssl rand -hex 32)}
      DATABASE_URL: postgres://outline:\${DB_PASSWORD:-outline123}@outline-db:5432/outline
      REDIS_URL: redis://outline-redis:6379
      URL: \${URL:-http://localhost:3000}
      FILE_STORAGE: local
      FILE_STORAGE_LOCAL_ROOT_DIR: /var/lib/outline/data
    volumes:
      - outline_data:/var/lib/outline/data
    depends_on:
      outline-db:
        condition: service_healthy
      outline-redis:
        condition: service_healthy

  outline-db:
    image: postgres:16-alpine
    container_name: outline-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: outline
      POSTGRES_PASSWORD: \${DB_PASSWORD:-outline123}
      POSTGRES_DB: outline
    volumes:
      - outline_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U outline"]
      interval: 5s
      timeout: 5s
      retries: 5

  outline-redis:
    image: redis:7-alpine
    container_name: outline-redis
    restart: unless-stopped

volumes:
  outline_data:
  outline_pgdata:`,
  },
  {
    slug: "supabase",
    name: "Supabase",
    description: "Open source Firebase alternative — database, auth, storage, edge functions",
    icon: "⚡",
    category: "Development",
    tags: ["backend", "baas", "firebase", "postgres", "api", "auth"],
    website: "https://supabase.com",
    compose: `services:
  supabase-studio:
    image: supabase/studio:latest
    container_name: supabase-studio
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      STUDIO_PG_META_URL: http://supabase-meta:8080
      SUPABASE_URL: http://supabase-kong:8000
      SUPABASE_REST_URL: http://supabase-kong:8000/rest/v1/

  supabase-db:
    image: supabase/postgres:15.6.1.145
    container_name: supabase-db
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: \${DB_PASSWORD:-supabase123}
    volumes:
      - supabase_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U supabase_admin"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  supabase_pgdata:`,
  },
  {
    slug: "paperless-ngx",
    name: "Paperless-ngx",
    description: "Document management system — scan, organize, search your papers",
    icon: "📄",
    category: "Productivity",
    tags: ["documents", "scanner", "ocr", "paperless"],
    website: "https://docs.paperless-ngx.com",
    compose: `services:
  paperless:
    image: ghcr.io/paperless-ngx/paperless-ngx:latest
    container_name: paperless
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      PAPERLESS_REDIS: redis://paperless-redis:6379
      PAPERLESS_DBHOST: paperless-db
      PAPERLESS_DBUSER: paperless
      PAPERLESS_DBPASS: \${DB_PASSWORD:-paperless123}
      PAPERLESS_ADMIN_USER: \${ADMIN_USER:-admin}
      PAPERLESS_ADMIN_PASSWORD: \${ADMIN_PASSWORD:-admin123}
    volumes:
      - paperless_data:/usr/src/paperless/data
      - paperless_media:/usr/src/paperless/media
      - paperless_consume:/usr/src/paperless/consume
    depends_on:
      paperless-db:
        condition: service_healthy
      paperless-redis:
        condition: service_healthy

  paperless-db:
    image: postgres:16-alpine
    container_name: paperless-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: paperless
      POSTGRES_PASSWORD: \${DB_PASSWORD:-paperless123}
      POSTGRES_DB: paperless
    volumes:
      - paperless_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U paperless"]
      interval: 5s
      timeout: 5s
      retries: 5

  paperless-redis:
    image: redis:7-alpine
    container_name: paperless-redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  paperless_data:
  paperless_media:
  paperless_consume:
  paperless_pgdata:`,
  },
];

export const STACK_CATEGORIES = [
  { key: "", label: "All", icon: "🔥" },
  { key: "Automation", label: "Automation", icon: "🔄" },
  { key: "CMS", label: "CMS", icon: "📝" },
  { key: "Communication", label: "Communication", icon: "💬" },
  { key: "Database", label: "Database", icon: "🗄️" },
  { key: "Development", label: "Development", icon: "🛠️" },
  { key: "DevOps", label: "DevOps", icon: "🐳" },
  { key: "Media", label: "Media", icon: "📸" },
  { key: "Monitoring", label: "Monitoring", icon: "📊" },
  { key: "Productivity", label: "Productivity", icon: "📋" },
  { key: "Security", label: "Security", icon: "🔐" },
  { key: "Storage", label: "Storage", icon: "☁️" },
  { key: "Analytics", label: "Analytics", icon: "📈" },
];
