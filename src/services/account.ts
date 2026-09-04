import { httpsCallable } from 'firebase/functions';

import { auth, functions } from '@/lib/firebase';

export async function deleteUserAccount() {
  const callable = httpsCallable(functions, 'deleteAccount');
  await callable({});

  if (auth.currentUser) {
    await auth.signOut();
  }
}
