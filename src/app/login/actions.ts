'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Turns a raw Supabase Auth error into a clear, actionable Spanish message.
 * Without this the UI only ever showed "Could not authenticate user", which hid
 * the real reason (e.g. "Email not confirmed" or "Auth session missing!").
 */
function authErrorMessage(message: string): string {
  const m = (message || '').toLowerCase()

  if (m.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (m.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada y la carpeta de spam.'
  }
  if (m.includes('user already registered')) {
    return 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.'
  }
  if (m.includes('auth session missing')) {
    return 'El enlace ha caducado o no es válido. Solicita uno nuevo.'
  }
  if (m.includes('email rate limit') || m.includes('rate limit')) {
    return 'Se han enviado demasiados correos. Espera unos minutos e inténtalo de nuevo.'
  }
  if (m.includes('for security purposes')) {
    return 'Por seguridad, espera unos segundos antes de volver a intentarlo.'
  }
  if (m.includes('password should be at least')) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }
  if (m.includes('unable to validate email') || m.includes('invalid format')) {
    return 'El correo electrónico no es válido.'
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled')) {
    return 'El registro está desactivado en este momento.'
  }

  return message
}

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const supabase = createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return redirect(`/login?message=${encodeURIComponent(authErrorMessage(error.message))}`)
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
    return redirect(`/login?message=${encodeURIComponent(authErrorMessage(error.message))}`)
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
    return redirect(`/login/forgot-password?message=${encodeURIComponent(authErrorMessage(error.message))}`)
  }

  return redirect('/login/forgot-password?message=Check your email for a password reset link')
}

export async function updatePassword(formData: FormData) {
  const password = formData.get('password') as string
  const supabase = createClient()

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return redirect(`/auth/reset-password?message=${encodeURIComponent(authErrorMessage(error.message))}`)
  }

  revalidatePath('/', 'layout')
  redirect('/estimates?message=Password updated successfully')
}
