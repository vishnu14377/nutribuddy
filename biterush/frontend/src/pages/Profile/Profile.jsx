import React, { useContext, useEffect, useState } from 'react'
import './Profile.css'
import api from '../../services/api.js'
import { StoreContext } from '../../Context/StoreContext'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

const Profile = () => {
  const { token, user, setUser, logout } = useContext(StoreContext)
  const navigate  = useNavigate()
  const [loading, setLoading]  = useState(true)
  const [saving,  setSaving]   = useState(false)
  const [profile, setProfile]  = useState({ name: '', email: '', phone: '', role: '' })
  const [pwData,  setPwData]   = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [activeTab, setActiveTab] = useState('profile')

  useEffect(() => {
    if (!token) { navigate('/'); return }
    const fetchProfile = async () => {
      try {
        const res = await api.get('/user/profile')
        setProfile({ name: res.data.data.name, email: res.data.data.email, phone: res.data.data.phone || '', role: res.data.data.role })
      } catch {} finally { setLoading(false) }
    }
    fetchProfile()
  }, [token])

  const saveProfile = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.put('/user/profile', { name: profile.name, phone: profile.phone })
      if (res.data.success) {
        setUser(prev => ({ ...prev, name: profile.name, phone: profile.phone }))
        localStorage.setItem('user', JSON.stringify({ ...user, name: profile.name, phone: profile.phone }))
        toast.success('Profile updated!')
      }
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed') } finally { setSaving(false) }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (pwData.newPassword !== pwData.confirmPassword) { toast.error("Passwords don't match"); return }
    setSaving(true)
    try {
      const res = await api.post('/user/change-password', { currentPassword: pwData.currentPassword, newPassword: pwData.newPassword })
      if (res.data.success) { toast.success('Password changed!'); setPwData({ currentPassword: '', newPassword: '', confirmPassword: '' }) }
    } catch (err) { toast.error(err.response?.data?.message || 'Failed') } finally { setSaving(false) }
  }

  const ROLE_LABELS = { user: '👤 Customer', restaurant_owner: '🍽️ Restaurant Owner', admin: '⚡ Admin', delivery_partner: '🚴 Delivery Partner' }

  if (loading) return <div className="profile-loading"><div className="spinner" /></div>

  return (
    <div className="profile-page">
      <div className="profile-sidebar">
        <div className="profile-avatar-section">
          <div className="avatar-circle">{profile.name?.[0]?.toUpperCase() || 'U'}</div>
          <h3>{profile.name}</h3>
          <span className="role-badge">{ROLE_LABELS[profile.role] || profile.role}</span>
          <p className="profile-email">{profile.email}</p>
        </div>
        <nav className="profile-nav">
          {[['profile', '👤', 'My Profile'], ['security', '🔐', 'Security'], ['orders', '📦', 'Orders']].map(([tab, icon, label]) => (
            <button key={tab} className={`nav-item ${activeTab === tab ? 'active' : ''}`} onClick={() => { if (tab === 'orders') navigate('/myorders'); else setActiveTab(tab) }}>
              {icon} {label}
            </button>
          ))}
          <button className="nav-item logout-item" onClick={logout}>🚪 Logout</button>
        </nav>
      </div>

      <div className="profile-main">
        {activeTab === 'profile' && (
          <div className="profile-section">
            <h2>My Profile</h2>
            <form onSubmit={saveProfile} className="profile-form">
              <div className="form-group">
                <label>Full Name</label>
                <input value={profile.name} onChange={e => setProfile(p => ({ ...p, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Email Address</label>
                <input value={profile.email} disabled className="disabled-input" />
                <span className="field-hint">Email cannot be changed</span>
              </div>
              <div className="form-group">
                <label>Phone Number</label>
                <input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+91 XXXXX XXXXX" />
              </div>
              <div className="form-group">
                <label>Account Type</label>
                <input value={ROLE_LABELS[profile.role] || profile.role} disabled className="disabled-input" />
              </div>
              <button type="submit" className="save-btn" disabled={saving}>{saving ? 'Saving...' : '💾 Save Changes'}</button>
            </form>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="profile-section">
            <h2>Security Settings</h2>
            <form onSubmit={changePassword} className="profile-form">
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" value={pwData.currentPassword} onChange={e => setPwData(p => ({ ...p, currentPassword: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input type="password" value={pwData.newPassword} onChange={e => setPwData(p => ({ ...p, newPassword: e.target.value }))} required minLength={8} />
              </div>
              <div className="form-group">
                <label>Confirm New Password</label>
                <input type="password" value={pwData.confirmPassword} onChange={e => setPwData(p => ({ ...p, confirmPassword: e.target.value }))} required />
              </div>
              <button type="submit" className="save-btn" disabled={saving}>{saving ? 'Updating...' : '🔐 Change Password'}</button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default Profile
