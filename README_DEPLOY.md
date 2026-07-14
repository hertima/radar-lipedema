# Deploy Radar Lipedema na VPS

Este projeto agora tem:

- frontend do app em `index.html`, `styles.css`, `app.js`;
- imagens e assets da pasta `imagem/`;
- servidor Node em `server.js`;
- banco PostgreSQL com schema em `db/schema.sql`;
- deploy por Docker Compose.

Ou seja: o app inteiro sobe na VPS. O HTML tamb&eacute;m vai junto dentro do container `app`.

## 1. Preparar a VPS

No Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin git
sudo systemctl enable --now docker
```

## 2. Enviar o projeto para a VPS

Entre na VPS e coloque o projeto em uma pasta, por exemplo:

```bash
mkdir -p /opt/radar-lipedema
cd /opt/radar-lipedema
```

Envie os arquivos do projeto para essa pasta por `git`, `scp`, SFTP ou painel da hospedagem.

## 3. Criar o arquivo `.env`

Na VPS:

```bash
cp .env.example .env
nano .env
```

Troque principalmente:

```env
POSTGRES_PASSWORD=uma_senha_bem_forte
PGPASSWORD=uma_senha_bem_forte
APP_PORT=3000
```

## 4. Subir app e banco

```bash
docker compose up -d --build
```

Ou use o script:

```bash
chmod +x scripts/deploy-vps.sh
APP_DIR=/opt/radar-lipedema ./scripts/deploy-vps.sh
```

Verificar:

```bash
docker compose ps
docker compose logs -f app
```

Testar no navegador:

```text
http://IP_DA_VPS:3000
http://IP_DA_VPS:3000/api/health
```

## 5. Domínio e HTTPS

Depois que abrir pelo IP, a forma mais limpa é colocar Nginx Proxy Manager, Caddy ou Nginx com Let's Encrypt apontando o domínio para `localhost:3000`.

Exemplo Nginx:

```nginx
server {
  server_name seu-dominio.com.br;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## Rotas da API

- `GET /api/health`: testa servidor e banco.
- `GET /api/bootstrap`: carrega perfil, registros recentes e fotos.
- `PUT /api/profile`: salva perfil e foto.
- `POST /api/records`: salva registros do app.
- `GET /api/records`: lista registros.
- `POST /api/photos`: salva fotos frente/lado/costas.
- `GET /api/photos/latest`: lista fotos mais recentes por posição.
