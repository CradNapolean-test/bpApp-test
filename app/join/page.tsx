import Link from 'next/link';
import { AuthFrame, authLink } from '@/app/_components/AuthFrame';

export const metadata = { title: 'Join Ballistic Performance' };

// A bare /join, with no sign-up link's code after it (BO11): it showed an unbranded 404. Public (lib/publicPaths.ts lists /join), the same
// look as a link that isn't active (app/join/[token]), and it reads nothing, so it says nothing about any gym, coach or member.
export default function JoinWithoutLinkPage() {
  return (
    <AuthFrame title="Use the link from your gym" lead="To join, open the sign-up link your gym or coach sent you. If you don't have one, ask them for it.">
      <Link href="/login" className={authLink}>
        Already a member? Sign in
      </Link>
    </AuthFrame>
  );
}
