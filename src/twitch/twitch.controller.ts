import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TwitchService } from './twitch.service';
import { ConfigService } from '@nestjs/config';

@Controller('twitch')
export class TwitchController {
  constructor(
    private twitchService: TwitchService,
    private configService: ConfigService,
  ) {}

  @Get('auth-url')
  @UseGuards(JwtAuthGuard)
  getAuthUrl(@Query('redirect_uri') redirectUri: string) {
    if (!redirectUri) {
      throw new BadRequestException('redirect_uri is required');
    }

    const clientId = process.env.TWITCH_CLIENT_ID;
    const scopes = [
      'user:read:email',
      'chat:read',
      'chat:edit',
      'channel:moderate',
      'whispers:read',
      'whispers:edit',
    ].join(' ');

    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}`;

    return { authUrl };
  }

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  async connectTwitch(
    @Body() body: { code: string; redirectUri: string },
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    const { code, redirectUri } = body;

    try {
      const tokens = await this.twitchService.exchangeCodeForTokens(
        code,
        redirectUri,
      );
      const platform = await this.twitchService.connectPlatform(
        userId,
        tokens.access_token,
        tokens.refresh_token,
      );

      await this.twitchService.initializeChatBot(userId);

      return {
        success: true,
        platform: {
          id: platform.id,
          username: platform.username,
          isConnected: platform.isConnected,
        },
      };
    } catch (error) {
      throw new BadRequestException('Failed to connect Twitch account');
    }
  }

  @Post('send-message')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Body() body: { message: string }, @Req() req: any) {
    const userId = req.user.sub;
    const { message } = body;

    try {
      await this.twitchService.sendMessage(userId, message);
      return { success: true };
    } catch (error) {
      throw new BadRequestException('Failed to send message');
    }
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectTwitch(@Req() req: any) {
    const userId = req.user.sub;

    try {
      await this.twitchService.disconnectBot(userId);
      return { success: true };
    } catch (error) {
      throw new BadRequestException('Failed to disconnect Twitch bot');
    }
  }

  @Get('bot-status')
  getBotStatus() {
    return this.twitchService.getBotStatus();
  }

  @Get('bot-auth-url')
  getBotAuthUrl() {
    const authUrl = this.twitchService.generateBotAuthUrl();
    return { authUrl };
  }

  @Get('callback')
  async universalCallback(
    @Query('code') code: string, 
    @Query('error') error: string,
    @Query('state') state: string
  ) {
    if (error) {
      return { 
        success: false, 
        error: error,
        message: 'Authorization failed'
      };
    }

    if (!code) {
      return { 
        success: false, 
        message: 'No authorization code received'
      };
    }

    // Check if this is a bot callback (state parameter indicates bot auth)
    if (state && state.startsWith('bot_')) {
      // Bot authentication callback
      const result = await this.twitchService.exchangeBotCodeForToken(code);
      
      return {
        type: 'bot',
        success: result.success,
        token: result.token,
        autoConfigured: result.autoConfigured,
        message: result.message,
        instructions: result.success ? 
          (result.autoConfigured ? [
            '✅ Configuration automatique réussie!',
            '🔄 Redémarrez votre serveur pour appliquer les changements',
            '🧪 Testez avec: curl http://localhost:3001/twitch/bot-status',
            '📝 Puis connectez un utilisateur et testez l\'envoi de messages'
          ] : [
            'Copiez le token ci-dessus',
            'Mettez à jour votre .env file: TWITCH_BOT_TOKEN="' + result.token + '"',
            'Redémarrez votre serveur',
            'Testez avec: curl http://localhost:3001/twitch/bot-status'
          ]) : [
          'Vérifiez votre configuration Twitch app',
          'Vérifiez Client ID et Client Secret dans .env',
          'Réessayez le processus d\'autorisation'
        ]
      };
    } else {
      // User authentication callback - redirect to frontend
      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/dashboard?tab=profile&twitch_callback=true&code=${code}&state=${state}`;
      
      return {
        type: 'user',
        success: true,
        message: 'User authentication code received',
        redirectUrl: redirectUrl,
        instructions: [
          'This is a user authentication callback',
          'You should be redirected to the frontend automatically',
          'If not, go to: ' + redirectUrl
        ]
      };
    }
  }
}
