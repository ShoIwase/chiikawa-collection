import {
  getCurrentUser as amplifyGetCurrentUser,
  fetchAuthSession as amplifyFetchAuthSession,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
} from "aws-amplify/auth";
import type { AuthSession, SignInInput } from "aws-amplify/auth";

type AmplifyMock = {
  getCurrentUser: () => Promise<{ username: string }>;
  fetchAuthSession: () => Promise<unknown>;
  signIn: (opts: SignInInput) => Promise<{ isSignedIn: boolean }>;
  signOut: () => Promise<void>;
};

declare global {
  interface Window {
    __AMPLIFY_MOCK__?: AmplifyMock;
  }
}

const mock = (): AmplifyMock | undefined =>
  typeof window !== "undefined" ? window.__AMPLIFY_MOCK__ : undefined;

export const getCurrentUser = () =>
  mock()?.getCurrentUser() ?? amplifyGetCurrentUser();

export const fetchAuthSession = (): Promise<AuthSession> =>
  (mock()?.fetchAuthSession() as Promise<AuthSession>) ?? amplifyFetchAuthSession();

export const signIn = (opts: SignInInput) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mock()?.signIn(opts) as any) ?? amplifySignIn(opts);

export const signOut = () =>
  mock()?.signOut() ?? amplifySignOut();
