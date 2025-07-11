# StreamUnity API

A NestJS-based API for the StreamUnity multi-platform streaming chat application.

## Features

- **Authentication**: JWT-based authentication with user registration and login
- **Real-time Chat**: WebSocket-based real-time chat functionality
- **Database**: PostgreSQL with Prisma ORM
- **Platform Integration**: Ready for multi-platform streaming APIs (Twitch, YouTube, TikTok, etc.)
- **Chat Moderation**: Built-in chat moderation tools

## Technology Stack

- **Framework**: NestJS with TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Authentication**: JWT with bcrypt
- **Real-time**: Socket.IO
- **Validation**: class-validator

## Setup Instructions

### Prerequisites

- Node.js 18+ 
- Docker (for PostgreSQL)
- npm

### Database Setup

1. Start PostgreSQL using Docker:
```bash
docker-compose up -d
```

Or manually:
```bash
docker run --name streamunity-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=streamunity_db -p 5432:5432 -d postgres:latest
```

2. Run database migrations:
```bash
npm run prisma:migrate
```

3. Generate Prisma client:
```bash
npm run prisma:generate
```

### Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Run the application:
```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## API Endpoints

### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login user

### WebSocket Events
- `joinRoom` - Join a chat room
- `leaveRoom` - Leave a chat room
- `newMessage` - Send a new chat message
- `moderateMessage` - Moderate a chat message

## Database Schema

The database includes the following main entities:

- **User**: User accounts with authentication
- **Platform**: Connected streaming platforms
- **ChatSettings**: User chat preferences
- **ChatMessage**: Chat messages from all platforms
- **ModerationAction**: Chat moderation logs

## Development

### Running Tests
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Database Management
```bash
# Generate Prisma client
npm run prisma:generate

# Push schema changes (development only)
npm run prisma:push

# Create and run new migration
npm run prisma:migrate

# Deploy migrations (production)
npm run prisma:deploy

# View database in browser
npm run prisma:studio

# Reset database (removes all data)
npx prisma migrate reset
```

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: JWT signing secret
- `JWT_EXPIRES_IN`: JWT expiration time
- `PORT`: Server port (default: 3001)
- `FRONTEND_URL`: Frontend URL for CORS

## Platform API Integration

The API is ready for integration with streaming platforms:

- Twitch
- YouTube
- TikTok
- Facebook Gaming
- Kick

Each platform requires API credentials to be configured in the environment variables.
