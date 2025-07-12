import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import { TwitchTokenResponse, TwitchUserInfo } from '../types/twitch.types';

@Injectable()
export class ChatBotService {
  private readonly logger = new Logger(ChatBotService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Génère un nom de bot unique basé sur le nom de l'utilisateur
   */
  private generateBotName(userName: string): string {
    const sanitizedName = userName
      .replace(/[^a-zA-Z0-9]/g, '')
      .substring(0, 10);
    return `StreamUnity${sanitizedName}Bot`;
  }

  /**
   * Crée un nouveau bot pour l'utilisateur automatiquement
   */
  async createBotForUser(userId: string): Promise<{
    botName: string;
    displayName: string;
    authUrl: string;
  }> {
    try {
      // Récupérer les infos de l'utilisateur
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Vérifier si l'utilisateur a déjà un bot
      const existingBot = await this.prisma.chatBot.findUnique({
        where: { userId },
      });

      if (existingBot) {
        return {
          botName: existingBot.botName,
          displayName: existingBot.displayName,
          authUrl: this.generateBotAuthUrl(existingBot.botName),
        };
      }

      // Générer un nom de bot unique
      const botName = this.generateBotName(user.name);
      const displayName = `${user.name}'s StreamUnity Bot`;

      // Créer l'entrée bot dans la base de données
      const bot = await this.prisma.chatBot.create({
        data: {
          userId,
          botName,
          displayName,
          isActive: true,
        },
      });

      this.logger.log(`Created bot ${botName} for user ${userId}`);

      return {
        botName: bot.botName,
        displayName: bot.displayName,
        authUrl: this.generateBotAuthUrl(bot.botName),
      };
    } catch (error) {
      this.logger.error(`Error creating bot for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Génère l'URL d'autorisation Twitch pour le bot
   */
  private generateBotAuthUrl(botName: string): string {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUri = `${frontendUrl}/dashboard?tab=profile&bot_callback=true`;

    const scopes = [
      'user:read:email',
      'chat:read',
      'chat:edit',
      'channel:moderate',
      'whispers:read',
      'whispers:edit',
    ].join(' ');

    if (!clientId) {
      throw new Error('TWITCH_CLIENT_ID is not set');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state: `bot_${botName}`,
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Connecte le bot à Twitch après autorisation OAuth
   */
  async connectBotToTwitch(
    userId: string,
    code: string,
    state: string,
  ): Promise<void> {
    try {
      // Vérifier que le state correspond à un bot de cet utilisateur
      if (!state.startsWith('bot_')) {
        throw new Error('Invalid state parameter for bot connection');
      }

      const bot = await this.prisma.chatBot.findUnique({
        where: { userId },
      });

      if (!bot) {
        throw new Error('Bot not found for user');
      }

      // Échanger le code contre des tokens
      const tokens = await this.exchangeCodeForTokens(code);
      const userInfo = await this.getBotUserInfo(tokens.access_token);

      // Mettre à jour les informations du bot
      await this.prisma.chatBot.update({
        where: { userId },
        data: {
          twitchUserId: userInfo.id,
          twitchUsername: userInfo.login,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        },
      });

      this.logger.log(
        `Connected bot ${bot.botName} to Twitch as ${userInfo.login}`,
      );
    } catch (error) {
      this.logger.error(`Error connecting bot to Twitch:`, error);
      throw error;
    }
  }

  /**
   * Échange le code OAuth contre des tokens
   */
  private async exchangeCodeForTokens(
    code: string,
  ): Promise<TwitchTokenResponse> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUri = `${frontendUrl}/dashboard?tab=profile&bot_callback=true`;

    try {
      const response = await axios.post<TwitchTokenResponse>(
        'https://id.twitch.tv/oauth2/token',
        {
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error exchanging code for tokens', error);
      throw error;
    }
  }

  /**
   * Récupère les informations du bot depuis Twitch
   */
  private async getBotUserInfo(accessToken: string): Promise<TwitchUserInfo> {
    try {
      const response = await axios.get<{ data: TwitchUserInfo[] }>(
        'https://api.twitch.tv/helix/users',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Client-Id': this.configService.get<string>('TWITCH_CLIENT_ID'),
          },
        },
      );

      return response.data.data[0];
    } catch (error) {
      this.logger.error('Error fetching bot user info', error);
      throw error;
    }
  }

  /**
   * Récupère le bot d'un utilisateur
   */
  async getUserBot(userId: string) {
    return await this.prisma.chatBot.findUnique({
      where: { userId },
    });
  }

  /**
   * Vérifie si le bot est connecté à Twitch
   */
  async isBotConnectedToTwitch(userId: string): Promise<boolean> {
    const bot = await this.getUserBot(userId);
    return !!(bot && bot.accessToken && bot.twitchUsername);
  }

  /**
   * Envoie un message de test avec le bot de l'utilisateur
   */
  async sendTestMessage(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const bot = await this.getUserBot(userId);

      if (!bot || !bot.accessToken || !bot.twitchUsername) {
        return {
          success: false,
          message: 'Bot not connected to Twitch',
        };
      }

      // Récupérer les informations de l'utilisateur pour obtenir son channel
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          platforms: {
            where: { platformType: 'TWITCH' },
          },
        },
      });

      if (!user || !user.platforms[0] || !user.platforms[0].username) {
        return {
          success: false,
          message: 'User Twitch channel not found',
        };
      }

      const channelName = user.platforms[0].username;
      const testMessage = `🤖 StreamUnity Bot Test - ${new Date().toLocaleTimeString()} - This bot is managed by ${user.name}`;

      // Envoyer le message via l'API Twitch
      await this.sendBotMessageToChannel(
        bot.accessToken,
        channelName,
        testMessage,
      );

      return {
        success: true,
        message: `Test message sent to #${channelName}! Check your Twitch chat.`,
      };
    } catch (error) {
      this.logger.error(
        `Error sending test message for user ${userId}:`,
        error,
      );
      return {
        success: false,
        message: 'Failed to send test message',
      };
    }
  }

  /**
   * Envoie un message via l'API Twitch Chat
   */
  private async sendBotMessageToChannel(
    botAccessToken: string,
    channelName: string,
    message: string,
  ): Promise<void> {
    try {
      // Récupérer l'ID du broadcaster
      const broadcasterResponse = await axios.get<{ data: TwitchUserInfo[] }>(
        'https://api.twitch.tv/helix/users',
        {
          params: { login: channelName },
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
            'Client-Id': this.configService.get<string>('TWITCH_CLIENT_ID'),
          },
        },
      );

      if (!broadcasterResponse.data.data[0]) {
        throw new Error(`Channel ${channelName} not found`);
      }

      const broadcasterId = broadcasterResponse.data.data[0].id;

      // Récupérer l'ID du bot
      const botResponse = await axios.get<{ data: TwitchUserInfo[] }>(
        'https://api.twitch.tv/helix/users',
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
            'Client-Id': this.configService.get<string>('TWITCH_CLIENT_ID'),
          },
        },
      );

      if (!botResponse.data.data[0]) {
        throw new Error('Bot user info not found');
      }

      const botUserId = botResponse.data.data[0].id;

      // Envoyer le message
      await axios.post(
        'https://api.twitch.tv/helix/chat/messages',
        {
          broadcaster_id: broadcasterId,
          sender_id: botUserId,
          message: message,
        },
        {
          headers: {
            Authorization: `Bearer ${botAccessToken}`,
            'Client-Id': this.configService.get<string>('TWITCH_CLIENT_ID'),
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Bot sent message to #${channelName}: ${message}`);
    } catch (error) {
      this.logger.error(`Error sending bot message to channel:`, error);
      throw error;
    }
  }

  /**
   * Désactive le bot pour un utilisateur
   */
  async deactivateBot(userId: string): Promise<void> {
    await this.prisma.chatBot.update({
      where: { userId },
      data: {
        isActive: false,
        accessToken: null,
        refreshToken: null,
      },
    });
  }
}
