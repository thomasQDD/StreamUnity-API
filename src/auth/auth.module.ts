import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { TwitchModule } from '../twitch/twitch.module';
import { ChatBotModule } from '../chatbot/chatbot.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PassportModule,
    TwitchModule,
    ChatBotModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'streamunity_jwt_secret',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '7d' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
