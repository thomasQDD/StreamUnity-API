import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as tmi from 'tmi.js';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import {
  TwitchTokenResponse,
  TwitchUserInfo,
  TwitchChatTags,
} from '../types/twitch.types';

@Injectable()
export class TwitchService {
  private readonly logger = new Logger(TwitchService.name);
  private clients: Map<string, tmi.Client> = new Map();

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async exchangeCodeForTokens(
    code: string,
    redirectUri: string,
  ): Promise<TwitchTokenResponse> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');

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

  async getUserInfo(accessToken: string): Promise<TwitchUserInfo> {
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
      this.logger.error('Error fetching user info', error);
      throw error;
    }
  }

  async connectPlatform(
    userId: string,
    accessToken: string,
    refreshToken: string,
  ) {
    const userInfo = await this.getUserInfo(accessToken);

    return this.prisma.platform.upsert({
      where: {
        userId_platformType: {
          userId: userId,
          platformType: 'TWITCH',
        },
      },
      update: {
        accessToken,
        refreshToken,
        username: userInfo.login,
        channelId: userInfo.id,
        isConnected: true,
        lastSynced: new Date(),
      },
      create: {
        userId,
        platformType: 'TWITCH',
        accessToken,
        refreshToken,
        username: userInfo.login,
        channelId: userInfo.id,
        isConnected: true,
        lastSynced: new Date(),
      },
    });
  }

  async initializeChatBot(userId: string) {
    const platform = await this.prisma.platform.findUnique({
      where: {
        userId_platformType: {
          userId: userId,
          platformType: 'TWITCH',
        },
      },
    });

    if (!platform || !platform.isConnected) {
      throw new Error('Twitch platform not connected');
    }

    // Get bot credentials from environment
    const botUsername = this.configService.get<string>('TWITCH_BOT_USERNAME');
    const botToken = this.configService.get<string>('TWITCH_BOT_TOKEN');

    if (!botUsername || !botToken) {
      throw new Error(
        'Bot credentials not configured. Please set TWITCH_BOT_USERNAME and TWITCH_BOT_TOKEN',
      );
    }

    // Create bot client that connects with dedicated bot account
    // The bot will join the user's channel and can send messages as the bot
    const formattedToken = botToken.startsWith('oauth:')
      ? botToken
      : `oauth:${botToken}`;

    const client = new tmi.Client({
      options: { debug: true },
      connection: {
        reconnect: true,
        secure: true,
      },
      identity: {
        username: botUsername,
        password: formattedToken,
      },
      channels: [platform.username || ''],
    });

    client.on('message', (channel, tags, message, self) => {
      if (self) return;

      void this.handleChatMessage(
        userId,
        channel,
        tags as TwitchChatTags,
        message,
      );
    });

    client.on('connected', () => {
      this.logger.log(`Connected to Twitch chat for user ${userId}`);
    });

    client.on('disconnected', (reason) => {
      this.logger.warn(
        `Disconnected from Twitch chat for user ${userId}: ${reason}`,
      );
    });

    await client.connect();
    this.clients.set(userId, client);

    return client;
  }

  private async handleChatMessage(
    userId: string,
    _channel: string,
    tags: TwitchChatTags,
    message: string,
  ): Promise<void> {
    try {
      const platform = await this.prisma.platform.findUnique({
        where: {
          userId_platformType: {
            userId: userId,
            platformType: 'TWITCH',
          },
        },
      });

      if (!platform) return;

      const savedMessage = await this.prisma.chatMessage.create({
        data: {
          userId,
          platformId: platform.id,
          platformType: 'TWITCH',
          username: tags.username,
          displayName: tags['display-name'] || tags.username,
          message,
          badges: tags.badges || {},
          emotes: tags.emotes || {},
          color: tags.color,
        },
      });

      // Emit message to WebSocket clients
      this.broadcastMessage(userId, savedMessage);
    } catch (error) {
      this.logger.error('Error handling chat message', error);
    }
  }

  private broadcastMessage(userId: string, message: unknown): void {
    // Use the ChatGateway to broadcast the message
    const globalObj = global as typeof global & {
      chatGateway?: {
        broadcastTwitchMessage: (userId: string, message: unknown) => void;
      };
    };

    if (globalObj.chatGateway) {
      globalObj.chatGateway.broadcastTwitchMessage(userId, message);
    }
  }

  async sendMessage(userId: string, message: string) {
    const client = this.clients.get(userId);
    if (!client) {
      throw new Error('Bot not connected for this user');
    }

    const platform = await this.prisma.platform.findUnique({
      where: {
        userId_platformType: {
          userId: userId,
          platformType: 'TWITCH',
        },
      },
    });

    if (!platform) {
      throw new Error('Twitch platform not found');
    }

    await client.say(platform.username || '', message);
  }

  async disconnectBot(userId: string) {
    const client = this.clients.get(userId);
    if (client) {
      await client.disconnect();
      this.clients.delete(userId);
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<TwitchTokenResponse> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');

    try {
      const response = await axios.post<TwitchTokenResponse>(
        'https://id.twitch.tv/oauth2/token',
        {
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        },
      );

      return response.data;
    } catch (error) {
      this.logger.error('Error refreshing access token', error);
      throw error;
    }
  }

  async getPlatform(userId: string) {
    return this.prisma.platform.findUnique({
      where: {
        userId_platformType: {
          userId: userId,
          platformType: 'TWITCH',
        },
      },
    });
  }

  async disconnectPlatform(userId: string) {
    return this.prisma.platform.update({
      where: {
        userId_platformType: {
          userId: userId,
          platformType: 'TWITCH',
        },
      },
      data: {
        isConnected: false,
        accessToken: null,
        refreshToken: null,
      },
    });
  }

  isBotConnected(userId: string): boolean {
    return this.clients.has(userId);
  }

  /**
   * Generate OAuth URL for bot authentication
   * This is used to get the initial bot token manually
   * The bot needs chat:edit scope to send messages
   */
  generateBotAuthUrl(): string {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const redirectUri = 'http://localhost:3001/twitch/callback'; // Universal callback endpoint
    const state = 'bot_auth_' + Math.random().toString(36).substring(7); // Indicate this is bot auth

    const scopes = ['chat:read', 'chat:edit'].join(' ');

    return `https://id.twitch.tv/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;
  }

  /**
   * Exchange authorization code for bot token automatically
   */
  async exchangeBotCodeForToken(code: string): Promise<{
    success: boolean;
    token?: string;
    message: string;
    autoConfigured?: boolean;
  }> {
    const clientId = this.configService.get<string>('TWITCH_CLIENT_ID');
    const clientSecret = this.configService.get<string>('TWITCH_CLIENT_SECRET');
    const redirectUri = 'http://localhost:3001/twitch/callback';

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

      const token = response.data.access_token;

      // Try to automatically update the .env file
      try {
        const envPath = path.join(process.cwd(), '.env');

        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, 'utf8');

          // Replace the bot token line
          if (envContent.includes('TWITCH_BOT_TOKEN=')) {
            envContent = envContent.replace(
              /TWITCH_BOT_TOKEN=.*/,
              `TWITCH_BOT_TOKEN="${token}"`,
            );
          } else {
            // Add the token if it doesn't exist
            envContent += `\nTWITCH_BOT_TOKEN="${token}"`;
          }

          fs.writeFileSync(envPath, envContent);

          return {
            success: true,
            token: token,
            autoConfigured: true,
            message:
              'Token obtained and automatically configured! Restart your server to apply changes.',
          };
        }
      } catch (fileError) {
        this.logger.warn('Could not automatically update .env file', fileError);
      }

      return {
        success: true,
        token: token,
        autoConfigured: false,
        message: `Token obtained successfully! Manually add this to your .env: TWITCH_BOT_TOKEN="${token}"`,
      };
    } catch (error) {
      this.logger.error('Error exchanging bot code for token', error);
      return {
        success: false,
        message: 'Failed to exchange code for token. Check your credentials.',
      };
    }
  }

  /**
   * Get bot configuration status
   */
  getBotStatus(): { configured: boolean; username?: string; message: string } {
    const botUsername = this.configService.get<string>('TWITCH_BOT_USERNAME');
    const botToken = this.configService.get<string>('TWITCH_BOT_TOKEN');

    if (!botUsername || !botToken || botToken === 'your_bot_oauth_token_here') {
      return {
        configured: false,
        message:
          'Bot not configured. Please set TWITCH_BOT_USERNAME and TWITCH_BOT_TOKEN in .env file',
      };
    }

    return {
      configured: true,
      username: botUsername,
      message: `Bot configured as ${botUsername}`,
    };
  }
}
