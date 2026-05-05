'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return redirect('/login?message=Could not authenticate user')
  }

  revalidatePath('/', 'layout')
  redirect('/estimates')
}

export async function signup(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
// const companyName = formData.get('companyName') as string
  const supabase = createClient()

  // 1. Create User
  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return redirect('/login?message=Could not sign up user')
  }

  // 2. We should technically wrap this in a trigger or RCP on Supabase side,
  // but for MVP we do it from the server since the user was created.
  // NOTE: RLS might block this if the authenticated session isn't immediately active 
  // or we don't bypass RLS. For MVP sake, let's keep it simple and redirect.
  // The actual company info setup can be hooked via DB Triggers on auth.users insert.

  revalidatePath('/', 'layout')
  redirect('/login?message=Check your email to continue sign in process')
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  return redirect('/login')
}

export async function forgotPassword(formData: FormData) {
  const email = formData.get('email') as string
  const supabase = createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://renovation-estimates-saas.vercel.app'}/auth/reset-password`,
  })

  if (error) {
    return redirect(`/login/forgot-password?message=${encodeURIComponent(error.message)}`)
  }

  return redirect('/login/forgot-password?message=Check your email for a password reset link')
}

export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string
  const supabase = createClient()

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return redirect('/auth/reset-password?message=Error updating password')
  }

  revalidatePath('/', 'layout')
  redirect('/estimates?message=Password updated successfully')
}
