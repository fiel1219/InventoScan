import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

test('demo seed creates three confirmed accounts with the advertised roles and laboratory access', async () => {
  const db = new PGlite({ extensions: { pgcrypto } })
  try {
    await db.exec(`
      create schema auth;
      create table auth.users (
        instance_id uuid, id uuid primary key, aud text, role text, email text unique,
        encrypted_password text, email_confirmed_at timestamptz,
        raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
        confirmation_token text, recovery_token text, email_change_token_new text,
        email_change text, email_change_token_current text, reauthentication_token text
      );
      create table auth.identities (
        id uuid primary key, user_id uuid references auth.users(id), provider_id text,
        identity_data jsonb, provider text, created_at timestamptz, updated_at timestamptz,
        unique(provider_id,provider)
      );
      create type public.user_role as enum ('Admin','Operator');
      create table public.user_accounts (
        id uuid primary key default gen_random_uuid(), full_name text, email text unique,
        role public.user_role, status text
      );
    `)
    await db.exec(`create role anon; create role authenticated;
      create table public.account_approvals(id uuid primary key default gen_random_uuid(),full_name text not null,email text unique,
        requested_role public.user_role default 'Operator',status text default 'pending');
      create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
      create table public.laboratories(id uuid primary key default gen_random_uuid(), name text unique);
      insert into public.laboratories(name) values ('Physics Laboratory');`)
    await db.exec(await readFile(new URL('../supabase/user_laboratories.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/atomic_registration.sql', import.meta.url), 'utf8'))
    const sql = await readFile(new URL('../supabase/demo_accounts.sql', import.meta.url), 'utf8')
    await assert.rejects(db.exec(sql), /Science Laboratory is missing/)
    await db.exec('rollback')
    assert.equal((await db.query('select * from auth.users')).rows.length, 0)
    await db.exec("insert into laboratories(name) values ('Science Laboratory')")
    await db.exec(sql)
    const first = (await db.query('select id from auth.users order by email')).rows
    // Exercise an existing demo with extra access and a changed Science role.
    await db.exec(`
      insert into laboratory_memberships(user_id,laboratory_id,role)
      select u.id,l.id,'Laboratory Admin'
      from user_accounts u cross join laboratories l
      where u.email in ('demo.admin@inventoscan.test','demo.operator@inventoscan.test') and l.name='Physics Laboratory';
      update laboratory_memberships set role='Laboratory Admin'
      where user_id=(select id from user_accounts where email='demo.operator@inventoscan.test');
    `)
    await db.exec(sql)
    assert.deepEqual((await db.query('select id from auth.users order by email')).rows, first)
    assert.equal((await db.query('select * from auth.identities')).rows.length, 3)
    assert.equal((await db.query('select * from account_approvals')).rows.length, 0)
    const demos = [
      { email: 'demo.admin@inventoscan.test', password: 'InventoAdmin2026!', role: 'Admin', membership: null, label: 'System Admin', access: 'All laboratories' },
      { email: 'demo.labadmin@inventoscan.test', password: 'InventoLabAdmin2026!', role: 'Operator', membership: 'Laboratory Admin', label: 'Laboratory Admin', access: 'Science Laboratory' },
      { email: 'demo.operator@inventoscan.test', password: 'InventoOperator2026!', role: 'Operator', membership: 'Laboratory Operator', label: 'Laboratory Operator', access: 'Science Laboratory' },
    ]
    const accounts = (await db.query(`
      select u.email,u.email_confirmed_at,a.role,a.status,m.role as membership,l.name as laboratory
      from auth.users u join public.user_accounts a on a.email=u.email
      left join laboratory_memberships m on m.user_id=a.id
      left join laboratories l on l.id=m.laboratory_id
      order by u.email
    `)).rows
    assert.deepEqual(accounts.map(({ email, role, membership, laboratory }) => ({ email, role, membership, laboratory })),
      demos.map(({ email, role, membership, access }) => ({ email, role, membership, laboratory: membership ? access : null })))
    for (const account of accounts) {
      assert.ok(account.email_confirmed_at)
      assert.equal(account.status, 'active')
    }
    const source = await readFile(new URL('../src/AuthGate.jsx', import.meta.url), 'utf8')
    for (const demo of demos) {
      assert.ok(source.includes(`role: '${demo.label}', access: '${demo.access}', email: '${demo.email}', password: '${demo.password}'`))
      const { rows } = await db.query(`
        select encrypted_password = extensions.crypt($1,encrypted_password) as valid
        from auth.users where email=$2
      `, [demo.password,demo.email])
      assert.equal(rows[0].valid, true)
    }
    await db.exec(`update auth.users set raw_user_meta_data='{}' where email='demo.operator@inventoscan.test'`)
    await assert.rejects(db.exec(sql), /non-demo user/)
    await db.exec('rollback')
    assert.equal((await db.query('select * from auth.users')).rows.length, 3)
  } finally { await db.close() }
})
