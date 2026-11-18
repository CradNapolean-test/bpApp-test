// What a coach sees instead of the chat on a colleague's member's page (MS22). Chat is private between a member and their own coach
// (decision D3, migration 0153), so the chat there was always empty and read "No messages yet", as if nobody had written.

// "Only Brad can see this conversation". The name is the member's coach's display name (or email); without one, "this member's coach".
export function privateChatTitle(coachName: string | null | undefined): string {
  const name = coachName?.trim();
  return `Only ${name || "this member's coach"} can see this conversation`;
}

export const PRIVATE_CHAT_HINT =
  'Chats are private between a member and their own coach. To take this member on, a gym admin can move them to you (Settings, Coaches at this gym, Move members).';
