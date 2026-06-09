# Eat WhatsApp Gateway

Mini backend NestJS dedie a WhatsApp Web pour Eat.

## Installation

```bash
npm install
npm run build
npm run start
```

Par defaut, le service demarre sur le port `3003`.

## Variables conseillees sur le VPS

```env
PORT=3003
WHATSAPP_SESSION_DIR=/home/eat/whatsapp-session
WHATSAPP_AUTO_INIT=true
WHATSAPP_READY_TIMEOUT_MS=90000
```

Si Chromium est installe manuellement :

```env
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

## Authentification

Toutes les requetes doivent envoyer le mot de passe hardcode :

```http
x-whatsapp-password: 123Whatsapp?
```

Ou :

```http
Authorization: Bearer 123Whatsapp?
```

## Routes

Base URL si le domaine pointe vers ce service :

```text
https://whatsapp.yaba-in.com/api/whatsapp
```

Routes exposees :

```http
GET  /api/whatsapp/status
GET  /api/whatsapp/qr
POST /api/whatsapp/reset
POST /api/whatsapp/send-test
POST /api/whatsapp/send-text
```

Payload `send-test` et `send-text` :

```json
{
  "phone": "237691224472",
  "message": "Bonjour"
}
```

## Important

Ne lance jamais ce service avec `sudo`, sinon le dossier de session sera cree en root et le reset ne pourra plus le supprimer.

La session WhatsApp reste dans `WHATSAPP_SESSION_DIR`. Ce dossier doit etre persistant sur le VPS.

Si déployé en local
Démarer Ngrock avec une adresse publique fixe pour rendre le service accessible enligne
ngrok http --domain=unallowable-hinderingly-amari.ngrok-free.dev 3003