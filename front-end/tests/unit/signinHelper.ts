import { issueChallenge, solveChallenge } from "@/lib/accountSecurity";
import { ChallengeRequired, signIn } from "@/lib/session";

/** Signs in the way the login page does: when the challenge step is asked for, solve it and try once more. */
export async function attempt(email: string, password: string) {
  try { return await signIn(email, password); }
  catch (e) {
    if (!(e instanceof ChallengeRequired)) throw e;
    const c = issueChallenge();
    return signIn(email, password, { seed: c.seed, nonce: await solveChallenge(c.seed, c.digits) });
  }
}
