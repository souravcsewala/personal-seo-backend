const admin = require('firebase-admin');

let initialized = false;

// Hardcoded service account (used when env vars are not provided)
const HARDCODED_SERVICE_ACCOUNT = {
  projectId: 'web-push-for-blog-my-site',
  clientEmail: 'firebase-adminsdk-fbsvc@web-push-for-blog-my-site.iam.gserviceaccount.com',
  privateKey: `-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDQqDFwf0f6Q6MO
l9xPbljn+MgBrvljaPRE5XXWKTlOJlrB5HmWqFEnBNvtkUzJsSyxSC3DA2oyeYle
p6JWZktP8/3m97U4FIUnhyvIcZKArokYX/MNRpy/sSgM4lNypBgHj4Y1J4qvino1
+KVv+J0ysWsDLFgHGfvVm/W7Pz7tswRxn/LyKmEHOrjrnH31f0riZ6WZ8sNG3DjS
ynIp197fyvCnWTUBZCSHptMFHlBZPyQo/IYiLhwAV8vqQf54TYYt3bUPKo/lj24o
zOOnz0GRPxEFhaD0d2PmJKGotUPGXF2WVUjA25rczQqtrJnVVOehXyyMkCK6rfm3
JSHpHH2lAgMBAAECggEAAhsZmTVYyp8+/TAk46TomoNQjN86WkLHezKGzaSGlPZ6
IkyKlZuG/QD31h5BAiStDV4ijKvhAjewXmB6Kz2iMzypKn2WFcXz0O+9u/PeDl3Z
Jzj3iiZ5uDtFM+wV+vKBBd3wq/Sp7DsNRLR2lLFKgpOb0byqQ1gVykuKqMjYn74S
+PIK2HIYh0HnnqVa3Fg4JPNlsmZSujYHneXf0os4pfBrwuJWoJOALrBsqFY+CUyJ
GG/6bP7UWsxQa2JIxSnnhzWuLgncyZ+sJYA6bfeI8xvif+0qofZv4GCx1im3y45F
4TfXm7Sln7ChWYXqDen2qnuJBFNe5lImbWulkRyOwQKBgQDyOeaA2bqsn7Sm8fVg
TOtqbLTgRrP2d30+CCu7Eh7x2lr0luElU/QP2aoAgsZX9NQPCU6lhqsfS33s09Ts
YHN0fF7VYJn2tWbGpcb6On1m5rOTGnXSc3o8NYXrrzmxcrPd9H89y/lvdwRUUND/
uY6HY3c5ca8cry4K5Hkz7UM/fQKBgQDchZ/fDVhv3zpscLSTqAyOEJTiRBZxe5Zy
zVxAm1rM8gDamv25ZoEmFArJlsjz0JGF+/zU1y7dHPuSBHXbkXQQmUCha/o3oakF
DajwNShAfDgnLvp4CHtIN8CwALuBPxA5DlCxAZzC/L4GljQfGI+iTvf07ZxuHMlm
+MtI6+BfSQKBgQDBlxjsPhd9w55EFvj/YDp+MidVX+yQvOrx2uHofxEQRm2PMc77
YF+dE19VTS9sOJYK9mtOy5SUTGd2Ec8IpAViQcwhSTWEAXMErJWcg4aZ6SP4G5uy
+OvmlvhTZxX7BitO5wuSviS6uypQoM6IsyqAdjRhSsSjbjakKfncUHIAmQKBgQCf
RK8rpPLbkakbiucQwc2XiWhOZwiim7UUYzeevdV9scdmG4zmq57ZRp5n7Exks512
3IFFo8iIEBet5STOGSZvmo/wRhEovsxZBv2dx3az5EOWITrrGI0ZopK7SzwhY8+u
taUXwmda+Lmx/ifU0aNjgY9aSYayjH31rfj8SMf7aQKBgQCXeuIX1R+y7YbeUEl1
nfo2iusejJqd/xV7YFB2K4ogyvkw0JUM+ZxbhhsKsIfN09HaAVMi7KOhI/G+jAuJ
6x2eijV8AXNIchdnRZp6GNd7j3Q9VCorLCvNQOSav8jI0IV2D6RYoWKzxfdL3t6u
5tEPSewUZblY3IMF1Drl73Q93g==
-----END PRIVATE KEY-----
`
};

function getFirebaseAdmin() {
  if (initialized && admin.apps && admin.apps.length > 0) return admin;
  try {
    if (!admin.apps.length) {
      // Force hardcoded credentials (ignore env) as requested
      const projectId = HARDCODED_SERVICE_ACCOUNT.projectId;
      const clientEmail = HARDCODED_SERVICE_ACCOUNT.clientEmail;
      let privateKey = HARDCODED_SERVICE_ACCOUNT.privateKey;
      if (privateKey && privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
      if (privateKey) {
        // Normalize common formatting issues
        // 1) Turn literal \n into real newlines
        if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
        // 2) Remove stray carriage returns
        privateKey = privateKey.replace(/\r/g, '');
        // 3) Trim surrounding whitespace
        privateKey = privateKey.trim();
      }
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey })
      });
    }
  } catch (e) {
    try { console.error('[FirebaseAdmin] initializeApp error:', e?.message || e); } catch (_) {}
  } finally {
    initialized = !!(admin.apps && admin.apps.length > 0);
    if (!initialized) {
      try { console.warn('[FirebaseAdmin] Not initialized'); } catch (_) {}
    }
  }
  return admin;
}

module.exports = { getFirebaseAdmin };



