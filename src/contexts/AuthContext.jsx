import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const DEMO_USERS = [
  { id: '1', email: 'super@mlm.com.ar', password: 'MLM2024super!', name: 'Super Admin', role: 'superadmin' },
  { id: '2', email: 'admin@mlm.com.ar', password: 'MLM2024admin!', name: 'Administrador', role: 'admin' },
  { id: '3', email: 'comprador@mlm.com.ar', password: 'MLM2024comp!', name: 'Comprador Demo', role: 'comprador' },
]

function initDemoUsers() {
  const stored = localStorage.getItem('mlm_demo_users')
  if (!stored) {
    localStorage.setItem('mlm_demo_users', JSON.stringify(DEMO_USERS))
    return DEMO_USERS
  }
  return JSON.parse(stored)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const isDemoMode = !supabase

  useEffect(() => {
    if (isDemoMode) {
      initDemoUsers()
      const stored = localStorage.getItem('mlm_current_user')
      if (stored) {
        try {
          const u = JSON.parse(stored)
          setUser(u)
          setRole(u.role)
        } catch {
          localStorage.removeItem('mlm_current_user')
        }
      }
      setLoading(false)
      return
    }

    // Supabase mode
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        if (session?.user) {
          await loadSupabaseProfile(session.user)
        } else {
          setUser(null)
          setRole(null)
        }
      } catch (e) {
        console.warn('AuthContext: getSession profile load failed', e)
        setUser(null)
        setRole(null)
      } finally {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (session?.user) {
          await loadSupabaseProfile(session.user)
        } else {
          setUser(null)
          setRole(null)
        }
      } catch (e) {
        console.warn('AuthContext: onAuthStateChange profile load failed', e)
      } finally {
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadSupabaseProfile(supabaseUser) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, name')
      .eq('id', supabaseUser.id)
      .maybeSingle()

    if (error) {
      console.warn('AuthContext: profiles query error:', error.message)
    }

    const userObj = {
      id: supabaseUser.id,
      email: supabaseUser.email,
      name: profile?.name || supabaseUser.email.split('@')[0],
      role: profile?.role || 'comprador',
    }
    setUser(userObj)
    setRole(userObj.role)
  }

  async function login(email, password) {
    if (isDemoMode) {
      const users = initDemoUsers()
      const found = users.find(u => u.email === email && u.password === password)
      if (!found) {
        return { success: false, error: 'Email o contraseña incorrectos' }
      }
      const { password: _pw, ...safeUser } = found
      setUser(safeUser)
      setRole(safeUser.role)
      localStorage.setItem('mlm_current_user', JSON.stringify(safeUser))
      return { success: true }
    }

    // Supabase mode
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        return {
          success: false,
          error: error.message === 'Invalid login credentials'
            ? 'Email o contraseña incorrectos'
            : error.message
        }
      }
      if (data.user) {
        try {
          await loadSupabaseProfile(data.user)
        } catch (e) {
          console.warn('AuthContext: profile load after login failed', e)
        }
      }
      return { success: true }
    } catch (e) {
      console.error('AuthContext: signInWithPassword threw', e)
      return { success: false, error: 'No se pudo conectar al servidor. Reintentá en unos segundos.' }
    }
  }

  async function logout() {
    if (isDemoMode) {
      setUser(null)
      setRole(null)
      localStorage.removeItem('mlm_current_user')
      return
    }
    await supabase.auth.signOut()
    setUser(null)
    setRole(null)
  }

  function isAdmin() {
    return role === 'admin' || role === 'superadmin'
  }

  function isSuperAdmin() {
    return role === 'superadmin'
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, login, logout, isAdmin, isSuperAdmin, isDemoMode }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
