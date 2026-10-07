export async function signOutAndRedirect(
  signOut: () => Promise<void>,
  redirectToLogin: () => void,
) {
  try {
    await signOut();
  } finally {
    redirectToLogin();
  }
}
