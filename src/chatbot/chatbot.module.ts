import { Module } from '@nestjs/common';
import { ChatBotService } from './chatbot.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [ChatBotService],
  exports: [ChatBotService],
})
export class ChatBotModule {}
