"use client";

import type { MessageFragment } from "@/hooks/use-websocket";

const TWITCH_EMOTE_BASE =
  "https://static-cdn.jtvnw.net/emoticons/v2";

type EmoteSize = "1.0" | "2.0" | "3.0";

function getEmoteUrl(emoteId: string, size: EmoteSize) {
  return `${TWITCH_EMOTE_BASE}/${emoteId}/default/dark/${size}`;
}

interface Props {
  messageText: string;
  fragments?: MessageFragment[] | null;
  className?: string;
}

export function ChatMessage({ messageText, fragments, className }: Props) {
  if (!fragments || fragments.length === 0) {
    return <span className={className}>{messageText}</span>;
  }

  return (
    <span className={className}>
      {fragments.map((fragment, index) => {
        if (fragment.type === "emote" && fragment.emoteId) {
          const alt = fragment.text || "emote";
          return (
            <img
              key={`${fragment.emoteId}-${index}`}
              className="chat-emote"
              src={getEmoteUrl(fragment.emoteId, "1.0")}
              srcSet={`${getEmoteUrl(fragment.emoteId, "1.0")} 1x, ${getEmoteUrl(fragment.emoteId, "2.0")} 2x, ${getEmoteUrl(fragment.emoteId, "3.0")} 3x`}
              alt={alt}
              title={alt}
              loading="lazy"
            />
          );
        }

        return (
          <span key={`${fragment.type}-${index}`}>
            {fragment.text}
          </span>
        );
      })}
    </span>
  );
}
