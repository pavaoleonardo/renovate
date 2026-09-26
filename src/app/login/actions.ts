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
  if (m.includes('reauthentication') || m.includes('nonce')) {
    return 'Por seguridad, tu sesión es demasiado antigua para cambiar la contraseña. Pide un enlace nuevo y ábrelo en este mismo navegador.'
  }
  if (m.includes('current password')) {
    return 'Debes indicar tu contraseña actual para poder cambiarla.'
  }
  if (m.includes('should be different from the old password')) {
    return 'La nueva contraseña debe ser distinta de la anterior.'
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
  const confirmPassword = formData.get('confirmPassword') as string
  const companyName = ((formData.get('companyName') as string) || '').trim()
  const supabase = createClient()

  // Only validate when the signup form actually sent the confirmation field.
  if (confirmPassword && password !== confirmPassword) {
    return redirect(`/login/signup?message=${encodeURIComponent('Las contraseñas no coinciden.')}`)
  }

  // 1. Create User
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the handle_new_user() trigger to name the new company
      // (see supabase/migrations/20260926000000_company_name_from_signup.sql).
      data: { company_name: companyName || null },
    },
  })

  if (error) {
    return redirect(`/login/signup?message=${encodeURIComponent(authErrorMessage(error.message))}`)
  }

  // 2. The company + public.users rows are created by the on_auth_user_created
  // trigger, so nothing else is needed here. The user still has to confirm their
  // email (Supabase "Confirm email" setting) before they can sign in.

  revalidatePath('/', 'layout')
  redirect('/login/signup?message=Check your email to confirm your account')
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
    // If the project enables "Require reauthentication when changing password",
    // GoTrue refuses a password change from any session created more than 24h ago
    // (ErrorCodeReauthenticationNeeded). That means the request carried a session
    // left over from an earlier login, not the fresh recovery session, so drop it
    // and send the user back to request a new link.
    if (error.message.toLowerCase().includes('reauthentication')) {
      await supabase.auth.signOut()
    }

    return redirect(`/auth/reset-password?message=${encodeURIComponent(authErrorMessage(error.message))}`)
  }

  revalidatePath('/', 'layout')
  redirect('/estimates?message=Password updated successfully')
}
