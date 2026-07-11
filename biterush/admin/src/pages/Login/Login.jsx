import React, { useState, useContext } from 'react'
import './Login.css'
import axios from 'axios'
import { AdminContext } from '../../context/AdminContext'
import { toast } from 'react-toastify'

const Login = () => {
  const { url, login } = useContext(AdminContext)
  const [data, setData] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const onChangeHandler = (e) => setData(d => ({ ...d, [e.target.name]: e.target.value }))

  const onSubmitHandler = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await axios.post(`${url}/api/user/login`, data)
      if (response.data.success) {
        const { token, user } = response.data
        const allowedRoles = ['admin', 'restaurant_owner', 'delivery_partner'];
        
        if (allowedRoles.includes(user.role)) {
          login(token, user)
          toast.success(`Welcome, ${user.role.replace('_', ' ')}`)
        } else {
          toast.error("Access Denied: Management roles only")
        }
      } else {
        toast.error(response.data.message)
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='admin-login-container'>
      <div className="login-card">
        <div className="login-brand">BiteRush</div>
        <div className="login-title">
          <h2>Management Portal</h2>
          <p>Admins, restaurant owners, and delivery partners can sign in here.</p>
          <div className="role-badges">
            <span className="role-badge">👑 Admin</span>
            <span className="role-badge">🍽 Restaurant</span>
            <span className="role-badge">🚴 Delivery</span>
          </div>
        </div>
        <form onSubmit={onSubmitHandler} className='flex-col'>
          <div className="input-group">
            <label>Email Address</label>
            <input name='email' onChange={onChangeHandler} value={data.email} type="email" placeholder='owner@biterush.com' required />
          </div>
          <div className="input-group">
            <label>Password</label>
            <input name='password' onChange={onChangeHandler} value={data.password} type="password" placeholder='••••••••' required />
          </div>
          <button type='submit' className='login-btn' disabled={loading}>
            {loading ? <div className="spinner-small"></div> : 'Secure Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default Login
