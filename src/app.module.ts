import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { TwitchModule } from './twitch/twitch.module';
import { ChatBotModule } from './chatbot/chatbot.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    ChatModule,
    TwitchModule,
    ChatBotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
