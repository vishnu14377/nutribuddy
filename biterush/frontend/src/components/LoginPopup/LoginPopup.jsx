import React, { useContext, useState } from 'react'
import './LoginPopup.css'
import { assets } from '../../assets/assets'
import { StoreContext } from '../../Context/StoreContext'
import api from '../../services/api.js'
import { toast } from 'react-toastify'

const LoginPopup = ({ setShowLogin }) => {
  const { login } = useContext(StoreContext)
  const [currState, setCurrState] = useState("Login")
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState({ name: '', email: '', password: '', phone: '', role: 'user' })

  const onChangeHandler = (e) => setData(d => ({ ...d, [e.target.name]: e.target.value }))

  const onSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (currState === "Login") {
        const res = await api.post('/user/login', { email: data.email, password: data.password })
        if (res.data.success) {
          login(res.data.token, res.data.refreshToken, res.data.user)
          setShowLogin(false)
          toast.success(`Welcome back, ${res.data.user.name}! 🎉`)
        } else {
          toast.error(res.data.message)
        }
      } else {
        const res = await api.post('/user/register', { name: data.name, email: data.email, password: data.password, phone: data.phone, role: data.role })
        if (res.data.success) {
          login(res.data.token, res.data.refreshToken, res.data.user)
          setShowLogin(false)
          if (res.data.user.role === 'restaurant_owner') {
            toast.success('Restaurant owner account created. Open Owner Portal from your profile to set up your restaurant.')
          } else {
            toast.success(`Account created! Welcome, ${res.data.user.name}! 🚀`)
          }
        } else {
          toast.error(res.data.message)
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong')
    } finally { setLoading(false) }
  }

  return (
    <div className='login-popup' onClick={(e) => e.target.className === 'login-popup' && setShowLogin(false)}>
      <form className='login-popup-container' onSubmit={onSubmit}>
        <div className='login-popup-title'>
          <h2>{currState === 'Login' ? 'Welcome Back 👋' : 'Create Account 🚀'}</h2>
          <img src={assets.cross_icon} onClick={() => setShowLogin(false)} alt="close" />
        </div>
        <p className="login-popup-subtitle">
          {currState === 'Login' ? 'Sign in to continue ordering' : 'Join thousands of food lovers'}
        </p>

        <div className='login-popup-inputs'>
          {currState === "Sign Up" && (
            <input name='name' onChange={onChangeHandler} value={data.name} type="text" placeholder='Full Name' required />
          )}
          {currState === "Sign Up" && (
            <input name='phone' onChange={onChangeHandler} value={data.phone} type="tel" placeholder='Phone Number' />
          )}
          <input name='email' onChange={onChangeHandler} value={data.email} type="email" placeholder='Email Address' required />
          <input name='password' onChange={onChangeHandler} value={data.password} type="password" placeholder='Password (min 8 chars)' required />
          {currState === "Sign Up" && (
            <select name='role' onChange={onChangeHandler} value={data.role} className="role-select">
              <option value="user">👤 Customer</option>
              <option value="restaurant_owner">🍽️ Restaurant Owner</option>
              <option value="delivery_partner">🚴 Delivery Partner</option>
            </select>
          )}
        </div>

        <button type='submit' disabled={loading} className="login-btn">
          {loading ? <span className="loader-spin"></span> : (currState === "Login" ? "Sign In" : "Create Account")}
        </button>

        <div className='login-popup-condition'>
          <input type='checkbox' required />
          <p>By continuing, I agree to the <a href="#">Terms & Conditions</a></p>
        </div>

        <div className='login-popup-switch'>
          {currState === "Login"
            ? <p>New here? <span onClick={() => setCurrState("Sign Up")}>Create Account</span></p>
            : <p>Already have an account? <span onClick={() => setCurrState("Login")}>Sign In</span></p>
          }
        </div>
      </form>
    </div>
  )
}

export default LoginPopup
