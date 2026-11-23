import {ADMIN_EMAIL_ACCOUNT} from './account-emails';
import {ownerPasskeys} from './owner-passkeys';
import { garage, selectedMotorcycle, storeGarage, motorcycleApi } from "./motorcycles";
import { DispatchCity } from './central';
export { DispatchCity } from './central';
import { productivity } from "./productivity";
import { carryBeforeDay, dayNetWithCarry } from "../shared/daily-balance";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture
} from "@simplewebauthn/server";

interface Env {
  DISPATCH: DurableObjectNamespace<DispatchCity>;
  DB: D1Database;
  ASSETS: Fetcher;
  INITIAL_SETUP_TOKEN?: string;
}

interface CredentialRow {
  id: string;
  public_key: string;
  counter: number;
  transports: string;
}

interface ProfileRow {
  display_name: string;
  email: string | null;
  password_salt: string | null;
  password_hash: string | null;
  password_iterations: number | null;
}

interface RideInput {
  motorcycleId?: string;
  clientId?: string;
  occurredAt: string;
  establishment: string;
  platform?: string;
  amount: number;
  note?: string;
  paid?: boolean;
}

interface ExpenseInput {
  motorcycleId?: string;
  clientId?: string;
  occurredAt: string;
  kind: "fuel" | "other";
  title: string;
  amount: number;
  odometerKm?: number;
  distanceKm?: number;
  liters?: number;
  tankFull?: boolean;
}

const SESSION_COOKIE = "__Host-ride_session";
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const PASSWORD_ITERATIONS = 100000;
const PASSWORD_BYTES = 32;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_MAX_ATTEMPTS = 10;
const encoder = new TextEncoder();

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function randomId(bytes = 24): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buffer))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function encodeBase64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value));
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function passwordDigest(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt).buffer, iterations },
    key,
    PASSWORD_BYTES * 8
  );
  return new Uint8Array(result);
}

async function matchesPassword(password: string, salt: string, expected: string, iterations: number): Promise<boolean> {
  const candidate = await passwordDigest(password, decodeBase64(salt), iterations);
  const saved = decodeBase64(expected);
  let diff = candidate.length ^ saved.length;
  for (let index = 0; index < Math.max(candidate.length, saved.length); index++) {
    diff |= (candidate[index] ?? 0) ^ (saved[index] ?? 0);
  }
  return diff === 0;
}

async function issueSession(env: Env): Promise<Response> {
  const token = randomId(32);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)")
    .bind(await hash(token), now, now + SESSION_SECONDS).run();
  return new Response(JSON.stringify({ authenticated: true }), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": setSessionCookie(token)
    }
  });
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get("Cookie") ?? "";
  const pair = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

function setSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`;
}

function originFor(request: Request): string {
  return new URL(request.url).origin;
}

function rpIdFor(request: Request): string {
  return new URL(request.url).hostname;
}

function validOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === originFor(request);
}

async function session(request: Request, env: Env): Promise<boolean> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return false;
  const digest = await hash(token);
  const found = await env.DB.prepare(
    "SELECT token_hash FROM sessions WHERE token_hash = ? AND expires_at > ?"
  ).bind(digest, Math.floor(Date.now() / 1000)).first();
  return Boolean(found);
}

async function requireSession(request: Request, env: Env): Promise<Response | null> {
  if (!await session(request, env)) return fail("Faça login para continuar.", 401);
  return null;
}

async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match;
  const parsedDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsedDay.getUTCFullYear() === Number(year) &&
    parsedDay.getUTCMonth() === Number(month) - 1 &&
    parsedDay.getUTCDate() === Number(day) &&
    (hour === undefined || (Number(hour) <= 23 && Number(minute) <= 59));
}

function cents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1000000) return null;
  return Math.round(value * 100);
}

async function storeChallenge(env: Env, challenge: string, purpose: string): Promise<string> {
  const id = randomId();
  await env.DB.prepare(
    "INSERT INTO challenges (id, challenge, purpose, created_at) VALUES (?, ?, ?, ?)"
  ).bind(id, challenge, purpose, Math.floor(Date.now() / 1000)).run();
  return id;
}

async function takeChallenge(env: Env, id: string, purpose: string): Promise<string | null> {
  const result = await env.DB.prepare(
    "SELECT challenge FROM challenges WHERE id = ? AND purpose = ? AND created_at > ?"
  ).bind(id, purpose, Math.floor(Date.now() / 1000) - 300).first<{ challenge: string }>();
  if (!result) return null;
  await env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(id).run();
  return result.challenge;
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if(path==='/api/access/me'&&method==='GET'){
    if(await session(request,env))return json({authenticated:true,role:'admin'});
    const res=await env.DISPATCH.getByName('city:3525300').route(new Request(new URL('/api/central/me',url),request),false);
    const data=await res.json() as {user?:{role:string}};return json({authenticated:!!data.user,role:data.user?.role||null});
  }
  if(path.startsWith('/api/access/')&&method==='POST'){
    if(!validOrigin(request))return fail('Origem da solicitação inválida.',403);
    const stub=env.DISPATCH.getByName('city:3525300');
    if(path==='/api/access/logout'){
      const token=cookieValue(request,SESSION_COOKIE);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
      await stub.route(new Request(new URL('/api/central/logout',url),request),false);
      const headers=new Headers({'Content-Type':'application/json','Cache-Control':'no-store'});headers.append('Set-Cookie',clearSessionCookie());headers.append('Set-Cookie','__Host-central_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');return new Response('{"ok":true}',{headers});
    }
    if(path==='/api/access/login/password'){
      const body=await readJson<{email?:string;password?:string}>(request);if(!body||typeof body.email!=='string'||typeof body.password!=='string')return fail('E-mail ou senha inválidos.',401);
      const profile=await env.DB.prepare('SELECT email FROM rider_profile WHERE id=1').first<{email:string}>();
      if(profile?.email)await stub.syncAdminEmail(profile.email);
      const admin=await stub.emailAccount(body.email.trim().toLowerCase())===ADMIN_EMAIL_ACCOUNT;
      const target=admin?'/api/auth/login/password':'/api/central/login',forward=new Request(new URL(target,url),{method:'POST',headers:request.headers,body:JSON.stringify(body)});
      const res=admin?await handleApi(forward,env):await stub.route(forward,false);if(!res.ok)return res;
      const headers=new Headers(res.headers);
      if(admin){await stub.route(new Request(new URL('/api/central/logout',url),{method:'POST',headers:request.headers,body:'{}'}),false);headers.append('Set-Cookie','__Host-central_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');}
      else {const token=cookieValue(request,SESSION_COOKIE);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();headers.append('Set-Cookie',clearSessionCookie());}
      const data=await res.json() as {user?:{role:string}};return new Response(JSON.stringify({...data,role:admin?'admin':data.user?.role}),{headers});
    }
    if(path==='/api/access/passkey/options'){
      await stub.checkPasskeyRate(request.headers.get('CF-Connecting-IP')||'local');
      const options=await generateAuthenticationOptions({rpID:rpIdFor(request),userVerification:'required'});
      return json({options,challengeId:await storeChallenge(env,options.challenge,'access-login')});
    }
    if(path==='/api/access/passkey/verify'){
      const body=await readJson<{challengeId:string;response:Parameters<typeof verifyAuthenticationResponse>[0]['response']}>(request);if(!body?.challengeId||!body.response)return fail('Resposta da passkey ausente.');
      const expectedChallenge=await takeChallenge(env,body.challengeId,'access-login');if(!expectedChallenge)return fail('Solicitação expirada. Tente novamente.');
      const credential=await env.DB.prepare('SELECT * FROM credentials WHERE id=?').bind(body.response.id).first<CredentialRow>();
      let res:Response;
      if(credential){const checked=await verifyAuthenticationResponse({response:body.response,expectedChallenge,expectedOrigin:originFor(request),expectedRPID:rpIdFor(request),credential:{id:credential.id,publicKey:new Uint8Array(decodeBase64(credential.public_key)),counter:credential.counter,transports:JSON.parse(credential.transports)},requireUserVerification:true});if(!checked.verified)return fail('Passkey inválida.',401);await env.DB.prepare('UPDATE credentials SET counter=? WHERE id=?').bind(checked.authenticationInfo.newCounter,credential.id).run();res=await issueSession(env);}
      else res=await stub.authenticatePasskey(body.response,expectedChallenge,originFor(request),rpIdFor(request));
      if(!res.ok)return res;const data=await res.json() as {user?:{role:string}},headers=new Headers(res.headers);
      if(credential){await stub.route(new Request(new URL('/api/central/logout',url),{method:'POST',headers:request.headers,body:'{}'}),false);headers.append('Set-Cookie','__Host-central_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0');}
      else {const token=cookieValue(request,SESSION_COOKIE);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();headers.append('Set-Cookie',clearSessionCookie());}
      return new Response(JSON.stringify({...data,role:credential?'admin':data.user?.role}),{headers});
    }
  }

  if (path.startsWith('/api/central/')) {
    const adminProfile=await env.DB.prepare('SELECT email FROM rider_profile WHERE id=1').first<{email:string}>();if(adminProfile?.email)await env.DISPATCH.getByName('city:3525300').syncAdminEmail(adminProfile.email);
    if(path==='/api/central/register'&&method==='POST'){
      const body=await request.clone().json() as {email?:string};const profile=await env.DB.prepare('SELECT email FROM rider_profile WHERE id=1').first<{email:string}>();if(body.email?.trim().toLowerCase()===profile?.email?.toLowerCase())return fail('Este e-mail está reservado à administração.',409);
    }
    const owner = Boolean(await session(request, env));
    const response=await env.DISPATCH.getByName('city:3525300').route(request, owner);
    if(['/api/central/register','/api/central/login'].includes(path)&&response.ok){
      const token=cookieValue(request,SESSION_COOKIE);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run();
      const headers=new Headers(response.headers);headers.append('Set-Cookie',clearSessionCookie());return new Response(response.body,{status:response.status,headers});
    }
    return response;
  }

  if (method === "GET" && path === "/api/auth/status") {
    const [row, profile] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM credentials").first<{ count: number }>(),
      env.DB.prepare("SELECT password_hash FROM rider_profile WHERE id = 1").first<{ password_hash: string | null }>()
    ]);
    return json({
      hasPasskey: Number(row?.count ?? 0) > 0,
      hasPassword: Boolean(profile?.password_hash),
      setupAvailable: Boolean(env.INITIAL_SETUP_TOKEN)
    });
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !validOrigin(request)) {
    return fail("Origem da solicitação inválida.", 403);
  }

  if (method === "POST" && path === "/api/auth/login/password") {
    const body = await readJson<{ email?: string; password?: string }>(request);
    if (!body || typeof body.email !== "string" || typeof body.password !== "string" ||
        body.email.length > 254 || body.password.length > 1024) return fail("E-mail ou senha incorretos.", 401);

    const email = body.email.trim().toLowerCase();
    const attemptId = await hash(`${email}\n${request.headers.get("CF-Connecting-IP") ?? "unknown"}`);
    const now = Math.floor(Date.now() / 1000);
    const attempt = await env.DB.prepare("SELECT attempts, window_started_at FROM login_attempts WHERE id = ?")
      .bind(attemptId).first<{ attempts: number; window_started_at: number }>();
    if (attempt && attempt.window_started_at > now - LOGIN_WINDOW_SECONDS &&
        attempt.attempts >= LOGIN_MAX_ATTEMPTS) {
      return fail("Muitas tentativas. Aguarde 15 minutos e tente novamente.", 429);
    }

    const profile = await env.DB.prepare(
      "SELECT email, password_salt, password_hash, password_iterations FROM rider_profile WHERE id = 1"
    ).first<Pick<ProfileRow, "email" | "password_salt" | "password_hash" | "password_iterations">>();
    const hasCredentials = Boolean(profile && profile.email && profile.password_salt && profile.password_hash && profile.password_iterations);
    const salt = profile?.password_salt ? decodeBase64(profile.password_salt) : new Uint8Array(16);
    const iterations = profile?.password_iterations ?? PASSWORD_ITERATIONS;
    const candidate = await passwordDigest(body.password, salt, iterations);
    const ownerStub=env.DISPATCH.getByName('city:3525300');if(profile?.email)await ownerStub.syncAdminEmail(profile.email);
    const isMatch = Boolean(profile && hasCredentials && await ownerStub.emailAccount(email)===ADMIN_EMAIL_ACCOUNT &&
      constantTimeEqual(encodeBase64(candidate), profile.password_hash ?? ""));

    if (!isMatch) {
      if (attempt && attempt.window_started_at > now - LOGIN_WINDOW_SECONDS) {
        await env.DB.prepare("UPDATE login_attempts SET attempts = attempts + 1 WHERE id = ?").bind(attemptId).run();
      } else {
        await env.DB.prepare(
          "INSERT INTO login_attempts (id, attempts, window_started_at) VALUES (?, 1, ?) ON CONFLICT(id) DO UPDATE SET attempts = 1, window_started_at = excluded.window_started_at"
        ).bind(attemptId, now).run();
      }
      return fail("E-mail ou senha incorretos.", 401);
    }

    await env.DB.prepare("DELETE FROM login_attempts WHERE id = ?").bind(attemptId).run();
    return issueSession(env);
  }

  if (method === "POST" && path === "/api/auth/register/options") {
    if (!env.INITIAL_SETUP_TOKEN) return fail("Configuração inicial indisponível.", 403);
    const body = await readJson<{ setupToken?: string }>(request);
    if (!body?.setupToken || !constantTimeEqual(body.setupToken, env.INITIAL_SETUP_TOKEN)) {
      return fail("Código de configuração inválido.", 403);
    }
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM credentials").first<{ count: number }>();
    if (Number(count?.count ?? 0) > 0) return fail("A chave de acesso já foi configurada.", 409);

    const options = await generateRegistrationOptions({
      rpName: "Entregas LJCS",
      rpID: rpIdFor(request),
      userID: encoder.encode(randomId(32)),
      userName: "Luan",
      userDisplayName: "Luan • Entregador",
      attestationType: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required"
      }
    });
    const challengeId = await storeChallenge(env, options.challenge, "register");
    return json({ options, challengeId });
  }

  if (method === "POST" && path === "/api/auth/register/verify") {
    const body = await readJson<{
      challengeId?: string;
      setupToken?: string;
      response?: Parameters<typeof verifyRegistrationResponse>[0]["response"];
    }>(request);
    if (!body?.challengeId || !body.response || !body.setupToken || !env.INITIAL_SETUP_TOKEN ||
        !constantTimeEqual(body.setupToken, env.INITIAL_SETUP_TOKEN)) return fail("Dados de configuração inválidos.", 403);
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM credentials").first<{ count: number }>();
    if (Number(count?.count ?? 0) > 0) return fail("A chave de acesso já foi configurada.", 409);
    const expectedChallenge = await takeChallenge(env, body.challengeId, "register");
    if (!expectedChallenge) return fail("A solicitação expirou. Tente novamente.", 400);

    const verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: originFor(request),
      expectedRPID: rpIdFor(request),
      requireUserVerification: true
    });
    if (!verification.verified || !verification.registrationInfo) return fail("Não foi possível verificar a passkey.", 400);
    const credential = verification.registrationInfo.credential;
    await env.DB.prepare(
      "INSERT INTO credentials (id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(
      credential.id,
      btoa(String.fromCharCode(...credential.publicKey)),
      credential.counter,
      JSON.stringify(credential.transports ?? []),
      new Date().toISOString()
    ).run();
    return json({ verified: true });
  }

  if (method === "POST" && path === "/api/auth/login/options") {
    const credentials = await env.DB.prepare("SELECT id, transports FROM credentials").all<Pick<CredentialRow, "id" | "transports">>();
    if (!credentials.results.length) return fail("Cadastre a passkey de configuração primeiro.", 409);
    const options = await generateAuthenticationOptions({
      rpID: rpIdFor(request),
      userVerification: "required",
      allowCredentials: credentials.results.map((credential) => ({
        id: credential.id,
        transports: JSON.parse(credential.transports) as AuthenticatorTransportFuture[]
      }))
    });
    const challengeId = await storeChallenge(env, options.challenge, "login");
    return json({ options, challengeId });
  }

  if (method === "POST" && path === "/api/auth/login/verify") {
    const body = await readJson<{
      challengeId?: string;
      response?: Parameters<typeof verifyAuthenticationResponse>[0]["response"];
    }>(request);
    if (!body?.challengeId || !body.response) return fail("Resposta da passkey ausente.");
    const expectedChallenge = await takeChallenge(env, body.challengeId, "login");
    if (!expectedChallenge) return fail("A solicitação expirou. Tente novamente.", 400);
    const credential = await env.DB.prepare("SELECT * FROM credentials WHERE id = ?")
      .bind(body.response.id).first<CredentialRow>();
    if (!credential) return fail("Passkey não reconhecida.", 401);
    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: originFor(request),
      expectedRPID: rpIdFor(request),
      credential: {
        id: credential.id,
        publicKey: Uint8Array.from(atob(credential.public_key), (char) => char.charCodeAt(0)),
        counter: credential.counter,
        transports: JSON.parse(credential.transports) as AuthenticatorTransportFuture[]
      },
      requireUserVerification: true
    });
    if (!verification.verified) return fail("Não foi possível validar sua passkey.", 401);
    await env.DB.prepare("UPDATE credentials SET counter = ? WHERE id = ?")
      .bind(verification.authenticationInfo.newCounter, credential.id).run();
    return issueSession(env);
  }

  if (method === "GET" && path === "/api/auth/me") {
    if (!await session(request, env)) return json({ authenticated: false });
    const profile = await env.DB.prepare("SELECT display_name FROM rider_profile WHERE id = 1")
      .first<{ display_name: string }>();
    return json({ authenticated: true, displayName: profile?.display_name ?? "Luan" });
  }

  if (method === "POST" && path === "/api/auth/logout") {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hash(token)).run();
    return new Response(JSON.stringify({ authenticated: false }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": clearSessionCookie()
      }
    });
  }

  if (path.startsWith("/api/")) {
    const authError = await requireSession(request, env);
    if (authError) return authError;
  }

  if(path.startsWith('/api/passkeys'))return (await ownerPasskeys(request,env.DB,await hash(cookieValue(request,SESSION_COOKIE)!)))!;
  if(path==='/api/emails'){
    const profile=await env.DB.prepare('SELECT * FROM rider_profile WHERE id=1').first<ProfileRow>(),stub=env.DISPATCH.getByName('city:3525300');
    if(!profile?.email)return fail('Configure seu e-mail e senha no perfil primeiro.',409);
    await stub.syncAdminEmail(profile.email);
    if(method==='GET')return json(await stub.adminEmails(profile.email));
    if(method==='POST'){
      const token=cookieValue(request,SESSION_COOKIE)!,recent=await env.DB.prepare('SELECT token_hash FROM sessions WHERE token_hash=? AND created_at>? AND expires_at>?').bind(await hash(token),Math.floor(Date.now()/1000)-900,Math.floor(Date.now()/1000)).first();if(!recent)return fail('Saia e entre novamente para gerenciar seus e-mails. Seu login deve ter menos de 15 minutos.',401);
      const b=await readJson<{action:string;email:string;currentPassword:string}>(request);if(!b||typeof b.currentPassword!=='string'||b.currentPassword.length>1024)return fail('Confirme a senha atual.',403);
      const attemptId=await hash('manage-email:'+token),attempt=await env.DB.prepare('SELECT attempts,window_started_at FROM login_attempts WHERE id=?').bind(attemptId).first<{attempts:number;window_started_at:number}>();if(attempt&&attempt.window_started_at>Math.floor(Date.now()/1000)-900&&attempt.attempts>=8)return fail('Muitas tentativas. Aguarde 15 minutos.',429);
      if(!profile.password_hash||!profile.password_salt||!profile.password_iterations||!await matchesPassword(b.currentPassword,profile.password_salt,profile.password_hash,profile.password_iterations)){await env.DB.prepare('INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN window_started_at>? THEN attempts+1 ELSE 1 END,window_started_at=excluded.window_started_at').bind(attemptId,Math.floor(Date.now()/1000),Math.floor(Date.now()/1000)-900).run();return fail('Senha atual incorreta.',403);}
      try{const result=await stub.manageAdminEmails(profile.email,b);if(b.action==='primary')await env.DB.prepare('UPDATE rider_profile SET email=?,updated_at=? WHERE id=1').bind(result.email,new Date().toISOString()).run();return json({ok:true});}catch(error){return fail(error instanceof Error?error.message:'Não foi possível alterar seus e-mails.',409);}
    }
  }
  const motorcycleResponse = await motorcycleApi(request, env.DB);
  if (motorcycleResponse) return motorcycleResponse;
  const productivityResponse = await productivity(request, env.DB);
  if (productivityResponse) return productivityResponse;

  if (method === "GET" && path === "/api/profile") {
    const profile = await env.DB.prepare(
      "SELECT display_name, email, password_hash FROM rider_profile WHERE id = 1"
    ).first<{ display_name: string; email: string | null; password_hash: string | null }>();
    return json({
      displayName: profile?.display_name ?? "Luan",
      email: profile?.email ? await env.DISPATCH.getByName('city:3525300').syncAdminEmail(profile.email) : '',
      hasPassword: Boolean(profile?.password_hash)
    });
  }

  if (method === "PUT" && path === "/api/profile") {
    const body = await readJson<{
      displayName?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    }>(request);
    if (!body || typeof body.displayName !== "string" || typeof body.email !== "string" ||
        typeof body.newPassword !== "string" || typeof body.currentPassword !== "string") {
      return fail("Confira os dados do perfil.");
    }

    const displayName = body.displayName.trim();
    const email = body.email.trim().toLowerCase();
    if (!displayName || displayName.length > 60) return fail("O nome deve ter de 1 a 60 caracteres.");
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Informe um e-mail válido.");
    if (body.newPassword && (body.newPassword.length < 12 || body.newPassword.length > 1024)) {
      return fail("A nova senha deve ter pelo menos 12 caracteres.");
    }

    const profile = await env.DB.prepare("SELECT * FROM rider_profile WHERE id = 1").first<ProfileRow>();
    const hasPassword = Boolean(profile?.password_hash && profile.password_salt && profile.password_iterations);
    if (!hasPassword && !body.newPassword) return fail("Crie uma senha para ativar o login por e-mail.");
    const changesLogin = Boolean(hasPassword && (profile?.email !== email || body.newPassword));
    if (changesLogin) {
      if (!body.currentPassword ||
          !await matchesPassword(body.currentPassword, profile!.password_salt!, profile!.password_hash!, profile!.password_iterations!)) {
        return fail("A senha atual está incorreta.", 403);
      }
    }

    try{const emailStub=env.DISPATCH.getByName('city:3525300');if(profile?.email)await emailStub.syncAdminEmail(profile.email);await emailStub.manageAdminEmails(profile?.email||'',{action:'add',email});await emailStub.manageAdminEmails(profile?.email||'',{action:'primary',email});}catch{return fail('Este e-mail já está em uso ou o limite de e-mails foi atingido.',409);}
    let salt = profile?.password_salt ?? null;
    let passwordHash = profile?.password_hash ?? null;
    let iterations = profile?.password_iterations ?? null;
    if (body.newPassword) {
      const newSalt = crypto.getRandomValues(new Uint8Array(16));
      salt = encodeBase64(newSalt);
      passwordHash = encodeBase64(await passwordDigest(body.newPassword, newSalt, PASSWORD_ITERATIONS));
      iterations = PASSWORD_ITERATIONS;
    }

    try {
      await env.DB.prepare(
        "INSERT INTO rider_profile (id, display_name, email, password_salt, password_hash, password_iterations, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, email = excluded.email, password_salt = excluded.password_salt, password_hash = excluded.password_hash, password_iterations = excluded.password_iterations, updated_at = excluded.updated_at"
      ).bind(displayName, email, salt, passwordHash, iterations, new Date().toISOString()).run();
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("unique")) {
        return fail("Este e-mail já está em uso.", 409);
      }
      throw error;
    }
    return json({ displayName, email, hasPassword: Boolean(passwordHash) });
  }

  if (method === "GET" && path === "/api/dashboard") {
    const day = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail("Data inválida.");
    const motorcycle = selectedMotorcycle(await garage(env.DB));
    const [rides, expenses, allFuel, setting, fuelLevelSetting, historyRides, previousDailyNets] = await Promise.all([
      env.DB.prepare("SELECT * FROM rides WHERE substr(occurred_at, 1, 10) = ? ORDER BY occurred_at DESC").bind(day).all(),
      env.DB.prepare("SELECT * FROM expenses WHERE substr(occurred_at, 1, 10) = ? ORDER BY occurred_at DESC").bind(day).all(),
      env.DB.prepare("SELECT occurred_at, distance_km, odometer_km, liters FROM expenses WHERE kind = 'fuel' AND motorcycle_id = ? ORDER BY occurred_at ASC, id ASC").bind(motorcycle.id).all(),
      env.DB.prepare("SELECT value FROM settings WHERE key = 'daily_goal_cents'").first<{ value: string }>(),
      env.DB.prepare("SELECT value FROM settings WHERE key = 'fuel_level'").first<{ value: string }>(),
      env.DB.prepare("SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS count, SUM(amount_cents) AS total FROM rides WHERE occurred_at >= ? GROUP BY day ORDER BY day DESC LIMIT 30")
        .bind(`${new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)}T00:00`).all(),
      env.DB.prepare(`WITH activity AS (
        SELECT substr(occurred_at,1,10) day, amount_cents amount FROM rides WHERE occurred_at < ? AND paid = 1
        UNION ALL
        SELECT substr(occurred_at,1,10) day, -amount_cents amount FROM expenses WHERE occurred_at < ?
       )
       SELECT day,SUM(amount) net FROM activity GROUP BY day ORDER BY day`).bind(`${day}T00:00`,`${day}T00:00`).all<{day:string;net:number}>()
    ]);
    const dailyGoalCents = Number(setting?.value ?? 20000);
    const rideRows = rides.results as Array<{ amount_cents: number; motorcycle_id: string; paid: number }>;
    const expenseRows = expenses.results as Array<{ amount_cents: number; motorcycle_id:string; kind: string; distance_km: number | null; odometer_km: number | null; liters: number | null }>;
    const grossCents = rideRows.reduce((sum, item) => sum + item.amount_cents, 0);
    const paidCents = rideRows.reduce((sum, item) => sum + (item.paid ? item.amount_cents : 0), 0);
    const pendingPaymentCents = grossCents - paidCents;
    const expenseCents = expenseRows.reduce((sum, item) => sum + item.amount_cents, 0);
    const carryCents = carryBeforeDay(previousDailyNets.results,day);
    const fuelRows = allFuel.results as Array<{ distance_km: number | null; odometer_km: number | null; liters: number | null }>;
    let distance = 0;
    let liters = 0;
    let previousOdometer: number | null = null;
    for (const fuel of fuelRows) {
      if (fuel.odometer_km !== null) {
        if (previousOdometer !== null && fuel.odometer_km > previousOdometer) {
          distance += fuel.odometer_km - previousOdometer;
          liters += fuel.liters ?? 0;
        }
        previousOdometer = fuel.odometer_km;
      } else {
        previousOdometer = null;
        if (fuel.distance_km !== null) {
          distance += fuel.distance_km;
          liters += fuel.liters ?? 0;
        }
      }
    }
    return json({
      date: day,
      dailyGoalCents,
      grossCents,
      paidCents,
      pendingPaymentCents,
      expenseCents,
      carryCents,
      netCents: dayNetWithCarry(paidCents,expenseCents,carryCents),
      rideCount: rideRows.length,
      remainingCents: Math.max(0, dailyGoalCents - grossCents),
      progress: dailyGoalCents ? Math.min(100, Math.round(grossCents / dailyGoalCents * 100)) : 0,
      fuelEfficiency: liters ? Math.round(distance / liters * 100) / 100 : null,
      motorcycle,
      motorcycleGrossCents: rideRows.filter(r => r.motorcycle_id === motorcycle.id).reduce((sum,r) => sum + r.amount_cents, 0),
      fuelLevel: motorcycle.level,
      rides: rides.results,
      expenses: expenses.results,
      history: historyRides.results
    });
  }

  if (method === "GET" && path === "/api/rides") {
    return json(await env.DB.prepare("SELECT * FROM rides ORDER BY occurred_at DESC LIMIT 250").all());
  }

  if (method === "GET" && path === "/api/expenses") {
    return json(await env.DB.prepare("SELECT * FROM expenses ORDER BY occurred_at DESC LIMIT 250").all());
  }

  if (method === "POST" && path === "/api/rides") {
    const body = await readJson<RideInput>(request);
    const amountCents = cents(body?.amount);
    if (!body || !validDate(body.occurredAt) || !body.establishment?.trim() || body.establishment.length > 100 ||
        (body.paid !== undefined && typeof body.paid !== "boolean") ||
        amountCents === null || (body.platform?.length ?? 0) > 40 || (body.note?.length ?? 0) > 300) {
      return fail("Confira data, estabelecimento e valor da corrida.");
    }
    const rideMotorcycle = (await garage(env.DB)).profiles.find(p => p.id === (body.motorcycleId ?? 'legacy'));
    if (!rideMotorcycle) return fail("Moto do registro não encontrada.");
    await env.DB.prepare(
      "INSERT OR IGNORE INTO rides (id, occurred_at, establishment, platform, amount_cents, note, motorcycle_id, paid) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.clientId && /^[A-Za-z0-9_-]{16,64}$/.test(body.clientId) ? body.clientId : randomId(16), body.occurredAt, body.establishment.trim(), body.platform?.trim() ?? "", amountCents, body.note?.trim() ?? "", rideMotorcycle.id, body.paid === undefined ? 1 : Number(body.paid)).run();
    return json({ saved: true }, 201);
  }

  const ridePaymentUpdate = path.match(/^\/api\/rides\/([A-Za-z0-9_-]+)\/payment$/);
  if (method === "PATCH" && ridePaymentUpdate) {
    const body = await readJson<{ paid?: unknown }>(request);
    if (!body || typeof body.paid !== "boolean") return fail("Informe se o pagamento foi recebido.");
    const result = await env.DB.prepare("UPDATE rides SET paid = ? WHERE id = ?")
      .bind(Number(body.paid), ridePaymentUpdate[1]).run();
    if (!result.meta.changes) return fail("Corrida não encontrada.", 404);
    return json({ saved: true });
  }

  const rideUpdate = path.match(/^\/api\/rides\/([A-Za-z0-9_-]+)$/);
  if (method === "PUT" && rideUpdate) {
    const body = await readJson<RideInput>(request);
    const amountCents = cents(body?.amount);
    if (!body || !validDate(body.occurredAt) || !body.establishment?.trim() || body.establishment.length > 100 ||
        (body.paid !== undefined && typeof body.paid !== "boolean") ||
        amountCents === null || (body.platform?.length ?? 0) > 40 || (body.note?.length ?? 0) > 300) {
      return fail("Confira data, estabelecimento e valor da corrida.");
    }
    const result = await env.DB.prepare(
      "UPDATE rides SET occurred_at = ?, establishment = ?, platform = ?, amount_cents = ?, note = ?, paid = COALESCE(?, paid) WHERE id = ?"
    ).bind(body.occurredAt, body.establishment.trim(), body.platform?.trim() ?? "", amountCents, body.note?.trim() ?? "", body.paid === undefined ? null : Number(body.paid), rideUpdate[1]).run();
    if (!result.meta.changes) return fail("Corrida não encontrada.", 404);
    return json({ saved: true });
  }

  const rideDelete = path.match(/^\/api\/rides\/([A-Za-z0-9_-]+)$/);
  if (method === "DELETE" && rideDelete) {
    await env.DB.prepare("DELETE FROM rides WHERE id = ?").bind(rideDelete[1]).run();
    return json({ deleted: true });
  }

  if (method === "POST" && path === "/api/expenses") {
    const body = await readJson<ExpenseInput>(request);
    const amountCents = cents(body?.amount);
    const isFuel = body?.kind === "fuel";
    if (!body || !validDate(body.occurredAt) || !body.title?.trim() || body.title.length > 100 ||
        amountCents === null || !["fuel", "other"].includes(body.kind) ||
        (isFuel && (body.tankFull !== true ||
          Number(typeof body.odometerKm === "number") + Number(typeof body.distanceKm === "number") !== 1 ||
          (typeof body.odometerKm === "number" && (!Number.isFinite(body.odometerKm) || body.odometerKm < 0 || body.odometerKm > 999999)) ||
          (typeof body.distanceKm === "number" && (!Number.isFinite(body.distanceKm) || body.distanceKm <= 0 || body.distanceKm > 5000)) ||
          typeof body.liters !== "number" || body.liters <= 0 || body.liters > 100))) {
      return fail(isFuel ? "Para abastecimento, informe a leitura do odômetro ou a distância desde o último tanque, litros e confirme tanque cheio." : "Confira os dados da despesa.");
    }
    const motorcycleState = await garage(env.DB);
    const expenseMotorcycle = motorcycleState.profiles.find(p => p.id === (body.motorcycleId ?? 'legacy'));
    if (!expenseMotorcycle) return fail("Moto do registro não encontrada.");
    const inserted = await env.DB.prepare(
      "INSERT OR IGNORE INTO expenses (id, occurred_at, kind, title, amount_cents, distance_km, liters, odometer_km, motorcycle_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(body.clientId && /^[A-Za-z0-9_-]{16,64}$/.test(body.clientId) ? body.clientId : randomId(16), body.occurredAt, body.kind, body.title.trim(), amountCents,
      isFuel ? body.distanceKm ?? null : null, isFuel ? body.liters! : null, isFuel ? body.odometerKm ?? null : null, expenseMotorcycle.id).run();
    if (isFuel && inserted.meta.changes) {
      expenseMotorcycle.level = expenseMotorcycle.segments;
      await storeGarage(env.DB, motorcycleState);
    }
    return json({ saved: true }, 201);
  }

  const expenseUpdate = path.match(/^\/api\/expenses\/([A-Za-z0-9_-]+)$/);
  if (method === "PUT" && expenseUpdate) {
    const body = await readJson<ExpenseInput>(request);
    const amountCents = cents(body?.amount);
    const isFuel = body?.kind === "fuel";
    if (!body || !validDate(body.occurredAt) || !body.title?.trim() || body.title.length > 100 ||
        amountCents === null || !["fuel", "other"].includes(body.kind) ||
        (isFuel && (body.tankFull !== true ||
          Number(typeof body.odometerKm === "number") + Number(typeof body.distanceKm === "number") !== 1 ||
          (typeof body.odometerKm === "number" && (!Number.isFinite(body.odometerKm) || body.odometerKm < 0 || body.odometerKm > 999999)) ||
          (typeof body.distanceKm === "number" && (!Number.isFinite(body.distanceKm) || body.distanceKm <= 0 || body.distanceKm > 5000)) ||
          typeof body.liters !== "number" || body.liters <= 0 || body.liters > 100))) {
      return fail(isFuel ? "Para abastecimento, informe a leitura do odômetro ou a distância desde o último tanque, litros e confirme tanque cheio." : "Confira os dados da despesa.");
    }
    const result = await env.DB.prepare(
      "UPDATE expenses SET occurred_at = ?, kind = ?, title = ?, amount_cents = ?, distance_km = ?, liters = ?, odometer_km = ? WHERE id = ?"
    ).bind(body.occurredAt, body.kind, body.title.trim(), amountCents,
      isFuel ? body.distanceKm ?? null : null, isFuel ? body.liters! : null, isFuel ? body.odometerKm ?? null : null, expenseUpdate[1]).run();
    if (!result.meta.changes) return fail("Despesa não encontrada.", 404);
    return json({ saved: true });
  }

  const expenseDelete = path.match(/^\/api\/expenses\/([A-Za-z0-9_-]+)$/);
  if (method === "DELETE" && expenseDelete) {
    await env.DB.prepare("DELETE FROM expenses WHERE id = ?").bind(expenseDelete[1]).run();
    return json({ deleted: true });
  }

  if (method === "PUT" && path === "/api/settings/goal") {
    const body = await readJson<{ dailyGoal?: number }>(request);
    const goalCents = cents(body?.dailyGoal);
    if (goalCents === null) return fail("A meta diária deve ser maior que zero.");
    await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'daily_goal_cents'").bind(String(goalCents)).run();
    return json({ dailyGoalCents: goalCents });
  }

  if (method === "PUT" && path === "/api/settings/fuel-level") {
    const body = await readJson<{ fuelLevel?: number; motorcycleId?: string }>(request);
    const state = await garage(env.DB);
    const motorcycle = selectedMotorcycle(state);
    if (body?.motorcycleId && body.motorcycleId !== motorcycle.id) return fail("A moto ativa mudou em outro dispositivo. Atualize o painel.", 409);
    if (!body || !Number.isInteger(body.fuelLevel) || body.fuelLevel! < 0 || body.fuelLevel! > motorcycle.segments) return fail("Nível de combustível inválido para esta moto.");
    motorcycle.level = body.fuelLevel!;
    await storeGarage(env.DB, state);
    return json({ fuelLevel: body.fuelLevel });
  }

  if (path.startsWith("/api/")) return fail("Rota não encontrada.", 404);
  if(path==='/central/operacao/'||path==='/central/operacao')return env.ASSETS.fetch(new Request(new URL('/central/',request.url),request));
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleApi(request, env);
    } catch (error) {
      console.error("Request failed", error);
      return fail("Ocorreu um erro ao processar sua solicitação.", 500);
    }
  }
};
