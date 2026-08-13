import { COGNITO_CLIENT_ID, COGNITO_REGION } from "./config";

export type Tokens = {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

const COGNITO_URL = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;

export async function signIn(username: string, password: string): Promise<Tokens> {
  const res = await fetch(COGNITO_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.message ?? body.__type ?? `ログインに失敗しました (${res.status})`);
  }

  const result = body.AuthenticationResult;
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn,
  };
}
