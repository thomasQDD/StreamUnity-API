# Configuration du Bot Twitch StreamUnity

Ce guide explique comment configurer le bot Twitch pour StreamUnity.

## Étapes de configuration

### 1. Créer un compte Twitch pour le bot

1. Allez sur https://www.twitch.tv/signup
2. Créez un nouveau compte avec un nom comme `StreamUnityBot` ou `StreamUnity_Bot`
3. Vérifiez l'email du compte

### 2. Créer une application Twitch pour le bot

1. Allez sur https://dev.twitch.tv/console/apps
2. Cliquez sur "Register Your Application"
3. Remplissez les informations :
   - **Name**: StreamUnity Bot
   - **OAuth Redirect URLs**: `http://localhost:3001`
   - **Category**: Application Integration
4. Cliquez sur "Create"
5. Notez le **Client ID** (vous en aurez besoin)

### 3. Obtenir le token OAuth pour le bot

#### Option A: Utilisation de l'API StreamUnity (Recommandé)

1. Démarrez le serveur StreamUnity API
2. Allez sur http://localhost:3001/twitch/bot-auth-url
3. Copiez l'URL d'autorisation retournée
4. Connectez-vous avec le compte bot sur Twitch
5. Visitez l'URL d'autorisation dans votre navigateur
6. Autorisez l'application
7. Vous serez redirigé vers `http://localhost:3001?code=XXXXX`
8. Copiez le code de l'URL

#### Option B: Méthode manuelle

Construisez l'URL d'autorisation manuellement :
```
https://id.twitch.tv/oauth2/authorize?client_id=VOTRE_CLIENT_ID&redirect_uri=http://localhost:3001&response_type=code&scope=chat:read chat:edit
```

### 4. Échanger le code contre un token

Utilisez cURL ou Postman pour échanger le code :

```bash
curl -X POST 'https://id.twitch.tv/oauth2/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=VOTRE_CLIENT_ID' \
  -d 'client_secret=VOTRE_CLIENT_SECRET' \
  -d 'code=LE_CODE_OBTENU' \
  -d 'grant_type=authorization_code' \
  -d 'redirect_uri=http://localhost:3001'
```

Vous obtiendrez une réponse comme :
```json
{
  "access_token": "abcdefghijklmnopqrstuvwxyz",
  "refresh_token": "zyxwvutsrqponmlkjihgfedcba",
  "expires_in": 3600,
  "scope": ["chat:read", "chat:edit"],
  "token_type": "bearer"
}
```

### 5. Configurer le fichier .env

Mettez à jour votre fichier `.env` :

```bash
# Twitch Bot Configuration
TWITCH_BOT_USERNAME="StreamUnityBot"
TWITCH_BOT_TOKEN="abcdefghijklmnopqrstuvwxyz"
```

⚠️ **Important** : N'ajoutez PAS le préfixe `oauth:` au token dans le fichier .env, il sera ajouté automatiquement par le code.

### 6. Tester la configuration

1. Redémarrez le serveur StreamUnity API
2. Vérifiez le statut du bot : http://localhost:3001/twitch/bot-status
3. Connectez un utilisateur à Twitch via l'interface
4. L'utilisateur doit ajouter le bot comme modérateur sur son canal
5. Testez l'envoi de messages

## Commandes utiles

### Vérifier le statut du bot
```bash
curl http://localhost:3001/twitch/bot-status
```

### Obtenir l'URL d'autorisation du bot
```bash
curl http://localhost:3001/twitch/bot-auth-url
```

## Dépannage

### Le bot ne peut pas envoyer de messages
- Vérifiez que le bot est modérateur du canal
- Vérifiez que le token a les bons scopes (chat:read, chat:edit)
- Vérifiez que les variables d'environnement sont correctes

### Token expiré
- Utilisez le refresh_token pour obtenir un nouveau access_token
- Ou répétez le processus d'autorisation

### Bot non trouvé
- Vérifiez que TWITCH_BOT_USERNAME correspond au nom exact du compte bot
- Vérifiez que le compte bot existe et est actif

## Architecture technique

Le bot fonctionne ainsi :
1. Utilise un compte Twitch dédié (pas celui de l'utilisateur)
2. Se connecte au chat IRC de Twitch avec le token du bot
3. Rejoint automatiquement les canaux des utilisateurs connectés
4. Envoie des messages avec le nom du bot
5. Nécessite les permissions de modérateur pour écrire