/**
 * Turns a YouTube link (video, playlist or channel) into a muted, looping, autoplaying embed for the lobby TV.
 * Uses youtube-nocookie.com so the clinic TV does not collect viewing cookies.
 */
export type YouTubeEmbed = { src: string; kind: "video" | "playlist" | "channel" };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE_HELP = "YouTube @handle links can't be embedded directly. On the channel page choose Share channel → Copy channel ID (it starts with UC) and paste that, or paste a playlist link.";

function embed(kind: YouTubeEmbed["kind"], path: string, extra = ""): YouTubeEmbed {
  return { kind, src: `https://www.youtube-nocookie.com/embed/${path}${path.includes("?") ? "&" : "?"}autoplay=1&mute=1&loop=1&controls=0&rel=0&playsinline=1&enablejsapi=1${extra}` };
}

/** Returns null for an empty value, an embed for a usable link, or an error explaining what to paste instead. */
export function parseYouTube(input: string | undefined | null): YouTubeEmbed | { error: string } | null {
  const text = String(input ?? "").trim();
  if (!text) return null;
  if (CHANNEL_ID.test(text)) return embed("channel", `videoseries?list=UU${text.slice(2)}`);
  if (/^(PL|UU|OL|FL|RD)[A-Za-z0-9_-]{8,}$/.test(text)) return embed("playlist", `videoseries?list=${text}`);
  if (VIDEO_ID.test(text)) return embed("video", text, `&playlist=${text}`);
  if (text.startsWith("@")) return { error: HANDLE_HELP };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: "That doesn't look like a YouTube link." };
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  if (!["youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) return { error: "Paste a link from youtube.com or youtu.be." };
  const parts = url.pathname.split("/").filter(Boolean);
  const list = url.searchParams.get("list");

  if (parts[0] === "channel" && CHANNEL_ID.test(parts[1] ?? "")) return embed("channel", `videoseries?list=UU${parts[1].slice(2)}`);
  if (parts[0]?.startsWith("@") || parts[0] === "c" || parts[0] === "user") return { error: HANDLE_HELP };
  if (list && LIST_ID.test(list)) return embed("playlist", `videoseries?list=${list}`);

  const video = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? url.searchParams.get("v") : ["embed", "shorts", "live", "v"].includes(parts[0] ?? "") ? parts[1] : null;
  if (video && VIDEO_ID.test(video)) return embed("video", video, `&playlist=${video}`);
  return { error: "Paste a YouTube video, playlist or channel link." };
}

/** Sends a player command (mute, unMute, setVolume…) to an embedded YouTube iframe. */
export function youtubeCommand(frame: HTMLIFrameElement | null | undefined, func: string, args: unknown[] = []) {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
}
