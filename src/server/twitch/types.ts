// Twitch Helix API types

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  type: "live" | "";
}

export interface TwitchTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// EventSub types

export interface EventSubWelcome {
  metadata: {
    message_id: string;
    message_type: "session_welcome";
    message_timestamp: string;
  };
  payload: {
    session: {
      id: string;
      status: string;
      connected_at: string;
      keepalive_timeout_seconds: number;
      reconnect_url: string | null;
    };
  };
}

export interface EventSubKeepalive {
  metadata: {
    message_id: string;
    message_type: "session_keepalive";
    message_timestamp: string;
  };
  payload: {};
}

export interface EventSubReconnect {
  metadata: {
    message_id: string;
    message_type: "session_reconnect";
    message_timestamp: string;
  };
  payload: {
    session: {
      id: string;
      reconnect_url: string;
    };
  };
}

export interface EventSubNotification {
  metadata: {
    message_id: string;
    message_type: "notification";
    message_timestamp: string;
    subscription_type: string;
  };
  payload: {
    subscription: {
      id: string;
      type: string;
      version: string;
      status: string;
      condition: Record<string, string>;
    };
    event: ChatMessageEvent;
  };
}

export interface EventSubRevocation {
  metadata: {
    message_id: string;
    message_type: "revocation";
    message_timestamp: string;
  };
  payload: {
    subscription: {
      id: string;
      type: string;
      status: string;
      condition: Record<string, string>;
    };
  };
}

export type EventSubMessage =
  | EventSubWelcome
  | EventSubKeepalive
  | EventSubReconnect
  | EventSubNotification
  | EventSubRevocation;

export interface ChatMessageFragment {
  type: string;
  text: string;
  emote?: {
    id: string;
    emote_set_id?: string;
  };
}

export interface ChatMessageEvent {
  broadcaster_user_id: string;
  broadcaster_user_login: string;
  broadcaster_user_name: string;
  chatter_user_id: string;
  chatter_user_login: string;
  chatter_user_name: string;
  message_id: string;
  message: {
    text: string;
    fragments: ChatMessageFragment[];
  };
  color: string;
  badges: Array<{
    set_id: string;
    id: string;
  }>;
  message_type: string;
}

export interface CreateSubscriptionResponse {
  data: Array<{
    id: string;
    status: string;
    type: string;
    version: string;
    condition: Record<string, string>;
    created_at: string;
    cost: number;
  }>;
  total: number;
  total_cost: number;
  max_total_cost: number;
}
