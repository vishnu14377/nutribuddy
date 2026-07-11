import React, { useEffect, useState, useContext } from 'react'
import './Users.css'
import axios from 'axios'
import { AdminContext } from '../../context/AdminContext'
import { toast } from 'react-toastify'

const Users = () => {
  const { url, token } = useContext(AdminContext)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${url}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      if (response.data.success) {
        setUsers(response.data.data)
      }
    } catch (error) {
      toast.error("Failed to fetch users")
    } finally {
      setLoading(false)
    }
  }

  const toggleStatus = async (userId) => {
    try {
      const response = await axios.patch(`${url}/api/admin/users/${userId}/toggle-active`, {}, { headers: { Authorization: `Bearer ${token}` } })
      if (response.data.success) {
        toast.success(response.data.message)
        fetchUsers()
      }
    } catch (error) {
      toast.error("Action failed")
    }
  }

  const changeRole = async (userId, newRole) => {
    try {
      const response = await axios.patch(`${url}/api/admin/users/${userId}/role`, { role: newRole }, { headers: { Authorization: `Bearer ${token}` } })
      if (response.data.success) {
        toast.success("Role updated")
        fetchUsers()
      }
    } catch (error) {
      toast.error("Failed to update role")
    }
  }

  useEffect(() => {
    if (token) fetchUsers()
  }, [token])

  const filteredUsers = users.filter(user => filter === 'all' || user.role === filter)

  if (loading) return <div className='users-loading'><div className='spinner'></div></div>

  return (
    <div className='users-page'>
      <div className="users-header">
        <h2>👥 User Management</h2>
        <div className="users-stats">
          Total Users: <span>{users.length}</span>
        </div>
      </div>

      <div className="users-filters">
        {['all', 'user', 'restaurant_owner', 'delivery_partner', 'admin'].map(r => (
          <button 
            key={r} 
            className={`filter-btn ${filter === r ? 'active' : ''}`}
            onClick={() => setFilter(r)}
          >
            {r.replace('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      <div className="users-list">
        <div className="users-table-header">
          <b>Name</b>
          <b>Email</b>
          <b>Phone</b>
          <b>Role</b>
          <b>Status</b>
          <b>Actions</b>
        </div>
        {filteredUsers.map((user, index) => (
          <div key={index} className="users-table-row">
            <div className='user-name-col'>
              <div className="user-avatar">{user.name[0]}</div>
              <p>{user.name}</p>
            </div>
            <p className='user-email'>{user.email}</p>
            <p>{user.phone || 'N/A'}</p>
            <div className='role-select-col'>
              <select 
                value={user.role} 
                onChange={(e) => changeRole(user._id, e.target.value)}
                className={`role-badge ${user.role}`}
              >
                <option value="user">User</option>
                <option value="restaurant_owner">Owner</option>
                <option value="delivery_partner">Partner</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <span className={`status-pill ${user.isActive ? 'active' : 'inactive'}`}>
                {user.isActive ? 'Active' : 'Banned'}
              </span>
            </div>
            <div className='actions-col'>
              <button 
                onClick={() => toggleStatus(user._id)}
                className={`action-btn ${user.isActive ? 'ban' : 'unban'}`}
              >
                {user.isActive ? 'Ban' : 'Unban'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Users
