import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformType } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async saveChatMessage(data: {
    userId: string;
    platformId: string;
    platformType: PlatformType;
    username: string;
    displayName?: string;
    message: string;
    badges?: any;
    emotes?: any;
    color?: string;
  }) {
    return this.prisma.chatMessage.create({
      data: {
        userId: data.userId,
        platformId: data.platformId,
        platformType: data.platformType,
        username: data.username,
        displayName: data.displayName,
        message: data.message,
        badges: data.badges,
        emotes: data.emotes,
        color: data.color,
      },
    });
  }

  async getChatMessages(userId: string, limit: number = 50) {
    return this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        platform: true,
      },
    });
  }

  async moderateMessage(messageId: string, action: 'DELETE' | 'APPROVE', userId: string, reason?: string) {
    // Update message moderation status
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { 
        isModerated: true,
        isDeleted: action === 'DELETE',
      },
    });

    // Create moderation action record
    return this.prisma.moderationAction.create({
      data: {
        userId,
        messageId,
        action,
        reason,
      },
    });
  }
}
