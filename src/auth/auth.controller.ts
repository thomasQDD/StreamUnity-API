import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Get,
  Req,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TwitchService } from '../twitch/twitch.service';
import { ChatBotService } from '../chatbot/chatbot.service';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  AuthenticatedRequest,
  TwitchTokenResponse,
  TwitchUserInfo,
} from '../types/twitch.types';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private twitchService: TwitchService,
    private chatBotService: ChatBotService,
    private configService: ConfigService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: { email: string; password: string }) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  @Post('register')
  async register(
    @Body() registerDto: { email: string; password: string; name: string },
  ) {
    const user = await this.authService.register(
      registerDto.email,
      registerDto.password,
      registerDto.name,
    );
    return this.authService.login(user);
  }

  // Twitch OAuth endpoints
  @Post('twitch/callback')
  @UseGuards(JwtAuthGuard)
  async twitchCallback(
    @Body() body: { code: string; state: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.sub;
    const { code } = body;

    try {
      // Use the redirect URI that matches what the frontend sent
      const redirectUri = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard?tab=profile&twitch_callback=true`;

      const tokens: TwitchTokenResponse =
        await this.twitchService.exchangeCodeForTokens(code, redirectUri);
      const userInfo: TwitchUserInfo = await this.twitchService.getUserInfo(
        tokens.access_token,
      );

      await this.twitchService.connectPlatform(
        userId,
        tokens.access_token,
        tokens.refresh_token,
      );

      // Initialize the chat bot
      await this.twitchService.initializeChatBot(userId);

      // Créer automatiquement un bot pour l'utilisateur
      try {
        await this.chatBotService.createBotForUser(userId);
      } catch (error) {
        console.warn('Failed to create bot for user:', error);
        // Ne pas faire échouer la connexion Twitch si la création du bot échoue
      }

      return {
        id: userInfo.id,
        username: userInfo.login,
        displayName: userInfo.display_name,
        profileImageUrl: userInfo.profile_image_url,
        isConnected: true,
        connectedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in Twitch callback:', error);
      throw new UnauthorizedException('Failed to connect Twitch account');
    }
  }

  @Get('twitch/connection')
  @UseGuards(JwtAuthGuard)
  async getTwitchConnection(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;

    try {
      const platform = await this.twitchService.getPlatform(userId);

      if (!platform || !platform.isConnected || !platform.accessToken) {
        return null;
      }

      // Get fresh user info from Twitch
      const userInfo: TwitchUserInfo = await this.twitchService.getUserInfo(
        platform.accessToken,
      );

      return {
        id: userInfo.id,
        username: userInfo.login,
        displayName: userInfo.display_name,
        profileImageUrl: userInfo.profile_image_url,
        isConnected: true,
        connectedAt:
          platform.lastSynced?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error getting Twitch connection:', error);
      return null;
    }
  }

  @Delete('twitch/disconnect')
  @UseGuards(JwtAuthGuard)
  async disconnectTwitch(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;

    try {
      await this.twitchService.disconnectBot(userId);
      await this.twitchService.disconnectPlatform(userId);

      return { success: true };
    } catch (error) {
      console.error('Error disconnecting Twitch:', error);
      throw new UnauthorizedException('Failed to disconnect Twitch account');
    }
  }

  @Post('twitch/test-bot')
  @UseGuards(JwtAuthGuard)
  async testTwitchBot(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;

    try {
      const platform = await this.twitchService.getPlatform(userId);

      if (!platform || !platform.isConnected) {
        return {
          success: false,
          message: 'Twitch account not connected',
        };
      }

      // Check if bot is already connected
      const isConnected = this.twitchService.isBotConnected(userId);

      if (isConnected) {
        return {
          success: true,
          message: 'Bot is connected and ready to moderate your chat',
        };
      } else {
        // Try to reconnect the bot
        await this.twitchService.initializeChatBot(userId);
        return {
          success: true,
          message: 'Bot reconnected successfully',
        };
      }
    } catch (error) {
      console.error('Error testing Twitch bot:', error);
      return {
        success: false,
        message: 'Failed to connect bot to your channel',
      };
    }
  }

  @Post('twitch/send-test-message')
  @UseGuards(JwtAuthGuard)
  async sendTestMessage(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;

    try {
      const platform = await this.twitchService.getPlatform(userId);

      if (!platform || !platform.isConnected) {
        return {
          success: false,
          message: 'Twitch account not connected',
        };
      }

      // Check if bot is connected
      const isConnected = this.twitchService.isBotConnected(userId);

      if (!isConnected) {
        return {
          success: false,
          message: 'Bot is not connected to your channel',
        };
      }

      // Send test message with bot name
      const botUsername =
        this.configService.get<string>('TWITCH_BOT_USERNAME') ||
        'StreamUnityBot';
      const testMessage = `🤖 ${botUsername} est connecté ! Test réussi - ${new Date().toLocaleTimeString()}`;
      await this.twitchService.sendMessage(userId, testMessage);

      return {
        success: true,
        message: 'Test message sent successfully! Check your Twitch chat.',
      };
    } catch (error) {
      console.error('Error sending test message:', error);
      return {
        success: false,
        message: 'Failed to send test message. Make sure the bot is connected.',
      };
    }
  }

  // Bot management endpoints
  @Post('bot/create')
  @UseGuards(JwtAuthGuard)
  async createBot(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;

    try {
      const botInfo = await this.chatBotService.createBotForUser(userId);

      return {
        success: true,
        bot: botInfo,
        message: 'Bot created successfully. Please authorize it on Twitch.',
      };
    } catch (error) {
      console.error('Error creating bot:', error);
      return {
        success: false,
        message: 'Failed to create bot',
      };
    }
  }

  @Get('bot/status')
  @UseGuards(JwtAuthGuard)
  async getBotStatus(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;

    try {
      const bot = await this.chatBotService.getUserBot(userId);

      if (!bot) {
        return {
          hasBot: false,
          message: 'No bot found for this user',
        };
      }

      const isConnectedToTwitch =
        await this.chatBotService.isBotConnectedToTwitch(userId);

      return {
        hasBot: true,
        bot: {
          botName: bot.botName,
          displayName: bot.displayName,
          isActive: bot.isActive,
          isConnectedToTwitch,
          twitchUsername: bot.twitchUsername,
        },
      };
    } catch (error) {
      console.error('Error getting bot status:', error);
      return {
        hasBot: false,
        message: 'Error retrieving bot status',
      };
    }
  }

  @Post('bot/connect-twitch')
  @UseGuards(JwtAuthGuard)
  async connectBotToTwitch(
    @Body() body: { code: string; state: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.sub;
    const { code, state } = body;

    try {
      await this.chatBotService.connectBotToTwitch(userId, code, state);

      return {
        success: true,
        message: 'Bot successfully connected to Twitch',
      };
    } catch (error) {
      console.error('Error connecting bot to Twitch:', error);
      return {
        success: false,
        message: 'Failed to connect bot to Twitch',
      };
    }
  }

  @Post('bot/send-test-message')
  @UseGuards(JwtAuthGuard)
  async sendBotTestMessage(@Req() req: AuthenticatedRequest) {
    const userId = req.user.sub;

    try {
      const result = await this.chatBotService.sendTestMessage(userId);
      return result;
    } catch (error) {
      console.error('Error sending bot test message:', error);
      return {
        success: false,
        message: 'Failed to send test message with bot',
      };
    }
  }
}
