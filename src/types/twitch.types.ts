export interface TwitchTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string[];
  token_type: string;
}

export interface TwitchUserInfo {
  id: string;
  login: string;
  display_name: string;
  type: string;
  broadcaster_type: string;
  description: string;
  profile_image_url: string;
  offline_image_url: string;
  view_count: number;
  email?: string;
  created_at: string;
}

export interface TwitchChatTags {
  username: string;
  'display-name'?: string;
  badges?: Record<string, string>;
  emotes?: Record<string, string>;
  color?: string;
  'user-id'?: string;
  mod?: boolean;
  subscriber?: boolean;
  turbo?: boolean;
  'room-id'?: string;
  'tmi-sent-ts'?: string;
}

export interface AuthenticatedRequest {
  user: {
    sub: string;
    email: string;
    name: string;
  };
}
