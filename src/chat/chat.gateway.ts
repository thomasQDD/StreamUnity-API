import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; roomId: string },
  ) {
    await client.join(data.roomId);
    console.log(`Client ${client.id} joined room ${data.roomId}`);
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    await client.leave(data.roomId);
    console.log(`Client ${client.id} left room ${data.roomId}`);
  }

  @SubscribeMessage('newMessage')
  async handleNewMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      userId: string;
      platformId: string;
      platformType: string;
      username: string;
      displayName?: string;
      message: string;
      badges?: any;
      emotes?: any;
      color?: string;
      roomId: string;
    },
  ) {
    // Save message to database
    const savedMessage = await this.chatService.saveChatMessage({
      userId: data.userId,
      platformId: data.platformId,
      platformType: data.platformType as any,
      username: data.username,
      displayName: data.displayName,
      message: data.message,
      badges: data.badges,
      emotes: data.emotes,
      color: data.color,
    });

    // Broadcast to all clients in the room
    this.server.to(data.roomId).emit('message', {
      id: savedMessage.id,
      username: savedMessage.username,
      displayName: savedMessage.displayName,
      message: savedMessage.message,
      platformType: savedMessage.platformType,
      badges: savedMessage.badges,
      emotes: savedMessage.emotes,
      color: savedMessage.color,
      timestamp: savedMessage.timestamp,
    });
  }

  @SubscribeMessage('moderateMessage')
  async handleModerateMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      messageId: string;
      action: 'DELETE' | 'APPROVE';
      userId: string;
      reason?: string;
      roomId: string;
    },
  ) {
    await this.chatService.moderateMessage(
      data.messageId,
      data.action,
      data.userId,
      data.reason,
    );

    // Broadcast moderation action to all clients in the room
    this.server.to(data.roomId).emit('messageModerated', {
      messageId: data.messageId,
      action: data.action,
      moderatedBy: data.userId,
    });
  }
}
