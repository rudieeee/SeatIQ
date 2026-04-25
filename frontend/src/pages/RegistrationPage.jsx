import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { registerUser } from '../api'
import { useAuth } from '../context/AuthContext'

const InputField = ({ label, type = 'text', value, onChange, placeholder, error }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-medium text-gray-400 uppercase tracking-widest">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full bg-surface-800 border rounded-xl px-4 py-3 text-white placeholder-gray-600 text-sm font-body
        focus:outline-none focus:ring-1 transition-all
        ${error
          ? 'border-red-500/60 focus:ring-red-500/30 focus:border-red-400'
          : 'border-white/8 focus:ring-brand-red/30 focus:border-brand-red/60 hover:border-white/15'
        }`}
    />
    {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
  </div>
)

export default function RegistrationPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [form, setForm] = useState({ name: '', email: '', password: '', studentId: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const validate = () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Full name is required'
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) errs.email = 'Valid email required'
    if (form.password.length < 6) errs.password = 'Password must be at least 6 characters'
    if (!form.studentId.trim()) errs.studentId = 'Student ID is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setApiError('')
    try {
      const res = await registerUser({
        name: form.name,
        email: form.email,
        password: form.password,
        student_id: form.studentId,
      })
      const { token, user } = res.data
      login(token, user)
      navigate('/floors')
    } catch (err) {
      setApiError(err.response?.data?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center px-4 py-12 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-red/5 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-brand-gold/3 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-red glow-red mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-7 h-7">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
            </svg>
          </div>
          <h1 className="font-display text-4xl tracking-widest text-white">
            LIBRA<span className="text-brand-red">SEAT</span>
          </h1>
          <p className="text-gray-500 mt-2 text-sm">Library Seat Management System</p>
        </div>

        {/* Card */}
        <div className="card-glass rounded-2xl p-8 shadow-2xl">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">Create Account</h2>
            <p className="text-gray-500 text-sm mt-1">Register to start booking your library seat</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <InputField
              label="Full Name"
              value={form.name}
              onChange={set('name')}
              placeholder="John Doe"
              error={errors.name}
            />
            <InputField
              label="Student ID"
              value={form.studentId}
              onChange={set('studentId')}
              placeholder="2024CS001"
              error={errors.studentId}
            />
            <InputField
              label="Email Address"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="john@university.edu"
              error={errors.email}
            />
            <InputField
              label="Password"
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="Min. 6 characters"
              error={errors.password}
            />

            {apiError && (
              <div className="bg-red-500/10 border border-red-500/25 text-red-400 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                <span className="shrink-0">⚠️</span>
                <span>{apiError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full mt-2 py-3.5 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2
                ${loading
                  ? 'bg-brand-red/40 cursor-not-allowed'
                  : 'bg-brand-red hover:bg-brand-redDark glow-red hover:scale-[1.01] active:scale-[0.99]'
                }`}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Creating account…
                </>
              ) : (
                'Create Account & Continue'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          By registering, you agree to library usage policies.
        </p>
      </div>
    </div>
  )
}
